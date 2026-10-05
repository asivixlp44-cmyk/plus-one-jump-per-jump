import { $ } from './engine.js';
import { S, net } from './state.js';
import * as BX from './bloxity.js';
import { sfx, getVolumes, setVolume } from './audio.js';
import { QUALITIES, getQuality, setQuality } from './fx.js';
import { fillIcons } from './icons.js';
import {
    CFG, PRODUCTS, PASSES, QUESTS, TUTORIAL_STEPS, FREE, DAILY, TRAILS, MAX_UPG, SEASONS,
    xpFor, xpPerJump, upgCost, xpMult, lowGravityEvent, eventLeft, fmt, comma, clock,
} from '../../shared/config.js';

// Bux coin + amount (our own strings only; never user text)
const bux = (n) => '<i class="bx" aria-hidden="true"></i>' + fmt(n);
function setHtml(node, html) { if (node && node.innerHTML !== html) node.innerHTML = html; }
function setText(node, text) { if (node && node.textContent !== text) node.textContent = text; }

const el = {
    wins: $('#winsVal'), reb: $('#rebVal'), rebTxt: $('#rebTxt'), jump: $('#jumpVal'), jumpTxt: $('#jumpTxt'),
    lvl: $('#lvlVal'), xpFill: $('#xpFill'), xpTxt: $('#xpTxt'),
    eventPill: $('#eventPill'), eventTxt: $('#eventTxt'), giftsPill: $('#giftsPill'), giftsTxt: $('#giftsTxt'),
    gravPill: $('#gravPill'), gravTxt: $('#gravTxt'), xpBoostPill: $('#xpBoostPill'), xpBoostTxt: $('#xpBoostTxt'),
    quest: $('#quest'), questStep: $('#questStep'), questStepN: $('#questStepN'), questTag: $('#questTag'), questTxt: $('#questTxt'),
    height: $('#heightVal'), best: $('#bestVal'), jumpsLeft: $('#jumpsLeft'),
    upgBadge: $('#upgBadge'), rebBadge: $('#rebBadge'), giftBadge: $('#giftBadge'), dailyBadge: $('#dailyBadge'),
    prompt: $('#promptBtn'), promptTxt: $('#promptTxt'),
};
export const promptEl = el.prompt, promptTxtEl = el.promptTxt;
fillIcons();

// ----- HUD -----
const shown = { wins: null };
function bump(node) { const s = node.closest('.bump-me'); if (!s) return; s.classList.remove('bump'); void s.offsetWidth; s.classList.add('bump'); }
export function bumpJump() { bump(el.jump); }
// Wins count up smoothly to their new value
export function animateCounters(dt) {
    const target = S.wins;
    if (shown.wins === null) shown.wins = target;
    if (shown.wins === target) return;
    if (target > shown.wins) bump(el.wins);
    const diff = target - shown.wins;
    shown.wins = Math.abs(diff) < 1 ? target : shown.wins + diff * Math.min(1, dt * 7);
    if (Math.abs(target - shown.wins) < Math.max(1, target * 0.002)) shown.wins = target;
    setText(el.wins, comma(shown.wins));
}

const statValue = (stat) => (stat === 'level' ? S.level : S[stat]) || 0;
const giftsReady = () => {
    const mins = (net.now() - S.joinedAt) / 60000;
    return FREE.filter((r, i) => mins >= r.min && !S.freeClaimed[i]).length;
};
export function updateHud(info) {
    const now = net.now();
    setText(el.lvl, String(S.level));
    const need = xpFor(S.level);
    el.xpFill.style.width = Math.min(100, S.xp / need * 100) + '%';
    setText(el.xpTxt, comma(S.xp) + ' / ' + comma(need) + ' XP');
    setText(el.reb, comma(S.rebirths));
    setText(el.rebTxt, 'REBIRTHS · x' + fmt(xpMult(S, now)) + ' XP');
    setText(el.jump, comma(S.jump));
    const boosted = !!S.passes.DoubleJump || info.lowGrav;
    setHtml(el.jumpTxt, boosted ? 'JUMP · <span class="boost">BOOSTED</span>' : 'JUMP POWER');
    // Event pill: LOW GRAVITY countdown on the server clock
    const live = lowGravityEvent(now);
    el.eventPill.classList.toggle('live', live);
    setText(el.eventTxt, live ? 'LOW GRAVITY LIVE! ' + clock(eventLeft(now)) : 'EVENT ' + clock(eventLeft(now)));
    // Weather pill: the season and how long it lasts
    if (info.weather) {
        const se = SEASONS[info.weather.season];
        const wp = $('#weatherPill');
        if (wp.dataset.season !== se.id) wp.dataset.season = se.id;
        setText($('#weatherIc'), se.ic);
        setText($('#weatherTxt'), se.name + ' ' + clock(info.weather.left));
    }
    const gifts = giftsReady();
    el.giftsPill.classList.toggle('none', gifts === 0);
    setText(el.giftsTxt, gifts ? gifts + (gifts === 1 ? ' GIFT READY!' : ' GIFTS READY!') : 'GIFTS');
    const grav = (S.gravUntil - now) / 1000, xb = (S.xpBoostUntil - now) / 1000;
    el.gravPill.hidden = grav <= 0; if (grav > 0) setText(el.gravTxt, 'NO GRAVITY ' + clock(grav));
    el.xpBoostPill.hidden = xb <= 0; if (xb > 0) setText(el.xpBoostTxt, 'x2 XP ' + clock(xb));
    // Quest card: the first steps are the tutorial
    const q = QUESTS[S.quest];
    el.quest.hidden = !q;
    if (q) {
        const tut = S.quest < TUTORIAL_STEPS;
        setText(el.questStepN, tut ? (S.quest + 1) + '/' + TUTORIAL_STEPS : '#' + (S.quest + 1));
        el.questStep.firstChild.textContent = tut ? 'STEP' : 'QUEST';
        setText(el.questTag, tut ? '★ TUTORIAL' : '★ QUEST');
        const v = Math.min(statValue(q.stat), q.n);
        const extra = q.stat === 'level' && S.quest === 0 ? ' (you: ' + S.level + ')' : ' (' + comma(v) + '/' + comma(q.n) + ')';
        setText(el.questTxt, q.text + extra);
    }
    // Height pill: how high you are, jumps left in this flight, best height ever
    setText(el.height, comma(Math.max(0, Math.floor(info.y))));
    setText(el.jumpsLeft, info.air ? '🦘 ' + info.left + ' left' : '');
    setText(el.best, comma(Math.max(S.best, Math.floor(info.y))));
    // Badges
    el.upgBadge.hidden = !(S.upg < MAX_UPG && S.wins >= upgCost(S.upg));
    el.rebBadge.hidden = S.level < CFG.rebirthLevel;
    el.giftBadge.hidden = gifts === 0; setText(el.giftBadge, String(gifts));
    el.dailyBadge.hidden = !(S.daily && S.daily.ready);
    // Pass and product prices on the side buttons
    document.querySelectorAll('[data-pass]').forEach((n) => {
        const k = n.dataset.pass;
        setHtml(n.querySelector('.pr'), S.passes[k] ? 'OWNED' : bux(PASSES[k].price));
        n.classList.toggle('owned', !!S.passes[k]);
    });
    document.querySelectorAll('[data-price]').forEach((n) => setHtml(n, bux(PRODUCTS[n.dataset.price].price)));
    if (!$('#modal').hidden && (modalKind === 'gifts' || modalKind === 'upgrades')) liveRefresh();
}

export function toast(text, color) {
    const d = document.createElement('div');
    d.className = 'toast o'; d.textContent = text; d.style.color = color || '#fff';
    const box = $('#toasts');
    box.appendChild(d);
    while (box.children.length > 3) box.firstChild.remove();
    setTimeout(() => d.remove(), 2400);
}
// "+10 XP" popups that float up around your character
export function popGain(text, kind, x, y) {
    const box = $('#gains');
    if (box.children.length > 14) box.firstChild.remove();
    const d = document.createElement('div');
    d.className = 'gain o' + (kind ? ' ' + kind : '');
    d.textContent = text;
    d.style.left = (x !== undefined ? x : 40 + Math.random() * 20) + '%';
    d.style.top = (y !== undefined ? y : 40 + Math.random() * 14) + '%';
    box.appendChild(d);
    setTimeout(() => d.remove(), 1000);
}
export function bigText(text, color) {
    const d = $('#bigText');
    d.textContent = text; d.style.color = color || '#fff';
    d.classList.remove('show'); void d.offsetWidth; d.classList.add('show');
}
// Red strip under the quest card: "You need JUMP 24+ for this pad!"
let noticeTimer;
export function notice(text) {
    const n = $('#notice');
    n.textContent = text;
    n.hidden = false;
    clearTimeout(noticeTimer);
    noticeTimer = setTimeout(() => { n.hidden = true; }, 2600);
}
function flash(kind) {
    const f = $('#flash');
    f.classList.remove('show', 'gold', 'red'); void f.offsetWidth; f.classList.add('show');
    if (kind) f.classList.add(kind);
}
export function showWin(n) {
    const w = $('#winTop');
    w.textContent = '+' + comma(n) + (n === 1 ? ' WIN!' : ' WINS!');
    w.classList.remove('show'); void w.offsetWidth; w.classList.add('show');
    flash('gold');
}
export function levelUp(to, jump) {
    flash();
    $('#luSub').textContent = 'Level ' + to + ' · Jump ' + comma(jump);
    const d = $('#levelUp');
    d.classList.remove('show'); void d.offsetWidth; d.classList.add('show');
    bump($('#lvlVal'));
}
// First-visit how-to card; gameplay keeps running behind it
export function showTutorial(onDone) {
    const t = $('#tutorial');
    t.hidden = false;
    const done = () => { t.hidden = true; onDone(); };
    $('#tutPlay').onclick = done;
    setTimeout(() => { if (!t.hidden) done(); }, 15000);
}

// ----- purchases (free in the web demo; the server grants them) -----
let pendingBuy = null;
export function buy(kind, key) {
    if (kind === 'pass' && S.passes[key]) { toast(PASSES[key].name + ' already owned!', '#6fe0ff'); return; }
    const item = kind === 'pass' ? PASSES[key] : PRODUCTS[key];
    if (!item) return;
    if (net.bux) { buyBux(kind, key); return; }
    pendingBuy = { kind, key };
    $('#buyItem').textContent = item.name;
    setHtml($('#buyCost'), bux(item.price) + ' Bux');
    $('#buy').hidden = false;
}
// Bloxity shows its own confirm modal; the grant arrives from the server after its webhook
async function buyBux(kind, key) {
    const r = await BX.buyWithBux(kind, key);
    if (r.success) { toast('Purchase complete!', '#7dff6b'); return; }
    if (r.error && !/cancel/i.test(r.error)) toast(r.error, '#ff5a5a');
}
$('#buyOk').addEventListener('click', () => {
    $('#buy').hidden = true;
    if (pendingBuy) net.send('buy', pendingBuy);
    pendingBuy = null;
});
$('#buyCancel').addEventListener('click', () => { $('#buy').hidden = true; pendingBuy = null; });
document.querySelectorAll('[data-pass]').forEach((b) => b.addEventListener('click', () => buy('pass', b.dataset.pass)));
$('#btnNoGrav').addEventListener('click', () => buy('product', 'NoGravity'));

// ----- panels -----
let modalKind = null;
export function openModal(kind) { modalKind = kind; renderModal(); $('#modal').hidden = false; }
export function closeModal() { $('#modal').hidden = true; modalKind = null; }
export function refreshModal() { if (!$('#modal').hidden) renderModal(); }
export const modalOpen = () => !$('#modal').hidden;
$('#modalClose').addEventListener('click', closeModal);
$('#modal').addEventListener('pointerdown', (e) => { if (e.target.id === 'modal') closeModal(); });
document.querySelectorAll('[data-open]').forEach((b) => b.addEventListener('click', () => openModal(b.dataset.open)));
$('#btnStore').addEventListener('click', () => openModal('store'));
$('#giftsPill').addEventListener('click', () => openModal('gifts'));
// Every chunky button clicks
document.addEventListener('pointerdown', (e) => { if (e.target.closest && e.target.closest('.btn')) sfx('click'); });

function rowCard(ic, name, desc, btnText, btnClass, onClick, disabled) {
    const d = document.createElement('div');
    d.className = 'row-card';
    d.innerHTML = '<div class="ic"></div><div><div class="nm o1"></div><div class="ds"></div></div><button class="btn o1"></button>';
    d.querySelector('.ic').textContent = ic;
    d.querySelector('.nm').textContent = name;
    d.querySelector('.ds').textContent = desc;
    const b = d.querySelector('button');
    b.classList.add(btnClass);
    setHtml(b, btnText); b.disabled = !!disabled;
    b.addEventListener('click', onClick);
    return d;
}
function sec(text) { const d = document.createElement('div'); d.className = 'sec'; d.textContent = text; return d; }
function para(text) { const p = document.createElement('p'); p.className = 'desc'; p.textContent = text; return p; }
const rewardStr = (r) => [r.xp ? '+' + fmt(r.xp) + ' XP' : '', r.wins ? '+' + fmt(r.wins) + ' Wins' : ''].filter(Boolean).join(' + ');

const TITLES = {
    upgrades: 'JUMP UPGRADES', rebirth: 'REBIRTH', trails: 'TRAILS', gifts: 'GIFTS', daily: 'DAILY REWARD',
    quests: 'QUESTS', codes: 'CODES', settings: 'SETTINGS', store: 'STORE', friends: 'FRIENDS',
};
function renderModal() {
    const body = $('#modalBody');
    $('#modalTitle').textContent = TITLES[modalKind] || '';
    body.innerHTML = '';
    const fn = {
        upgrades: renderUpgrades, rebirth: renderRebirth, trails: renderTrails, gifts: renderGifts, daily: renderDaily,
        quests: renderQuests, codes: renderCodes, settings: renderSettings, store: renderStore, friends: renderFriends,
    }[modalKind];
    if (fn) fn(body);
    fillIcons(body);
}
// Panels with timers or affordability redraw in place without losing focus
let liveKey = '';
function liveRefresh() {
    const key = modalKind + '|' + S.wins + '|' + S.upg + '|' + Math.floor((net.now() - S.joinedAt) / 1000) + '|' + JSON.stringify(S.freeClaimed);
    if (key === liveKey) return;
    liveKey = key;
    if (modalKind === 'gifts' || modalKind === 'upgrades') {
        const focusId = document.activeElement && document.activeElement.dataset ? document.activeElement.dataset.fid : null;
        renderModal();
        if (focusId) { const f = $('#modalBody [data-fid="' + focusId + '"]'); if (f) f.focus(); }
    }
}

// NOW (+1 XP per jump · Lv 1) ▶ NEXT (+2 XP · Lv 2), then [🏆 cost] [BUY MAX] [+1 LEVEL]
function renderUpgrades(body) {
    const w = document.createElement('div');
    w.className = 'upg';
    const lv = S.upg, maxed = lv >= MAX_UPG, cost = upgCost(lv);
    w.appendChild(para('More XP every jump = faster levels = HIGHER JUMPS!'));
    const cmp = document.createElement('div');
    cmp.className = 'cmp';
    cmp.innerHTML = '<div class="box"><small>NOW</small><b class="o"></b><small></small></div><div class="arrow o">▶</div><div class="box next"><small>NEXT</small><b class="o"></b><small></small></div>';
    const [now, , next] = cmp.children;
    now.children[1].textContent = '+' + fmt(xpPerJump(lv)) + ' XP';
    now.children[2].textContent = 'per jump · Lv ' + lv;
    next.children[1].textContent = maxed ? 'MAX' : '+' + fmt(xpPerJump(lv + 1)) + ' XP';
    next.children[2].textContent = maxed ? 'all levels bought' : 'per jump · Lv ' + (lv + 1);
    w.appendChild(cmp);
    const yw = document.createElement('div');
    yw.className = 'yw o1';
    yw.textContent = 'Your Wins: ' + comma(S.wins);
    w.appendChild(yw);
    const acts = document.createElement('div');
    acts.className = 'acts';
    const can = !maxed && S.wins >= cost;
    acts.innerHTML = '<button class="btn o1 g-green" data-fid="cost"><i data-icon="trophy"></i><span></span></button><button class="btn o1 g-blue" data-fid="max">BUY MAX</button><button class="btn o1 g-yellow" data-fid="one">+1 LEVEL</button>';
    acts.children[0].querySelector('span').textContent = maxed ? 'MAX' : comma(cost);
    acts.children[0].disabled = true;
    acts.children[0].style.opacity = 1;
    acts.children[1].disabled = !can; acts.children[2].disabled = !can;
    acts.children[1].addEventListener('click', () => net.send('upgrade', { max: true }));
    acts.children[2].addEventListener('click', () => net.send('upgrade', {}));
    w.appendChild(acts);
    if (!can && !maxed) w.appendChild(para('Need ' + comma(cost - S.wins) + ' more Wins. Climb the towers and touch the win pads!'));
    body.appendChild(w);
}
function renderRebirth(body) {
    const cur = 1 + S.rebirths, next = cur + 1;
    const ready = S.level >= CFG.rebirthLevel;
    const w = document.createElement('div');
    w.className = 'rebirth-box';
    w.innerHTML = `<div class="big o">🔄 ${comma(S.rebirths)} Rebirths</div>
        <div class="mult o"><span style="color:#6fe0ff">x${cur} XP</span><span>➜</span><span style="color:#7dff6b">x${next} XP</span></div>
        <p>Each rebirth adds +1x to every jump's XP. Your level (and Jump power) goes back to 1. You keep your Wins, upgrades, trails and passes.</p>
        <p style="color:${ready ? '#7dff6b' : '#ffb51c'};font-weight:700">${ready ? 'Ready to rebirth!' : 'Reach Level ' + CFG.rebirthLevel + ' to rebirth (now Level ' + S.level + ')'}</p>`;
    const b = document.createElement('button');
    b.className = 'btn o ' + (ready ? 'g-green' : 'g-grey');
    b.textContent = 'REBIRTH';
    b.disabled = !ready;
    b.addEventListener('click', () => net.send('rebirth'));
    w.appendChild(b);
    body.appendChild(w);
}
function renderTrails(body) {
    body.appendChild(para('Trails follow you through the air on every jump. Everyone can see them!'));
    for (const t of TRAILS) {
        const owned = (t.cost === 0 && !t.pass) || S.trails[t.id] || (t.pass && S.passes[t.pass]);
        const on = S.trail === t.id;
        const btn = on ? 'EQUIPPED' : owned ? 'EQUIP' : t.pass ? bux(PASSES[t.pass].price) : '<i data-icon="trophy" style="width:1.3em;height:1.3em;margin-right:0.25em"></i>' + comma(t.cost);
        const ic = { None: '⛔', Sparkle: '✨', Bubble: '🫧', Fire: '🔥', Toxic: '☢️', Galaxy: '🌌', Rainbow: '🌈' }[t.id] || '✨';
        const card = rowCard(ic, t.id === 'None' ? 'No Trail' : t.id + ' Trail', t.pass ? 'Game pass' : owned ? 'Owned' : 'Costs ' + comma(t.cost) + ' Wins',
            btn, on ? 'g-grey' : owned ? 'g-green' : t.pass ? 'g-pink' : 'g-yellow',
            () => { if (t.pass && !owned) buy('pass', t.pass); else net.send('trail', { id: t.id }); }, on);
        if (on) card.classList.add('on');
        body.appendChild(card);
    }
}
function renderGifts(body) {
    const mins = (net.now() - S.joinedAt) / 60000;
    body.appendChild(para('Free gifts for playing! Keep jumping to unlock them all.'));
    FREE.forEach((r, i) => {
        const claimed = !!S.freeClaimed[i];
        const ready = mins >= r.min;
        const btn = claimed ? 'Claimed' : ready ? 'CLAIM' : clock(r.min * 60 - mins * 60);
        const card = rowCard(r.wins ? '🏆' : '⭐', rewardStr(r), 'Play for ' + r.min + ' min', btn,
            claimed ? 'g-grey' : ready ? 'g-green' : 'g-blue', () => { if (!claimed && ready) net.send('free', { i }); }, claimed || !ready);
        card.querySelector('button').dataset.fid = 'g' + i;
        body.appendChild(card);
    });
}
function renderDaily(body) {
    const d = S.daily || { ready: false, day: 0 };
    const week = document.createElement('div');
    week.className = 'daily';
    week.innerHTML = '<p class="desc">Log in every day! Miss a day and the streak starts over.</p><div class="days"></div>';
    const days = week.querySelector('.days');
    DAILY.forEach((r, i) => {
        const done = d.ready ? i < d.day : i <= d.day;
        const today = d.ready && i === d.day;
        const c = document.createElement('div');
        c.className = 'day o1' + (done ? ' done' : '') + (today ? ' today' : '') + (i === DAILY.length - 1 ? ' big' : '');
        c.innerHTML = '<b>Day ' + (i + 1) + '</b><span class="di">' + (r.wins && r.xp ? '🎁' : r.wins ? '🏆' : '⭐') + '</span><small>' +
            [r.xp ? fmt(r.xp) + ' XP' : '', r.wins ? r.wins + 'W' : ''].filter(Boolean).join(' + ') + '</small>' + (done ? '<i>✔</i>' : '');
        days.appendChild(c);
    });
    const claim = document.createElement('button');
    claim.className = 'btn o1 ' + (d.ready ? 'g-green' : 'g-grey');
    claim.textContent = d.ready ? 'CLAIM DAY ' + (d.day + 1) : 'Come back tomorrow!';
    claim.disabled = !d.ready;
    claim.addEventListener('click', () => net.send('daily'));
    week.appendChild(claim);
    body.appendChild(week);
}
function renderQuests(body) {
    QUESTS.forEach((q, i) => {
        if (i < S.quest - 2 || i > S.quest + 4) return;
        const done = i < S.quest, cur = i === S.quest;
        const v = Math.min(statValue(q.stat), q.n);
        const r = document.createElement('div');
        r.className = 'quest-row' + (done ? ' done' : '') + (cur ? ' cur' : '');
        r.innerHTML = '<span></span><span class="o1"></span><small class="o1"></small>' + (cur ? '<div class="qbar"><div></div></div>' : '');
        r.children[0].textContent = done ? '✅' : cur ? '⭐' : '🔒';
        r.children[1].textContent = q.text + (cur ? ' (' + comma(v) + '/' + comma(q.n) + ')' : '');
        r.children[2].textContent = rewardStr(q.reward);
        if (cur) r.querySelector('.qbar div').style.width = (v / q.n * 100) + '%';
        body.appendChild(r);
    });
    if (S.quest >= QUESTS.length) body.appendChild(para('All quests done. You are a jump legend!'));
}
function renderCodes(body) {
    body.appendChild(para('Got a code? Type it in for free rewards!'));
    const row = document.createElement('div');
    row.className = 'code-row';
    row.innerHTML = '<input id="codeIn" maxlength="24" placeholder="ENTER CODE" aria-label="Code" autocomplete="off"><button class="btn g-green o1" id="codeGo">Redeem</button>';
    const go = () => { const v = row.querySelector('input').value.trim(); if (v) net.send('code', { code: v }); row.querySelector('input').value = ''; };
    row.querySelector('button').addEventListener('click', go);
    row.querySelector('input').addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); e.stopPropagation(); });
    body.appendChild(row);
    body.appendChild(para('Try: RELEASE · JUMP · LEGION · BLOXITY'));
}
function renderSettings(body) {
    const vols = getVolumes();
    const w = document.createElement('div');
    w.className = 'settings';
    w.innerHTML = `
        <label class="set-row o1" for="volMusic"><span>🎵 Music</span><input id="volMusic" type="range" min="0" max="100" value="${Math.round(vols.music * 100)}"></label>
        <label class="set-row o1" for="volSfx"><span>🔊 Sound effects</span><input id="volSfx" type="range" min="0" max="100" value="${Math.round(vols.sfx * 100)}"></label>
        <div class="set-row o1"><span>✨ Graphics</span><div class="seg" role="radiogroup" aria-label="Graphics quality"></div></div>
        <p class="set-note">Low turns off glow and shadows for older phones.</p>`;
    w.querySelector('#volMusic').addEventListener('input', (e) => setVolume('music', e.target.value / 100));
    w.querySelector('#volSfx').addEventListener('input', (e) => setVolume('sfx', e.target.value / 100));
    const seg = w.querySelector('.seg');
    for (const [key, q] of Object.entries(QUALITIES)) {
        const b = document.createElement('button');
        b.className = 'btn o1 ' + (getQuality() === key ? 'g-green' : 'g-grey');
        b.textContent = q.label;
        b.setAttribute('role', 'radio');
        b.setAttribute('aria-checked', String(getQuality() === key));
        b.addEventListener('click', () => { setQuality(key); renderModal(); });
        seg.appendChild(b);
    }
    body.appendChild(w);
    if (BX.bloxity.ready) {
        const f = document.createElement('button');
        f.className = 'btn g-blue o1';
        f.style.cssText = 'font-size:1.1rem;padding:0.45rem';
        f.textContent = '👥 Friends & invites';
        f.addEventListener('click', () => openModal('friends'));
        body.appendChild(f);
    }
}
function renderStore(body) {
    body.appendChild(sec('Game passes'));
    for (const k of Object.keys(PASSES)) {
        const p = PASSES[k], owned = !!S.passes[k];
        body.appendChild(rowCard(p.ic, p.name, p.desc, owned ? 'OWNED' : bux(p.price), owned ? 'g-grey' : 'g-green', () => buy('pass', k), owned));
    }
    body.appendChild(sec('Boosts'));
    body.appendChild(rowCard('🪐', 'No Gravity', '15 minutes of x1.6 higher jumps', bux(PRODUCTS.NoGravity.price), 'g-purple', () => buy('product', 'NoGravity')));
    body.appendChild(rowCard('⚡', 'x2 XP Boost', '15 minutes of double XP', bux(PRODUCTS.XPBoost.price), 'g-yellow', () => buy('product', 'XPBoost')));
    body.appendChild(sec('Wins'));
    for (const k of ['Wins100', 'Wins1K', 'Wins10K']) {
        const p = PRODUCTS[k];
        body.appendChild(rowCard('🏆', p.name, 'Spend them on Jump Upgrades and Trails', bux(p.price), 'g-yellow', () => buy('product', k)));
    }
    if (!S.claimedPack) body.appendChild(rowCard('🎁', 'Starter Pack', '+25 Wins and +2,000 XP, once', bux(PRODUCTS.StarterPack.price), 'g-pink', () => buy('product', 'StarterPack')));
}
// Bloxity friends with presence, a shareable invite link and per-friend invites
function renderFriends(body) {
    const note = (text) => { const p = document.createElement('p'); p.className = 'set-note'; p.textContent = text; body.appendChild(p); return p; };
    if (!BX.bloxity.ready) { note('Bloxity is not available right now.'); return; }
    const id = BX.identity();
    const link = document.createElement('div');
    link.className = 'invite-row';
    link.innerHTML = '<input id="inviteLink" readonly aria-label="Invite link"><button class="btn g-green o1" id="copyInvite">Copy link</button>';
    body.appendChild(link);
    const input = link.querySelector('input');
    input.value = BX.getInviteLink();
    link.querySelector('button').addEventListener('click', async () => {
        input.select();
        try { await navigator.clipboard.writeText(input.value); toast('Invite link copied!', '#7dff6b'); }
        catch (e) { toast('Select the link and copy it', '#ffb51c'); }
    });
    if (!id.loggedIn) {
        note('Log in with Bloxity to see your friends and invite them into this server.');
        const b = document.createElement('button');
        b.className = 'btn g-blue o1'; b.textContent = 'Log in with Bloxity';
        b.addEventListener('click', () => BX.login());
        body.appendChild(b);
        return;
    }
    const loading = note('Loading friends…');
    BX.getFriends().then((friends) => {
        if (modalKind !== 'friends') return;
        loading.remove();
        if (!friends.length) { note('No friends yet. Share the invite link above!'); return; }
        const order = { 'in-game': 0, online: 1, away: 2, offline: 3 };
        friends.sort((a, b) => (order[a.presence && a.presence.status] ?? 4) - (order[b.presence && b.presence.status] ?? 4));
        for (const f of friends) {
            const st = (f.presence && f.presence.status) || 'offline';
            const where = st === 'in-game' && f.presence.gameName ? 'Playing ' + f.presence.gameName : st;
            const dot = st === 'offline' ? '⚫' : st === 'away' ? '🟡' : '🟢';
            body.appendChild(rowCard(dot, f.displayName || f.username, where, 'Invite', 'g-green', async (e) => {
                e.currentTarget.disabled = true;
                const ok = await BX.inviteFriend(f._id);
                toast(ok ? 'Invite sent to ' + (f.displayName || f.username) : 'Could not send the invite', ok ? '#7dff6b' : '#ff5a5a');
            }));
        }
    });
}
