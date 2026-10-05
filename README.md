# +1 Jump per Jump

A Bloxity game built with Three.js and Colyseus. It is a clone of the Roblox game
"+1 Jump per Jump" (reference video: `reference/Gameplay.mp4`).

## How it plays

- Every jump earns XP: `(XP per jump) x (1 + rebirths) x x2 XP pass x x2 XP boost`.
- **Jump power** is how many jumps you can chain before you land: `3 x Level - 2` (x2 with the X2 JUMP pass).
  Tap Space for each jump, or hold it to keep jumping at the top of every hop. A level-up in mid-air adds the new jumps right away.
- One jump rises about 4 studs, so a pad marked `JUMP 20+` sits about 80 studs up.
- **Win pads** sit on the steps of four towers (and a pink kiosk by the spawn). Touch one with enough Jump power for Wins,
  then you go back to the spawn. Without enough Jump power you get "You need JUMP N+ for this pad!".
  - GREEN STEPS (by the spawn): 7 / 10 / 16 / 32 / 64
  - Behind WALL 1 (Jump 7+): RED TOWER 20 / 48, GOLD TOWER 24 / 55
  - Behind WALL 2 (Jump 12+): SKY TOWER 79 / 120 / 180
  - Behind WALL 3 (Jump 25+): FROST TOWER 100 / 150 / 220, LAVA TOWER 130 / 260
  - Behind WALL 4 (Jump 45+): GALAXY TOWER 300 / 400 / 520 (up to ~2,000 studs, where the sky turns to space)
- **Laser rings** slide up and down around the higher steps (Gold, Sky, Frost, Lava, Galaxy) on the server clock.
  Touching one knocks you away from the tower with no jumps left, so you fall.
- **Jump Upgrades** (the striped shop, or the Upgrades button): spend Wins for more XP per jump
  (+1, +2, +3, +4, +7, +10, +17, +27 ...). Costs 3, 4, 7, 12, 19, 31, 50 ... Wins. BUY MAX buys as many as you can afford.
- **Training Gym**: trampolines bounce you by themselves for XP. Two are free (x1); x3, x9, x25 and OP x100 are passes.
  Owned trampolines glow with a light beam, rising neon halos and bubbles, and splash bubbles on every bounce.
- **Seasons** (server clock, 5 minutes each, 25 s blend): SUMMER, RAINY (rain, thunder and lightning), AUTUMN (orange trees,
  falling leaves) and WINTER (snowfall, snow on the ground, icy slippery movement). Sky, fog, light, sea and trees all change.
- **Rebirth** at Level 25: +1x XP per rebirth. Level and Jump power start over. Wins, upgrades and trails stay.
- **LOW GRAVITY event**: the last 5 minutes of every 30 (server clock), jumps go x1.6 higher for everyone.
  The NO GRAVITY product gives the same for 15 minutes.
- Trails (bought with Wins, Rainbow is a pass), Gifts (playtime rewards), Daily streak, a Quest chain
  (the first four steps are the tutorial, with guide arrows), redeem Codes (`RELEASE`, `JUMP`, `LEGION`, `BLOXITY`)
  and three leaderboards (Top Jumps, Top Wins, Top Rebirths).
- Soundtrack: an original, code-generated 118 BPM island-pop loop (marimba hook, octave bass). No audio files.

## Run it

```bash
npm install        # also installs client/ and server/
npm run build      # builds the client into client/dist
npm start          # server + built client on http://localhost:2567 (PORT to change)
```

For development, run the server and the Vite client side by side:

```bash
npm run dev:server
VITE_SERVER_URL=http://localhost:2567 npm run dev:client
```

## Deploy (Bloxity hosting)

Every push to `main` (prod) or `dev` runs `.github/workflows/deploy.yml`:

1. Builds the server image from `server/Dockerfile` and pushes it to `ghcr.io/asivixlp44-cmyk/plus-one-jump-per-jump-server`.
2. Tells Legion (`legion.bloxity.io/v1/apps/plus-one-jump-per-jump/deploy`) to roll it out (seat cap 24, up to 5 replicas).
3. Builds the client with `VITE_BLOXITY_GAME_ID` and uploads it to the Bloxity hosting API.

Play at https://plus-one-jump-per-jump.play.bloxity.io (prod) or https://plus-one-jump-per-jump.dev.play.bloxity.io (dev).
The hosted client finds its server through the Bloxity matchmaker (`<id>.host.bloxity.io`).

One-time setup:

- Create the app `plus-one-jump-per-jump` on hosting.bloxity.io (Legion has no create-on-deploy).
- Repo secrets: `LEGION_DEPLOY_TOKEN` (from hosting.bloxity.io) and `GHCR_PUSH_TOKEN` (classic PAT of asivixlp44-cmyk with `write:packages`).
- After the first run, make the GHCR package public so Legion can pull it.
- On Legion, `MONGODB_URI` is provided: player profiles live in MongoDB and are shared by every pod.
  Without it (local dev) they are kept in `server/data/profiles.json`.

## Controls

| Action | Keyboard / mouse | Controller |
|---|---|---|
| Move | WASD / arrows | Left stick |
| Jump (hold to keep jumping) | Space | A |
| Camera | Drag, wheel to zoom | Right stick, D-pad up/down to zoom |
| Interact (shop) | E | X |
| Store / Upgrades / Rebirth / Gifts / Settings | HUD buttons | Y / LB / RB / Back / Start |

Phones get an on-screen joystick and a JUMP button.

## Layout

- `shared/config.js`: game data used by both sides (jump power, XP, upgrades, towers and pads, trampolines, trails, store, quests).
- `server/src/JumpRoom.js`: the room. It owns XP from jumps and bounces, levels, Wins, upgrades, rebirths, codes and purchases.
- `client/src/main.js`: player, multi-jump physics, trampolines, networking, other players.
- `client/src/world.js`: the island, spawn arch, shop, gym, towers, laser rings, walls and leaderboards.
- `client/src/weather.js`: seasons, sky dome, rain/snow/leaves, lightning and the space sky up high.
- `client/src/ui.js` and `client/index.html`: the HUD and panels.

## Multiplayer and anti-cheat

- Movement is client-side; the client sends its position about 15 times a second.
- The server pays every jump, but only up to `Jump power + 3` jumps per flight and at most 10 jumps a second.
- Trampoline bounces are checked against the player's position and a 0.45 s cooldown. Win pads check position and Jump power.

## Bloxity

Bloxity integration works the same way as in the other Legion games:

- Login, avatars, friends, settings, Bux purchases and stats (Jumps, Wins, Rebirths).
- Game slug: `plus-one-jump-per-jump` (`client/src/bloxity.js`). Confirm it with Bloxity.
- Create the Bux SKUs from `SKUS` in `shared/config.js` in the game's IAP catalog.
- Set `LEGION_WEBHOOK_SECRET` on the host to turn on Bux mode.

UI rules: the top-left corner stays empty for the Bloxity overlay, prices are in Bux only, and there is no start menu.
