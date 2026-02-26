const QUESTS = {
  chef_collect: {
    id: 'chef_collect',
    title: 'Chef Special',
    description: 'Collect 3 Slime Gel and return to Chef Truffle.',
    type: 'collect',
    target: 'Slime Gel',
    count: 3,
    turnInNpc: 'chef',
    rewards: { xp: 45, gold: 30 },
    nextQuests: ['smith_delivery', 'chef_collect_2'],
    unlockShop: 'chef',
    unlockArea: 'north',
  },
  chef_collect_2: {
    id: 'chef_collect_2',
    title: 'Chef Encore',
    description: 'Collect 5 Slime Gel for Chef Truffle\'s deluxe stock.',
    type: 'collect',
    target: 'Slime Gel',
    count: 5,
    turnInNpc: 'chef',
    rewards: { xp: 65, gold: 45, items: [{ name: 'Potion', count: 1 }] },
  },
  smith_delivery: {
    id: 'smith_delivery',
    title: 'Northern Pickup',
    description: 'Travel to Frostcrag North, pick up the Frost Coil, and return to Smith Bop.',
    type: 'collect',
    target: 'Frost Coil',
    count: 1,
    turnInNpc: 'smith',
    rewards: { xp: 30, gold: 20 },
    nextQuests: ['mayor_clearance', 'smith_hunt_2'],
    unlockShop: 'smith',
    unlockArea: 'west',
  },
  smith_hunt_2: {
    id: 'smith_hunt_2',
    title: 'Northern Forge Trial',
    description: 'Travel to Frostcrag North and defeat 3 Rocklings, 3 Wobble Mages, and 3 Silkweavers.',
    type: 'kill',
    target: 'rockling',
    count: 9,
    turnInNpc: 'smith',
    rewards: { xp: 70, gold: 50, items: [{ name: 'Hi-Potion', count: 1 }] },
  },
  mayor_clearance: {
    id: 'mayor_clearance',
    title: 'Mayor\'s Clearance',
    description: 'Clear the West Wilds by defeating 3 Puff Zombies, 3 Rune Sentinels, and 3 Pocket Drakes, then report to Mayor Puffle.',
    type: 'kill',
    target: 'puff_zombie',
    count: 9,
    turnInNpc: 'mayor',
    rewards: { xp: 80, gold: 45, items: [{ name: 'Potion', count: 2 }] },
    nextQuests: ['mayor_chef_slime'],
    unlockArea: 'south_meadow',
  },
  mayor_chef_slime: {
    id: 'mayor_chef_slime',
    title: 'Kitchen Calamity',
    description: 'Head south of Sunny Meadow and defeat The Chef Slime.',
    type: 'kill',
    target: 'chef_slime',
    count: 1,
    turnInNpc: 'mayor',
    rewards: { xp: 140, gold: 90, items: [{ name: 'Elixir', count: 1 }] },
  },
  main_2: {
    id: 'main_2',
    title: 'Cavern Cleanup',
    description: 'Defeat the Giggle Cavern boss.',
    type: 'kill',
    target: 'boss',
    count: 1,
    rewards: { xp: 180, gold: 120, items: [{ name: 'Elixir', count: 1 }] },
  },
};

export class QuestSystem {
  constructor() {
    this.active = new Map();
    this.completed = new Set();
    this.unlockedShops = new Set();
    this.unlockedAreas = new Set(['town', 'meadow']);
    this.addQuest('chef_collect');
  }

  addQuest(id) {
    if (!QUESTS[id] || this.active.has(id) || this.completed.has(id)) return;
    this.active.set(id, { id, progress: 0, turnedIn: false });
  }

  onEnemyDefeated(type) {
    this.active.forEach((state, id) => {
      const q = QUESTS[id];
      if (q.type !== 'kill') return;

      if (id === 'smith_hunt_2') {
        const tracked = state.tracked || { rockling: 0, wobble_mage: 0, silkweaver: 0 };
        if (Object.hasOwn(tracked, type)) tracked[type] = Math.min(3, tracked[type] + 1);
        state.tracked = tracked;
        state.progress = tracked.rockling + tracked.wobble_mage + tracked.silkweaver;
        return;
      }

      if (id === 'mayor_clearance') {
        const tracked = state.tracked || { puff_zombie: 0, rune_sentinel: 0, pocket_drake: 0 };
        if (Object.hasOwn(tracked, type)) tracked[type] = Math.min(3, tracked[type] + 1);
        state.tracked = tracked;
        state.progress = tracked.puff_zombie + tracked.rune_sentinel + tracked.pocket_drake;
        return;
      }

      if (q.target === type) {
        state.progress = Math.min(q.count, state.progress + 1);
      }
    });
  }

  onItemCollected(name) {
    this.active.forEach((state, id) => {
      const q = QUESTS[id];
      if (q.type === 'collect' && q.target === name) {
        state.progress = Math.min(q.count, state.progress + 1);
      }
    });
  }

  canTurnIn(questId, npcId = null) {
    const state = this.active.get(questId);
    const q = QUESTS[questId];
    if (!state || !q) return false;
    if (q.turnInNpc && npcId && q.turnInNpc !== npcId) return false;
    return state.progress >= q.count;
  }

  claim(questId, inventory, grantXp) {
    const q = QUESTS[questId];
    const state = this.active.get(questId);
    if (!q || !state || state.progress < q.count) return false;

    this.active.delete(questId);
    this.completed.add(questId);
    inventory.gold += q.rewards.gold || 0;
    (q.rewards.items || []).forEach((i) => inventory.addItem(i.name, i.count));
    grantXp(q.rewards.xp || 0);
    if (q.unlockShop) this.unlockedShops.add(q.unlockShop);
    if (q.unlockArea) this.unlockedAreas.add(q.unlockArea);
    (q.nextQuests || []).forEach((nextQuestId) => this.addQuest(nextQuestId));
    return true;
  }

  getTurnInQuestForNpc(npcId) {
    for (const [id, state] of this.active.entries()) {
      const q = QUESTS[id];
      if (q?.turnInNpc === npcId && state.progress >= q.count) return id;
    }
    return null;
  }

  getActiveQuestForNpc(npcId) {
    for (const [id] of this.active.entries()) {
      const q = QUESTS[id];
      if (q?.turnInNpc === npcId) return id;
    }
    return null;
  }

  hasQuestForNpc(npcId) {
    return Boolean(this.getActiveQuestForNpc(npcId));
  }

  isShopUnlocked(shopId) {
    return this.unlockedShops.has(shopId);
  }

  isAreaUnlocked(areaId) {
    return this.unlockedAreas.has(areaId);
  }

  trackerText() {
    const lines = [];
    this.active.forEach((state, id) => {
      const q = QUESTS[id];
      if (id === 'smith_hunt_2') {
        const tracked = state.tracked || { rockling: 0, wobble_mage: 0, silkweaver: 0 };
        lines.push(`${q.title}: Rocklings ${tracked.rockling}/3 • Wobble Mages ${tracked.wobble_mage}/3 • Silkweavers ${tracked.silkweaver}/3`);
      } else if (id === 'mayor_clearance') {
        const tracked = state.tracked || { puff_zombie: 0, rune_sentinel: 0, pocket_drake: 0 };
        lines.push(`${q.title}: Puff Zombies ${tracked.puff_zombie}/3 • Rune Sentinels ${tracked.rune_sentinel}/3 • Pocket Drakes ${tracked.pocket_drake}/3`);
      } else {
        lines.push(`${q.title}: ${state.progress}/${q.count}`);
      }
    });
    return lines;
  }

  serialize() {
    return {
      active: [...this.active.entries()],
      completed: [...this.completed],
      unlockedShops: [...this.unlockedShops],
      unlockedAreas: [...this.unlockedAreas],
    };
  }

  hydrate(data) {
    if (!data) return;
    this.active = new Map(data.active || []);
    this.completed = new Set(data.completed || []);
    this.unlockedShops = new Set(data.unlockedShops || []);
    this.unlockedAreas = new Set(data.unlockedAreas || ['town', 'meadow']);
  }

  static get QUESTS() {
    return QUESTS;
  }
}
