const RARITY_TABLE = [
  { id: 'common', chance: 0.64, color: '#f3f3f3', mult: 1 },
  { id: 'uncommon', chance: 0.23, color: '#7cf8b2', mult: 1.15 },
  { id: 'rare', chance: 0.1, color: '#6cc8ff', mult: 1.35 },
  { id: 'epic', chance: 0.025, color: '#cf89ff', mult: 1.6 },
  { id: 'legendary', chance: 0.005, color: '#ffc46b', mult: 2 },
];

const AFFIX_POOL = [
  { id: 'ferocious', label: 'Ferocious', stats: { attack: 3 } },
  { id: 'warded', label: 'Warded', stats: { defense: 2 } },
  { id: 'vital', label: 'Vital', stats: { maxHp: 18 } },
  { id: 'lucid', label: 'Lucid', stats: { maxMana: 16 } },
  { id: 'swift', label: 'Swift', stats: { speed: 4 } },
];

function rollRarity(rand = Math.random) {
  let cursor = rand();
  for (const rarity of RARITY_TABLE) {
    if (cursor <= rarity.chance) return rarity;
    cursor -= rarity.chance;
  }
  return RARITY_TABLE[0];
}

function rollAffixes(rarity, rand = Math.random) {
  const count = rarity.id === 'legendary' ? 3 : rarity.id === 'epic' ? 2 : rarity.id === 'rare' ? 1 : 0;
  const picks = [];
  while (picks.length < count) {
    const affix = AFFIX_POOL[Math.floor(rand() * AFFIX_POOL.length)];
    if (!picks.find((p) => p.id === affix.id)) picks.push(affix);
  }
  return picks;
}

export function rollLoot(baseItem, level = 1) {
  const rarity = rollRarity();
  const affixes = rollAffixes(rarity);
  const stats = { ...baseItem.stats };
  Object.keys(stats).forEach((key) => {
    stats[key] = Math.round(stats[key] * rarity.mult * (1 + level * 0.05));
  });
  affixes.forEach((affix) => {
    Object.entries(affix.stats).forEach(([stat, value]) => {
      stats[stat] = (stats[stat] || 0) + Math.round(value * rarity.mult);
    });
  });

  const prefix = affixes[0]?.label ? `${affixes[0].label} ` : '';
  return {
    ...baseItem,
    name: `${prefix}${baseItem.name}`,
    rarity: rarity.id,
    rarityColor: rarity.color,
    affixes: affixes.map((a) => a.label),
    stats,
  };
}
