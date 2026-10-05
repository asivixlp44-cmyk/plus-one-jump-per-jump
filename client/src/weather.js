import { T, V3, scene, camera, sun, hemi, amb, mat, texFrom } from './engine.js';
import { net } from './state.js';
import { groundMat, seaMat } from './world.js';
import { sfx, setAmbience } from './audio.js';
import { SEASONS, seasonAt, WORLD, clamp } from '../../shared/config.js';

// Seasons and sky. Every look value is blended between the current season and the next,
// so a change rolls in over SEASON_BLEND seconds: the sky darkens before the rain, leaves
// turn orange, then snow settles on the island. Climbing very high fades the sky into space.

const C = (h) => new T.Color(h);
const LOOK = {
    summer: {
        top: C(0x2f8cff), horizon: C(0xbfe8ff), fog: C(0xc4eaff), hemiSky: C(0xeaf6ff), hemiGround: C(0x5c8a4a), hemiI: 1.5, ambI: 0.45,
        sunC: C(0xffffff), sunI: 1.2, sea: C(0x2ab4ff), ground: C(0xffffff), leaves: [C(0x3fc23a), C(0x2fae36), C(0x5ad44a), C(0x2fb84a), C(0x46d25a), C(0x46c84a)],
        snow: 0, rain: 0, fall: 0, motes: 1, grip: 1, fogNear: 380, fogFar: 1500,
    },
    rain: {
        top: C(0x4d5a6c), horizon: C(0x9aa6b4), fog: C(0x8c98a6), hemiSky: C(0xc8d4e0), hemiGround: C(0x3c5a3a), hemiI: 1.05, ambI: 0.4,
        sunC: C(0xc8d4ff), sunI: 0.4, sea: C(0x2a6a96), ground: C(0xc8d8c8), leaves: [C(0x2f9e36), C(0x248a2c), C(0x3fae40), C(0x249a3a), C(0x2fae44), C(0x2f9a3a)],
        snow: 0, rain: 1, fall: 0, motes: 0, grip: 0.8, fogNear: 160, fogFar: 900,
    },
    autumn: {
        top: C(0x4f7ad8), horizon: C(0xffcf96), fog: C(0xffd9b4), hemiSky: C(0xfff0dc), hemiGround: C(0x8a6a3a), hemiI: 1.4, ambI: 0.45,
        sunC: C(0xffc890), sunI: 1.15, sea: C(0x2a96d0), ground: C(0xffe2a0), leaves: [C(0xff8a1e), C(0xe8561a), C(0xffc414), C(0xd8461a), C(0xff9a2a), C(0xc8a83a)],
        snow: 0, rain: 0, fall: 1, motes: 0, grip: 1, fogNear: 320, fogFar: 1400,
    },
    winter: {
        top: C(0x86aee0), horizon: C(0xeaf3ff), fog: C(0xeaf3ff), hemiSky: C(0xffffff), hemiGround: C(0xa8b8d0), hemiI: 1.45, ambI: 0.55,
        sunC: C(0xdfe8ff), sunI: 0.9, sea: C(0x5aa8d8), ground: C(0xe8f0ff), leaves: [C(0xf4f8ff), C(0xdce8f6), C(0xffffff), C(0xe6eef8), C(0xf0f6ff), C(0xe8f0f8)],
        snow: 1, rain: 0, fall: 0, motes: 0, grip: 0.16, fogNear: 220, fogFar: 1100,
    },
};
const SPACE_TOP = C(0x05031a), SPACE_HORIZON = C(0x2a1c6a);
const LEAF_BASE = [0x3fc23a, 0x2fae36, 0x5ad44a, 0x2fb84a, 0x46d25a, 0x46c84a];
const cur = {
    top: new T.Color(), horizon: new T.Color(), fog: new T.Color(), hemiSky: new T.Color(), hemiGround: new T.Color(), sunC: new T.Color(),
    sea: new T.Color(), ground: new T.Color(), leaves: LEAF_BASE.map(() => new T.Color()),
    hemiI: 1, ambI: 0.4, sunI: 1, snow: 0, rain: 0, fall: 0, motes: 0, grip: 1, fogNear: 300, fogFar: 1500,
};
const NUMS = ['hemiI', 'ambI', 'sunI', 'snow', 'rain', 'fall', 'motes', 'grip', 'fogNear', 'fogFar'];
const COLS = ['top', 'horizon', 'fog', 'hemiSky', 'hemiGround', 'sunC', 'sea', 'ground'];
function blend(a, b, k) {
    for (const n of NUMS) cur[n] = a[n] + (b[n] - a[n]) * k;
    for (const c of COLS) cur[c].copy(a[c]).lerp(b[c], k);
    cur.leaves.forEach((l, i) => l.copy(a.leaves[i]).lerp(b.leaves[i], k));
}

// ----- sky dome with a vertical gradient (fog does not touch it) -----
const skyMat = new T.ShaderMaterial({
    uniforms: { top: { value: new T.Color() }, horizon: { value: new T.Color() } },
    vertexShader: 'varying vec3 vP; void main() { vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'uniform vec3 top; uniform vec3 horizon; varying vec3 vP; void main() { float h = clamp(vP.y * 1.6, 0.0, 1.0); gl_FragColor = vec4(mix(horizon, top, pow(h, 0.7)), 1.0); }',
    side: T.BackSide, depthWrite: false, fog: false,
});
const sky = new T.Mesh(new T.SphereGeometry(4500, 32, 16), skyMat);
sky.renderOrder = -10;
sky.frustumCulled = false;
scene.add(sky);

// ----- stars (only once you are up in "space") -----
const stars = (() => {
    const n = 1500, p = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
        const u = Math.random(), th = Math.random() * Math.PI * 2, y = 0.05 + u * 0.95, r = Math.sqrt(1 - y * y);
        p.set([Math.cos(th) * r * 4000, y * 4000, Math.sin(th) * r * 4000], i * 3);
    }
    const g = new T.BufferGeometry(); g.setAttribute('position', new T.BufferAttribute(p, 3));
    const m = new T.PointsMaterial({ color: 0xffffff, size: 10, sizeAttenuation: true, transparent: true, opacity: 0, depthWrite: false, fog: false });
    const pts = new T.Points(g, m); pts.frustumCulled = false; scene.add(pts);
    return pts;
})();

// ----- snow lying on the island -----
const snowTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const x = c.getContext('2d');
    x.fillStyle = '#f4f8ff'; x.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 260; i++) { x.fillStyle = Math.random() < 0.5 ? 'rgba(200,215,240,0.7)' : 'rgba(255,255,255,1)'; x.fillRect(Math.random() * 128, Math.random() * 128, 2, 2); }
    const t = texFrom(c); t.wrapS = t.wrapT = T.RepeatWrapping; t.repeat.set(60, 160);
    return t;
})();
const snowCover = new T.Mesh(new T.PlaneGeometry(WORLD.halfX * 2, WORLD.zMax - WORLD.zMin), new T.MeshLambertMaterial({ map: snowTex, transparent: true, opacity: 0, depthWrite: false }));
snowCover.rotation.x = -Math.PI / 2;
snowCover.position.set(0, 0.24, (WORLD.zMin + WORLD.zMax) / 2);
snowCover.renderOrder = 1;
scene.add(snowCover);

// ----- falling things: snow, rain, autumn leaves, summer motes, all in a box around the camera -----
const BOX = { x: 140, y: 90, z: 140 };
function dotTex(draw) { const c = document.createElement('canvas'); c.width = c.height = 64; draw(c.getContext('2d')); return texFrom(c); }
const flakeTex = dotTex((x) => { const g = x.createRadialGradient(32, 32, 0, 32, 32, 30); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.5, 'rgba(255,255,255,0.8)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, 64, 64); });
const leafTex = dotTex((x) => { x.translate(32, 32); x.rotate(0.6); x.fillStyle = '#ffffff'; x.beginPath(); x.ellipse(0, 0, 26, 13, 0, 0, Math.PI * 2); x.fill(); x.strokeStyle = 'rgba(0,0,0,0.35)'; x.lineWidth = 3; x.beginPath(); x.moveTo(-24, 0); x.lineTo(24, 0); x.stroke(); });
function particleSystem(n, tex, size, colors, opts) {
    const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), seed = new Float32Array(n);
    const c = new T.Color();
    for (let i = 0; i < n; i++) {
        pos.set([(Math.random() - 0.5) * BOX.x, Math.random() * BOX.y, (Math.random() - 0.5) * BOX.z], i * 3);
        c.setHex(colors[i % colors.length]); col.set([c.r, c.g, c.b], i * 3);
        seed[i] = Math.random() * 100;
    }
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.BufferAttribute(pos, 3));
    g.setAttribute('color', new T.BufferAttribute(col, 3));
    const m = new T.PointsMaterial({ size, map: tex, vertexColors: true, transparent: true, opacity: 0, depthWrite: false, sizeAttenuation: true, blending: opts && opts.add ? T.AdditiveBlending : T.NormalBlending });
    const p = new T.Points(g, m);
    p.frustumCulled = false; p.visible = false;
    scene.add(p);
    return { p, pos, seed, n };
}
const snow = particleSystem(2600, flakeTex, 0.9, [0xffffff, 0xeef4ff]);
const leaves = particleSystem(500, leafTex, 1.6, [0xff8a1e, 0xe8561a, 0xffc414, 0xd8461a, 0xb8401a]);
const motes = particleSystem(300, flakeTex, 0.7, [0xfff6b0, 0xffffff, 0xb8ffb0], { add: true });
// Rain is drawn as short streaks
const rain = (() => {
    const n = 2200, pos = new Float32Array(n * 6), seed = new Float32Array(n);
    for (let i = 0; i < n; i++) {
        const x = (Math.random() - 0.5) * BOX.x, y = Math.random() * BOX.y, z = (Math.random() - 0.5) * BOX.z;
        pos.set([x, y, z, x - 0.25, y + 2.6, z - 0.15], i * 6);
        seed[i] = 0.8 + Math.random() * 0.4;
    }
    const g = new T.BufferGeometry(); g.setAttribute('position', new T.BufferAttribute(pos, 3));
    const m = new T.LineBasicMaterial({ color: 0xc8dcff, transparent: true, opacity: 0, depthWrite: false });
    const l = new T.LineSegments(g, m); l.frustumCulled = false; l.visible = false; scene.add(l);
    return { l, pos, seed, n };
})();

const origin = new V3();
// Particles live in camera-relative space that wraps, so the weather follows you everywhere
function stepPoints(sys, amount, dt, t, fall, sway, spin) {
    sys.p.visible = amount > 0.01;
    if (!sys.p.visible) return;
    sys.p.material.opacity = Math.min(1, amount * 1.1);
    const p = sys.pos;
    for (let i = 0; i < sys.n; i++) {
        const s = sys.seed[i], j = i * 3;
        p[j + 1] -= fall * (0.7 + (s % 1) * 0.6) * dt;
        p[j] += Math.sin(t * (0.6 + spin * (s % 1)) + s) * sway * dt;
        p[j + 2] += Math.cos(t * 0.7 + s * 1.3) * sway * dt;
        if (p[j + 1] < 0) p[j + 1] += BOX.y; else if (p[j + 1] > BOX.y) p[j + 1] -= BOX.y;
        if (p[j] < -BOX.x / 2) p[j] += BOX.x; else if (p[j] > BOX.x / 2) p[j] -= BOX.x;
        if (p[j + 2] < -BOX.z / 2) p[j + 2] += BOX.z; else if (p[j + 2] > BOX.z / 2) p[j + 2] -= BOX.z;
    }
    sys.p.geometry.attributes.position.needsUpdate = true;
    sys.p.position.copy(origin);
}
function stepRain(amount, dt) {
    rain.l.visible = amount > 0.01;
    if (!rain.l.visible) return;
    rain.l.material.opacity = amount * 0.55;
    const p = rain.pos;
    for (let i = 0; i < rain.n; i++) {
        const j = i * 6, d = 95 * rain.seed[i] * dt;
        p[j + 1] -= d; p[j + 4] -= d; p[j] += 0.25 * d / 2.6; p[j + 3] += 0.25 * d / 2.6;
        if (p[j + 1] < 0) {
            const x = (Math.random() - 0.5) * BOX.x, z = (Math.random() - 0.5) * BOX.z;
            p.set([x, BOX.y, z, x - 0.25, BOX.y + 2.6, z - 0.15], j);
        }
    }
    rain.l.geometry.attributes.position.needsUpdate = true;
    rain.l.position.copy(origin);
}

// ----- lightning -----
let flash = 0, nextBolt = 8, thunderAt = -1;

let lastSeason = -1;
const leafMats = LEAF_BASE.map((h) => mat(h));
export const weather = { grip: 1, season: 0, k: 0, left: 0 };

export function updateWeather(dt, t, playerY) {
    const s = seasonAt(net.now());
    blend(LOOK[SEASONS[s.i].id], LOOK[SEASONS[s.next].id], s.k);
    weather.grip = cur.grip; weather.season = s.k > 0.5 ? s.next : s.i; weather.k = s.k; weather.left = s.left;
    if (lastSeason !== -1 && weather.season !== lastSeason && weather.onChange) weather.onChange(SEASONS[weather.season]);
    lastSeason = weather.season;

    // Up high the sky turns to space; weather stays below the clouds
    const camY = camera.position.y;
    const space = clamp((camY - 400) / 800, 0, 1);
    const low = 1 - clamp((camY - 300) / 250, 0, 1);
    skyMat.uniforms.top.value.copy(cur.top).lerp(SPACE_TOP, space);
    skyMat.uniforms.horizon.value.copy(cur.horizon).lerp(SPACE_HORIZON, space * 0.92);
    sky.position.copy(camera.position);
    stars.position.copy(camera.position);
    stars.material.opacity = space;
    scene.background = skyMat.uniforms.horizon.value;
    scene.fog.color.copy(cur.fog).lerp(SPACE_HORIZON, space);
    scene.fog.near = cur.fogNear + Math.max(0, playerY) * 0.8;
    scene.fog.far = cur.fogFar + Math.max(0, playerY) * 1.6;

    // Lightning: a double flash, then thunder a moment later
    if (cur.rain > 0.6) {
        nextBolt -= dt;
        if (nextBolt <= 0) { nextBolt = 7 + Math.random() * 10; flash = 1; thunderAt = t + 0.4 + Math.random() * 1.2; }
    }
    if (thunderAt > 0 && t >= thunderAt) { thunderAt = -1; sfx('thunder'); }
    flash = Math.max(0, flash - dt * 3.5);
    const bolt = flash > 0 ? (flash > 0.7 || (flash > 0.3 && flash < 0.45) ? 1 : 0.2) * flash : 0;

    hemi.color.copy(cur.hemiSky); hemi.groundColor.copy(cur.hemiGround);
    hemi.intensity = cur.hemiI + bolt * 2.5;
    amb.intensity = cur.ambI + bolt;
    sun.color.copy(cur.sunC); sun.intensity = cur.sunI;
    if (bolt > 0.5) skyMat.uniforms.horizon.value.lerp(C(0xffffff), 0.5);
    seaMat.color.copy(cur.sea);
    if (groundMat) groundMat.color.copy(cur.ground);
    leafMats.forEach((m, i) => m.color.copy(cur.leaves[i]));
    snowCover.material.opacity = cur.snow * 0.88;
    snowCover.visible = cur.snow > 0.01;

    origin.set(camera.position.x, Math.max(-5, camera.position.y - 45), camera.position.z);
    stepPoints(snow, cur.snow * low, dt, t, 7, 2.2, 1.5);
    stepPoints(leaves, cur.fall * low, dt, t, 5, 5, 2.5);
    stepPoints(motes, cur.motes * low * 0.7, dt, t, -0.6, 1.2, 0.8);
    stepRain(cur.rain * low, dt);
    setAmbience(cur.rain * low, Math.max(cur.snow * 0.6, space * 0.8, cur.fall * 0.25));
}
