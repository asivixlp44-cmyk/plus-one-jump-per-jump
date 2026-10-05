// Game data shared by the client and the Colyseus server.
// Clone target: Roblox "+1 Jump per Jump" (reference/Gameplay.mp4).

export const CFG = {
    walkSpeed: 24,
    gravity: 120,
    jumpV: 32,              // one jump rises ~4.3 studs
    bounceV: 46,            // trampoline bounce, ~8.8 studs
    tierStep: 4,            // studs of tower per required jump (a "JUMP 20+" pad sits ~80 studs up)
    lowGravity: 0.62,       // gravity multiplier while low gravity is on (jumps x1.6)
    rebirthLevel: 25,
    boostMinutes: 15,
    maxPlayers: 24,
    voidY: -30,
    // Global LOW GRAVITY event: every 30 minutes, the last 5 are live for everyone
    eventCycle: 30 * 60,
    eventLive: 5 * 60,
};

// XP needed to finish level L (25, 63, 110, 162 ... 715 at L12, like the reference), then it gets steeper
export const xpFor = (L) => Math.floor(25 * Math.pow(L, 1.35) * (1 + Math.max(0, L - 12) * 0.05));
// Jump power: how many jumps you can chain before landing (1, 4, 7 ... 3 per level)
export function jumpPower(p) {
    const base = 3 * Math.max(1, p.level || 1) - 2;
    return base * (p.passes && p.passes.DoubleJump ? 2 : 1);
}

// Jump Upgrades shop: Wins buy more XP per jump
const UPG_XP = [1, 2, 3, 4, 7, 10, 17, 27, 40, 60, 90, 135, 200, 300, 450, 675, 1000, 1500, 2250, 3400];
export const MAX_UPG = 60;
export function xpPerJump(lv) {
    lv = Math.max(1, Math.min(MAX_UPG, lv | 0));
    if (lv <= UPG_XP.length) return UPG_XP[lv - 1];
    return Math.floor(UPG_XP[UPG_XP.length - 1] * Math.pow(1.5, lv - UPG_XP.length));
}
// Wins to go from level lv to lv + 1 (3, 4, 7, 12, 19, 31, 50 ...)
export const upgCost = (lv) => Math.floor(3 * Math.pow(1.6, lv - 1));

// XP multiplier: +1x per rebirth, x2 XP pass, x2 XP boost
export function xpMult(p, now) {
    let m = 1 + (p.rebirths || 0);
    if (p.passes && p.passes.DoubleXP) m *= 2;
    if ((now || Date.now()) < (p.xpBoostUntil || 0)) m *= 2;
    return m;
}
export const lowGravityEvent = (now) => ((now / 1000) % CFG.eventCycle) >= CFG.eventCycle - CFG.eventLive;
// Seconds until the event starts (or, while it is live, until it ends)
export function eventLeft(now) {
    const ph = (now / 1000) % CFG.eventCycle, start = CFG.eventCycle - CFG.eventLive;
    return ph >= start ? CFG.eventCycle - ph : start - ph;
}
export const hasLowGravity = (p, now) => lowGravityEvent(now) || now < (p.gravUntil || 0);

// ---------------------------------------------------------------------------------
// World layout (studs). +z is "forward" from spawn: plaza, then five zones split by ever taller walls.
// ---------------------------------------------------------------------------------
export const WORLD = {
    halfX: 110, zMin: -80, zMax: 620,
    spawn: { x: 0, y: 1.1, z: -12 },
    walls: [
        { name: 'WALL 1', req: 7, z: 78, depth: 6 },
        { name: 'WALL 2', req: 12, z: 184, depth: 6 },
        { name: 'WALL 3', req: 25, z: 330, depth: 8 },
        { name: 'WALL 4', req: 45, z: 470, depth: 10 },
    ],
};
export const tierTop = (req) => req * CFG.tierStep - 2;

// Stepped towers. Each step has a win pad: touch it with enough Jump power for Wins,
// then you go back to spawn. x/z is the front-left corner, steps climb toward +z.
// lasers: [step index, ring count]. Laser rings slide up and down around that step and
// knock you off if they touch you.
export const TOWERS = [
    { name: 'GREEN STEPS', x: 34, z: -26, w: 30, step: 11, color: 0x2fd84a, glow: 0x7dff6b, pads: [[7, 2], [10, 2], [16, 4], [32, 8], [64, 16]] },
    { name: 'RED TOWER', x: -70, z: 96, w: 26, step: 12, color: 0xe8283c, glow: 0xff5a6e, pads: [[20, 3], [48, 25]] },
    { name: 'GOLD TOWER', x: 40, z: 100, w: 26, step: 12, color: 0xffa21e, glow: 0xffd028, pads: [[24, 10], [55, 25]], lasers: [[1, 1]] },
    { name: 'SKY TOWER', x: -16, z: 206, w: 34, step: 14, color: 0x22d8e0, glow: 0x7ff6ff, pads: [[79, 100], [120, 250], [180, 500]], lasers: [[1, 1], [2, 2]] },
    { name: 'FROST TOWER', x: 34, z: 352, w: 30, step: 14, color: 0x9fe8ff, glow: 0xffffff, pads: [[100, 600], [150, 1200], [220, 2500]], lasers: [[0, 1], [1, 2], [2, 2]] },
    { name: 'LAVA TOWER', x: -74, z: 360, w: 28, step: 14, color: 0xff4a14, glow: 0xffc414, pads: [[130, 900], [260, 5000]], lasers: [[0, 2], [1, 3]] },
    { name: 'GALAXY TOWER', x: -20, z: 500, w: 40, step: 16, color: 0x6a3cff, glow: 0xc28cff, pads: [[300, 8000], [400, 15000], [520, 30000]], lasers: [[0, 3], [1, 2], [2, 3]] },
];
// Flat pad list (index = id the client sends) with the pad centre on top of its step
export const PADS = [];
for (const [ti, t] of TOWERS.entries()) {
    t.pads.forEach(([req, wins], k) => {
        PADS.push({ tower: ti, req, wins, x: t.x + t.w / 2, y: tierTop(req), z: t.z + k * t.step + 4.5 });
    });
}
// The little pink "+2 WINS JUMP 7+" kiosk by the spawn
PADS.push({ tower: -1, req: 7, wins: 2, x: -16, y: tierTop(7), z: 46 });

// Training Gym trampolines: stand on one and you bounce for XP by yourself
export const TRAMPS = [
    { x: -62, z: -18, r: 5.5, mult: 1 },
    { x: -46, z: -18, r: 5.5, mult: 1 },
    { x: -62, z: 2, r: 5.5, mult: 3, pass: 'Tramp3' },
    { x: -46, z: 2, r: 5.5, mult: 9, pass: 'Tramp9' },
    { x: -62, z: 22, r: 5.5, mult: 25, pass: 'Tramp25' },
    { x: -46, z: 22, r: 6.5, mult: 100, pass: 'Tramp100', op: true },
];
export const TRAMP_TOP = 1.4;
export function trampAt(x, y, z, slack) {
    if (y < TRAMP_TOP - 1 || y > TRAMP_TOP + (slack || 0.6)) return null;
    for (const t of TRAMPS) if ((x - t.x) ** 2 + (z - t.z) ** 2 <= (t.r + 0.4) ** 2) return t;
    return null;
}
export const UPGRADE_SHOP = { x: 20, z: 6 };

// Seasons roll on the server clock so every player sees the same weather.
// Winter makes the ground slippery; rain brings thunder.
export const SEASONS = [
    { id: 'summer', name: 'SUMMER', ic: '☀️' },
    { id: 'rain', name: 'RAINY', ic: '🌧️' },
    { id: 'autumn', name: 'AUTUMN', ic: '🍂' },
    { id: 'winter', name: 'WINTER', ic: '❄️' },
];
export const SEASON_LEN = 300, SEASON_BLEND = 25;
// { i, next, k } where k blends from season i to the next during the last SEASON_BLEND seconds
export function seasonAt(now) {
    const s = now / 1000, n = SEASONS.length;
    const i = Math.floor(s / SEASON_LEN) % n, ph = s % SEASON_LEN;
    const k = Math.max(0, (ph - (SEASON_LEN - SEASON_BLEND)) / SEASON_BLEND);
    return { i, next: (i + 1) % n, k: k * k * (3 - 2 * k), left: SEASON_LEN - ph };
}

// ---------------------------------------------------------------------------------
// Cosmetic jump trails (bought with Wins)
// ---------------------------------------------------------------------------------
export const TRAILS = [
    { id: 'None', cost: 0, colors: [] },
    { id: 'Sparkle', cost: 15, colors: [0xffffff, 0xfff6b0] },
    { id: 'Bubble', cost: 60, colors: [0x7fe8ff, 0xffffff] },
    { id: 'Fire', cost: 200, colors: [0xff7a1a, 0xffc414, 0xff3a14] },
    { id: 'Toxic', cost: 600, colors: [0x7dff3a, 0x2fd84a] },
    { id: 'Galaxy', cost: 2000, colors: [0xc28cff, 0x6a3cff, 0xffffff] },
    { id: 'Rainbow', pass: 'RainbowTrail', colors: [0xff3a3a, 0xff9a1e, 0xffe14a, 0x46ec50, 0x28c8ff, 0x8a5cff] },
];
export const trailIndex = (id) => Math.max(0, TRAILS.findIndex((t) => t.id === id));

// ---------------------------------------------------------------------------------
// Store (Bux)
// ---------------------------------------------------------------------------------
export const PRODUCTS = {
    NoGravity: { name: 'No Gravity (15 min)', price: 19, ic: '🪐' },
    XPBoost: { name: 'x2 XP Boost (15 min)', price: 25, ic: '⚡' },
    Wins100: { name: '+100 Wins', price: 15, wins: 100, ic: '🏆' },
    Wins1K: { name: '+1,000 Wins', price: 79, wins: 1000, ic: '🏆' },
    Wins10K: { name: '+10,000 Wins', price: 299, wins: 10000, ic: '🏆' },
    StarterPack: { name: 'Starter Pack', price: 9, wins: 25, xp: 2000, ic: '🎁' },
};
export const PASSES = {
    DoubleJump: { name: 'x2 Jump', price: 49, ic: '🦘', desc: 'Double your Jump power forever' },
    DoubleXP: { name: 'x2 XP', price: 39, ic: '⭐', desc: 'Double the XP from every jump' },
    DoubleWins: { name: 'x2 Wins', price: 99, ic: '🏆', desc: 'Double the Wins from every pad' },
    Tramp3: { name: 'x3 XP Trampoline', price: 15, ic: '🟠', desc: 'Unlocks the x3 XP trampoline in the Gym' },
    Tramp9: { name: 'x9 XP Trampoline', price: 35, ic: '🟣', desc: 'Unlocks the x9 XP trampoline in the Gym' },
    Tramp25: { name: 'x25 XP Trampoline', price: 79, ic: '🔵', desc: 'Unlocks the x25 XP trampoline in the Gym' },
    Tramp100: { name: 'OP x100 XP Trampoline', price: 199, ic: '🔴', desc: 'Unlocks the OP x100 XP trampoline' },
    RainbowTrail: { name: 'Rainbow Trail', price: 29, ic: '🌈', desc: 'A rainbow trail behind every jump' },
};
// Bloxity Bux SKUs: create these in the game's IAP catalog on bloxity.io (prices live there)
export const SKUS = {
    product: {
        NoGravity: 'no_gravity', XPBoost: 'xp_boost', Wins100: 'wins_100', Wins1K: 'wins_1k', Wins10K: 'wins_10k',
        StarterPack: 'starter_pack',
    },
    pass: {
        DoubleJump: 'pass_double_jump', DoubleXP: 'pass_double_xp', DoubleWins: 'pass_double_wins',
        Tramp3: 'pass_tramp_3', Tramp9: 'pass_tramp_9', Tramp25: 'pass_tramp_25', Tramp100: 'pass_tramp_100',
        RainbowTrail: 'pass_rainbow_trail',
    },
};
export const buxText = (n) => fmt(n) + ' Bux';
export function skuLookup(sku) {
    for (const kind of ['product', 'pass']) for (const [key, s] of Object.entries(SKUS[kind])) if (s === sku) return { kind, key };
    return null;
}

// Quest chain. The first four are the tutorial ("STEP 1/4"), with a guide arrow.
export const TUTORIAL_STEPS = 4;
export const QUESTS = [
    { text: 'Jump to LEVEL 3, then touch a pad!', stat: 'level', n: 3, reward: { xp: 50 }, goal: 'pad' },
    { text: 'Touch the WIN PAD!', stat: 'totalWins', n: 2, reward: { wins: 1 }, goal: 'pad' },
    { text: 'Buy your first upgrade at the SHOP!', stat: 'upg', n: 2, reward: { xp: 150 }, goal: 'shop' },
    { text: 'Train in the GYM for more XP!', stat: 'bounces', n: 10, reward: { wins: 3 }, goal: 'gym' },
    { text: 'Reach Level 10!', stat: 'level', n: 10, reward: { wins: 10 } },
    { text: 'Jump over WALL 1!', stat: 'best', n: 30, reward: { wins: 5 } },
    { text: 'Get 50 Wins!', stat: 'totalWins', n: 50, reward: { xp: 5000 } },
    { text: 'Jump 1,000 times!', stat: 'jumps', n: 1000, reward: { wins: 25 } },
    { text: 'Reach Level 25!', stat: 'level', n: 25, reward: { wins: 50 } },
    { text: 'Rebirth once!', stat: 'rebirths', n: 1, reward: { wins: 100 } },
    { text: 'Climb 500 studs high!', stat: 'best', n: 500, reward: { wins: 250 } },
    { text: 'Jump over WALL 3!', stat: 'best', n: 100, reward: { wins: 300 } },
    { text: 'Get 2,500 Wins!', stat: 'totalWins', n: 2500, reward: { wins: 500 } },
    { text: 'Jump over WALL 4!', stat: 'best', n: 180, reward: { wins: 1000 } },
    { text: 'Reach Level 75!', stat: 'level', n: 75, reward: { wins: 5000 } },
    { text: 'Climb 1,500 studs - into space!', stat: 'best', n: 1500, reward: { wins: 20000 } },
];

// Daily login streak: claim once per (UTC) day; missing a day starts over at Day 1
export const DAILY = [
    { xp: 200 }, { wins: 3 }, { xp: 1500 }, { wins: 10 }, { xp: 8000 }, { wins: 30 }, { xp: 40000, wins: 75 },
];
export const dayKey = (t) => new Date(t).toISOString().slice(0, 10);
export function dailyStatus(p, now) {
    const today = dayKey(now), yesterday = dayKey(now - 86400000);
    if (p.dailyDay === today) return { ready: false, day: (p.dailyStreak - 1) % DAILY.length };
    const streak = p.dailyDay === yesterday ? p.dailyStreak : 0;
    return { ready: true, day: streak % DAILY.length };
}

// Gifts: session playtime rewards (minutes since joining)
export const FREE = [
    { min: 1, xp: 100 }, { min: 3, wins: 2 }, { min: 6, xp: 1000 },
    { min: 10, wins: 5 }, { min: 15, xp: 5000 }, { min: 25, wins: 15 }, { min: 40, xp: 25000 }, { min: 60, wins: 50 },
];

// Redeem codes (case-insensitive, once per player)
export const CODES = {
    RELEASE: { wins: 10 },
    JUMP: { xp: 500 },
    LEGION: { wins: 25 },
    BLOXITY: { grav: 5 },
};

// Fallback blocky look (before the Bloxity body loads): black tee, dark jeans, orange hair
export const KITS = [
    { shirt: 0x1c1c22, shorts: 0x26302a, socks: 0x26302a, hair: 0xe8761e, skin: 0xf2efe6 },
    { shirt: 0x2f7bff, shorts: 0x2b3340, socks: 0x2b3340, hair: 0x3a2618 },
    { shirt: 0xe82434, shorts: 0x1c1c22, socks: 0x1c1c22, hair: 0x1a1410 },
    { shirt: 0x28c43c, shorts: 0x2b3340, socks: 0x2b3340, hair: 0xe6c878 },
    { shirt: 0x8a1cff, shorts: 0x1c1c22, socks: 0x1c1c22, hair: 0x3a2618 },
    { shirt: 0xf5f5f5, shorts: 0x2b3340, socks: 0x2b3340, hair: 0xd8641e },
];
export const SKINS = [0xf5d29a, 0xe1af87, 0xc88c5f, 0x8c5a3c, 0xf0c8a0];

const SUF = ['K', 'M', 'B', 'T', 'Qa', 'Qi'];
// 2700 -> "2.7K", 1000000 -> "1M", 950 -> "950"
export function fmt(v) {
    v = Math.floor(v || 0);
    if (v < 1000) return String(v);
    let i = -1, s = v;
    while (s >= 1000 && i < SUF.length - 1) { s /= 1000; i++; }
    const t = s >= 100 ? String(Math.floor(s)) : (Math.floor(s * 10) / 10).toFixed(1).replace(/\.0$/, '');
    return t + SUF[i];
}
export const comma = (v) => Math.floor(v || 0).toLocaleString('en-US');
export function clock(s) {
    s = Math.max(0, Math.floor(s));
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
}
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export function rngFrom(seed) {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6D2B79F5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
