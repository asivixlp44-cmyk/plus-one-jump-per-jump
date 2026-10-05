// Local mirror of this player's progress. The server owns the real values:
// public stats arrive through the room state, private ones in "profile" messages.
export const S = {
    wins: 0, totalWins: 0, level: 1, xp: 0, rebirths: 0, jump: 1, best: 0, upg: 1, jumps: 0, bounces: 0,
    passes: {}, quest: 0, trails: {}, trail: 'None', codes: {}, seenTutorial: true,
    xpBoostUntil: 0, gravUntil: 0, claimedPack: false, firstPlay: Date.now(),
    freeClaimed: {}, joinedAt: Date.now(), name: '', daily: null,
};

// Game actions that world objects (pads, the shop carpet) trigger; filled in by main.js
export const actions = {};

export const net = {
    room: null,
    offset: 0,
    send(type, msg) { if (this.room) this.room.send(type, msg || {}); },
    // Server clock in ms
    now() { return Date.now() + this.offset; },
};
