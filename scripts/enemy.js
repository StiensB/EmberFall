const ENEMY_TYPES = {
  slime: { hp: 56, attack: 9, speed: 42, color: '#7df2be', xp: 14, gold: [4, 8], drop: 'Slime Gel' },
  bat: { hp: 38, attack: 12, speed: 70, color: '#bba5ff', xp: 12, gold: [3, 7], drop: 'Bat Wing' },
  mushroom: { hp: 72, attack: 11, speed: 35, color: '#ffb788', xp: 16, gold: [6, 10], drop: 'Mush Cap' },
  wraith: { hp: 80, attack: 16, speed: 58, color: '#90a2ff', xp: 22, gold: [8, 14], drop: 'Echo Dust' },
  sentinel: { hp: 110, attack: 14, speed: 34, color: '#90d4d0', xp: 24, gold: [9, 16], drop: 'Relic Shard' },
  boss: { hp: 380, attack: 24, speed: 50, color: '#ff6fa9', xp: 120, gold: [40, 70], drop: 'Crown Core' },
};

export class Enemy {
  constructor({ type, x, y, level = 1, modifiers = [] }) {
    const template = ENEMY_TYPES[type] || ENEMY_TYPES.slime;
    const scale = 1 + (level - 1) * 0.08;
    this.type = type;
    this.x = x;
    this.y = y;
    this.radius = type === 'boss' ? 28 : 14;
    this.maxHp = Math.round(template.hp * scale);
    this.hp = this.maxHp;
    this.attack = Math.round(template.attack * scale);
    this.speed = template.speed * scale;
    this.color = template.color;
    this.xp = Math.round(template.xp * scale);
    this.goldRange = template.gold;
    this.drop = template.drop;
    this.cooldown = 0;
    this.alertRange = 220;
    this.attackRange = this.radius + 20;
    this.wander = { angle: Math.random() * Math.PI * 2, timer: 1 + Math.random() * 3 };
    this.level = level;
    this.statuses = [];
    this.modifiers = modifiers;
    this.phase = 1;
    this.applyModifiers();
  }

  applyModifiers() {
    if (this.modifiers.some((m) => m.id === 'fortified')) {
      this.maxHp = Math.round(this.maxHp * 1.18);
      this.hp = this.maxHp;
    }
    if (this.modifiers.some((m) => m.id === 'fury')) this.attack = Math.round(this.attack * 1.14);
    if (this.modifiers.some((m) => m.id === 'haste')) this.speed *= 1.16;
  }

  addStatus(id, duration, payload = {}) {
    const existing = this.statuses.find((s) => s.id === id);
    if (existing) {
      existing.duration = Math.max(existing.duration, duration);
      return;
    }
    this.statuses.push({ id, duration, ...payload });
  }

  updateStatuses(dt) {
    this.statuses = this.statuses.filter((status) => {
      status.duration -= dt;
      if (status.id === 'burn') this.hp -= dt * (status.dps || 5);
      if (status.id === 'slow') this.speed *= 0.995;
      return status.duration > 0;
    });
  }

  updateAI(dt, target, world) {
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.updateStatuses(dt);

    if (this.type === 'boss' && this.hp / this.maxHp < 0.5 && this.phase === 1) {
      this.phase = 2;
      this.attack = Math.round(this.attack * 1.3);
      this.speed *= 1.2;
    }

    const dx = target.x - this.x;
    const dy = target.y - this.y;
    const dist = Math.hypot(dx, dy);

    if (dist < this.alertRange) {
      const nx = dx / (dist || 1);
      const ny = dy / (dist || 1);
      const step = this.speed * dt;
      const next = world.resolveCollision(this.x + nx * step, this.y + ny * step, this.radius);
      this.x = next.x;
      this.y = next.y;
    } else {
      this.wander.timer -= dt;
      if (this.wander.timer <= 0) {
        this.wander.angle += (Math.random() - 0.5) * 1.2;
        this.wander.timer = 1 + Math.random() * 3;
      }
      const wx = Math.cos(this.wander.angle) * this.speed * 0.3 * dt;
      const wy = Math.sin(this.wander.angle) * this.speed * 0.3 * dt;
      const next = world.resolveCollision(this.x + wx, this.y + wy, this.radius);
      this.x = next.x;
      this.y = next.y;
    }

    return dist < this.attackRange && this.cooldown <= 0;
  }

  rollGold() {
    const [min, max] = this.goldRange;
    return Math.floor(min + Math.random() * (max - min + 1));
  }
}
