const QUESTS = {
  main_1: {
    id: 'main_1',
    title: 'Slime Situation',
    description: 'Defeat 6 slimes in Sunny Meadow.',
    type: 'kill',
    target: 'slime',
    count: 6,
    rewards: { xp: 80, gold: 40, items: [{ name: 'Potion', count: 2 }] },
    nextQuest: 'main_2',
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
  side_collect: {
    id: 'side_collect',
    title: 'Chef Special',
    description: 'Collect 3 Slime Gel and return to Chef Truffle.',
    type: 'collect',
    target: 'Slime Gel',
    count: 3,
    turnInNpc: 'chef',
    rewards: { xp: 45, gold: 30 },
  },
  side_delivery: {
    id: 'side_delivery',
    title: 'Spark Delivery',
    description: 'Deliver Spark Coil to Mimi in your party menu.',
    type: 'deliver',
    target: 'Spark Coil',
    count: 1,
    rewards: { xp: 30, gold: 20 },
  },
};

export class QuestSystem {
  constructor() {
    this.active = new Map();
    this.completed = new Set();
    this.addQuest('main_1');
    this.addQuest('side_collect');
    this.addQuest('side_delivery');
    this.deliveryDone = false;
  }

  addQuest(id) {
    if (!QUESTS[id] || this.active.has(id) || this.completed.has(id)) return;
    this.active.set(id, { id, progress: 0, turnedIn: false });
  }

  onEnemyDefeated(type) {
    this.active.forEach((state, id) => {
      const q = QUESTS[id];
      if (q.type === 'kill' && q.target === type) {
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

  completeDelivery() {
    this.deliveryDone = true;
    const q = this.active.get('side_delivery');
    if (q) q.progress = 1;
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
    if (q.nextQuest) this.addQuest(q.nextQuest);
    return true;
  }

  trackerText() {
    const lines = [];
    this.active.forEach((state, id) => {
      const q = QUESTS[id];
      lines.push(`${q.title}: ${state.progress}/${q.count}`);
    });
    return lines;
  }

  serialize() {
    return {
      active: [...this.active.entries()],
      completed: [...this.completed],
      deliveryDone: this.deliveryDone,
    };
  }

  hydrate(data) {
    if (!data) return;
    this.active = new Map(data.active || []);
    this.completed = new Set(data.completed || []);
    this.deliveryDone = Boolean(data.deliveryDone);
  }

  static get QUESTS() {
    return QUESTS;
  }
}
