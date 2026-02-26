# EmberFall: Pocket Dungeon Parade

A complete browser-based, mobile-friendly, portrait RPG dungeon crawler built with **HTML + CSS + JavaScript + Canvas API**.

## Features

- Three-character party (Warrior, Mage, Ranger) with active switching and auto-follow.
- Multiple zones: town hub + two dungeons + boss encounter.
- Real-time action combat with basic attacks, two skills per class, cooldowns, mana, and AI enemies.
- Quests: main story + side quests (kill, collect, deliver).
- Progression: XP, level scaling, stat growth, loot, inventory, equipment, gold.
- Mobile controls: virtual joystick + touch buttons.
- Responsive portrait UI, quest tracker, minimap, dialogue panel, party bars, menu tabs.
- Save/Load via `localStorage`.
- Lightweight synth SFX via Web Audio API.
- Modular architecture for scalability.

## Run locally

1. Start a local static server from repo root:

```bash
python3 -m http.server 4173
```

2. Open in your browser:

```text
http://localhost:4173
```

> On mobile, connect from same network and open `http://<your-local-ip>:4173`.

## Controls

### Mobile
- Drag joystick to move.
- `ATK`, `S1`, `S2` for combat.
- `SW` switches active character.
- `☰` opens menu.
- Double-tap canvas near NPC to interact.

### Desktop
- `Space` attack, `1` and `2` skills, `Q` switch, `E` talk.

## Architecture

- `scripts/game.js` – game composition root, update loop, render loop, input, save/load.
- `scripts/world.js` – zone definitions, collision, map exits, NPC lookup.
- `scripts/player.js` – party member definitions, classes, follow behavior.
- `scripts/enemy.js` – enemy templates and basic chase/wander AI.
- `scripts/combat.js` – damage, skills, enemy attacks, particles, drops.
- `scripts/questSystem.js` – quest state, progression, rewards.
- `scripts/inventory.js` – items, equipment, gold economy.
- `scripts/ui.js` – HUD/menu/dialogue rendering and UI wiring.
- `scripts/saveSystem.js` – `localStorage` persistence abstraction.
- `scripts/audio.js` – tiny web-audio sound effects.

## Expansion ideas

1. Add tilemaps and sprite sheets loaded from `/assets` instead of procedural drawing.
2. Introduce class trees, skill customization, and status effects.
3. Add network-ready state replication layer for co-op multiplayer.
4. Split world data into JSON packs and implement streaming/chunk loading.
5. Add encounter director and event scripting for richer dungeons.
