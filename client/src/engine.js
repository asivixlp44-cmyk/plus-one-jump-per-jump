import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const T = THREE;
export const V3 = THREE.Vector3;
export const $ = (s) => document.querySelector(s);
export const hexCss = (h) => '#' + h.toString(16).padStart(6, '0');

// ----- renderer, scene, camera, lights -----
export const canvas = $('#view');
export const renderer = new T.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = T.PCFShadowMap;

export const scene = new T.Scene();
// Bright daytime sky like the reference; fog only softens the far end of the island
const SKY = 0x8fd6ff;
scene.background = new T.Color(SKY);
scene.fog = new T.Fog(0xbfe8ff, 380, 1500);

export const camera = new T.PerspectiveCamera(70, 1, 0.3, 6000);
function resize() {
    const w = innerWidth, h = innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.fov = w < h ? 85 : 70;
    camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

// Lit surfaces stay below 1.0 in the linear buffer so only HDR neon blooms;
// toneMappingExposure (fx.js) brings the overall brightness back up.
export const hemi = new T.HemisphereLight(0xeaf6ff, 0x5c8a4a, 1.5);
export const amb = new T.AmbientLight(0xffffff, 0.45);
scene.add(hemi, amb);
export const sun = new T.DirectionalLight(0xffffff, 1.2);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
Object.assign(sun.shadow.camera, { left: -60, right: 60, top: 60, bottom: -60, near: 1, far: 260 });
sun.shadow.bias = -0.0015;
scene.add(sun, sun.target);

// ----- materials & textures -----
export const UNIT = new T.BoxGeometry(1, 1, 1);
export const NEON_BOOST = 1.3;
const matCache = new Map();
export function mat(color, o) {
    o = o || {};
    const key = color + '|' + (o.neon ? 1 : 0) + '|' + (o.opacity || 1);
    let m = matCache.get(key);
    if (!m) {
        m = o.neon ? new T.MeshBasicMaterial({ color }) : new T.MeshLambertMaterial({ color });
        // Neon is HDR (brighter than 1) so the bloom pass picks it up
        if (o.neon) m.color.multiplyScalar(NEON_BOOST);
        if (o.opacity && o.opacity < 1) { m.transparent = true; m.opacity = o.opacity; m.depthWrite = false; }
        matCache.set(key, m);
    }
    return m;
}
export function texFrom(cv) {
    const t = new T.CanvasTexture(cv);
    t.colorSpace = T.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
}
const studCanvas = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const x = c.getContext('2d');
    x.fillStyle = '#f2f2f2'; x.fillRect(0, 0, 64, 64);
    x.fillStyle = '#d6d6d6'; x.beginPath(); x.arc(33, 34, 17, 0, Math.PI * 2); x.fill();
    x.fillStyle = '#ffffff'; x.beginPath(); x.arc(31, 31, 16, 0, Math.PI * 2); x.fill();
    x.strokeStyle = '#e2e2e2'; x.lineWidth = 2; x.strokeRect(1, 1, 62, 62);
    return c;
})();
const studBase = texFrom(studCanvas);
studBase.wrapS = studBase.wrapT = T.RepeatWrapping;
studBase.anisotropy = renderer.capabilities.getMaxAnisotropy();
function studMat(color, rx, rz) {
    rx = Math.max(1, Math.round(rx)); rz = Math.max(1, Math.round(rz));
    const key = 'stud|' + color + '|' + rx + '|' + rz;
    let m = matCache.get(key);
    if (!m) {
        const t = studBase.clone(); t.needsUpdate = true; t.repeat.set(rx, rz);
        m = new T.MeshLambertMaterial({ color, map: t });
        matCache.set(key, m);
    }
    return m;
}

// ----- world collections -----
export const solids = [];   // {min,max,belt,tread}
export const kills = [];    // {min,max,active}
export const triggers = []; // {min,max,enter,inside}
export const prompts = [];  // {pos,r,label(),act()}
export const tickers = [];  // per-frame callbacks (dt, t)

export function aabb(x, y, z, sx, sy, sz) {
    return { min: new V3(x - sx / 2, y - sy / 2, z - sz / 2), max: new V3(x + sx / 2, y + sy / 2, z + sz / 2) };
}

// box(sx,sy,sz, x,y,z, color, {studs, neon, opacity, decor, kill, cast})
export function box(sx, sy, sz, x, y, z, color, o) {
    o = o || {};
    let m;
    if (o.studs) {
        const side = mat(color), top = studMat(color, sx / 2, sz / 2);
        m = new T.Mesh(UNIT, [side, side, top, side, side, side]);
    } else {
        m = new T.Mesh(UNIT, mat(color, o));
    }
    m.scale.set(sx, sy, sz);
    m.position.set(x, y, z);
    if (!o.neon) m.receiveShadow = true;
    if (o.cast) m.castShadow = true;
    m.matrixAutoUpdate = false;
    m.updateMatrix();
    scene.add(m);
    if (o.kill) {
        const k = aabb(x, y, z, sx, sy, sz); k.active = true; kills.push(k);
    } else if (!o.decor) {
        solids.push(aabb(x, y, z, sx, sy, sz));
    }
    return m;
}

// ----- text -----
export function textCanvas(lines, W) {
    const pad = 10;
    let H = pad * 2;
    for (const l of lines) H += l.px * 1.2;
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = Math.ceil(H);
    const x = cv.getContext('2d');
    let y = pad;
    for (const l of lines) {
        let px = l.px;
        const font = (p) => `${l.w || 700} ${p}px Fredoka, "Arial Rounded MT Bold", sans-serif`;
        x.font = font(px);
        while (x.measureText(l.t).width > W - 24 && px > 8) { px -= 2; x.font = font(px); }
        x.textAlign = 'center'; x.textBaseline = 'middle';
        const cy = y + l.px * 0.62;
        if (l.s) { x.lineJoin = 'round'; x.lineWidth = Math.max(4, px * 0.22); x.strokeStyle = l.s; x.strokeText(l.t, W / 2, cy); }
        x.fillStyle = l.c || '#fff';
        x.fillText(l.t, W / 2, cy);
        y += l.px * 1.2;
    }
    return cv;
}
export function billboard(lines, worldW, W, pos, parent) {
    W = W || 512;
    const cv = textCanvas(lines, W);
    const sp = new T.Sprite(new T.SpriteMaterial({ map: texFrom(cv), transparent: true, depthWrite: false, toneMapped: false }));
    sp.scale.set(worldW, worldW * cv.height / cv.width, 1);
    if (pos) sp.position.copy(pos);
    sp.userData.set = (nl) => {
        const c2 = textCanvas(nl, W);
        sp.material.map.dispose();
        sp.material.map = texFrom(c2);
        sp.material.needsUpdate = true;
        sp.scale.set(worldW, worldW * c2.height / c2.width, 1);
    };
    (parent || scene).add(sp);
    return sp;
}
export function textPlane(lines, worldW, W, pos, look) {
    const cv = textCanvas(lines, W || 512);
    const h = worldW * cv.height / cv.width;
    const m = new T.Mesh(new T.PlaneGeometry(worldW, h), new T.MeshBasicMaterial({ map: texFrom(cv), transparent: true, depthWrite: false, toneMapped: false }));
    m.position.copy(pos);
    m.lookAt(look);
    scene.add(m);
    return m;
}
// Board facing `dir` (horizontal unit vector) with a border and text
export function signBoard(center, dir, w, h, lines, boardColor) {
    const g = new T.Group();
    g.position.copy(center); g.rotation.y = Math.atan2(dir.x, dir.z);
    const b1 = new T.Mesh(UNIT, mat(0x78372d)); b1.scale.set(w + 2, h + 2, 0.4); b1.position.z = -0.4; g.add(b1);
    const b2 = new T.Mesh(UNIT, mat(boardColor)); b2.scale.set(w, h, 0.4); b2.position.z = -0.1; g.add(b2);
    const cv = textCanvas(lines, 1024);
    const th = Math.min(h - 1, (w - 2) * cv.height / cv.width);
    const tw = th * cv.width / cv.height;
    const tp = new T.Mesh(new T.PlaneGeometry(tw, th), new T.MeshBasicMaterial({ map: texFrom(cv), transparent: true, depthWrite: false, toneMapped: false }));
    tp.position.z = 0.15; g.add(tp);
    scene.add(g);
    return g;
}

// ----- blocky fallback character rigs -----
// Name + number printed on the back of a shirt
const backTexCache = new Map();
function backTex(label, n, color) {
    const key = label + '|' + n + '|' + color;
    if (!backTexCache.has(key)) {
        const c = document.createElement('canvas'); c.width = c.height = 256;
        const x = c.getContext('2d');
        x.textAlign = 'center'; x.textBaseline = 'middle';
        x.lineJoin = 'round';
        if (label) {
            let px = 44;
            x.font = `700 ${px}px Fredoka, sans-serif`;
            while (x.measureText(label).width > 236 && px > 18) { px -= 2; x.font = `700 ${px}px Fredoka, sans-serif`; }
            x.lineWidth = 6; x.strokeStyle = 'rgba(0,0,0,0.35)'; x.strokeText(label, 128, 48);
            x.fillStyle = color; x.fillText(label, 128, 48);
        }
        x.font = '700 150px Fredoka, sans-serif';
        x.lineWidth = 10; x.strokeStyle = 'rgba(0,0,0,0.35)'; x.strokeText(String(n), 128, 160);
        x.fillStyle = color; x.fillText(String(n), 128, 160);
        backTexCache.set(key, texFrom(c));
    }
    return backTexCache.get(key);
}

// Blocky hair styles built from boxes on top of the 1.2-stud head (top at y 5.2)
function buildHair(part, style, c) {
    switch (style) {
        case 'buzz':
            part(1.24, 0.1, 1.24, 0, 5.24, 0, c);
            part(1.24, 0.55, 0.08, 0, 4.95, -0.62, c);
            break;
        case 'curly': {
            part(1.26, 0.25, 1.26, 0, 5.28, 0, c);
            for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
                const h = 0.3 + ((i * 7 + j * 13 + 20) % 5) * 0.05;
                part(0.44, h, 0.44, i * 0.42, 5.4 + h / 2 - 0.1, j * 0.42, c);
            }
            part(1.26, 0.7, 0.2, 0, 4.95, -0.56, c);
            break;
        }
        case 'mohawk':
            part(1.24, 0.1, 1.24, 0, 5.24, 0, 0x3a2618);
            part(0.42, 0.5, 1.22, 0, 5.5, 0, c);
            part(0.42, 0.3, 0.3, 0, 5.4, 0.55, c);
            break;
        case 'quiff':
            part(1.3, 0.32, 1.3, 0, 5.34, -0.02, c);
            part(1.3, 0.7, 0.3, 0, 4.95, -0.5, c);
            part(1.0, 0.42, 0.5, 0, 5.62, 0.34, c);
            break;
        case 'slick':
            part(1.3, 0.3, 1.3, 0, 5.33, -0.02, c);
            part(1.3, 1.1, 0.3, 0, 4.72, -0.5, c);
            part(0.14, 0.6, 1.0, -0.64, 4.95, -0.1, c);
            part(0.14, 0.6, 1.0, 0.64, 4.95, -0.1, c);
            break;
        case 'fade':
            part(1.24, 0.1, 1.24, 0, 5.24, 0, c);
            part(1.1, 0.3, 1.1, 0, 5.42, 0.02, c);
            part(1.24, 0.45, 0.08, 0, 5.0, -0.62, c);
            break;
        case 'long':
            part(1.3, 0.35, 1.3, 0, 5.35, -0.02, c);
            part(1.3, 1.5, 0.3, 0, 4.55, -0.52, c);
            part(0.16, 1.1, 0.9, -0.66, 4.7, -0.12, c);
            part(0.16, 1.1, 0.9, 0.66, 4.7, -0.12, c);
            part(1.3, 0.18, 0.2, 0, 5.13, 0.56, c);
            break;
        case 'shaggy': {
            // Big messy Roblox-style hair: a puffy crown with strands falling over the face and neck
            const c2 = new THREE.Color(c).offsetHSL(0, 0, 0.1).getHex(), c3 = new THREE.Color(c).offsetHSL(0, 0, -0.12).getHex();
            part(1.6, 0.55, 1.6, 0, 5.38, -0.05, c);
            part(1.3, 0.35, 1.3, 0.05, 5.72, -0.1, c2);
            part(1.6, 1.3, 0.45, 0, 4.85, -0.6, c3);
            for (const sx of [-1, 1]) part(0.36, 1.1, 1.35, sx * 0.76, 4.9, -0.05, c);
            const strands = [[-0.55, 0.62, c2], [-0.18, 0.75, c], [0.2, 0.68, c3], [0.56, 0.58, c2]];
            for (const [x, h, col] of strands) part(0.4, h * 0.6, 0.3, x, 5.2 - h * 0.25, 0.64, col);
            for (let i = 0; i < 5; i++) part(0.32, 0.5 + (i % 2) * 0.25, 0.32, -0.64 + i * 0.32, 5.85 + (i % 2) * 0.1, -0.2 + (i % 3) * 0.2, i % 2 ? c2 : c);
            break;
        }
        case 'crop':
        case 'short':
        default:
            part(1.3, 0.35, 1.3, 0, 5.33, -0.02, c);
            part(1.3, 0.75, 0.3, 0, 4.95, -0.5, c);
            part(1.3, 0.16, 0.2, 0, 5.16, 0.56, c);
            break;
    }
}

export function buildRig(d) {
    const g = new T.Group();
    const part = (sx, sy, sz, x, y, z, c, parent) => {
        const m = new T.Mesh(UNIT, mat(c)); m.scale.set(sx, sy, sz); m.position.set(x, y, z); m.castShadow = true; (parent || g).add(m); return m;
    };
    const accent = new T.Color(d.numC || '#ffffff').getHex();
    // Torso: shirt, stripes, collar, crest, name + number on the back
    part(2, 2, 1, 0, 3, 0, d.shirt);
    if (d.stripes) { part(0.35, 2.02, 1.02, -0.5, 3, 0, d.stripes); part(0.35, 2.02, 1.02, 0.5, 3, 0, d.stripes); }
    part(0.9, 0.14, 1.04, 0, 3.94, 0, accent);
    part(0.3, 0.34, 0.04, 0.5, 3.55, 0.51, accent);
    part(2.02, 0.12, 1.02, 0, 2.06, 0, d.shorts);
    if (!d.plain) {
        const back = new T.Mesh(new T.PlaneGeometry(1.8, 1.8), new T.MeshBasicMaterial({ map: backTex(d.label || '', d.num || 10, d.numC || '#fff'), transparent: true, toneMapped: false }));
        back.position.set(0, 2.98, -0.52); back.rotation.y = Math.PI; g.add(back);
    }
    // Head: face, ears, hair, optional beard
    const head = new T.Group(); g.add(head);
    part(1.2, 1.2, 1.2, 0, 4.6, 0, d.skin, head);
    part(0.12, 0.3, 0.26, -0.64, 4.62, 0, d.skin, head);
    part(0.12, 0.3, 0.26, 0.64, 4.62, 0, d.skin, head);
    for (const sx of [-0.26, 0.26]) {
        part(0.26, 0.24, 0.04, sx, 4.72, 0.605, 0xffffff, head);
        part(0.13, 0.18, 0.04, sx + (sx > 0 ? -0.04 : 0.04), 4.71, 0.625, 0x1a1420, head);
        part(0.3, 0.07, 0.04, sx, 4.93, 0.61, d.hair, head);
    }
    part(0.36, 0.07, 0.04, 0, 4.34, 0.64, 0x6b2a2a, head);
    if (d.beard) {
        part(1.22, 0.3, 0.14, 0, 4.15, 0.56, d.hair, head);
        part(0.14, 0.55, 0.7, -0.6, 4.35, 0.2, d.hair, head);
        part(0.14, 0.55, 0.7, 0.6, 4.35, 0.2, d.hair, head);
    }
    buildHair((sx, sy, sz, x, y, z, c) => part(sx, sy, sz, x, y, z, c, head), d.hairStyle, d.hair);
    // Legs (pivot at the hip) and arms (pivot at the shoulder)
    const legs = [], arms = [];
    for (const side of [-0.5, 0.5]) {
        const p = new T.Group(); p.position.set(side, 2, 0); g.add(p);
        part(1, 0.9, 1, 0, -0.45, 0, d.shorts, p);
        part(0.04, 0.8, 0.5, side > 0 ? 0.51 : -0.51, -0.42, 0, accent, p);
        part(0.98, 1.1, 0.98, 0, -1.45, 0, d.socks, p);
        part(1.0, 0.14, 1.0, 0, -1.0, 0, 0xffffff, p);
        part(1.05, 0.38, 1.3, 0, -1.84, 0.12, d.shoes || 0x141418, p);
        legs.push(p);
    }
    for (const side of [-1.5, 1.5]) {
        const p = new T.Group(); p.position.set(side, 3.9, 0); g.add(p);
        part(1, 0.8, 1, 0, -0.4, 0, d.shirt, p);
        part(1.02, 0.1, 1.02, 0, -0.78, 0, accent, p);
        part(0.98, 1.2, 0.98, 0, -1.4, 0, d.gloves || d.skin, p);
        arms.push(p);
    }
    g.userData.legs = legs; g.userData.arms = arms; g.userData.head = head;
    return g;
}

// Signature celebration poses for the shop players ([left arm, right arm] as x/z rotations)
const POSES = {
    sky: { arms: [[2.7, -0.3], [2.7, 0.3]], head: -0.35 },
    siu: { arms: [[0.1, -0.9], [0.1, 0.9]], legs: [0.28, -0.28] },
    crossed: { arms: [[-1.25, 0.75], [-1.25, -0.75]] },
    airplane: { arms: [[0, -1.5], [0, 1.5]] },
    armsUp: { arms: [[3.0, -0.25], [3.0, 0.25]], head: -0.2 },
    wave: { arms: [[0, -0.15], [2.8, 0.35]] },
    hips: { arms: [[0.15, -0.45], [0.15, 0.45]] },
    flex: { arms: [[0, -2.3], [0, 2.3]] },
    cold: { arms: [[-0.7, 0.85], [-0.7, -0.85]], head: 0.1 },
};
// Applies a pose with a small breathing/sway motion driven by t
export function posed(g, pose, t) {
    const p = POSES[pose] || POSES.hips;
    const u = g.userData, b = Math.sin(t * 2) * 0.05;
    u.arms.forEach((a, i) => { a.rotation.x = p.arms[i][0] + b; a.rotation.z = p.arms[i][1] + (i ? b : -b) * 0.5; });
    const lz = p.legs || [0, 0];
    u.legs.forEach((l, i) => { l.rotation.x = 0; l.rotation.z = lz[i]; });
    u.head.rotation.x = (p.head || 0) + Math.sin(t * 1.3) * 0.03;
    g.position.y = g.userData.baseY + Math.abs(Math.sin(t * 2)) * 0.05;
}

export function animRig(g, phase, amt) {
    const s = Math.sin(phase) * amt;
    const u = g.userData;
    u.legs[0].rotation.x = s; u.legs[1].rotation.x = -s;
    u.arms[0].rotation.x = -s * 0.9; u.arms[1].rotation.x = s * 0.9;
}
export function airPose(g) {
    const u = g.userData;
    u.legs[0].rotation.x = 0.5; u.legs[1].rotation.x = -0.3;
    u.arms[0].rotation.x = -2.6; u.arms[1].rotation.x = -2.6;
}
export function armsUp(g) { g.userData.arms[0].rotation.x = Math.PI; g.userData.arms[1].rotation.x = Math.PI; }

// Glowing ring + orbiting cubes, attached to a rig
export function buildAuraFx(parent) {
    const fx = new T.Group();
    const ringM = new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, depthWrite: false });
    const ring = new T.Mesh(new T.RingGeometry(1.6, 2.6, 32), ringM);
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.15; fx.add(ring);
    const bits = [];
    for (let i = 0; i < 8; i++) {
        const b = new T.Mesh(UNIT, new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 }));
        b.scale.setScalar(0.35); fx.add(b); bits.push(b);
    }
    fx.userData = { ringM, bits };
    fx.visible = false;
    parent.add(fx);
    return fx;
}
const tmpColor = new T.Color();
export function updateAuraFx(fx, aura, t) {
    fx.visible = !!aura;
    if (!aura) return;
    const u = fx.userData;
    const rainbow = aura.id === 'Rainbow';
    u.ringM.color.copy(rainbow ? tmpColor.setHSL((t * 0.3) % 1, 1, 0.6) : tmpColor.set(aura.color)).multiplyScalar(NEON_BOOST);
    u.ringM.opacity = 0.4 + Math.sin(t * 4) * 0.15;
    u.bits.forEach((b, i) => {
        const ang = t * 2.2 + i * Math.PI / 4;
        b.material.color.copy(rainbow ? tmpColor.setHSL(((t * 0.3) + i / 8) % 1, 1, 0.6) : tmpColor.set(aura.color)).multiplyScalar(NEON_BOOST);
        b.position.set(Math.cos(ang) * 2.2, 1 + ((i * 0.7 + t * 1.5) % 5), Math.sin(ang) * 2.2);
        b.rotation.set(t * 3, t * 2, 0);
    });
}

// ----- shadow monster -----
// Black blob with a glowing red rim, a wide toothy mouth and white eyes (the
// "Beat Levels with your Clones" creature). Jaw and body are animated by main.js.
const MON_GEO = (() => {
    const g = new T.IcosahedronGeometry(3.2, 3);
    const p = g.attributes.position, v = new V3();
    for (let i = 0; i < p.count; i++) {
        v.fromBufferAttribute(p, i);
        const n = 1 + 0.08 * Math.sin(v.x * 2.1 + v.y * 1.3) + 0.06 * Math.sin(v.z * 2.7 - v.y * 1.9);
        v.multiplyScalar(n);
        if (v.y < 0) v.y *= 0.8;
        p.setXYZ(i, v.x, v.y, v.z * 0.92);
    }
    g.computeVertexNormals();
    return g;
})();
const TOOTH_GEO = new T.ConeGeometry(0.32, 1.1, 4);
const MON_BODY = new T.MeshLambertMaterial({ color: 0x0c0a12 });
const MON_RIM = new T.MeshBasicMaterial({ color: new T.Color(0xff1e32).multiplyScalar(NEON_BOOST), side: T.BackSide });
const MON_MOUTH = new T.MeshBasicMaterial({ color: 0x2a0410 });
const MON_WHITE = new T.MeshBasicMaterial({ color: 0xffffff });
export function buildMonster() {
    const g = new T.Group();
    const body = new T.Group(); g.add(body);
    const blob = new T.Mesh(MON_GEO, MON_BODY); blob.castShadow = true; body.add(blob);
    const rim = new T.Mesh(MON_GEO, MON_RIM); rim.scale.setScalar(1.07); body.add(rim);
    // Spiky hair on top
    for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2;
        const sp = new T.Mesh(new T.ConeGeometry(0.7, 2.4 + (i % 3) * 0.6, 5), MON_BODY);
        sp.position.set(Math.cos(a) * 1.8, 2.7, Math.sin(a) * 1.6 - 0.4);
        sp.rotation.set(Math.sin(a) * -0.6, 0, Math.cos(a) * -0.6);
        body.add(sp);
    }
    // Mouth: dark inside, upper teeth fixed, lower teeth on the jaw
    const mouth = new T.Mesh(new T.SphereGeometry(1, 20, 12), MON_MOUTH);
    mouth.scale.set(2.3, 1.1, 0.9); mouth.position.set(0, -0.5, 2.55); body.add(mouth);
    for (let i = 0; i < 7; i++) {
        const t = new T.Mesh(TOOTH_GEO, MON_WHITE);
        t.position.set((i - 3) * 0.62, 0.35 - Math.abs(i - 3) * 0.06, 3.0 - Math.abs(i - 3) * 0.12);
        t.rotation.x = Math.PI; body.add(t);
    }
    const jaw = new T.Group(); jaw.position.set(0, -0.6, 0); body.add(jaw);
    for (let i = 0; i < 6; i++) {
        const t = new T.Mesh(TOOTH_GEO, MON_WHITE);
        t.position.set((i - 2.5) * 0.62, -0.75 + Math.abs(i - 2.5) * 0.06, 2.95 - Math.abs(i - 2.5) * 0.12);
        jaw.add(t);
    }
    // Slanted glowing eyes
    for (const sx of [-1, 1]) {
        const e = new T.Mesh(UNIT, MON_WHITE);
        e.scale.set(0.9, 0.42, 0.2); e.position.set(sx * 1.05, 1.15, 2.85); e.rotation.z = sx * 0.35;
        body.add(e);
    }
    g.userData = { body, jaw, rim };
    return g;
}

// ----- particles & floating text -----
const particles = [];
export function burst(pos, color, size, count) {
    for (let i = 0; i < (count || 26); i++) {
        const m = new T.Mesh(UNIT, mat(i % 3 ? color : 0xffffff));
        m.scale.setScalar((size || 1) * (0.5 + Math.random() * 0.5));
        m.position.copy(pos);
        scene.add(m);
        particles.push({ m, v: new V3((Math.random() * 2 - 1) * 25, Math.random() * 30 + 5, (Math.random() * 2 - 1) * 25), t: 1.2 });
    }
}
export function confettiAt(pos) {
    for (const c of [0xffd028, 0x46ec50, 0x28c8ff, 0xe82434, 0xc428ff]) burst(pos, c, 0.4, 12);
}
const floaters = [];
export function floatText(text, color, pos) {
    const sp = billboard([{ t: text, c: color, s: '#16121f', px: 70 }], 5, 512, pos);
    floaters.push({ sp, t: 1.1 });
}
export function updateEffects(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.t -= dt; p.v.y -= 80 * dt;
        p.m.position.addScaledVector(p.v, dt);
        p.m.rotation.x += dt * 5; p.m.rotation.y += dt * 4;
        if (p.t <= 0) { scene.remove(p.m); particles.splice(i, 1); }
    }
    for (let i = floaters.length - 1; i >= 0; i--) {
        const f = floaters[i];
        f.t -= dt; f.sp.position.y += dt * 4; f.sp.material.opacity = Math.min(1, f.t * 2);
        if (f.t <= 0) { scene.remove(f.sp); f.sp.material.map.dispose(); f.sp.material.dispose(); floaters.splice(i, 1); }
    }
}

export function lerpAngle(a, b, k) {
    let d = (b - a) % (Math.PI * 2);
    if (d > Math.PI) d -= Math.PI * 2;
    if (d < -Math.PI) d += Math.PI * 2;
    return a + d * k;
}

// ----- static batching -----
// The world is built from thousands of unit boxes that never move again. Merge every one
// that shares a material (and shadow flags) into a single mesh so the GPU draws a few
// hundred batches instead of thousands of tiny calls. Anything animated later is a plain
// Mesh with matrixAutoUpdate on, so it is left alone.
export function mergeStatic() {
    const groups = new Map();
    for (const m of scene.children) {
        if (!m.isMesh || m.matrixAutoUpdate || m.geometry !== UNIT || Array.isArray(m.material) || !m.visible) continue;
        const key = m.material.uuid + '|' + (m.castShadow ? 1 : 0) + (m.receiveShadow ? 1 : 0);
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(m);
    }
    let before = 0, after = 0;
    for (const list of groups.values()) {
        before += list.length;
        if (list.length < 2) { after += list.length; continue; }
        // Chunks keep each merged buffer a sensible size
        for (let i = 0; i < list.length; i += 400) {
            const part = list.slice(i, i + 400);
            const geos = part.map((m) => UNIT.clone().applyMatrix4(m.matrix));
            const merged = new T.Mesh(mergeGeometries(geos), part[0].material);
            merged.castShadow = part[0].castShadow; merged.receiveShadow = part[0].receiveShadow;
            merged.matrixAutoUpdate = false;
            for (const g of geos) g.dispose();
            for (const m of part) scene.remove(m);
            scene.add(merged);
            after++;
        }
    }
    return { before, after };
}
