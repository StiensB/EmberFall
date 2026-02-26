const CLASS_DATA = {
  Warrior: {
    color: '#ff9a9a',
    baseStats: { maxHp: 180, maxMana: 60, attack: 20, defense: 10, speed: 112 },
    passive: 'Bulwark: 10% less incoming damage.',
    skills: ['Shield Bash', 'Heroic Spin'],
  },
  Mage: {
    color: '#b194ff',
    baseStats: { maxHp: 120, maxMana: 150, attack: 26, defense: 5, speed: 108 },
    passive: 'Arcane Tap: attacks restore a little mana.',
    skills: ['Spark Bolt', 'Comet Puddle'],
  },
  Ranger: {
    color: '#9ce5a2',
    baseStats: { maxHp: 140, maxMana: 90, attack: 23, defense: 7, speed: 125 },
    passive: 'Fleetstep: bonus movement speed.',
    skills: ['Triple Shot', 'Snare Trap'],
  },
};

export class PartyMember {
  constructor({ name, className, x, y }) {
    this.name = name;
    this.className = className;
    this.level = 1;
    this.x = x;
    this.y = y;
    this.radius = 16;
    this.direction = { x: 1, y: 0 };
    this.cooldowns = { attack: 0, skill1: 0, skill2: 0 };
    this.followLag = 40;

    const cls = CLASS_DATA[className];
    this.baseStats = { ...cls.baseStats };
    this.stats = { ...cls.baseStats };
    this.hp = this.stats.maxHp;
    this.mana = this.stats.maxMana;
    this.passive = cls.passive;
    this.skills = [...cls.skills];
    this.color = cls.color;
    this.statuses = [];

    this.equipment = { weapon: null, armor: null, charm: null };
  }

  updateCooldowns(dt) {
    this.cooldowns = { attack: 0, skill1: 0, skill2: 0, ...(this.cooldowns || {}) };
    for (const key of Object.keys(this.cooldowns)) {
      this.cooldowns[key] = Math.max(0, Number(this.cooldowns[key]) - dt || 0);
    }

    const activeStatuses = Array.isArray(this.statuses) ? this.statuses : [];
    this.statuses = activeStatuses
      .filter((status) => status && typeof status === 'object')
      .filter((status) => {
        status.duration = Math.max(0, Number(status.duration) || 0);
        status.duration -= dt;
        if (status.id === 'poison') {
          const dps = Number(status.dps) || 0;
          this.hp = Math.max(0, this.hp - dt * dps);
        }
        return status.duration > 0;
      });
  }

  gainLevel() {
    this.level += 1;
    this.baseStats.maxHp += 16;
    this.baseStats.maxMana += 8;
    this.baseStats.attack += 3;
    this.baseStats.defense += 2;
    this.baseStats.speed += 2;
  }

  applyEquipmentBonuses() {
    this.stats = { ...this.baseStats };
    Object.values(this.equipment)
      .filter(Boolean)
      .forEach((item) => {
        Object.entries(item.stats || {}).forEach(([stat, value]) => {
          this.stats[stat] = (this.stats[stat] || 0) + value;
        });
      });
    this.hp = Math.min(this.hp, this.stats.maxHp);
    this.mana = Math.min(this.mana, this.stats.maxMana);
  }
}

export class Party {
  constructor(spawn) {
    this.members = [
      new PartyMember({ name: 'Bruno', className: 'Warrior', ...spawn }),
      new PartyMember({ name: 'Mimi', className: 'Mage', ...spawn }),
      new PartyMember({ name: 'Pip', className: 'Ranger', ...spawn }),
    ];
    this.activeIndex = 0;
    this.trail = [];
  }

  get active() {
    return this.members[this.activeIndex] || this.members[0];
  }

  switchActive() {
    this.activeIndex = (this.activeIndex + 1) % this.members.length;
  }

  isWiped() {
    return this.members.every((m) => m.hp <= 0);
  }

  updateFollow(dt) {
    const lead = this.active;
    this.trail.push({ x: lead.x, y: lead.y });
    if (this.trail.length > 400) this.trail.shift();

    this.members.forEach((member, idx) => {
      member.updateCooldowns(dt);
      if (idx === this.activeIndex || member.hp <= 0) return;
      const followIndex = Math.max(0, this.trail.length - 1 - member.followLag * idx);
      const target = this.trail[followIndex] || { x: lead.x, y: lead.y };
      member.x += (target.x - member.x) * Math.min(1, dt * 8);
      member.y += (target.y - member.y) * Math.min(1, dt * 8);
    });
  }
}

export { CLASS_DATA };
