import { Room } from 'colyseus';
import { GameState, PlayerState } from './schema.js';
import {
    getProfile, markDirty, saveProfiles, adoptGuestProgress, loadProfile, releaseProfile,
    topProfiles, claimGrants, queueGrant, USE_DB,
} from './profiles.js';
import { verifyBloxityToken, BUX_MODE } from './bloxity.js';
import {
    CFG, WORLD, PADS, TRAMPS, TRAILS, PRODUCTS, PASSES, QUESTS, FREE, DAILY, CODES, KITS, SKINS, MAX_UPG,
    dailyStatus, dayKey, xpFor, jumpPower, xpPerJump, upgCost, xpMult, trampAt, trailIndex, fmt, comma, clamp,
} from '../../shared/config.js';

const GREEN = '#7dff6b', RED = '#ff5a5a', GOLD = '#ffd028', BLUE = '#6fe0ff';

// Empty string when the player left the name box blank
function cleanName(name) {
    return String(name || '').replace(/[^\w .\-]/g, '').trim().slice(0, 20);
}
const randomName = () => 'Player' + Math.floor(1000 + Math.random() * 9000);
const finite = (v) => typeof v === 'number' && Number.isFinite(v);
// Guest ids come from the browser; they can never claim a Bloxity identity
const guestUid = (uid, fallback) => String(uid || fallback).replace(/^legion_/, 'guest_').slice(0, 64);
const cleanAvatar = (av) => (typeof av === 'string' && av.length <= 2000 ? av : '');
const rewardText = (r) => [r.xp ? '+' + fmt(r.xp) + ' XP' : '', r.wins ? '+' + fmt(r.wins) + ' Wins' : '', r.grav ? r.grav + ' min No Gravity' : ''].filter(Boolean).join(' & ');

// Jumps are paid as they happen; a token bucket stops scripted spam
const JUMP_RATE = 10, JUMP_BURST = 14;

export const liveRooms = new Set();

// One shared world. Movement is client-side; everything that changes progress
// (XP from jumps and bounces, levels, Wins, upgrades, purchases) is decided here.
export class JumpRoom extends Room {
    maxClients = CFG.maxPlayers;

    onCreate() {
        liveRooms.add(this);
        this.setState(new GameState());
        this.setPatchRate(50);
        this.sessions = new Map();
        this.joinCount = 0;

        this.onMessage('move', (client, m) => this.onMove(client, m));
        this.onMessage('jump', (client) => this.onJump(client));
        this.onMessage('bounce', (client) => this.onBounce(client));
        this.onMessage('pad', (client, m) => this.onPad(client, m));
        this.onMessage('upgrade', (client, m) => this.onUpgrade(client, m));
        this.onMessage('rebirth', (client) => this.onRebirth(client));
        this.onMessage('trail', (client, m) => this.onTrail(client, m));
        this.onMessage('code', (client, m) => this.onCode(client, m));
        this.onMessage('free', (client, m) => this.onFree(client, m));
        this.onMessage('daily', (client) => this.onDaily(client));
        this.onMessage('buy', (client, m) => this.onBuy(client, m));
        this.onMessage('tutorial', (client) => this.onTutorial(client));
        this.onMessage('auth', (client, m) => this.onBloxityLogin(client, m));
        this.onMessage('avatar', (client, m) => this.onAvatar(client, m));
        this.onMessage('emote', (client, m) => this.onEmote(client, m));
        this.onMessage('chat', (client, m) => this.onChat(client, m));

        this.setSimulationInterval((dt) => this.tick(dt), 250);
        this.clock.setInterval(() => this.broadcastBoards(), 10000);
        // Bux purchases made while the player was on another pod (or offline)
        if (USE_DB) this.clock.setInterval(() => this.applyQueuedGrants(), 5000);
    }

    // A Bloxity token is verified with the Bloxity API; anyone else joins as a guest
    async onAuth(client, options) {
        const legion = options && options.token ? await verifyBloxityToken(options.token) : null;
        return legion ? { legion } : { guest: true };
    }

    async onJoin(client, options, auth) {
        options = options || {};
        const guest = guestUid(options.uid, client.sessionId);
        let uid = guest, name = cleanName(options.name);
        if (auth && auth.legion) {
            uid = 'legion_' + auth.legion.id;
            name = cleanName(auth.legion.name) || name;
            await adoptGuestProgress(uid, guest, name);
        }
        await loadProfile(uid);
        const profile = getProfile(uid, name, randomName());
        const player = new PlayerState();
        player.name = profile.name;
        player.av = cleanAvatar(options.av);
        player.x = WORLD.spawn.x; player.y = WORLD.spawn.y; player.z = WORLD.spawn.z; player.ry = 0;
        player.kit = this.joinCount % KITS.length;
        player.skin = (this.joinCount * 3) % SKINS.length;
        this.joinCount++;
        this.state.players.set(client.sessionId, player);
        this.sessions.set(client.sessionId, {
            client, profile, player,
            bucket: JUMP_BURST, bucketT: Date.now(), flight: 0, lastBounce: 0,
            joinedAt: Date.now(), freeClaimed: {}, cooldowns: new Map(), guest, lastChat: 0,
        });
        this.syncPublic(client.sessionId);
        client.send('hello', { now: Date.now(), bux: BUX_MODE, bloxity: uid.startsWith('legion_') });
        this.sendProfile(client.sessionId);
        this.broadcastBoards(client);
        if (USE_DB) this.applyQueuedGrants();
    }

    // A dropped connection keeps the player in the world for 30 s so the client can reconnect
    onDrop(client) {
        this.allowReconnection(client, 30);
    }
    onReconnect(client) {
        const s = this.sessions.get(client.sessionId);
        if (!s) return;
        s.client = client;
        client.send('hello', { now: Date.now(), bux: BUX_MODE, bloxity: s.profile.uid.startsWith('legion_') });
        this.sendProfile(client.sessionId);
        this.broadcastBoards(client);
    }

    onLeave(client) {
        const s = this.sessions.get(client.sessionId);
        this.state.players.delete(client.sessionId);
        this.sessions.delete(client.sessionId);
        markDirty();
        if (s && !isOnline(s.profile.uid)) releaseProfile(s.profile.uid);
    }

    // Colyseus awaits this on SIGTERM, which is how Legion stops a pod on every deploy
    onDispose() { liveRooms.delete(this); markDirty(); return saveProfiles(); }

    async applyQueuedGrants() {
        const uids = [...this.sessions.values()].map((s) => s.profile.uid);
        let grants = [];
        try { grants = await claimGrants(uids); } catch (e) { return console.warn('[DB] grants:', e.message); }
        for (const g of grants) {
            const entry = [...this.sessions].find(([, s]) => s.profile.uid === g.uid);
            if (entry) { this.grant({ ...entry[1], id: entry[0] }, g.kind, g.key); continue; }
            // Left between the query and now: put it back for their next visit
            queueGrant(g.uid, g.name, g.kind, g.key, g.tx).catch(() => {});
        }
        if (grants.length) saveProfiles();
    }

    // ----- helpers -----
    syncPublic(id) {
        const s = this.sessions.get(id);
        if (!s) return;
        const p = s.profile, pl = s.player;
        pl.wins = p.wins; pl.level = p.level; pl.xp = p.xp; pl.rebirths = p.rebirths;
        pl.jump = jumpPower(p);
        pl.trail = trailIndex(p.trail);
    }
    sendProfile(id) {
        const s = this.sessions.get(id);
        if (!s) return;
        const p = s.profile;
        s.client.send('profile', {
            passes: p.passes, quest: p.quest, totalWins: p.totalWins, best: p.best, upg: p.upg, jumps: p.jumps, bounces: p.bounces,
            trails: p.trails, trail: p.trail, codes: p.codes, xpBoostUntil: p.xpBoostUntil, gravUntil: p.gravUntil,
            claimedPack: p.claimedPack, seenTutorial: p.seenTutorial, firstPlay: p.firstPlay,
            freeClaimed: s.freeClaimed, joinedAt: s.joinedAt, daily: dailyStatus(p, Date.now()),
        });
    }
    toast(s, text, color) { s.client.send('toast', { text, color }); }
    cooldown(s, key, seconds) {
        const now = Date.now();
        if ((s.cooldowns.get(key) || 0) > now) return false;
        s.cooldowns.set(key, now + seconds * 1000);
        return true;
    }
    changed(id) {
        const s = this.sessions.get(id);
        if (s) this.checkQuest(s);
        this.syncPublic(id); this.sendProfile(id); markDirty();
    }

    addXp(s, amount) {
        const p = s.profile;
        if (!(amount > 0)) return 0;
        amount = Math.floor(amount);
        const old = p.level;
        p.xp += amount;
        while (p.xp >= xpFor(p.level)) { p.xp -= xpFor(p.level); p.level++; }
        if (p.level > old) {
            s.client.send('levelUp', { from: old, to: p.level, jump: jumpPower(p) });
            this.checkQuest(s);
        }
        markDirty();
        return amount;
    }
    addWins(s, n, boosted) {
        if (boosted && s.profile.passes.DoubleWins) n *= 2;
        s.profile.wins += n;
        s.profile.totalWins += n;
        markDirty();
        return n;
    }
    grantReward(s, r) {
        if (r.xp) this.addXp(s, r.xp);
        if (r.wins) this.addWins(s, r.wins, false);
        if (r.grav) s.profile.gravUntil = Math.max(Date.now(), s.profile.gravUntil || 0) + r.grav * 60000;
    }
    // Quest chain: completes automatically and pays its reward
    checkQuest(s) {
        const p = s.profile;
        for (let guard = 0; guard < QUESTS.length; guard++) {
            const q = QUESTS[p.quest];
            if (!q || (p[q.stat] || 0) < q.n) return;
            p.quest++;
            this.grantReward(s, q.reward);
            s.client.send('quest', { text: q.text, reward: rewardText(q.reward) });
            this.sendProfile(s.client.sessionId);
        }
    }

    // ----- simulation -----
    tick(dt) {
        for (const s of this.sessions.values()) s.profile.playtime = (s.profile.playtime || 0) + dt / 1000;
    }

    broadcastBoards(target) {
        const top = (key) => topProfiles(key).map((p) => ({ n: p.name, v: Math.floor(p[key] || 0) }));
        const msg = { wins: top('totalWins'), rebirths: top('rebirths'), jumps: top('jumps') };
        if (target) target.send('boards', msg); else this.broadcast('boards', msg);
    }

    // ----- messages -----
    onMove(client, m) {
        const s = this.sessions.get(client.sessionId);
        if (!s || !m || !finite(m.x) || !finite(m.y) || !finite(m.z)) return;
        const pl = s.player;
        pl.x = clamp(m.x, -WORLD.halfX - 60, WORLD.halfX + 60);
        pl.y = clamp(m.y, -100, 1200);
        pl.z = clamp(m.z, WORLD.zMin - 60, WORLD.zMax + 60);
        pl.ry = finite(m.ry) ? m.ry : 0;
        pl.anim = clamp(m.a | 0, 0, 2);
        if (pl.anim < 2) s.flight = 0;
        // Highest point ever reached (BEST on the HUD, "Climb 500 studs" quest)
        const h = Math.floor(pl.y);
        if (h > (s.profile.best || 0) && h < 900) {
            s.profile.best = h;
            if (this.cooldown(s, 'best', 1)) { this.checkQuest(s); this.sendProfile(client.sessionId); }
        }
    }

    // Every jump is worth (XP per jump) x multipliers. You get Jump-power jumps per flight.
    onJump(client) {
        const s = this.sessions.get(client.sessionId);
        if (!s) return;
        const now = Date.now(), p = s.profile;
        s.bucket = Math.min(JUMP_BURST, s.bucket + (now - s.bucketT) / 1000 * JUMP_RATE);
        s.bucketT = now;
        if (s.bucket < 1) return;
        s.bucket -= 1;
        s.flight++;
        if (s.flight > jumpPower(p) + 3) return;
        p.jumps = (p.jumps || 0) + 1;
        this.addXp(s, xpPerJump(p.upg) * xpMult(p, now));
        this.syncPublic(client.sessionId);
        if (p.jumps % 50 === 0) this.checkQuest(s);
    }

    // Trampoline bounce: checked against where the player is standing
    onBounce(client) {
        const s = this.sessions.get(client.sessionId);
        if (!s) return;
        const now = Date.now(), p = s.profile, pl = s.player;
        if (now - s.lastBounce < 450) return;
        const t = trampAt(pl.x, pl.y, pl.z, 14);
        if (!t || (t.pass && !p.passes[t.pass])) return;
        s.lastBounce = now;
        p.bounces = (p.bounces || 0) + 1;
        const got = this.addXp(s, xpPerJump(p.upg) * xpMult(p, now) * t.mult);
        this.syncPublic(client.sessionId);
        client.send('bounced', { n: got, mult: t.mult });
        if (p.bounces <= 20 || p.bounces % 25 === 0) { this.checkQuest(s); this.sendProfile(client.sessionId); }
    }

    onPad(client, m) {
        const s = this.sessions.get(client.sessionId);
        const i = m ? m.i | 0 : -1;
        const pad = PADS[i];
        if (!s || !pad) return;
        const pl = s.player, p = s.profile;
        if (Math.abs(pl.x - pad.x) > 9 || Math.abs(pl.z - pad.z) > 9 || Math.abs(pl.y - pad.y) > 6) return;
        if (jumpPower(p) < pad.req) {
            if (this.cooldown(s, 'padmsg', 1.5)) this.toast(s, 'You need JUMP ' + pad.req + '+ for this pad!', RED);
            return;
        }
        if (!this.cooldown(s, 'pad', 1.5)) return;
        const got = this.addWins(s, pad.wins, true);
        client.send('wins', { n: got, i });
        this.changed(client.sessionId);
    }

    // Jump Upgrades: +1 level, or as many as the player's Wins can pay for
    onUpgrade(client, m) {
        const s = this.sessions.get(client.sessionId);
        if (!s) return;
        const p = s.profile;
        let bought = 0;
        const want = m && m.max ? MAX_UPG : 1;
        while (bought < want && p.upg < MAX_UPG && p.wins >= upgCost(p.upg)) {
            p.wins -= upgCost(p.upg);
            p.upg++;
            bought++;
        }
        if (!bought) {
            if (p.upg >= MAX_UPG) return this.toast(s, 'Jump Upgrades are maxed!', BLUE);
            return this.toast(s, 'You need ' + comma(upgCost(p.upg) - p.wins) + ' more Wins!', RED);
        }
        client.send('upgraded', { lv: p.upg, n: bought, xp: xpPerJump(p.upg) });
        this.changed(client.sessionId);
    }

    onRebirth(client) {
        const s = this.sessions.get(client.sessionId);
        if (!s) return;
        const p = s.profile;
        if (p.level < CFG.rebirthLevel) return this.toast(s, 'Reach Level ' + CFG.rebirthLevel + ' to Rebirth!', RED);
        p.rebirths++;
        p.level = 1; p.xp = 0;
        this.toast(s, 'REBIRTH! XP is now x' + (1 + p.rebirths), BLUE);
        client.send('fx', { kind: 'rebirth' });
        this.changed(client.sessionId);
    }

    // Buy a trail with Wins (or the pass), then equip it
    onTrail(client, m) {
        const s = this.sessions.get(client.sessionId);
        const t = m && TRAILS.find((x) => x.id === m.id);
        if (!s || !t) return;
        const p = s.profile;
        const owned = t.cost === 0 && !t.pass || p.trails[t.id] || (t.pass && p.passes[t.pass]);
        if (!owned) {
            if (t.pass) return this.toast(s, 'Get the ' + PASSES[t.pass].name + ' pass in the Store!', BLUE);
            if (p.wins < t.cost) return this.toast(s, 'You need ' + comma(t.cost - p.wins) + ' more Wins!', RED);
            p.wins -= t.cost;
            p.trails[t.id] = true;
            this.toast(s, t.id + ' Trail unlocked!', GREEN);
        }
        p.trail = t.id;
        this.changed(client.sessionId);
    }

    onCode(client, m) {
        const s = this.sessions.get(client.sessionId);
        if (!s || !m || typeof m.code !== 'string') return;
        if (!this.cooldown(s, 'code', 1)) return;
        const code = m.code.trim().toUpperCase().slice(0, 24);
        const r = CODES[code];
        if (!r) return this.toast(s, 'Invalid code!', RED);
        if (s.profile.codes[code]) return this.toast(s, 'Code already redeemed!', BLUE);
        s.profile.codes[code] = true;
        this.grantReward(s, r);
        this.toast(s, 'Code redeemed: ' + rewardText(r) + '!', GREEN);
        client.send('fx', { kind: 'confetti' });
        this.changed(client.sessionId);
    }

    onFree(client, m) {
        const s = this.sessions.get(client.sessionId);
        const i = m ? m.i | 0 : -1;
        const r = FREE[i];
        if (!s || !r || s.freeClaimed[i]) return;
        if ((Date.now() - s.joinedAt) / 60000 < r.min) return;
        s.freeClaimed[i] = true;
        this.grantReward(s, r);
        this.toast(s, 'Gift: ' + rewardText(r) + '!', GREEN);
        client.send('fx', { kind: 'confetti' });
        this.changed(client.sessionId);
    }

    onDaily(client) {
        const s = this.sessions.get(client.sessionId);
        if (!s) return;
        const p = s.profile, now = Date.now();
        const st = dailyStatus(p, now);
        if (!st.ready) return this.toast(s, 'Come back tomorrow for the next reward!', BLUE);
        const r = DAILY[st.day];
        p.dailyStreak = (p.dailyDay === dayKey(now - 86400000) ? p.dailyStreak : 0) + 1;
        p.dailyDay = dayKey(now);
        this.grantReward(s, r);
        this.toast(s, 'Day ' + (st.day + 1) + ' reward: ' + rewardText(r) + '!', GREEN);
        client.send('fx', { kind: 'confetti' });
        this.changed(client.sessionId);
    }

    onTutorial(client) {
        const s = this.sessions.get(client.sessionId);
        if (s && !s.profile.seenTutorial) { s.profile.seenTutorial = true; this.sendProfile(client.sessionId); markDirty(); }
    }

    // Demo mode grants for free. In Bux mode (LEGION_WEBHOOK_SECRET set) only the webhook grants.
    onBuy(client, m) {
        const s = this.sessions.get(client.sessionId);
        if (!s || !m) return;
        if (BUX_MODE) return this.toast(s, 'Purchases use Bux - log in to Bloxity', BLUE);
        this.grant({ ...s, id: client.sessionId }, m.kind, m.key);
    }

    // s is a live session, or a stand-in { profile, client: { send() {} } } for offline players
    grant(s, kind, key) {
        const client = s.client;
        const p = s.profile;
        if (kind === 'pass') {
            const pass = PASSES[key];
            if (!pass) return false;
            if (p.passes[key]) { this.toast(s, pass.name + ' already owned!', BLUE); return true; }
            p.passes[key] = true;
            if (key === 'RainbowTrail') p.trail = 'Rainbow';
            this.toast(s, pass.name + ' unlocked!', GREEN);
        } else {
            const prod = PRODUCTS[key];
            if (!prod) return false;
            if (key === 'NoGravity') {
                p.gravUntil = Math.max(Date.now(), p.gravUntil || 0) + CFG.boostMinutes * 60000;
                this.toast(s, 'NO GRAVITY! Jumps x1.6 for 15 minutes', BLUE);
            }
            if (key === 'XPBoost') {
                p.xpBoostUntil = Math.max(Date.now(), p.xpBoostUntil || 0) + CFG.boostMinutes * 60000;
                this.toast(s, 'x2 XP Boost active!', GOLD);
            }
            if (key === 'StarterPack') {
                if (p.claimedPack) { this.toast(s, 'Starter Pack already claimed!', BLUE); return true; }
                p.claimedPack = true;
            }
            if (prod.xp) this.addXp(s, prod.xp);
            if (prod.wins) { this.addWins(s, prod.wins, false); this.toast(s, '+' + comma(prod.wins) + ' Wins!', GOLD); }
        }
        client.send('fx', { kind: 'confetti' });
        if (s.id) this.changed(s.id); else markDirty();
        return true;
    }

    // ----- Bloxity -----
    // Logged in to Bloxity after joining: move this session onto the Bloxity profile
    async onBloxityLogin(client, m) {
        const s = this.sessions.get(client.sessionId);
        if (!s || !m || s.authing) return;
        s.authing = true;
        const legion = await verifyBloxityToken(m.token);
        s.authing = false;
        if (!legion || !this.sessions.has(client.sessionId)) return;
        const uid = 'legion_' + legion.id;
        if (s.profile.uid === uid) return;
        const name = cleanName(legion.name) || s.profile.name;
        const guestProfile = s.profile;
        await adoptGuestProgress(uid, guestProfile.uid, name);
        await loadProfile(uid);
        if (!this.sessions.has(client.sessionId)) return;
        s.profile = getProfile(uid, name, randomName());
        if (!isOnline(guestProfile.uid)) releaseProfile(guestProfile.uid);
        s.player.name = s.profile.name;
        this.changed(client.sessionId);
        client.send('authed', { name: s.profile.name });
        this.toast(s, 'Logged in as ' + s.profile.name, GREEN);
        this.broadcastBoards();
    }
    onAvatar(client, m) {
        const s = this.sessions.get(client.sessionId);
        if (s && m) s.player.av = cleanAvatar(m.av);
    }
    // Emote ids are opaque catalogue ids; other players play the same clip
    onEmote(client, m) {
        const s = this.sessions.get(client.sessionId);
        if (!s || !m || typeof m.id !== 'string' || m.id.length > 40) return;
        this.broadcast('emote', { s: client.sessionId, id: m.id }, { except: client });
    }
    onChat(client, m) {
        const s = this.sessions.get(client.sessionId);
        if (!s || !m || typeof m.text !== 'string') return;
        const now = Date.now();
        if (now - s.lastChat < 800) return;
        s.lastChat = now;
        const text = m.text.replace(/\s+/g, ' ').trim().slice(0, 120);
        if (text) this.broadcast('chat', { s: client.sessionId, name: s.profile.name, text });
    }
}

function isOnline(uid) {
    for (const room of liveRooms) for (const s of room.sessions.values()) if (s.profile.uid === uid) return true;
    return false;
}

// Grants a Bux purchase confirmed by the Bloxity webhook, whether or not the player is online
export async function grantPurchase(uid, name, kind, key, tx) {
    for (const room of liveRooms) {
        for (const [id, s] of room.sessions) {
            if (s.profile.uid === uid) return room.grant({ ...s, id }, kind, key);
        }
    }
    // Not on this pod: the pod hosting them (or their next join) applies it
    if (USE_DB) { await queueGrant(uid, name, kind, key, tx); return true; }
    const profile = getProfile(uid, name, randomName());
    const stub = { profile, client: { send() {} } };
    const proto = JumpRoom.prototype;
    return proto.grant.call({ toast() {}, addXp: proto.addXp, addWins: proto.addWins, checkQuest() {}, changed() {}, sessions: new Map() }, stub, kind, key);
}
