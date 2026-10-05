import { Client } from '@colyseus/sdk';
import {
    T, V3, $, canvas, renderer, scene, camera, sun, solids, triggers, prompts, tickers,
    billboard, buildRig, animRig, airPose, mergeStatic, confettiAt, floatText, updateEffects, lerpAngle,
} from './engine.js';
import { S, actions, net } from './state.js';
import { initAudio, startMusic, sfx, sfxJump, setVolume } from './audio.js';
import * as BX from './bloxity.js';
import { createAvatar, loadBase, packAvatar, unpackAvatar, avatarStats } from './avatar.js';
import { pad, pollGamepad, rumble, onGamepadConnection } from './gamepad.js';
import { render, setSpeedLines, updateFx, dust, sparkleColumn, ring, fireworks, setQuality, emitTrail, airPuff } from './fx.js';
import {
    buildWorld, SPAWN, SHOP_POS, refreshWorld, renderBoards, trampLocked, squashTramp, updateWorld, padList, laserHit,
} from './world.js';
import { updateWeather, weather } from './weather.js';
import {
    updateHud, toast, levelUp, bigText, buy, closeModal, openModal, modalOpen,
    refreshModal, promptEl, promptTxtEl, showWin, animateCounters, popGain, showTutorial, notice, bumpJump,
} from './ui.js';
import {
    CFG, PADS, TRAMPS, TRAILS, QUESTS, TUTORIAL_STEPS, KITS, SKINS,
    xpPerJump, xpMult, hasLowGravity, lowGravityEvent, fmt, comma, clamp,
} from '../../shared/config.js';

// =====================================================================================
// Local player
// =====================================================================================
const HW = 1, PH = 5, STEP = 1.7;
const P = {
    pos: SPAWN.clone(), vel: new V3(), onGround: false, ground: null, facing: 0, moving: false,
    jumpsLeft: 1, chain: 0, lastJumpT: -9, heldPrev: false, airTime: 0, animPhase: 0, lastStep: 0,
    squash: 1, squashV: 0, lockToastT: -9, trailT: 0, returning: false,
    hv: new V3(), knock: new V3(), shield: 0,
};
const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
let shake = 0;
function addShake(a) { if (!reduceMotion) shake = Math.min(1.2, shake + a); }
let rig;

// ----- Bloxity avatars -----
// The Bloxity body replaces the blocky rig's meshes; labels stay on the rig group.
function dressRig(group, avatar) {
    group.children.forEach((c) => { if (!c.isSprite) c.visible = false; });
    group.add(avatar.root);
    group.userData.blox = avatar;
}
let localAvatar = null, localAvatarReq = 0;
async function setupLocalAvatar() {
    const req = ++localAvatarReq;
    const a = await createAvatar(BX.currentAvatar(), BX.getSkinTextureUrl());
    if (!a) return;
    if (req !== localAvatarReq || !rig) { a.dispose(); return; }
    if (localAvatar) localAvatar.dispose();
    localAvatar = a;
    dressRig(rig, a);
}
function syncMyAvatar() {
    const av = BX.currentAvatar();
    if (localAvatar && av) { localAvatar.setProportions(av.proportions); localAvatar.setEquipped(av, BX.getSkinTextureUrl()); }
    net.send('avatar', { av: packAvatar(av) });
}
async function playEmoteOn(avatar, id) {
    if (!avatar) return;
    const cat = await BX.loadEmotes();
    const e = cat.get(id);
    if (e && e.clip) avatar.playEmote(e.clip);
}
// Chat bubble above a rig for a few seconds
function chatBubble(group, text) {
    if (!group) return;
    if (group.userData.bubble) { group.remove(group.userData.bubble); group.userData.bubble.material.map.dispose(); }
    const b = billboard([{ t: '💬 ' + text, c: '#ffffff', s: '#16121f', px: 44 }], 9, 1024, new V3(0, 9.4, 0), group);
    group.userData.bubble = b;
    setTimeout(() => { if (group.userData.bubble === b) { group.remove(b); b.material.map.dispose(); group.userData.bubble = null; } }, 5000);
}
// Fallback blocky look (until the Bloxity body loads): pale skin, big orange hair, black tee
const lookOf = (kit, skin) => { const k = KITS[kit % KITS.length]; return { ...k, skin: k.skin || SKINS[skin % SKINS.length], hairStyle: 'shaggy', plain: true }; };

function buildPlayer() {
    if (rig) scene.remove(rig);
    rig = buildRig(lookOf(0, 0));
    scene.add(rig);
    rig.position.copy(P.pos);
    localAvatar = null;
    setupLocalAvatar();
}

// =====================================================================================
// Collision
// =====================================================================================
function overlapsBox(c, x, y, z) {
    return c.max.x > x - HW && c.min.x < x + HW && c.max.y > y && c.min.y < y + PH && c.max.z > z - HW && c.min.z < z + HW;
}
function freeAt(x, y, z) {
    for (const c of solids) if (overlapsBox(c, x, y, z)) return false;
    return true;
}
function moveAxis(axis, d) {
    if (d === 0) return;
    const p = P.pos;
    p[axis] += d;
    for (const c of solids) {
        if (!overlapsBox(c, p.x, p.y, p.z)) continue;
        if (axis === 'y') {
            if (d < 0) { p.y = c.max.y; P.vel.y = Math.max(0, P.vel.y); P.onGround = true; P.ground = c; }
            else { p.y = c.min.y - PH - 1e-4; if (P.vel.y > 0) P.vel.y = 0; }
        } else {
            const rise = c.max.y - p.y;
            if (rise > 0 && rise <= STEP && (P.onGround || P.vel.y <= 0) && freeAt(p.x, c.max.y + 0.01, p.z)) { p.y = c.max.y + 0.001; continue; }
            if (d > 0) p[axis] = c.min[axis] - HW - 1e-4; else p[axis] = c.max[axis] + HW + 1e-4;
        }
    }
}

function teleport(pos, yaw) {
    P.pos.copy(pos); P.vel.set(0, 0, 0); P.hv.set(0, 0, 0); P.knock.set(0, 0, 0);
    P.facing = yaw || 0; cam.yaw = (yaw || 0) + Math.PI;
    P.jumpsLeft = S.jump; P.chain = 0;
    for (const t of triggers) t.inside = overlapsBox(t, pos.x, pos.y, pos.z);
    sendMove(true);
}
const toSpawn = () => teleport(SPAWN, 0);

// =====================================================================================
// Jumping: every jump is +XP; Jump power is how many jumps you get before landing
// =====================================================================================
let lowGrav = false;
const gravity = () => CFG.gravity * (lowGrav ? CFG.lowGravity : 1);
const myTrail = () => TRAILS.find((t) => t.id === S.trail) || TRAILS[0];

function doJump(t) {
    const air = !P.onGround;
    P.vel.y = CFG.jumpV;
    P.onGround = false;
    P.jumpsLeft--;
    P.lastJumpT = t;
    P.chain++;
    sendMove(true);
    net.send('jump');
    // Predicted XP popup; the server pays the real amount
    const gain = xpPerJump(S.upg) * xpMult(S, net.now());
    popGain('+' + fmt(gain) + ' XP', '', 44 + Math.random() * 12, 42 + Math.random() * 6);
    sfxJump(P.chain - 1);
    P.squashV += 6;
    if (air) {
        airPuff(P.pos, 0xffffff);
        emitTrail(P.pos, myTrail().colors, 6);
    } else dust(P.pos, 5, 0.7);
    if (P.chain > 1 && P.chain % 10 === 0) { ring(P.pos, 0x7dff6b, 5, 0.4); sfx('pickup'); }
}
function bounce(def, t) {
    P.vel.y = CFG.bounceV;
    P.onGround = false;
    P.jumpsLeft = S.jump; P.chain = 0;
    P.lastJumpT = t;
    squashTramp(def);
    sfx('boing'); P.squashV += 9;
    ring(new V3(def.x, P.pos.y, def.z), def.op ? 0xff4a5a : 0x6fe0ff, def.r, 0.4);
    sendMove(true);
    net.send('bounce');
}

// Touching a laser ring: knocked away from the tower with no jumps left, so you fall
function zap(L) {
    P.shield = 1.2;
    P.jumpsLeft = 0;
    const away = new V3(P.pos.x - L.cx, 0, P.pos.z - L.cz);
    if (away.lengthSq() < 0.01) away.set(0, 0, -1);
    away.normalize();
    P.knock.copy(away).multiplyScalar(34);
    P.vel.y = Math.min(P.vel.y, -10);
    sfx('zap'); sfx('hit'); addShake(0.7); rumble(0.8, 250);
    floatText('ZAPPED!', '#ff4a5a', P.pos.clone().add(new V3(0, 6, 0)));
    const f = $('#flash'); f.classList.remove('show', 'gold', 'red'); void f.offsetWidth; f.classList.add('show', 'red');
}

// =====================================================================================
// Actions triggered by world objects
// =====================================================================================
actions.pad = (i) => {
    const p = PADS[i];
    if (!p || P.returning) return;
    if (S.jump < p.req) {
        notice('You need JUMP ' + p.req + '+ for this pad!');
        sfx('deny');
        return;
    }
    sendMove(true);
    net.send('pad', { i });
};
actions.openPanel = (kind) => { if (!modalOpen()) openModal(kind); };

// =====================================================================================
// Guide arrows (tutorial): a trail of white arrowheads to the next goal
// =====================================================================================
const GUIDE_N = 9, GUIDE_GAP = 3.6;
const guideArrows = (() => {
    const shape = new T.Shape();
    shape.moveTo(0, 1.6); shape.lineTo(1.25, -1.1); shape.lineTo(0, -0.45); shape.lineTo(-1.25, -1.1); shape.closePath();
    const geo = new T.ExtrudeGeometry(shape, { depth: 0.35, bevelEnabled: true, bevelThickness: 0.12, bevelSize: 0.12, bevelSegments: 1 });
    geo.translate(0, 0, -0.17);
    const front = new T.MeshLambertMaterial({ color: 0xffffff, emissive: 0x9fb8d8, emissiveIntensity: 0.35 });
    const list = [];
    for (let i = 0; i < GUIDE_N; i++) {
        const m = new T.Mesh(geo, front);
        m.visible = false;
        scene.add(m);
        list.push(m);
    }
    return list;
})();
let guidePhase = 0;
const guideGoal = new V3(), guideDir = new V3();
// Where the current tutorial step wants you to go (null = nowhere)
function guideTarget(out) {
    const q = QUESTS[S.quest];
    if (!q || S.quest >= TUTORIAL_STEPS || !q.goal) return null;
    if (q.goal === 'shop') return out.copy(SHOP_POS);
    if (q.goal === 'gym') {
        const t = TRAMPS.find((d) => !trampLocked(d));
        return t ? out.set(t.x, 0, t.z) : null;
    }
    // The nearest pad you can already claim (or the easiest one), in front of its tower
    let best = null, bd = Infinity;
    for (const { pad: p } of padList()) {
        if (S.jump < p.req && p.req > 7) continue;
        const d = Math.hypot(p.x - P.pos.x, p.z - P.pos.z) + p.req * 2;
        if (d < bd) { bd = d; best = p; }
    }
    if (!best) return null;
    return out.set(best.x, 0, best.z - 9);
}
function updateGuide(dt) {
    guidePhase = (guidePhase + dt * 5) % GUIDE_GAP;
    const goal = P.onGround && P.pos.y < 3 ? guideTarget(guideGoal) : null;
    if (!goal) { for (const m of guideArrows) m.visible = false; return; }
    guideDir.subVectors(guideGoal, P.pos).setY(0);
    const len = guideDir.length();
    guideDir.normalize();
    const yaw = Math.atan2(guideDir.x, guideDir.z);
    guideArrows.forEach((m, i) => {
        const d = 3 + i * GUIDE_GAP + guidePhase;
        m.visible = d < len - 2;
        if (!m.visible) return;
        m.position.set(P.pos.x + guideDir.x * d, P.pos.y + 1.1, P.pos.z + guideDir.z * d);
        m.rotation.set(-1.15, 0, 0);
        m.rotation.y = yaw;
        m.rotation.order = 'YXZ';
        const fade = Math.min(1, (len - 2 - d) / 4, d / 4);
        m.scale.setScalar(0.55 + 0.45 * Math.max(0, fade));
    });
}

// =====================================================================================
// Other players
// =====================================================================================
const remotes = new Map();
let joinSynced = false;
class Remote {
    constructor(p) {
        this.rig = buildRig(lookOf(p.kit, p.skin));
        this.rig.position.set(p.x, p.y, p.z);
        this.rig.rotation.y = p.ry;
        scene.add(this.rig);
        this.labelText = '';
        this.label = billboard([{ t: p.name, c: '#ffffff', s: '#16121f', px: 56 }], 6, 512, new V3(0, 7.6, 0), this.rig);
        this.phase = Math.random() * 6;
        this.av = null; this.blox = null; this.dead = false; this.trailT = 0;
        this.setAvatar(p.av);
    }
    setAvatar(av) {
        this.av = av;
        const data = av ? unpackAvatar(av) : null;
        if (this.blox) { this.blox.setProportions(data && data.proportions); this.blox.setEquipped(data || {}); return; }
        if (this.loading) return;
        this.loading = true;
        createAvatar(data).then((a) => {
            this.loading = false;
            if (!a) return;
            if (this.dead) { a.dispose(); return; }
            this.blox = a;
            dressRig(this.rig, a);
            if (this.av !== av) this.setAvatar(this.av);
        });
    }
    update(p, dt, t) {
        const r = this.rig;
        const k = 1 - Math.exp(-dt * 12);
        const far = (r.position.x - p.x) ** 2 + (r.position.z - p.z) ** 2 + (r.position.y - p.y) ** 2 > 900;
        if (far) r.position.set(p.x, p.y, p.z);
        else { r.position.x += (p.x - r.position.x) * k; r.position.y += (p.y - r.position.y) * k; r.position.z += (p.z - r.position.z) * k; }
        r.rotation.y = lerpAngle(r.rotation.y, p.ry, k);
        if (p.av !== this.av) this.setAvatar(p.av);
        const air = p.anim === 2;
        if (this.blox) this.blox.update(dt, { moving: p.anim === 1, air, speed: CFG.walkSpeed, t });
        if (air) airPose(r);
        else { this.phase += dt * (p.anim === 1 ? 14 : 0); animRig(r, this.phase, p.anim === 1 ? 0.9 : 0); }
        if (air) {
            this.trailT -= dt;
            if (this.trailT <= 0) { this.trailT = 0.05; emitTrail(r.position, (TRAILS[p.trail] || TRAILS[0]).colors, 1); }
        }
        const text = p.name + '|' + p.jump;
        if (text !== this.labelText) {
            this.labelText = text;
            this.label.userData.set([{ t: p.name, c: '#ffffff', s: '#16121f', px: 50 }, { t: '🦘 Jump ' + comma(p.jump), c: '#7dff6b', s: '#16121f', px: 50 }]);
        }
    }
    dispose() {
        this.dead = true;
        if (this.blox) this.blox.dispose();
        scene.remove(this.rig);
    }
}
function syncRemotes(dt, t) {
    const room = net.room;
    if (!room || !room.state || !room.state.players) return 1;
    const seen = new Set();
    room.state.players.forEach((p, id) => {
        if (id === room.sessionId) {
            // Our own public stats come from the server
            const oldLevel = S.level, oldJump = S.jump;
            S.name = p.name; S.wins = p.wins; S.level = p.level; S.xp = p.xp; S.rebirths = p.rebirths; S.jump = p.jump;
            // More Jump power mid-air (a level up, a pass) is usable right away
            if (S.jump > oldJump && !P.onGround) P.jumpsLeft += S.jump - oldJump;
            if (S.jump !== oldJump) { bumpJump(); refreshWorld(); }
            if (oldLevel !== S.level) refreshModal();
            return;
        }
        seen.add(id);
        let r = remotes.get(id);
        if (!r) {
            r = new Remote(p); remotes.set(id, r);
            if (joinSynced) BX.playerJoined(p.name); else BX.playerInRoom(p.name);
        }
        r.update(p, dt, t);
    });
    for (const [id, r] of remotes) if (!seen.has(id)) { r.dispose(); remotes.delete(id); }
    joinSynced = true;
    return room.state.players.size;
}

// =====================================================================================
// Networking
// =====================================================================================
// Hosted on Bloxity (VITE_BLOXITY_GAME_ID set at build time): the client is served from
// <id>.play.bloxity.io and the server pods are found through the Bloxity matchmaker.
const BLOXITY_GAME_ID = import.meta.env.VITE_BLOXITY_GAME_ID || '';
// <id>.play.bloxity.io -> <id>.host.bloxity.io, <id>.dev.play.bloxity.io -> <id>.dev.host.bloxity.io
const ON_BLOXITY_HOST = /\.play\.bloxity\.io$/.test(location.hostname);
const DEV_CHANNEL = /\.dev\.play\.bloxity\.io$/.test(location.hostname);
const SERVER_URL = import.meta.env.VITE_SERVER_URL
    || (ON_BLOXITY_HOST ? `https://${location.hostname.replace(/\.play\.bloxity\.io$/, '.host.bloxity.io')}`
        : BLOXITY_GAME_ID ? `https://${BLOXITY_GAME_ID}.host.bloxity.io`
        : import.meta.env.DEV ? `${location.protocol}//${location.hostname}:2567` : location.origin);
let lastEndpoint = '';
async function serverEndpoint() {
    if (!BLOXITY_GAME_ID) { lastEndpoint = SERVER_URL; return SERVER_URL; }
    const r = await BX.resolveEndpoint(BLOXITY_GAME_ID, DEV_CHANNEL ? 'preview' : undefined);
    if (r && r.cold) $('#loading').textContent = 'Waking up a server…';
    lastEndpoint = (r && r.endpoint) || SERVER_URL;
    return lastEndpoint;
}
let lastMoveSent = 0, lastMoveKey = '';
function sendMove(force) {
    const now = performance.now();
    if (!force && now - lastMoveSent < 66) return;
    const a = !P.onGround ? 2 : P.moving ? 1 : 0;
    const m = { x: +P.pos.x.toFixed(2), y: +P.pos.y.toFixed(2), z: +P.pos.z.toFixed(2), ry: +P.facing.toFixed(3), a };
    const key = m.x + ',' + m.y + ',' + m.z + ',' + m.ry + ',' + a;
    if (!force && key === lastMoveKey && now - lastMoveSent < 500) return;
    lastMoveKey = key; lastMoveSent = now;
    net.send('move', m);
}

function storageGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
function storageSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* private mode */ } }
function playerUid() {
    let uid = storageGet('jpj_uid');
    if (!uid) {
        uid = (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2) + Date.now());
        storageSet('jpj_uid', uid);
    }
    return uid;
}

async function connect(name) {
    const client = new Client(await serverEndpoint());
    const id = BX.identity();
    const room = await client.joinOrCreate('jump', {
        uid: playerUid(), name: name || id.name, token: id.token, av: packAvatar(BX.currentAvatar()),
    });
    net.room = room;
    joinSynced = false;
    room.onMessage('hello', (m) => { net.offset = m.now - Date.now(); net.bux = !!m.bux; net.bloxity = !!m.bloxity; });
    room.onMessage('authed', () => { net.bloxity = true; });
    room.onMessage('emote', (m) => { const r = remotes.get(m.s); if (r) playEmoteOn(r.blox, m.id); });
    room.onMessage('chat', (m) => {
        toast(m.name + ': ' + m.text, '#ffffff');
        chatBubble(m.s === room.sessionId ? rig : remotes.get(m.s) && remotes.get(m.s).rig, m.text);
    });
    BX.updateRoom(room.roomId);
    BX.gameplayStart();
    let firstProfile = true;
    room.onMessage('profile', (m) => {
        Object.assign(S, m);
        refreshWorld(); refreshModal();
        if (firstProfile) {
            firstProfile = false;
            if (!S.seenTutorial) showTutorial(() => net.send('tutorial'));
            else if (S.daily && S.daily.ready) setTimeout(() => toast('📅 Daily reward ready!', '#ffd028'), 2500);
        }
    });
    room.onMessage('toast', (m) => { if (/^You need JUMP/.test(m.text)) notice(m.text); else toast(m.text, m.color); });
    room.onMessage('levelUp', (m) => {
        levelUp(m.to, m.jump);
        sfx('levelUp'); rumble(0.3, 150);
        ring(P.pos, 0x46ec50, 10, 0.8);
        sparkleColumn(P.pos, 0x7dff6b);
    });
    room.onMessage('bounced', (m) => {
        popGain('+' + fmt(m.n) + ' XP', m.mult >= 100 ? 'op' : m.mult > 1 ? 'big' : '', 42 + Math.random() * 16, 40 + Math.random() * 8);
    });
    room.onMessage('wins', (m) => {
        showWin(m.n);
        floatText('+' + comma(m.n) + ' 🏆', '#ffd028', P.pos.clone().add(new V3(2.5, 5, 0)));
        sfx('cheer'); rumble(0.7, 500);
        confettiAt(P.pos.clone().add(new V3(0, 4, 0)));
        fireworks(P.pos, 5, () => sfx('firework'));
        // Back to the spawn to spend the Wins (like the reference)
        P.returning = true;
        setTimeout(() => { P.returning = false; sfx('whoosh'); toSpawn(); sparkleColumn(SPAWN, 0xffd028); }, 1300);
    });
    room.onMessage('upgraded', (m) => {
        bigText('+' + fmt(m.xp) + ' XP per jump!', '#7dff6b');
        sfx('upgrade'); confettiAt(P.pos.clone().add(new V3(0, 4, 0)));
    });
    room.onMessage('quest', (m) => { toast('✅ ' + m.text + ' ' + m.reward, '#7dff6b'); sfx('buy'); });
    room.onMessage('fx', (m) => {
        confettiAt(P.pos.clone().add(new V3(0, 4, 0)));
        sparkleColumn(P.pos, m.kind === 'rebirth' ? 0xff6bd5 : 0xffd028);
        if (m.kind === 'rebirth') { ring(P.pos, 0xff6bd5, 14, 1); fireworks(P.pos, 6, () => sfx('firework')); }
        sfx('buy');
    });
    room.onMessage('boards', renderBoards);
    // The SDK retries dropped connections on its own; the server holds our place for 30 s
    room.onDrop(() => { $('#reconnecting').hidden = false; });
    room.onReconnect(() => { $('#reconnecting').hidden = true; toast('Reconnected!', '#7dff6b'); });
    room.onLeave((code, reason) => {
        console.warn('[net] left room', code, reason || '');
        net.room = null;
        $('#reconnecting').hidden = true;
        if (code !== 1000) $('#offline').hidden = false;
    });
    return room;
}

// =====================================================================================
// Camera & input
// =====================================================================================
const cam = { yaw: Math.PI, pitch: 0.42, dist: 26, target: new V3() };
let camSens = 1;
const keys = {};
const touchMove = { x: 0, y: 0 };
let touchJump = false, running = false;

addEventListener('keydown', (e) => {
    if (e.target && e.target.tagName === 'INPUT') { if (e.key === 'Enter') e.target.blur(); return; }
    keys[e.code] = true;
    if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
    if (e.code === 'KeyE' && running) usePrompt();
    if (e.code === 'Escape') {
        if (!$('#modal').hidden) closeModal();
        else if (running && BX.isEmbedded()) BX.showPortalMenu();
    }
});
addEventListener('keyup', (e) => { keys[e.code] = false; });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; });
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

const drags = new Map();
canvas.addEventListener('pointerdown', (e) => { canvas.setPointerCapture(e.pointerId); drags.set(e.pointerId, { x: e.clientX, y: e.clientY }); canvas.focus(); });
canvas.addEventListener('pointermove', (e) => {
    const d = drags.get(e.pointerId);
    if (!d) return;
    const k = (e.pointerType === 'touch' ? 0.008 : 0.005) * camSens;
    cam.yaw -= (e.clientX - d.x) * k;
    cam.pitch = clamp(cam.pitch + (e.clientY - d.y) * k, -0.6, 1.4);
    d.x = e.clientX; d.y = e.clientY;
});
const endDrag = (e) => drags.delete(e.pointerId);
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);
canvas.addEventListener('wheel', (e) => { cam.dist = clamp(cam.dist + Math.sign(e.deltaY) * 2, 8, 60); e.preventDefault(); }, { passive: false });

if (isTouch) document.body.classList.add('touch');
(function joystick() {
    const stick = $('#stick'), knob = $('#knob');
    let id = null;
    const set = (e) => {
        const r = stick.getBoundingClientRect();
        let dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
        const max = r.width / 2, l = Math.hypot(dx, dy);
        if (l > max) { dx *= max / l; dy *= max / l; }
        knob.style.transform = `translate(${dx}px, ${dy}px)`;
        touchMove.x = dx / max; touchMove.y = dy / max;
    };
    stick.addEventListener('pointerdown', (e) => { id = e.pointerId; stick.setPointerCapture(id); set(e); });
    stick.addEventListener('pointermove', (e) => { if (e.pointerId === id) set(e); });
    const end = (e) => { if (e.pointerId !== id) return; id = null; knob.style.transform = ''; touchMove.x = touchMove.y = 0; };
    stick.addEventListener('pointerup', end); stick.addEventListener('pointercancel', end);
    const jb = $('#jumpBtn');
    jb.addEventListener('pointerdown', (e) => { e.preventDefault(); jb.setPointerCapture(e.pointerId); touchJump = true; });
    jb.addEventListener('pointerup', () => { touchJump = false; });
    jb.addEventListener('pointercancel', () => { touchJump = false; });
})();

function rayHit(o, d, maxT) {
    let best = maxT;
    for (const c of solids) {
        let t0 = 0, t1 = best, hit = true;
        for (const a of ['x', 'y', 'z']) {
            if (Math.abs(d[a]) < 1e-9) { if (o[a] < c.min[a] || o[a] > c.max[a]) { hit = false; break; } continue; }
            let ta = (c.min[a] - o[a]) / d[a], tb = (c.max[a] - o[a]) / d[a];
            if (ta > tb) { const q = ta; ta = tb; tb = q; }
            t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
            if (t0 > t1) { hit = false; break; }
        }
        if (hit && t0 > 0 && t0 < best) best = t0;
    }
    return best;
}
const camDir = new V3(), camGoal = new V3(), camPos = new V3(), lookTmp = new V3();
const ATTRACT_LOOK = new V3(0, 30, 40);
let intro = null, baseFov = camera.fov;
const ease = (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
function updateCamera(dt) {
    if (!running) {
        const t = performance.now() / 1000;
        camera.position.set(Math.sin(t * 0.07) * 120, 70, Math.cos(t * 0.07) * 110 + 60);
        camera.lookAt(ATTRACT_LOOK);
        baseFov = camera.fov;
        return;
    }
    cam.target.lerp(camGoal.set(P.pos.x, P.pos.y + 4.5, P.pos.z), 1 - Math.exp(-dt * 16));
    const cp = Math.cos(cam.pitch);
    camDir.set(Math.sin(cam.yaw) * cp, Math.sin(cam.pitch), Math.cos(cam.yaw) * cp);
    const dist = Math.max(3, rayHit(cam.target, camDir, cam.dist) - 0.8);
    camPos.copy(cam.target).addScaledVector(camDir, dist);
    if (camPos.y < 0.8) camPos.y = 0.8;
    if (intro) {
        intro.t += dt;
        const k = ease(Math.min(1, intro.t / intro.dur));
        camera.position.lerpVectors(intro.from, camPos, k);
        camera.lookAt(lookTmp.lerpVectors(ATTRACT_LOOK, cam.target, k));
        if (intro.t >= intro.dur) intro = null;
    } else {
        camera.position.copy(camPos);
        camera.lookAt(cam.target);
    }
    if (shake > 0.001) {
        const s = shake * shake * 0.9;
        camera.position.x += (Math.random() * 2 - 1) * s;
        camera.position.y += (Math.random() * 2 - 1) * s;
        shake = Math.max(0, shake - dt * 2.2);
    }
    // Falling fast widens the view a little
    const want = (innerWidth < innerHeight ? 85 : 70) + clamp(-P.vel.y - 60, 0, 60) * 0.15;
    baseFov += (want - baseFov) * Math.min(1, dt * 5);
    if (Math.abs(camera.fov - baseFov) > 0.01) { camera.fov = baseFov; camera.updateProjectionMatrix(); }
    sun.position.set(P.pos.x + 50, P.pos.y + 110, P.pos.z - 40);
    sun.target.position.copy(P.pos);
}

// Proximity prompts
let activePrompt = null;
const projV = new V3();
const promptKey = promptEl.querySelector('kbd');
const usingPad = () => pad.connected && performance.now() - pad.lastUsed < 8000;
function updatePrompt() {
    let best = null, bd = Infinity;
    for (const p of prompts) {
        const d = p.pos.distanceTo(P.pos);
        if (d < p.r && d < bd) { bd = d; best = p; }
    }
    activePrompt = best;
    if (!best) { promptEl.hidden = true; return; }
    projV.copy(best.pos).setY(best.pos.y + 2).project(camera);
    if (projV.z > 1) { promptEl.hidden = true; return; }
    promptEl.hidden = false;
    promptEl.style.left = ((projV.x + 1) / 2 * innerWidth) + 'px';
    promptEl.style.top = ((1 - projV.y) / 2 * innerHeight) + 'px';
    const txt = best.label();
    if (promptTxtEl.textContent !== txt) promptTxtEl.textContent = txt;
    const key = usingPad() ? 'X' : 'E';
    if (promptKey.textContent !== key) promptKey.textContent = key;
}
function usePrompt() { if (activePrompt) activePrompt.act(); }
promptEl.addEventListener('click', usePrompt);

// Controller buttons: popups and panels first, then gameplay shortcuts
const shown = (sel) => { const e = $(sel); return !!e && !e.hidden; };
function focusStep(container, dir) {
    const items = [...container.querySelectorAll('button:not(:disabled), input')];
    if (!items.length) return;
    const i = items.indexOf(document.activeElement);
    const next = items[i < 0 ? 0 : (i + dir + items.length) % items.length];
    next.focus({ preventScroll: false });
    next.scrollIntoView({ block: 'nearest' });
}
function padButtons() {
    const p = pad.pressed;
    if (!p.size) return;
    const overlay = ['#start', '#offline', '#buy', '#modal'].find(shown);
    if (overlay) pad.jump = false;
    if (overlay === '#start') { if ((p.has('A') || p.has('START')) && shown('#playBtn')) play(); return; }
    if (overlay === '#offline') { if (p.has('A')) $('#reconnectBtn').click(); return; }
    if (overlay === '#buy') { if (p.has('A')) $('#buyOk').click(); else if (p.has('B')) $('#buyCancel').click(); return; }
    if (overlay === '#modal') {
        const body = $('#modal');
        const el = document.activeElement;
        const onSlider = el && el.type === 'range' && body.contains(el);
        if (onSlider && (p.has('LEFT') || p.has('RIGHT'))) {
            el.value = Number(el.value) + (p.has('RIGHT') ? 5 : -5);
            el.dispatchEvent(new Event('input', { bubbles: true }));
            return;
        }
        if (p.has('DOWN') || p.has('RIGHT')) focusStep(body, 1);
        else if (p.has('UP') || p.has('LEFT')) focusStep(body, -1);
        else if (p.has('A') && el && body.contains(el) && el.tagName === 'BUTTON') el.click();
        else if (['B', 'Y', 'LB', 'RB', 'BACK', 'START'].some((b) => p.has(b))) { closeModal(); canvas.focus(); }
        return;
    }
    if (!running) return;
    if (shown('#tutorial') && p.has('A')) { $('#tutPlay').click(); return; }
    if (p.has('X')) usePrompt();
    if (p.has('Y')) openModal('store');
    if (p.has('LB')) openModal('upgrades');
    if (p.has('RB')) openModal('rebirth');
    if (p.has('BACK')) openModal('gifts');
    if (p.has('START')) openModal('settings');
    if (p.has('UP')) cam.dist = clamp(cam.dist - 4, 8, 60);
    if (p.has('DOWN')) cam.dist = clamp(cam.dist + 4, 8, 60);
    if (['Y', 'LB', 'RB', 'BACK', 'START'].some((b) => p.has(b))) focusStep($('#modal'), 1);
}
onGamepadConnection((g, on) => {
    if (running) toast(on ? '🎮 Controller connected' : '🎮 Controller disconnected', on ? '#7dff6b' : '#ffb51c');
});

// =====================================================================================
// Main update
// =====================================================================================
let clockT = 0, hudT = 0, online = 1, eventWas = null;
const tmpF = new V3(), tmpR = new V3(), mv = new V3();

function update(dt) {
    clockT += dt;
    const t = clockT;
    const now = net.now();
    lowGrav = hasLowGravity(S, now);
    const ev = lowGravityEvent(now);
    if (eventWas !== null && ev !== eventWas) {
        if (ev) { bigText('🪐 LOW GRAVITY!', '#c28cff'); sfx('gate'); } else toast('Low gravity is over!', '#ffd028');
    }
    eventWas = ev;

    let f = 0, r = 0;
    if (keys.KeyW || keys.ArrowUp) f += 1;
    if (keys.KeyS || keys.ArrowDown) f -= 1;
    if (keys.KeyD || keys.ArrowRight) r += 1;
    if (keys.KeyA || keys.ArrowLeft) r -= 1;
    f -= touchMove.y + pad.ly; r += touchMove.x + pad.lx;
    cam.yaw -= pad.rx * 2.8 * dt;
    cam.pitch = clamp(cam.pitch + pad.ry * 1.8 * dt, -0.6, 1.4);
    tmpF.set(-Math.sin(cam.yaw), 0, -Math.cos(cam.yaw));
    tmpR.set(Math.cos(cam.yaw), 0, -Math.sin(cam.yaw));
    mv.set(0, 0, 0).addScaledVector(tmpF, f).addScaledVector(tmpR, r);
    if (mv.lengthSq() > 1) mv.normalize();
    if (P.returning) mv.set(0, 0, 0);
    P.moving = mv.lengthSq() > 0.01;

    // Jump: tap for each jump, or hold to keep jumping at the top of every hop
    const held = !!(keys.Space || touchJump || pad.jump) && !modalOpen();
    const pressed = held && !P.heldPrev;
    P.heldPrev = held;
    if (P.jumpsLeft > 0 && !P.returning) {
        if (P.onGround && held && t - P.lastJumpT > 0.12) doJump(t);
        else if (!P.onGround && (pressed ? t - P.lastJumpT > 0.1 : held && P.vel.y < 6 && t - P.lastJumpT > 0.16)) doJump(t);
    }

    P.vel.y -= gravity() * dt;
    if (P.vel.y < -160) P.vel.y = -160;
    // Horizontal speed eases toward the stick; in winter the ground is icy and you slide
    const grip = P.onGround ? 4 + 26 * weather.grip : 12;
    P.hv.x += (mv.x * CFG.walkSpeed - P.hv.x) * Math.min(1, dt * grip);
    P.hv.z += (mv.z * CFG.walkSpeed - P.hv.z) * Math.min(1, dt * grip);
    P.knock.multiplyScalar(Math.exp(-2.2 * dt));
    const vx = P.hv.x + P.knock.x, vz = P.hv.z + P.knock.z;
    const dist = Math.max(Math.abs(vx), Math.abs(vz), Math.abs(P.vel.y)) * dt;
    const n = Math.max(1, Math.ceil(dist / 0.6));
    const sdt = dt / n;
    const wasGround = P.ground, wasOn = P.onGround;
    P.onGround = false; P.ground = null;
    for (let i = 0; i < n; i++) {
        moveAxis('x', vx * sdt);
        moveAxis('z', vz * sdt);
        moveAxis('y', P.vel.y * sdt);
    }
    if (!P.onGround && wasGround && P.vel.y <= 0 && P.vel.y > -40) {
        // Stick to the ground when walking down small steps
        const y0 = P.pos.y;
        moveAxis('y', -0.3);
        if (!P.onGround) P.pos.y = y0;
    }
    if (P.onGround) {
        const tr = P.ground && P.ground.tramp;
        if (!wasOn) {
            if (P.airTime > 0.3 && !(tr && !trampLocked(tr))) {
                sfx('land');
                dust(P.pos, P.airTime > 0.9 ? 14 : 7, P.airTime > 0.9 ? 1.5 : 1);
                P.squashV -= Math.min(10, 3 + P.airTime * 5);
                if (P.airTime > 2) addShake(0.25);
            }
            P.jumpsLeft = S.jump; P.chain = 0;
            sendMove(true);
        }
        P.airTime = 0;
        // Trampolines bounce you by themselves; locked ones ask for the pass
        if (tr) {
            if (!trampLocked(tr)) bounce(tr, t);
            else if (t - P.lockToastT > 5) { P.lockToastT = t; buy('pass', tr.pass); }
        }
    } else P.airTime += dt;
    if (P.onGround) P.jumpsLeft = Math.max(P.jumpsLeft, S.jump);
    if (P.moving) P.facing = lerpAngle(P.facing, Math.atan2(mv.x, mv.z), 1 - Math.exp(-dt * 14));
    if (P.pos.y < CFG.voidY) { toSpawn(); sfx('whoosh'); }
    if (P.shield > 0) P.shield -= dt;
    else { const L = laserHit(P.pos); if (L) zap(L); }

    for (const tr of triggers) {
        const inside = overlapsBox(tr, P.pos.x, P.pos.y, P.pos.z);
        if (inside && !tr.inside && tr.enter) tr.enter();
        tr.inside = inside;
    }

    // Trail behind you while airborne
    if (!P.onGround) {
        P.trailT -= dt;
        if (P.trailT <= 0) { P.trailT = 0.04; emitTrail(P.pos, myTrail().colors, 1); }
    }

    updateGuide(dt);
    updateEffects(dt);
    updateFx(dt);
    updateWorld(dt, t, P.pos);
    updateWeather(dt, t, P.pos.y);
    for (const fn of tickers) fn(dt, t);

    online = syncRemotes(dt, t);

    rig.position.copy(P.pos);
    rig.rotation.y = P.facing;
    const runAnim = P.moving && P.onGround;
    P.animPhase += dt * (P.onGround ? (runAnim ? 14 : 4) : 0);
    if (P.onGround) animRig(rig, P.animPhase, runAnim ? 0.9 : 0); else airPose(rig);
    if (localAvatar) localAvatar.update(dt, { moving: runAnim, air: !P.onGround, speed: CFG.walkSpeed, t });
    const stepN = Math.floor(P.animPhase / Math.PI);
    if (runAnim && stepN !== P.lastStep) sfx('step');
    P.lastStep = stepN;
    // Squash & stretch spring around 1
    P.squashV += (1 - P.squash) * 180 * dt;
    P.squashV *= Math.exp(-12 * dt);
    P.squash = clamp(P.squash + P.squashV * dt, 0.7, 1.3);
    rig.scale.set(1 / Math.sqrt(P.squash), P.squash, 1 / Math.sqrt(P.squash));
    setSpeedLines(P.vel.y < -70 ? Math.min(1, (-P.vel.y - 70) / 60) : 0, dt);

    sendMove(false);
    updatePrompt();
    animateCounters(dt);
    hudT -= dt;
    if (hudT <= 0) { hudT = 0.1; updateHud({ y: P.pos.y, air: !P.onGround, left: Math.max(0, P.jumpsLeft), lowGrav, online, weather }); refreshWorld(); }
}

// =====================================================================================
// Boot
// =====================================================================================
let lastFrame = 0, loadingSignaled = false, fpsAcc = 0, fpsFrames = 0, showFps = false, fpsLast = 0;
function frame(now) {
    const dt = Math.min(0.05, (now - (lastFrame || now)) / 1000);
    fpsAcc += (now - (lastFrame || now)) / 1000; fpsFrames++;
    if (fpsAcc >= 0.5) { fpsLast = Math.round(fpsFrames / fpsAcc); if (showFps) $('#fps').textContent = fpsLast + ' FPS'; fpsAcc = 0; fpsFrames = 0; }
    lastFrame = now;
    if (!loadingSignaled) {
        // First frame after setup: apply portal settings and lift the Bloxity loading overlay
        loadingSignaled = true;
        BX.triggerAllSettings();
    }
    pollGamepad();
    padButtons();
    if (running) update(dt);
    else { const t = now / 1000; for (const fn of tickers) fn(dt, t); updateWeather(dt, t, 0); }
    updateCamera(dt);
    render();
    requestAnimationFrame(frame);
}

// Straight into the game: no menu. Joins with the Bloxity name (or guest name) automatically.
let joining = false;
async function play() {
    if (joining || running) return;
    joining = true;
    const err = $('#connectErr'), retry = $('#playBtn');
    err.hidden = true; retry.hidden = true;
    $('#loading').hidden = false;
    $('#loading').textContent = 'Joining…';
    BX.loadingStep('Joining a server…');
    initAudio();
    try {
        await waitForLogin(1500);
        const saved = (storageGet('jpj_name') || '').slice(0, 20);
        const room = await connect(BX.identity().loggedIn ? '' : saved);
        const me = room.state.players && room.state.players.get(room.sessionId);
        S.name = me ? me.name : S.name;
    } catch (e) {
        console.error(e);
        joining = false;
        $('#loading').hidden = true;
        err.hidden = false;
        err.textContent = 'Could not reach the game server. Check your connection and try again.';
        // Technical detail for debugging hosted deploys
        const det = document.createElement('div');
        det.style.cssText = 'font-size:0.8rem;opacity:0.75;margin-top:0.4rem;word-break:break-all';
        det.textContent = (lastEndpoint ? lastEndpoint + ' · ' : '') + ((e && (e.message || e.code)) || String(e));
        err.appendChild(det);
        retry.hidden = false;
        BX.loadingEnd();
        return;
    }
    joining = false;
    intro = { t: 0, dur: 2.2, from: camera.position.clone() };
    running = true;
    startMusic();
    $('#start').hidden = true;
    $('#hud').hidden = false;
    $('#touch').hidden = !isTouch;
    if (!rig) buildPlayer();
    toSpawn();
    showTips();
    canvas.focus();
    BX.loadingEnd();
}
// Embedded games get the Bloxity user from the portal handshake a moment after init
function waitForLogin(ms) {
    if (!BX.bloxity.ready || BX.identity().loggedIn) return Promise.resolve();
    return new Promise((res) => {
        const t0 = performance.now();
        (function check() { if (BX.identity().loggedIn || performance.now() - t0 > ms) res(); else setTimeout(check, 100); })();
    });
}
// Controls reminder for the first seconds of play
function showTips() {
    const el = $('#tips');
    const k = (key, what) => `<span><kbd>${key}</kbd>${what}</span>`;
    el.innerHTML = pad.connected
        ? k('L', 'Move') + k('A', 'Jump (hold to keep jumping)') + k('X', 'Interact') + k('R', 'Camera')
        : isTouch
            ? '<span>Joystick to move · hold JUMP to keep jumping · drag to look</span>'
            : k('WASD', 'Move') + k('Space', 'Jump (hold = keep jumping)') + k('E', 'Interact') + k('Drag', 'Camera') + k('Wheel', 'Zoom');
    el.hidden = false; el.style.opacity = 1;
    setTimeout(() => { el.style.opacity = 0; }, 9000);
    setTimeout(() => { el.hidden = true; }, 9900);
}
// Browsers only start audio after a user gesture
function unlockAudioOnGesture() {
    const unlock = () => { initAudio(); startMusic(); removeEventListener('pointerdown', unlock); removeEventListener('keydown', unlock); removeEventListener('touchstart', unlock); };
    addEventListener('pointerdown', unlock); addEventListener('keydown', unlock); addEventListener('touchstart', unlock);
}

// Portal settings only apply when the game runs inside bloxity.io (standalone has its own panel)
weather.onChange = (season) => {
    if (!running) return;
    const msg = { summer: 'Sunny skies are back!', rain: 'Storm incoming - watch the lightning!', autumn: 'The leaves are turning!', winter: 'Brr! The ground is icy - you will slide!' }[season.id];
    bigText(season.ic + ' ' + season.name, '#ffffff');
    toast(msg, '#ffd028');
    sfx('gate');
};
function wirePortalSettings() {
    const embedded = (fn) => (v) => { if (BX.isEmbedded()) fn(v); };
    const pct = (v) => clamp((parseInt(v, 10) || 0) / 100, 0, 1);
    BX.listenSetting('master_volume', embedded((v) => setVolume('master', pct(v))));
    BX.listenSetting('music_volume', embedded((v) => setVolume('music', pct(v))));
    BX.listenSetting('graphics_quality', embedded((v) => setQuality(v === 'Low' ? 'low' : v === 'Medium' ? 'medium' : 'high')));
    BX.listenSetting('camera_sensitivity', embedded((v) => { camSens = clamp(parseFloat(v) || 1, 0.1, 5); }));
    BX.listenSetting('show_fps', (v) => { showFps = v === 'true'; $('#fps').hidden = !showFps; });
}
function wirePortalEvents() {
    BX.onPortalEvent((event, data) => {
        if (event === 'respawn_request') { if (running) toSpawn(); }
        else if (event === 'chat_message_sent' && data) net.send('chat', { text: String(data) });
        else if (event === 'play_emote' && data) { playEmoteOn(localAvatar, String(data)); net.send('emote', { id: String(data) }); }
    });
    BX.onAvatarChanged(() => syncMyAvatar());
    BX.onProportionsChanged(() => syncMyAvatar());
}
// Account chip in the HUD
function showIdentity(id) {
    const avail = BX.bloxity.ready;
    $('#acct').hidden = !avail;
    if (!avail) return;
    $('#acctName').textContent = id.name || 'Guest';
    $('#acctBtn').textContent = id.loggedIn ? 'Log out' : 'Log in';
    const pfp = $('#acctPfp');
    pfp.hidden = !id.pfp;
    if (id.pfp) pfp.src = id.pfp;
}
function toggleLogin() { if (BX.identity().loggedIn) BX.logout(); else BX.login(); }

async function boot() {
    BX.initBloxity();
    BX.loadingStep('Loading fonts…');
    try { await Promise.race([document.fonts.load('700 40px Fredoka'), new Promise((r) => setTimeout(r, 2500))]); } catch (e) { /* fallback font */ }
    BX.loadingStep('Building the island…');
    buildWorld();
    const batched = mergeStatic();
    if (import.meta.env.DEV) console.info('[world] batched', batched.before, 'boxes into', batched.after, 'meshes');
    loadBase().catch(() => {}); // warm up the Bloxity body model
    wirePortalSettings();
    wirePortalEvents();
    BX.loadCatalogPrices().then((changed) => { if (changed) refreshWorld(); });
    BX.onIdentity((id) => {
        showIdentity(id);
        // Logged in after joining: move this session onto the Bloxity profile
        if (net.room && id.loggedIn && id.token && !net.bloxity) net.send('auth', { token: id.token });
        if (net.room) { setupLocalAvatar(); syncMyAvatar(); }
    });
    $('#acctBtn').addEventListener('click', toggleLogin);
    $('#acctPfp').addEventListener('error', (e) => { e.target.hidden = true; });
    $('#playBtn').addEventListener('click', play);
    $('#reconnectBtn').addEventListener('click', () => location.reload());
    unlockAudioOnGesture();
    requestAnimationFrame(frame);
    play();
}
boot();

// Dev-only hooks for automated QA runs (stripped from production builds)
if (import.meta.env.DEV) {
    window.__qa = {
        P, S, net, actions, avatarStats, scene, cam, keys, openModal,
        fps: () => fpsLast,
        draws: () => ({ calls: renderer.info.render.calls, tris: renderer.info.render.triangles, solids: solids.length }),
        teleport: (x, y, z) => teleport(new V3(x, y, z), 0),
        state: () => ({ x: P.pos.x, y: P.pos.y, z: P.pos.z, ground: P.onGround, left: P.jumpsLeft, wins: S.wins, level: S.level, xp: S.xp, jump: S.jump, upg: S.upg, rebirths: S.rebirths, quest: S.quest }),
    };
}
