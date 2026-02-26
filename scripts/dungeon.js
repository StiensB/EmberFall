function mulberry32(seed) {
  return function rand() {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function rect(x, y, w, h) {
  return { x, y, w, h };
}

const MODIFIERS = {
  fortified: { id: 'fortified', name: 'Fortified', description: 'Enemies gain +18% max HP.', score: 1 },
  fury: { id: 'fury', name: 'Fury', description: 'Enemies gain +14% attack.', score: 1 },
  plague: { id: 'plague', name: 'Plague Mist', description: 'Enemy attacks can poison.', score: 1 },
  haste: { id: 'haste', name: 'Haste', description: 'Enemies move +16% faster.', score: 1 },
  volatility: { id: 'volatility', name: 'Volatility', description: 'Boss enters burst phases.', score: 2 },
};

const REGION_THEME = {
  meadow: { name: 'Verdant Wilds', colorA: '#86ebac', colorB: '#6abfff', enemies: ['slime', 'bat', 'mushroom'] },
  caverns: { name: 'Violet Caverns', colorA: '#6c78ff', colorB: '#ae82ff', enemies: ['bat', 'mushroom', 'wraith'] },
  ruins: { name: 'Sunken Ruins', colorA: '#84d1c5', colorB: '#7fb1ff', enemies: ['slime', 'wraith', 'sentinel'] },
};

export class DungeonSystem {
  constructor() {
    this.runIndex = 1;
    this.currentRun = null;
  }

  rollModifiers(rank, rand) {
    const picks = Object.values(MODIFIERS);
    const wanted = Math.min(1 + Math.floor(rank / 3), 4);
    const selected = [];
    while (selected.length < wanted) {
      const option = picks[Math.floor(rand() * picks.length)];
      if (!selected.find((m) => m.id === option.id)) selected.push(option);
    }
    return selected;
  }

  buildLayout(theme, rand) {
    const width = 1800 + Math.floor(rand() * 450);
    const height = 1600 + Math.floor(rand() * 400);
    const blockers = [];
    for (let i = 0; i < 10; i += 1) {
      const bw = 140 + Math.floor(rand() * 260);
      const bh = 90 + Math.floor(rand() * 200);
      blockers.push(rect(140 + rand() * (width - bw - 280), 140 + rand() * (height - bh - 280), bw, bh));
    }

    return {
      id: `dungeon_${this.runIndex}`,
      name: `${theme.name} Depth ${this.runIndex}`,
      width,
      height,
      colorA: theme.colorA,
      colorB: theme.colorB,
      blockers,
      exits: [{ x: 22, y: 22, w: 130, h: 130, to: 'town', spawn: { x: 1380, y: 1400 } }],
      npcs: [],
    };
  }

  createRun(regionId, rank = 1) {
    const seed = Date.now() + this.runIndex * 37;
    const rand = mulberry32(seed);
    const theme = REGION_THEME[regionId] || REGION_THEME.meadow;
    const zone = this.buildLayout(theme, rand);
    const modifiers = this.rollModifiers(rank, rand);

    const enemySpawns = [];
    const packs = 10 + rank * 2;
    for (let i = 0; i < packs; i += 1) {
      enemySpawns.push({
        type: theme.enemies[Math.floor(rand() * theme.enemies.length)],
        count: 1 + Math.floor(rand() * (1 + rank * 0.35)),
        level: 1 + rank + Math.floor(rand() * 2),
      });
    }
    enemySpawns.push({ type: 'boss', count: 1, level: 2 + rank });

    this.currentRun = {
      id: `run-${this.runIndex}`,
      rank,
      regionId,
      seed,
      modifiers,
      zone: { ...zone, enemySpawns },
      completed: false,
    };
    this.runIndex += 1;
    return this.currentRun;
  }

  completeRun() {
    if (this.currentRun) this.currentRun.completed = true;
  }

  serialize() {
    return {
      runIndex: this.runIndex,
      currentRun: this.currentRun,
    };
  }

  hydrate(data) {
    if (!data) return;
    this.runIndex = data.runIndex || 1;
    this.currentRun = data.currentRun || null;
  }
}

export { MODIFIERS };
