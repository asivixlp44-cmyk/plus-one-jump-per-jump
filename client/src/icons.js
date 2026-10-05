// Chunky outlined HUD icons drawn as inline SVG (trophy, rainbow spring, planet, gift...).
// Elements with data-icon="name" get the matching SVG when the page loads.
const K = '#16121f';
const RAINBOW = ['#ff3a3a', '#ff9a1e', '#ffe14a', '#46ec50', '#28c8ff', '#8a5cff'];
export const ICONS = {
    trophy: `<svg viewBox="0 0 64 64" aria-hidden="true">
        <path d="M17 13H7c0 11 6 16 13 16M47 13h10c0 11-6 16-13 16" fill="none" stroke="${K}" stroke-width="8" stroke-linecap="round"/>
        <path d="M17 13H7c0 11 6 16 13 16M47 13h10c0 11-6 16-13 16" fill="none" stroke="#ffb51c" stroke-width="3.5" stroke-linecap="round"/>
        <path d="M16 6h32v16c0 11-7 18-16 18S16 33 16 22z" fill="#ffc72a" stroke="${K}" stroke-width="3.5"/>
        <path d="M22 11v10c0 6 4 11 8 12" fill="none" stroke="#fff1a8" stroke-width="3.5" stroke-linecap="round"/>
        <path d="M27 39h10v8H27z" fill="#e3940c" stroke="${K}" stroke-width="3.5"/>
        <rect x="16" y="46" width="32" height="11" rx="3" fill="#ffc72a" stroke="${K}" stroke-width="3.5"/></svg>`,
    rebirth: `<svg viewBox="0 0 64 64" aria-hidden="true">
        <circle cx="32" cy="32" r="26" fill="#ffffff" stroke="${K}" stroke-width="4"/>
        <path d="M6 32a26 26 0 0 1 52 0z" fill="#e82434" stroke="${K}" stroke-width="4"/>
        <path d="M6 32h52" stroke="${K}" stroke-width="5"/>
        <circle cx="32" cy="32" r="8" fill="#ffffff" stroke="${K}" stroke-width="4"/>
        <path d="M17 18a18 18 0 0 1 8-5" stroke="#ff9aa2" stroke-width="4" stroke-linecap="round" fill="none"/></svg>`,
    gift: `<svg viewBox="0 0 64 64" aria-hidden="true">
        <path d="M32 20c-4-10-16-12-16-5s10 6 16 5zm0 0c4-10 16-12 16-5s-10 6-16 5z" fill="#ffc72a" stroke="${K}" stroke-width="3.5" stroke-linejoin="round"/>
        <rect x="8" y="20" width="48" height="12" rx="2" fill="#ff4a5a" stroke="${K}" stroke-width="3.5"/>
        <rect x="12" y="31" width="40" height="27" rx="2" fill="#e82434" stroke="${K}" stroke-width="3.5"/>
        <path d="M27 20h10v38H27z" fill="#ffc72a" stroke="${K}" stroke-width="3.5"/>
        <path d="M15 35v18" stroke="#ff8a96" stroke-width="3" stroke-linecap="round"/></svg>`,
    // Rainbow coil spring: the jump icon
    spring: `<svg viewBox="0 0 64 64" aria-hidden="true">
        ${RAINBOW.map((c, i) => `<rect x="9" y="${6 + i * 9}" width="46" height="8" rx="4" fill="${c}" stroke="${K}" stroke-width="3"/>`).join('')}
        <path d="M14 9h14" stroke="#ffffff" stroke-width="2.5" stroke-linecap="round" opacity="0.7"/></svg>`,
    sparkle: `<svg viewBox="0 0 64 64" aria-hidden="true">
        <path d="M30 4l6 18 18 6-18 6-6 18-6-18-18-6 18-6z" fill="#ffe14a" stroke="${K}" stroke-width="3.5" stroke-linejoin="round"/>
        <path d="M50 38l3 8 8 3-8 3-3 8-3-8-8-3 8-3z" fill="#c28cff" stroke="${K}" stroke-width="3" stroke-linejoin="round"/>
        <path d="M12 42l2 5 5 2-5 2-2 5-2-5-5-2 5-2z" fill="#6fe0ff" stroke="${K}" stroke-width="2.5" stroke-linejoin="round"/></svg>`,
    calendar: `<svg viewBox="0 0 64 64" aria-hidden="true">
        <rect x="8" y="12" width="48" height="46" rx="5" fill="#ffffff" stroke="${K}" stroke-width="3.5"/>
        <path d="M8 17a5 5 0 0 1 5-5h38a5 5 0 0 1 5 5v9H8z" fill="#e82434" stroke="${K}" stroke-width="3.5"/>
        <path d="M20 6v12M44 6v12" stroke="${K}" stroke-width="5" stroke-linecap="round"/>
        <text x="32" y="51" text-anchor="middle" font-family="Fredoka, sans-serif" font-weight="700" font-size="22" fill="${K}">21</text></svg>`,
    scroll: `<svg viewBox="0 0 64 64" aria-hidden="true">
        <path d="M14 8h34a6 6 0 0 1 6 6v40a4 4 0 0 1-4 4H18a6 6 0 0 1-6-6V12" fill="#ffe7a8" stroke="${K}" stroke-width="3.5" stroke-linejoin="round"/>
        <path d="M12 12a4 4 0 0 1 8 0v6h-8z" fill="#ffc72a" stroke="${K}" stroke-width="3"/>
        <path d="M24 22h20M24 31h20M24 40h14" stroke="#b07a2a" stroke-width="3.5" stroke-linecap="round"/></svg>`,
    ticket: `<svg viewBox="0 0 64 64" aria-hidden="true">
        <path d="M6 20l38-12 4 10a6 6 0 0 0 8 4l4 10-38 12-4-10a6 6 0 0 0-8-4z" fill="#ff4a5a" stroke="${K}" stroke-width="3.5" stroke-linejoin="round"/>
        <path d="M26 16l7 22" stroke="#ffffff" stroke-width="3" stroke-dasharray="4 4"/>
        <circle cx="41" cy="26" r="4" fill="#ffd028" stroke="${K}" stroke-width="2.5"/></svg>`,
    gear: `<svg viewBox="0 0 64 64" aria-hidden="true">
        <path d="M28 4h8l2 8 6 3 7-4 6 6-4 7 3 6 8 2v8l-8 2-3 6 4 7-6 6-7-4-6 3-2 8h-8l-2-8-6-3-7 4-6-6 4-7-3-6-8-2v-8l8-2 3-6-4-7 6-6 7 4 6-3z" fill="#a9b2c8" stroke="${K}" stroke-width="3.5" stroke-linejoin="round"/>
        <circle cx="32" cy="32" r="9" fill="#5d6680" stroke="${K}" stroke-width="3.5"/></svg>`,
    cart: `<svg viewBox="0 0 64 64" aria-hidden="true">
        <path d="M4 10h9l7 30h30l6-22H17" fill="none" stroke="${K}" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M17 18h39l-6 22H20z" fill="#ffc72a" stroke="${K}" stroke-width="3.5" stroke-linejoin="round"/>
        <path d="M4 10h9l7 30h30" fill="none" stroke="#e3940c" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>
        <circle cx="24" cy="52" r="5" fill="#ffffff" stroke="${K}" stroke-width="3.5"/><circle cx="46" cy="52" r="5" fill="#ffffff" stroke="${K}" stroke-width="3.5"/></svg>`,
    planet: `<svg viewBox="0 0 64 64" aria-hidden="true">
        <g transform="rotate(-18 32 34)"><ellipse cx="32" cy="34" rx="29" ry="9" fill="none" stroke="${K}" stroke-width="8"/><ellipse cx="32" cy="34" rx="29" ry="9" fill="none" stroke="#ff6bd5" stroke-width="4"/></g>
        <circle cx="32" cy="32" r="18" fill="#8a3cff" stroke="${K}" stroke-width="3.5"/>
        <path d="M22 24a12 12 0 0 1 10-6" stroke="#d8b8ff" stroke-width="4" stroke-linecap="round" fill="none"/>
        <g transform="rotate(-18 32 34)"><path d="M3 34a29 9 0 0 0 58 0" fill="none" stroke="${K}" stroke-width="8"/><path d="M3 34a29 9 0 0 0 58 0" fill="none" stroke="#ff6bd5" stroke-width="4"/></g></svg>`,
    star: `<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M32 4l8 18 20 2-15 13 5 20-18-11-18 11 5-20L4 24l20-2z" fill="#ffd028" stroke="${K}" stroke-width="3.5" stroke-linejoin="round"/></svg>`,
    up: `<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M32 6l22 26H42v26H22V32H10z" fill="#ffffff" stroke="${K}" stroke-width="4" stroke-linejoin="round"/></svg>`,
    friends: `<svg viewBox="0 0 64 64" aria-hidden="true">
        <circle cx="22" cy="22" r="10" fill="#f5d29a" stroke="${K}" stroke-width="3.5"/><circle cx="44" cy="24" r="9" fill="#f5d29a" stroke="${K}" stroke-width="3.5"/>
        <path d="M4 56c0-12 8-20 18-20s18 8 18 20z" fill="#28c8ff" stroke="${K}" stroke-width="3.5"/>
        <path d="M34 56c0-10 4-17 10-17s16 7 16 17z" fill="#46ec50" stroke="${K}" stroke-width="3.5"/></svg>`,
};
export function fillIcons(root) {
    (root || document).querySelectorAll('[data-icon]').forEach((el) => {
        const svg = ICONS[el.dataset.icon];
        if (svg && !el.firstElementChild) el.innerHTML = svg;
    });
}
