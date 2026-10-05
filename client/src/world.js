import {
    T, V3, scene, camera, mat, box, aabb, UNIT, solids, triggers, prompts, tickers, texFrom, billboard, NEON_BOOST,
} from './engine.js';
import { S, actions, net } from './state.js';
import { plateMaterial, studWallMaterial, pathMaterial, netMaterial } from './textures.js';
import { neonBubble, bubbleBurst } from './fx.js';
import {
    CFG, WORLD, TOWERS, PADS, TRAMPS, TRAMP_TOP, UPGRADE_SHOP, PASSES, tierTop, lowGravityEvent, eventLeft,
    fmt, comma, clock, rngFrom, buxText,
} from '../../shared/config.js';

export const SPAWN = new V3(WORLD.spawn.x, WORLD.spawn.y, WORLD.spawn.z);
export const SHOP_POS = new V3(UPGRADE_SHOP.x - 7, 0, UPGRADE_SHOP.z);
export const GYM_POS = new V3(-54, 0, -8);
const HX = WORLD.halfX, Z0 = WORLD.zMin, Z1 = WORLD.zMax;
const rng = rngFrom(20251005);
// Shared with weather.js, which tints them through the seasons
export let groundMat = null;
export const seaMat = new T.MeshLambertMaterial({ color: 0x2ab4ff });

function texturedBox(sx, sy, sz, x, y, z, material, solid) {
    const m = new T.Mesh(UNIT, material);
    m.scale.set(sx, sy, sz); m.position.set(x, y, z);
    m.receiveShadow = true;
    m.matrixAutoUpdate = false; m.updateMatrix();
    scene.add(m);
    if (solid) solids.push(aabb(x, y, z, sx, sy, sz));
    return m;
}
function neon(sx, sy, sz, x, y, z, color) { return box(sx, sy, sz, x, y, z, color, { neon: true, decor: true }); }

// Dark rounded sign panel with outlined text, as a flat plane (tower signs, wall signs, labels)
function panelCanvas(lines, W, H, bg, border) {
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const x = cv.getContext('2d');
    const r = H * 0.16;
    x.fillStyle = border || 'rgba(255,255,255,0.85)';
    x.beginPath(); x.roundRect(0, 0, W, H, r); x.fill();
    x.fillStyle = bg || '#1c1a2e';
    x.beginPath(); x.roundRect(H * 0.05, H * 0.05, W - H * 0.1, H - H * 0.1, r * 0.8); x.fill();
    // Line sizes are given for a 512-wide panel; scale them to the canvas and shrink to fit the height
    const sum = lines.reduce((a, l) => a + l.px * 1.1, 0);
    const sc = Math.min(W / 512, (H * 0.8) / sum);
    const total = sum * sc;
    let y = (H - total) / 2;
    x.textAlign = 'center'; x.textBaseline = 'middle'; x.lineJoin = 'round';
    for (const l of lines) {
        const lp = l.px * sc;
        let px = lp;
        x.font = `700 ${px}px Fredoka, "Arial Rounded MT Bold", sans-serif`;
        while (x.measureText(l.t).width > W * 0.88 && px > 10) { px -= 2; x.font = `700 ${px}px Fredoka, sans-serif`; }
        const cy = y + lp * 0.58;
        x.lineWidth = Math.max(4, px * 0.18); x.strokeStyle = '#16121f'; x.strokeText(l.t, W / 2, cy);
        x.fillStyle = l.c || '#ffffff'; x.fillText(l.t, W / 2, cy);
        y += lp * 1.1;
    }
    return cv;
}
function panel(lines, w, h, pos, rotY, opts) {
    opts = opts || {};
    const W = 1024, H = Math.round(W * h / w);
    const m = new T.Mesh(new T.PlaneGeometry(w, h), new T.MeshBasicMaterial({ map: texFrom(panelCanvas(lines, W, H, opts.bg, opts.border)), transparent: true, toneMapped: false }));
    m.position.copy(pos); m.rotation.y = rotY || 0;
    scene.add(m);
    m.userData.set = (nl) => { m.material.map.dispose(); m.material.map = texFrom(panelCanvas(nl, W, H, opts.bg, opts.border)); m.material.needsUpdate = true; };
    return m;
}
// Big outlined 3D-ish words floating in the world ("+2 WINS", "x9 XP")
function bigWords(lines, worldW, pos, parent) {
    return billboard(lines.map((l) => ({ t: l.t, c: l.c, s: '#16121f', px: l.px || 80 })), worldW, 1024, pos, parent);
}

// =====================================================================================
// Decorations: round trees, palms, lamps, fences, clouds, candy pillars, barrels
// =====================================================================================
const SPHERE = new T.SphereGeometry(1, 14, 10);
const CYL = new T.CylinderGeometry(1, 1, 1, 18);
function mesh(geo, material, sx, sy, sz, x, y, z, cast) {
    const m = new T.Mesh(geo, material);
    m.scale.set(sx, sy, sz); m.position.set(x, y, z);
    if (cast) m.castShadow = true;
    m.receiveShadow = true;
    m.matrixAutoUpdate = false; m.updateMatrix();
    scene.add(m);
    return m;
}
function tree(x, z, s) {
    s = s || 1;
    box(1.4 * s, 5 * s, 1.4 * s, x, 2.5 * s, z, 0x8a5a32, { cast: true });
    const greens = [0x3fc23a, 0x2fae36, 0x5ad44a];
    mesh(SPHERE, mat(greens[0]), 3.6 * s, 3.2 * s, 3.6 * s, x, 7 * s, z, true);
    mesh(SPHERE, mat(greens[1]), 2.6 * s, 2.4 * s, 2.6 * s, x + 2 * s, 6 * s, z + 0.8 * s, true);
    mesh(SPHERE, mat(greens[2]), 2.4 * s, 2.2 * s, 2.4 * s, x - 1.6 * s, 6.3 * s, z - 1.2 * s, true);
}
function palm(x, z, s) {
    s = s || 1;
    for (let i = 0; i < 6; i++) box(1.1 * s, 1.6 * s, 1.1 * s, x + i * 0.18 * s, 0.8 * s + i * 1.5 * s, z, i % 2 ? 0x9b6a3a : 0x87592e, { cast: true });
    const top = new V3(x + 1.1 * s, 9.5 * s, z);
    for (let i = 0; i < 6; i++) {
        const a = i / 6 * Math.PI * 2;
        const leaf = new T.Mesh(UNIT, mat(i % 2 ? 0x2fb84a : 0x46d25a));
        leaf.scale.set(5 * s, 0.25 * s, 1.4 * s);
        leaf.position.set(top.x + Math.cos(a) * 2.2 * s, top.y - 0.6 * s, top.z + Math.sin(a) * 2.2 * s);
        leaf.rotation.set(0, -a, -0.35);
        leaf.castShadow = true; leaf.matrixAutoUpdate = false; leaf.updateMatrix(); scene.add(leaf);
    }
}
function bush(x, z, s, color) {
    mesh(SPHERE, mat(color || 0x3fc23a), 1.8 * s, 1.4 * s, 1.8 * s, x, 0.9 * s, z, true);
}
function lamp(x, z) {
    box(0.5, 9, 0.5, x, 4.5, z, 0x2b3a4a, { decor: true, cast: true });
    box(1.4, 0.6, 1.4, x, 0.3, z, 0x2b3a4a, { decor: true });
    mesh(SPHERE, mat(0xfff2b0, { neon: true }), 1.1, 1.1, 1.1, x, 9.6, z);
}
function barrel(x, z) {
    mesh(CYL, mat(0x9a5a2a), 1.3, 2.4, 1.3, x, 1.2, z, true);
    mesh(CYL, mat(0x4a3a2a), 1.35, 0.2, 1.35, x, 0.6, z);
    mesh(CYL, mat(0x4a3a2a), 1.35, 0.2, 1.35, x, 1.8, z);
    solids.push(aabb(x, 1.2, z, 2.4, 2.4, 2.4));
}
// Candy-cane pillar: red/white/blue rings with a gold ball on top
function candyPillar(x, z, h, r) {
    const seg = 2.4, n = Math.ceil(h / seg);
    const cols = [0xffffff, 0xe8283c, 0xffffff, 0x28a8ff];
    for (let i = 0; i < n; i++) mesh(CYL, mat(cols[i % 4]), r, seg, r, x, i * seg + seg / 2, z, true);
    mesh(SPHERE, mat(0xffd028, { neon: true }), r * 1.15, r * 1.15, r * 1.15, x, n * seg + r * 0.9, z);
    solids.push(aabb(x, n * seg / 2, z, r * 2, n * seg, r * 2));
}
function fenceLine(x0, z0, x1, z1, color) {
    const len = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.round(len / 4));
    const along = x0 === x1 ? 'z' : 'x';
    for (let i = 0; i <= n; i++) {
        const k = i / n;
        box(0.6, 2.8, 0.6, x0 + (x1 - x0) * k, 1.4, z0 + (z1 - z0) * k, color || 0xffffff, { decor: true, cast: true });
    }
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    for (const y of [1.2, 2.3]) {
        if (along === 'x') box(len, 0.35, 0.3, cx, y, cz, color || 0xffffff, { decor: true });
        else box(0.3, 0.35, len, cx, y, cz, color || 0xffffff, { decor: true });
    }
    if (along === 'x') solids.push(aabb(cx, 1.5, cz, len, 3, 0.8)); else solids.push(aabb(cx, 1.5, cz, 0.8, 3, len));
}
const clouds = [];
function cloud(x, y, z, s) {
    const g = new T.Group();
    const m = mat(0xffffff);
    for (let i = 0; i < 5; i++) {
        const c = new T.Mesh(SPHERE, m);
        c.scale.set((3 + rng() * 3) * s, (2 + rng() * 1.5) * s, (3 + rng() * 2) * s);
        c.position.set((i - 2) * 3.4 * s, rng() * 1.5 * s, (rng() - 0.5) * 3 * s);
        g.add(c);
    }
    g.position.set(x, y, z);
    scene.add(g);
    clouds.push({ g, sp: 0.6 + rng() * 0.8, x0: x });
}

// =====================================================================================
// Island, ocean and paths
// =====================================================================================
function buildIsland() {
    const w = HX * 2, d = Z1 - Z0, cz = (Z0 + Z1) / 2;
    groundMat = plateMaterial('#3fc23a', w / 4, d / 4);
    texturedBox(w, 4, d, 0, -2, cz, groundMat, true);
    // Sandy rim and the ocean all around
    box(w + 8, 3, d + 8, 0, -2.6, cz, 0xf2dc9a, { decor: true });
    const sea = new T.Mesh(new T.PlaneGeometry(8000, 8000), seaMat);
    sea.rotation.x = -Math.PI / 2; sea.position.set(0, -3.6, cz); scene.add(sea);
    const shine = new T.Mesh(new T.PlaneGeometry(4000, 4000), new T.MeshBasicMaterial({ color: 0x9fe8ff, transparent: true, opacity: 0.18, depthWrite: false }));
    shine.rotation.x = -Math.PI / 2; shine.position.set(0, -3.1, cz); scene.add(shine);
    // The shine layer z-fights with the sea from far above, so it only shows near the ground
    tickers.push((dt, t) => { shine.material.opacity = 0.14 + Math.sin(t * 0.8) * 0.05; shine.visible = camera.position.y < 160; });
    // A few far islands on the horizon
    for (let i = 0; i < 7; i++) {
        const a = i / 7 * Math.PI * 2 + 0.3, r = 520 + rng() * 260;
        const x = Math.cos(a) * r, z = cz + Math.sin(a) * r, s = 30 + rng() * 40;
        mesh(SPHERE, mat(0x46c84a), s, s * 0.35, s * 0.8, x, -4, z);
        mesh(SPHERE, mat(0xf2dc9a), s * 1.08, s * 0.22, s * 0.88, x, -4.5, z);
    }
    // Walkways: the main path forward, plus branches to the gym and the green steps
    texturedBox(12, 0.2, d - 20, 0, 0.1, cz + 6, pathMaterial(3, (d - 20) / 6), false);
    texturedBox(26, 0.2, 10, -19, 0.1, 2, pathMaterial(6, 3), false);
    texturedBox(22, 0.2, 10, 17, 0.1, -8, pathMaterial(6, 3), false);
    // White picket fence around most of the island edge (the ocean side)
    fenceLine(-HX + 2, Z0 + 2, HX - 2, Z0 + 2);
    fenceLine(-HX + 2, Z0 + 2, -HX + 2, Z1 - 2);
    fenceLine(HX - 2, Z0 + 2, HX - 2, Z1 - 2);
    fenceLine(-HX + 2, Z1 - 2, HX - 2, Z1 - 2);
}

// =====================================================================================
// Spawn, the "+1 JUMP PER JUMP" arch and the low gravity event cube
// =====================================================================================
let eventLabel = null, eventCube = null, eventKey = '';
function buildSpawn() {
    const s = SPAWN;
    box(12, 1, 12, s.x, 0.5, s.z, 0xb9b3c9, { studs: true });
    neon(12.4, 0.3, 0.4, s.x, 0.9, s.z - 6, 0x6fe0ff); neon(12.4, 0.3, 0.4, s.x, 0.9, s.z + 6, 0x6fe0ff);
    neon(0.4, 0.3, 12.4, s.x - 6, 0.9, s.z, 0x6fe0ff); neon(0.4, 0.3, 12.4, s.x + 6, 0.9, s.z, 0x6fe0ff);
    const emblem = new T.Mesh(new T.CircleGeometry(3.2, 32), mat(0x2b2546));
    emblem.rotation.x = -Math.PI / 2; emblem.position.set(s.x, 1.02, s.z); scene.add(emblem);
    const star = new T.Mesh(new T.CircleGeometry(2.2, 5), mat(0xffd028, { neon: true }));
    star.rotation.x = -Math.PI / 2; star.position.set(s.x, 1.04, s.z); scene.add(star);

    // The title arch ahead of the spawn: candy pillars, a sunset disc and the big sign
    const z = 30;
    candyPillar(-24, z, 30, 2.2); candyPillar(24, z, 30, 2.2);
    const sun = new T.Mesh(new T.CircleGeometry(16, 40, 0, Math.PI), mat(0xffa21e, { neon: true }));
    sun.position.set(0, 34, z + 1.2); sun.rotation.y = Math.PI; scene.add(sun);
    const sun2 = new T.Mesh(new T.CircleGeometry(12, 40, 0, Math.PI), mat(0xffd028, { neon: true }));
    sun2.position.set(0, 34, z + 1); sun2.rotation.y = Math.PI; scene.add(sun2);
    box(46, 14, 1.2, 0, 32, z + 0.4, 0x1f6bff, {});
    neon(47, 0.6, 1.4, 0, 39.2, z + 0.4, 0xffd028); neon(47, 0.6, 1.4, 0, 24.8, z + 0.4, 0xffd028);
    panel([{ t: '+1 JUMP', px: 120, c: '#ffe14a' }, { t: 'PER JUMP', px: 120, c: '#ffffff' }], 44, 13, new V3(0, 32, z - 0.25), Math.PI, { bg: '#1f6bff', border: '#1f6bff' });
    panel([{ t: '+1 JUMP', px: 120, c: '#ffe14a' }, { t: 'PER JUMP', px: 120, c: '#ffffff' }], 44, 13, new V3(0, 32, z + 1.05), 0, { bg: '#1f6bff', border: '#1f6bff' });
    panel([{ t: 'SKY TOWER BEYOND WALL 2!', px: 60, c: '#ffffff' }], 26, 3.4, new V3(0, 23, z - 0.3), Math.PI, { bg: '#8a1cff', border: '#ff3fa0' });

    // Low gravity event: a purple stud cube with a countdown floating above it
    const ex = -16, ez = 12;
    texturedBox(8, 8, 8, ex, 4, ez, studWallMaterial('#8a3cff', 4, 4), true);
    // Own material (and matrixAutoUpdate on) so the colour can change and static batching skips it
    eventCube = new T.Mesh(UNIT, new T.MeshBasicMaterial({ color: 0xc28cff }));
    eventCube.scale.set(8.3, 0.4, 8.3); eventCube.position.set(ex, 8.1, ez); scene.add(eventCube);
    eventLabel = billboard([{ t: 'LOW GRAVITY IN', c: '#ffffff', s: '#16121f', px: 56 }, { t: '0:00', c: '#c28cff', s: '#16121f', px: 90 }], 12, 512, new V3(ex, 15, ez));
    tickers.push((dt, t) => {
        const now = net.now(), live = lowGravityEvent(now);
        const key = (live ? 'L' : 'W') + Math.floor(eventLeft(now));
        if (key !== eventKey) {
            eventKey = key;
            eventLabel.userData.set([{ t: live ? 'LOW GRAVITY LIVE!' : 'LOW GRAVITY IN', c: live ? '#7dff6b' : '#ffffff', s: '#16121f', px: 56 }, { t: clock(eventLeft(now)), c: '#c28cff', s: '#16121f', px: 90 }]);
        }
        eventLabel.position.y = 15 + Math.sin(t * 2) * 0.4;
    });
}

// =====================================================================================
// Jump Upgrade shop: a striped booth with candy jars and a red carpet
// =====================================================================================
function buildShop() {
    const { x, z } = UPGRADE_SHOP;
    box(8, 4, 14, x + 1, 2, z, 0xffffff, { cast: true });
    for (let i = 0; i < 5; i++) box(0.3, 3.6, 2.4, x - 3.1, 2, z - 5.6 + i * 2.8, [0xff3fa0, 0xffd028, 0x28c8ff, 0x46ec50, 0xff8a1e][i], { decor: true });
    box(9, 0.6, 15, x + 1, 4.3, z, 0xffd028, { decor: true });
    for (const dz of [-6.8, 6.8]) box(0.8, 9, 0.8, x - 2.6, 4.5, z + dz, 0xffffff, { decor: true, cast: true });
    for (let i = 0; i < 8; i++) box(2.2, 0.8, 16, x - 2.6 + i * 1.4, 9.4 + i * 0.25, z, i % 2 ? 0xffffff : 0xe8283c, { decor: true, cast: true });
    // Candy jars on the counter
    const jarCols = [0xff3fa0, 0x28c8ff, 0xffd028, 0x7dff6b, 0xc28cff];
    for (let i = 0; i < 5; i++) {
        mesh(CYL, new T.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.45 }), 0.9, 1.8, 0.9, x - 1.6, 5.5, z - 5 + i * 2.5);
        mesh(SPHERE, mat(jarCols[i], { neon: true }), 0.7, 0.6, 0.7, x - 1.6, 5.2, z - 5 + i * 2.5);
    }
    panel([{ t: 'UPGRADES', px: 110, c: '#ffe14a' }], 14, 4, new V3(x - 3.2, 13.2, z), -Math.PI / 2, { bg: '#e8283c', border: '#ffd028' });
    bigWords([{ t: 'JUMP UPGRADE', c: '#ffffff', px: 70 }], 10, new V3(x - 8, 8.5, z));
    // Red carpet: step on it to open the shop
    const carpet = box(8, 0.25, 10, x - 9, 0.15, z, 0xd81e34, { decor: true });
    carpet.receiveShadow = true;
    neon(8.2, 0.1, 0.3, x - 9, 0.3, z - 5, 0xffd028); neon(8.2, 0.1, 0.3, x - 9, 0.3, z + 5, 0xffd028);
    triggers.push({ ...aabb(x - 9, 1.5, z, 8, 3, 10), enter: () => actions.openPanel('upgrades') });
    prompts.push({ pos: new V3(x - 5, 0, z), r: 9, label: () => 'Jump Upgrades', act: () => actions.openPanel('upgrades') });
}

// =====================================================================================
// Leaderboards: Top Wins, Top Rebirths, Top Jumps
// =====================================================================================
const boards = {};
const BOARD_LOOK = {
    wins: { title: 'TOP WINS', col: '#ffd028', rim: 0xffb51c, unit: 'WINS' },
    rebirths: { title: 'TOP REBIRTHS', col: '#ff6bd5', rim: 0xc428ff, unit: 'REBIRTHS' },
    jumps: { title: 'TOP JUMPS', col: '#6fe0ff', rim: 0x1f8fff, unit: 'JUMPS' },
};
function leaderboard(kind, x, z, rotY) {
    const L = BOARD_LOOK[kind];
    const g = new T.Group(); g.position.set(x, 0, z); g.rotation.y = rotY; scene.add(g);
    for (const sx of [-5, 5]) { const p = new T.Mesh(UNIT, mat(0x2b2546)); p.scale.set(1, 10, 1); p.position.set(sx, 5, -0.4); p.castShadow = true; g.add(p); }
    const rim = new T.Mesh(UNIT, mat(L.rim, { neon: true })); rim.scale.set(15, 19.5, 0.6); rim.position.set(0, 18.5, -0.5); g.add(rim);
    const back = new T.Mesh(UNIT, mat(0x1d1b3a)); back.scale.set(14, 18.5, 0.8); back.position.set(0, 18.5, -0.2); g.add(back);
    const cv = document.createElement('canvas'); cv.width = 384; cv.height = 512;
    const tex = texFrom(cv);
    const scr = new T.Mesh(new T.PlaneGeometry(13.2, 17.6), new T.MeshBasicMaterial({ map: tex, toneMapped: false }));
    scr.position.set(0, 18.5, 0.25); g.add(scr);
    solids.push(aabb(x, 5, z, 12, 10, 2));
    boards[kind] = { cv, tex, rows: [], kind };
}
const HAIR = ['#e8761e', '#3a2618', '#e6c878', '#1a1410', '#c84a1a'];
let boardsAt = performance.now();
function drawBoard(b) {
    const L = BOARD_LOOK[b.kind];
    const x = b.cv.getContext('2d');
    x.fillStyle = '#1d1b3a'; x.fillRect(0, 0, 384, 512);
    x.fillStyle = L.col; x.fillRect(0, 0, 384, 56);
    x.font = '700 34px Fredoka, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.lineWidth = 6; x.strokeStyle = '#16121f'; x.strokeText(L.title, 192, 30); x.fillStyle = '#ffffff'; x.fillText(L.title, 192, 30);
    x.font = '700 18px Fredoka, sans-serif'; x.fillStyle = '#9d97d0';
    x.textAlign = 'left'; x.fillText('#', 14, 74); x.fillText('NAME', 70, 74);
    x.textAlign = 'right'; x.fillText(L.unit, 372, 74);
    if (!b.rows.length) { x.textAlign = 'center'; x.fillStyle = '#cfc4f2'; x.font = '700 24px Fredoka, sans-serif'; x.fillText('Be the first!', 192, 250); }
    x.font = '700 23px Fredoka, sans-serif';
    b.rows.forEach((r, i) => {
        const y = 104 + i * 38;
        x.fillStyle = r.you ? 'rgba(70,236,80,0.28)' : i % 2 ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.09)';
        x.fillRect(6, y - 17, 372, 34);
        x.fillStyle = i === 0 ? '#ffd028' : i === 1 ? '#dfe4f0' : i === 2 ? '#e0925a' : '#ffffff';
        x.textAlign = 'left'; x.fillText(String(i + 1), 14, y);
        const hx = 50, r0 = 10;
        x.fillStyle = '#f2efe6'; x.fillRect(hx - r0, y - r0 * 0.6, r0 * 2, r0 * 1.7);
        x.fillStyle = HAIR[(r.n.length + i) % HAIR.length]; x.fillRect(hx - r0 * 1.15, y - r0 * 1.05, r0 * 2.3, r0 * 0.75);
        x.fillStyle = r.you ? '#7dff6b' : '#ffffff'; x.fillText(r.n.slice(0, 13), 70, y);
        x.textAlign = 'right'; x.fillStyle = L.col; x.fillText(fmt(r.v), 372, y);
    });
    const left = Math.max(0, Math.ceil(10 - (performance.now() - boardsAt) / 1000));
    x.font = 'italic 700 18px Fredoka, sans-serif'; x.textAlign = 'center'; x.fillStyle = '#ffd028';
    x.fillText('Refreshing in ' + left + 's', 192, 494);
    b.tex.needsUpdate = true;
}
// msg = { wins: [{n, v}], rebirths: [...], jumps: [...] } from the server, top 10 each
export function renderBoards(msg) {
    if (!boards.wins || !msg) return;
    boardsAt = performance.now();
    for (const kind of Object.keys(BOARD_LOOK)) {
        const b = boards[kind];
        b.rows = (msg[kind] || []).map((r) => ({ n: r.n, v: r.v, you: r.n === S.name }));
        drawBoard(b);
    }
}
setInterval(() => { for (const k of Object.keys(boards)) drawBoard(boards[k]); }, 1000);

// =====================================================================================
// Training Gym: trampolines (x1, x1, then x3 / x9 / x25 / OP x100 passes), weights, fence
// =====================================================================================
export const trampLocked = (def) => !!def.pass && !S.passes[def.pass];
const trampItems = [];
const TRAMP_RIM = [0xff3a3a, 0xffd028, 0xff8a1e, 0xc428ff, 0x28c8ff, 0xff1e32];
function trampLabel(def) {
    const lines = [{ t: (def.op ? 'OP ' : '') + 'x' + def.mult + ' XP', c: def.op ? '#ff4a5a' : def.mult >= 9 ? '#6fe0ff' : '#ffffff', px: 84 }];
    if (def.pass) lines.push(trampLocked(def) ? { t: '★ GAMEPASS · ' + buxText(PASSES[def.pass].price), c: '#ffd028', px: 46 } : { t: '★ OWNED', c: '#7dff6b', px: 46 });
    return lines;
}
function buildTrampoline(def, i) {
    // Blocky rim: little cubes around the edge, like the pixel trampolines in the reference
    const n = Math.round(def.r * 6);
    for (let k = 0; k < n; k++) {
        const a = k / n * Math.PI * 2;
        box(1.3, 0.9, 1.3, def.x + Math.cos(a) * def.r, TRAMP_TOP - 0.35, def.z + Math.sin(a) * def.r, TRAMP_RIM[i % TRAMP_RIM.length], { neon: def.mult > 1, decor: true });
    }
    for (let k = 0; k < 4; k++) {
        const a = k / 4 * Math.PI * 2 + 0.4;
        box(0.4, TRAMP_TOP, 0.4, def.x + Math.cos(a) * (def.r - 0.6), TRAMP_TOP / 2, def.z + Math.sin(a) * (def.r - 0.6), 0x2b2546, { decor: true });
    }
    const net = new T.Mesh(new T.CircleGeometry(def.r - 0.5, 36), netMaterial());
    net.rotation.x = -Math.PI / 2; net.position.set(def.x, TRAMP_TOP - 0.1, def.z); net.receiveShadow = true;
    scene.add(net);
    const solid = aabb(def.x, TRAMP_TOP / 2, def.z, def.r * 1.7, TRAMP_TOP, def.r * 1.7);
    solid.tramp = def;
    solids.push(solid);
    const label = bigWords(trampLabel(def), 14, new V3(def.x, 12, def.z));
    const lock = billboard([{ t: '🔒', c: '#ffffff', px: 120 }], 5, 256, new V3(def.x, 5, def.z));
    // Premium glow: a soft light beam over the net and neon halos that float up out of it
    const col = TRAMP_RIM[i % TRAMP_RIM.length];
    const beamMat = new T.MeshBasicMaterial({ map: beamTex, color: new T.Color(col).multiplyScalar(1.6), transparent: true, opacity: 0.4, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide });
    const beam = new T.Mesh(new T.CylinderGeometry(def.r - 0.6, def.r - 0.3, 16, 40, 1, true), beamMat);
    beam.position.set(def.x, TRAMP_TOP + 8, def.z); scene.add(beam);
    const halos = [0, 1, 2].map((h) => {
        const m = new T.Mesh(new T.TorusGeometry(def.r - 0.8, 0.14, 8, 48), new T.MeshBasicMaterial({ color: new T.Color(col).multiplyScalar(2.2), transparent: true, depthWrite: false, blending: T.AdditiveBlending }));
        m.rotation.x = Math.PI / 2; scene.add(m);
        return { m, ph: h / 3 };
    });
    trampItems.push({ def, label, lock, net, owned: null, sq: 0, col, beam, halos, bubT: 0 });
}
// Soft vertical fade for the trampoline light beams (bright at the bottom)
const beamTex = (() => {
    const c = document.createElement('canvas'); c.width = 4; c.height = 128;
    const x = c.getContext('2d');
    const g = x.createLinearGradient(0, 0, 0, 128);
    g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.7, 'rgba(255,255,255,0.35)'); g.addColorStop(1, 'rgba(255,255,255,1)');
    x.fillStyle = g; x.fillRect(0, 0, 4, 128);
    return texFrom(c);
})();
// The net dips when someone lands on it, with a splash of neon bubbles
export function squashTramp(def) {
    const it = trampItems.find((t) => t.def === def);
    if (!it) return;
    it.sq = 1;
    bubbleBurst(new V3(def.x, TRAMP_TOP, def.z), it.col, def.r);
}
function buildGym() {
    const x0 = -74, x1 = -34, z0 = -32, z1 = 34;
    box(x1 - x0, 0.3, z1 - z0, (x0 + x1) / 2, 0.15, (z0 + z1) / 2, 0x5a6278, { decor: true });
    // Coloured lanes painted on the floor
    for (let i = 0; i < 4; i++) box(1.6, 0.05, z1 - z0 - 6, x0 + 10 + i * 6, 0.33, (z0 + z1) / 2, [0xff8fd0, 0x6fe0ff, 0xffd028, 0x7dff6b][i], { decor: true });
    fenceLine(x0, z0, x1, z0, 0x7fd4ff); fenceLine(x0, z1, x1, z1, 0x7fd4ff); fenceLine(x0, z0, x0, z1, 0x7fd4ff);
    fenceLine(x1, z0, x1, -6, 0x7fd4ff); fenceLine(x1, 10, x1, z1, 0x7fd4ff);
    // Entrance arch: "TRAINING GYM"
    for (const dz of [-7, 9]) { box(2, 16, 2, x1, 8, dz, 0xffa21e, { cast: true }); box(2.6, 1, 2.6, x1, 16.3, dz, 0xffffff, { decor: true }); }
    box(2, 4.2, 18, x1, 18, 1, 0x1f6bff, { decor: true });
    panel([{ t: 'TRAINING GYM', px: 110, c: '#ffe14a' }], 17, 3.8, new V3(x1 + 1.05, 18, 1), Math.PI / 2, { bg: '#1f6bff', border: '#ffd028' });
    // Dumbbells and benches
    for (const [x, z] of [[-70, -27], [-60, -28], [-38, 29], [-70, 30]]) {
        box(0.6, 0.6, 5, x, 1.4, z, 0x8890a8, { decor: true });
        for (const dz of [-2.4, 2.4]) { const w = mesh(CYL, mat(dz < 0 ? 0xe8283c : 0x2b2546), 1.4, 0.8, 1.4, x, 1.4, z + dz, true); w.rotation.set(Math.PI / 2, 0, 0); w.updateMatrix(); }
    }
    for (const [x, z] of [[-40, -26], [-40, -20]]) { box(6, 0.8, 2, x, 1.6, z, 0xe8283c, { cast: true }); box(1, 1.2, 1.6, x - 2.4, 0.6, z, 0x2b2546, { decor: true }); box(1, 1.2, 1.6, x + 2.4, 0.6, z, 0x2b2546, { decor: true }); }
    TRAMPS.forEach((d, i) => buildTrampoline(d, i));
}

// =====================================================================================
// Stepped towers with win pads, and the two jump walls
// =====================================================================================
const padItems = [];
function padSign(req, wins) {
    return [{ t: '🏆 +' + comma(wins) + ' WINS', px: 92, c: '#ffd028' }, { t: 'JUMP ' + req + '+', px: 92, c: '#ffffff' }];
}
function winPad(pi) {
    const p = PADS[pi];
    const g = new T.Mesh(CYL, mat(0x46ec50, { neon: true }));
    g.scale.set(3.4, 0.4, 3.4); g.position.set(p.x, p.y + 0.2, p.z); scene.add(g);
    const ring = new T.Mesh(new T.TorusGeometry(3.6, 0.25, 8, 40), mat(0xffffff, { neon: true }));
    ring.rotation.x = Math.PI / 2; ring.position.set(p.x, p.y + 0.45, p.z); scene.add(ring);
    const label = bigWords([{ t: '+' + comma(p.wins) + ' WINS', c: '#7dff6b', px: 96 }], 10, new V3(p.x, p.y + 6, p.z));
    triggers.push({ ...aabb(p.x, p.y + 2.5, p.z, 7, 5, 7), enter: () => actions.pad(pi) });
    padItems.push({ p, g, ring, label, ok: null });
}
export const padList = () => padItems.map((it, i) => ({ i, pad: it.p }));
function buildTower(t, ti) {
    const n = t.pads.length;
    const hex = '#' + t.color.toString(16).padStart(6, '0');
    let prevH = 0;
    t.pads.forEach(([req, wins], k) => {
        const h = tierTop(req);
        const z0 = t.z + k * t.step;
        const d = k === n - 1 ? t.step + 6 : t.step;
        texturedBox(t.w, h, d, t.x + t.w / 2, h / 2, z0 + d / 2, studWallMaterial(hex, t.w / 4, h / 4), true);
        // Glowing edges: the front top lip and the vertical corners
        neon(t.w + 0.4, 0.6, 0.6, t.x + t.w / 2, h, z0, t.glow);
        for (const sx of [t.x, t.x + t.w]) neon(0.6, h - prevH, 0.6, sx, (h + prevH) / 2, z0, t.glow);
        // Sign under the pad on this step's front face
        panel(padSign(req, wins), Math.min(16, t.w - 4), 6.2, new V3(t.x + t.w / 2, h - 5, z0 - 0.08), Math.PI);
        prevH = h;
    });
    PADS.forEach((p, i) => { if (p.tower === ti) winPad(i); });
    // Name on the ground in front
    panel([{ t: t.name, px: 100, c: '#ffffff' }], 16, 3.4, new V3(t.x + t.w / 2, 3.4, t.z - 3), Math.PI, { bg: hex });
    box(0.6, 3, 0.6, t.x + t.w / 2 - 6, 1.5, t.z - 3.4, 0x2b2546, { decor: true });
    box(0.6, 3, 0.6, t.x + t.w / 2 + 6, 1.5, t.z - 3.4, 0x2b2546, { decor: true });
    // A spinning star on top of the last step
    const top = tierTop(t.pads[n - 1][0]);
    const star = new T.Mesh(new T.OctahedronGeometry(3), mat(0xffd028, { neon: true }));
    star.position.set(t.x + t.w / 2, top + 14, t.z + (n - 1) * t.step + t.step - 2);
    scene.add(star);
    tickers.push((dt, tt) => { star.rotation.y += dt * 1.4; star.position.y = top + 14 + Math.sin(tt * 1.5) * 1; });
}
// Laser rings: three neon bars (front and sides) around a step, sliding up and down on the
// server clock so everyone sees the same timing. Touching one knocks you off the tower.
const lasers = [];
const laserMat = new T.MeshBasicMaterial({ color: new T.Color(0xff2a4a).multiplyScalar(2.4) });
const laserGlow = new T.MeshBasicMaterial({ color: 0xff4a6a, transparent: true, opacity: 0.4, blending: T.AdditiveBlending, depthWrite: false });
function buildLasers(t) {
    if (!t.lasers) return;
    const n = t.pads.length;
    for (const [k, count] of t.lasers) {
        const h = tierTop(t.pads[k][0]), prev = k ? tierTop(t.pads[k - 1][0]) : 0;
        const z0 = t.z + k * t.step, d = k === n - 1 ? t.step + 6 : t.step;
        const x0 = t.x - 2.5, x1 = t.x + t.w + 2.5, zf = z0 - 2.5, zb = z0 + d;
        const yMin = prev + 8, yMax = h - 5;
        if (yMax - yMin < 6) continue;
        for (let c = 0; c < count; c++) {
            const g = new T.Group(); scene.add(g);
            const bars = [[x1 - x0, (x0 + x1) / 2, zf, true], [zb - zf, x0, (zf + zb) / 2, false], [zb - zf, x1, (zf + zb) / 2, false]];
            for (const [len, bx, bz, alongX] of bars) {
                const core = new T.Mesh(UNIT, laserMat); core.scale.set(alongX ? len : 1, 1, alongX ? 1 : len); core.position.set(bx, 0, bz); g.add(core);
                const glow = new T.Mesh(UNIT, laserGlow); glow.scale.set(alongX ? len : 3.2, 3.2, alongX ? 3.2 : len); glow.position.set(bx, 0, bz); g.add(glow);
            }
            const amp = (yMax - yMin) / 2;
            lasers.push({ g, x0, x1, zf, zb, mid: (yMin + yMax) / 2, amp, w: Math.min(1.1, Math.max(0.12, 16 / amp)), ph: c * Math.PI * 2 / count + k, cx: t.x + t.w / 2, cz: z0 + d / 2 });
        }
    }
}
function updateLasers() {
    const st = net.now() / 1000;
    for (const L of lasers) L.g.position.y = L.mid + Math.sin(st * L.w + L.ph) * L.amp;
}
// The laser touching a player box (feet at pos.y, 5 tall), or null
export function laserHit(pos) {
    for (const L of lasers) {
        const y = L.g.position.y;
        if (pos.y > y + 0.6 || pos.y + 5 < y - 0.6) continue;
        if (pos.x < L.x0 - 1.4 || pos.x > L.x1 + 1.4 || pos.z < L.zf - 1.4 || pos.z > L.zb) continue;
        const nearFront = Math.abs(pos.z - L.zf) < 1.4, nearSide = Math.abs(pos.x - L.x0) < 1.4 || Math.abs(pos.x - L.x1) < 1.4;
        if (nearFront || nearSide) return L;
    }
    return null;
}
function buildKiosk() {
    const p = PADS[PADS.length - 1];
    texturedBox(10, p.y, 10, p.x, p.y / 2, p.z, studWallMaterial('#ff3fa0', 3, p.y / 4), true);
    neon(10.4, 0.6, 10.4, p.x, p.y, p.z, 0xffffff);
    panel(padSign(p.req, p.wins), 9, 3.6, new V3(p.x, p.y - 4, p.z - 5.08), Math.PI, { bg: '#7a0a3a' });
    winPad(PADS.length - 1);
}
function buildWalls() {
    const cols = [[0xffd028, '#ffd028', 0xfff2a0], [0xff8a1e, '#ff8a1e', 0xffd028], [0x5fd0ff, '#5fd0ff', 0xffffff], [0x8a3cff, '#8a3cff', 0xff6bd5]];
    WORLD.walls.forEach((w, i) => {
        const h = tierTop(w.req), [c, hex, glow] = cols[i % cols.length];
        texturedBox(HX * 2 - 4, h, w.depth, 0, h / 2, w.z, studWallMaterial(hex, HX / 2, h / 4), true);
        neon(HX * 2 - 4, 0.8, w.depth + 0.4, 0, h, w.z, glow);
        neon(HX * 2 - 4, 0.5, 0.4, 0, 1.5, w.z - w.depth / 2 - 0.2, glow);
        for (const x of [-60, 0, 60]) {
            for (const side of [-1, 1]) {
                panel([{ t: w.name, px: 100, c: '#ffffff' }, { t: 'JUMP ' + w.req + '+', px: 100, c: '#ffe14a' }], 14, 6.4,
                    new V3(x, Math.min(h - 5, 10), w.z + side * (w.depth / 2 + 0.08)), side < 0 ? Math.PI : 0);
            }
        }
        void c;
    });
}

// =====================================================================================
// Decor placement
// =====================================================================================
function buildDecor() {
    for (let i = 0; i < 26; i++) {
        const x = (rng() < 0.5 ? -1 : 1) * (12 + rng() * (HX - 18)), z = Z0 + 10 + rng() * (Z1 - Z0 - 20);
        if (Math.abs(x) < 10) continue;
        if (x < -32 && x > -76 && z > -34 && z < 36) continue;   // gym
        if (x > 30 && x < 68 && z > -30 && z < 40) continue;      // green steps
        if (WORLD.walls.some((w) => Math.abs(z - w.z) < 10)) continue;
        if (TOWERS.some((t) => x > t.x - 6 && x < t.x + t.w + 6 && z > t.z - 8 && z < t.z + t.pads.length * t.step + 12)) continue;
        if (Math.hypot(x - (-16), z - 46) < 9 || Math.hypot(x - (-16), z - 12) < 8 || (x > 6 && x < 30 && z > -6 && z < 18)) continue;
        if (rng() < 0.3) palm(x, z, 0.9 + rng() * 0.4); else tree(x, z, 0.9 + rng() * 0.5);
    }
    for (let i = 0; i < 40; i++) {
        const x = (rng() < 0.5 ? -1 : 1) * (10 + rng() * (HX - 14)), z = Z0 + 6 + rng() * (Z1 - Z0 - 12);
        if (x < -32 && x > -76 && z > -34 && z < 36) continue;
        if (TOWERS.some((t) => x > t.x - 3 && x < t.x + t.w + 3 && z > t.z - 3 && z < t.z + t.pads.length * t.step + 8)) continue;
        bush(x, z, 0.8 + rng() * 0.8, [0x3fc23a, 0x2fae36, 0xff8fd0, 0xffd028][i % 4 === 3 ? 2 : i % 3]);
    }
    // Lamps along the main path
    const inTower = (x, z) => TOWERS.some((t) => x > t.x - 2 && x < t.x + t.w + 2 && z > t.z - 2 && z < t.z + t.pads.length * t.step + 8) || WORLD.walls.some((w) => Math.abs(z - w.z) < w.depth);
    for (let z = -40; z < Z1 - 10; z += 26) for (const x of [-8, 8]) if (!inTower(x, z)) lamp(x, z);
    for (const [x, z] of [[-14, -34], [14, -34], [-28, 8], [26, 20]]) barrel(x, z);
    // Palms on the beach corners
    for (const [x, z] of [[-100, -70], [100, -70], [-100, 320], [100, 320], [-100, 130], [100, 140], [-100, 610], [100, 610], [-100, 420], [100, 540]]) palm(x, z, 1.4);
    // Clouds high above (the towers poke through them)
    for (let i = 0; i < 22; i++) cloud(-260 + rng() * 520, 90 + rng() * 260, Z0 - 40 + rng() * (Z1 - Z0 + 80), 1.4 + rng() * 2);
    // Higher layers for the giant towers to pierce
    for (let i = 0; i < 26; i++) cloud(-300 + rng() * 600, 420 + rng() * 1000, Z0 + rng() * (Z1 - Z0), 2.5 + rng() * 3);
    tickers.push((dt) => {
        for (const c of clouds) { c.g.position.x += c.sp * dt; if (c.g.position.x > 320) c.g.position.x = -320; }
    });
}

// =====================================================================================
// Live state: pad colours follow your Jump power, trampoline locks follow your passes
// =====================================================================================
let lastJump = -1;
export function refreshWorld() {
    if (S.jump !== lastJump) {
        lastJump = S.jump;
        for (const it of padItems) {
            const ok = S.jump >= it.p.req;
            if (ok === it.ok) continue;
            it.ok = ok;
            it.g.material = mat(ok ? 0x46ec50 : 0xff4a5a, { neon: true });
            it.label.userData.set([{ t: '+' + comma(it.p.wins) + ' WINS', c: ok ? '#7dff6b' : '#ff6b6b', s: '#16121f', px: 96 }].concat(ok ? [] : [{ t: 'JUMP ' + it.p.req + '+', c: '#ffffff', s: '#16121f', px: 60 }]));
        }
    }
    for (const it of trampItems) {
        const owned = !trampLocked(it.def);
        if (owned === it.owned) continue;
        it.owned = owned;
        it.lock.visible = !owned;
        it.label.userData.set(trampLabel(it.def).map((l) => ({ ...l, s: '#16121f' })));
    }
}
export function updateWorld(dt, t, pp) {
    for (const it of padItems) it.ring.scale.setScalar(1 + Math.sin(t * 3 + it.p.x) * 0.06);
    for (const it of trampItems) {
        it.sq = Math.max(0, it.sq - dt * 4);
        it.net.position.y = TRAMP_TOP - 0.1 - Math.sin(it.sq * Math.PI) * 0.7;
        if (!it.owned) it.lock.position.y = 5 + Math.sin(t * 2 + it.def.x) * 0.3;
        // Owned trampolines glow; locked ones stay dim
        const on = it.owned ? 1 : 0.25;
        it.beam.material.opacity = (0.28 + Math.sin(t * 2.4 + it.def.z) * 0.08 + it.sq * 0.4) * on;
        for (const h of it.halos) {
            const k = (t * 0.45 + h.ph) % 1;
            h.m.position.set(it.def.x, TRAMP_TOP + 0.3 + k * 13, it.def.z);
            h.m.scale.setScalar(1 - k * 0.35);
            h.m.material.opacity = Math.sin(k * Math.PI) * 0.9 * on;
        }
        // Rising neon bubbles (only near the player, more on the bigger multipliers)
        if (it.owned && (!pp || Math.hypot(pp.x - it.def.x, pp.z - it.def.z) < 140)) {
            it.bubT -= dt * (it.def.mult >= 25 ? 9 : it.def.mult > 1 ? 6 : 4);
            while (it.bubT <= 0) { it.bubT += 1; neonBubble(new V3(it.def.x, TRAMP_TOP, it.def.z), it.col, it.def.r - 1); }
        }
    }
    updateLasers();
    if (eventCube) eventCube.material.color.setHex(lowGravityEvent(net.now()) ? 0x7dff6b : 0xc28cff).multiplyScalar(NEON_BOOST * (1 + Math.sin(t * 4) * 0.25));
}

export function buildWorld() {
    buildIsland();
    buildSpawn();
    buildShop();
    buildGym();
    TOWERS.forEach((t, i) => { buildTower(t, i); buildLasers(t); });
    buildKiosk();
    buildWalls();
    for (const [i, kind] of ['jumps', 'wins', 'rebirths'].entries()) leaderboard(kind, -24 + i * 24, -54, 0);
    buildDecor();
    for (const k of Object.keys(boards)) drawBoard(boards[k]);
    refreshWorld();
}
