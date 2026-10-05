import { T, texFrom } from './engine.js';

// Canvas-generated surface textures: the green Roblox baseplate, stud walls for the towers,
// the beige walkway and the trampoline net.

function canvas(w, h, draw) {
    const c = document.createElement('canvas'); c.width = w; c.height = h || w;
    draw(c.getContext('2d'), c.width, c.height);
    return c;
}

const cache = new Map();
function repeated(img, key, rx, ry) {
    rx = Math.max(1, Math.round(rx)); ry = Math.max(1, Math.round(ry));
    const id = key + rx + 'x' + ry;
    if (cache.has(id)) return cache.get(id);
    const t = texFrom(img);
    t.wrapS = t.wrapT = T.RepeatWrapping;
    t.repeat.set(rx, ry);
    cache.set(id, t);
    return t;
}
function lambert(id, color, map) {
    id = 'mat:' + id;
    if (cache.has(id)) return cache.get(id);
    const m = new T.MeshLambertMaterial({ color, map });
    cache.set(id, m);
    return m;
}

// Baseplate stud: flat plate with the engraved chevron, in any base colour
function chevron(x, ox, oy, s, color) {
    x.strokeStyle = color; x.lineWidth = s * 0.16; x.lineJoin = 'round'; x.lineCap = 'round';
    x.beginPath(); x.moveTo(ox - s * 0.35, oy - s * 0.15); x.lineTo(ox, oy + s * 0.2); x.lineTo(ox + s * 0.35, oy - s * 0.15); x.stroke();
}
const plateCache = new Map();
function plateImg(base) {
    if (!plateCache.has(base)) {
        plateCache.set(base, canvas(64, 64, (x) => {
            x.fillStyle = base; x.fillRect(0, 0, 64, 64);
            x.strokeStyle = 'rgba(0,0,0,0.16)'; x.lineWidth = 2; x.strokeRect(1, 1, 62, 62);
            chevron(x, 32, 33, 30, 'rgba(0,0,0,0.22)');
            chevron(x, 32, 30, 30, 'rgba(255,255,255,0.28)');
        }));
    }
    return plateCache.get(base);
}
// Tower faces: a colour with round studs on a grid (the dotted neon walls in the reference)
const studCache = new Map();
function studImg(base) {
    if (!studCache.has(base)) {
        studCache.set(base, canvas(64, 64, (x) => {
            x.fillStyle = base; x.fillRect(0, 0, 64, 64);
            for (const [cx, cy] of [[16, 16], [48, 16], [16, 48], [48, 48]]) {
                x.fillStyle = 'rgba(0,0,0,0.18)'; x.beginPath(); x.arc(cx + 1.5, cy + 2, 8.5, 0, Math.PI * 2); x.fill();
                x.fillStyle = 'rgba(255,255,255,0.22)'; x.beginPath(); x.arc(cx, cy, 8, 0, Math.PI * 2); x.fill();
            }
        }));
    }
    return studCache.get(base);
}
// Walkway: rows of pale pink/beige bricks
const pathImg = canvas(128, 128, (x) => {
    x.fillStyle = '#d8c4b6'; x.fillRect(0, 0, 128, 128);
    for (let r = 0; r < 4; r++) for (let b = -1; b < 3; b++) {
        const off = r % 2 ? 32 : 0, v = (r * 7 + b * 13) % 3;
        x.fillStyle = ['#f1e2d6', '#ecdacb', '#f5e9e0'][v];
        x.fillRect(b * 64 + off + 2, r * 32 + 2, 60, 28);
    }
});
// Trampoline net: dark mat with a faint grid
const netImg = canvas(64, 64, (x) => {
    x.fillStyle = '#23263a'; x.fillRect(0, 0, 64, 64);
    x.strokeStyle = 'rgba(255,255,255,0.08)'; x.lineWidth = 2;
    for (let i = 0; i <= 64; i += 16) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i, 64); x.stroke(); x.beginPath(); x.moveTo(0, i); x.lineTo(64, i); x.stroke(); }
});

export const plateMaterial = (base, rx, ry) => lambert('plate' + base + rx + 'x' + ry, 0xffffff, repeated(plateImg(base), 'plate' + base, rx, ry));
export const studWallMaterial = (base, rx, ry) => lambert('stud' + base + rx + 'x' + ry, 0xffffff, repeated(studImg(base), 'stud' + base, rx, ry));
export const pathMaterial = (rx, ry) => lambert('path' + rx + 'x' + ry, 0xffffff, repeated(pathImg, 'path', rx, ry));
export const netMaterial = () => lambert('net', 0xffffff, repeated(netImg, 'net', 3, 3));
