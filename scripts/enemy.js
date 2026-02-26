const ENEMY_TYPES = {
  slime: { hp: 56, attack: 9, defense: 2, speed: 42, color: '#7df2be', xp: 14, gold: [4, 8], drop: 'Slime Gel' },
  bat: { hp: 38, attack: 12, defense: 1, speed: 70, color: '#bba5ff', xp: 12, gold: [3, 7], drop: 'Bat Wing' },
  mushroom: { hp: 72, attack: 11, defense: 4, speed: 35, color: '#ffb788', xp: 16, gold: [6, 10], drop: 'Mush Cap' },
  wraith: { hp: 80, attack: 16, defense: 4, speed: 58, color: '#90a2ff', xp: 22, gold: [8, 14], drop: 'Echo Dust' },
  sentinel: { hp: 110, attack: 14, defense: 11, speed: 34, color: '#90d4d0', xp: 24, gold: [9, 16], drop: 'Relic Shard' },
  rockling: { hp: 132, attack: 15, defense: 24, speed: 30, color: '#8da0b7', xp: 30, gold: [11, 18], drop: 'Stone Core' },
  wobble_mage: { hp: 74, attack: 13, defense: 6, speed: 45, color: '#8ecbff', xp: 28, gold: [10, 16], drop: 'Arcane Pebble' },
  silkweaver: { hp: 92, attack: 14, defense: 8, speed: 49, color: '#d5ddff', xp: 32, gold: [11, 19], drop: 'Silk Bundle' },
  spiderling: { hp: 34, attack: 9, defense: 2, speed: 72, color: '#adb8d8', xp: 10, gold: [2, 5], drop: 'Spider Silk' },
  boss: { hp: 380, attack: 24, defense: 12, speed: 50, color: '#ff6fa9', xp: 120, gold: [40, 70], drop: 'Crown Core' },
  puff_zombie: { hp: 88, attack: 16, defense: 5, speed: 39, color: '#b7f598', xp: 34, gold: [12, 20], drop: 'Puff Core' },
  rune_sentinel: { hp: 170, attack: 17, defense: 16, speed: 31, color: '#9ec7d0', xp: 40, gold: [14, 24], drop: 'Rune Shard' },
  pocket_drake: { hp: 120, attack: 20, defense: 9, speed: 56, color: '#ffb592', xp: 44, gold: [15, 25], drop: 'Drake Scale' },
  chef_slime: { hp: 520, attack: 26, defense: 13, speed: 42, color: '#ff9fc2', xp: 180, gold: [60, 90], drop: 'Chef Crown' },
};

export class Enemy {
  constructor({ type, x, y, level = 1, modifiers = [] }) {
    const template = ENEMY_TYPES[type] || ENEMY_TYPES.slime;
    const scale = 1 + (level - 1) * 0.08;
    this.type = type;
    this.x = x;
    this.y = y;
    this.radius = type === 'boss' || type === 'chef_slime' ? 28 : type === 'rockling' || type === 'rune_sentinel' ? 16 : type === 'spiderling' ? 10 : 14;
    this.maxHp = Math.round(template.hp * scale);
    this.hp = this.maxHp;
    this.attack = Math.round(template.attack * scale);
    this.baseDefense = Math.round(template.defense * scale);
    this.defense = this.baseDefense;
    this.speed = template.speed * scale;
    this.color = template.color;
    this.xp = Math.round(template.xp * scale);
    this.goldRange = template.gold;
    this.drop = template.drop;
    this.cooldown = 0;
    this.specialCooldown = 0.6 + Math.random() * 1.4;
    this.alertRange = type === 'wobble_mage' ? 260 : type === 'pocket_drake' ? 250 : type === 'chef_slime' ? 280 : 220;
    this.attackRange = this.radius + (type === 'wobble_mage' ? 180 : type === 'pocket_drake' || type === 'chef_slime' ? 150 : 20);
    this.wander = { angle: Math.random() * Math.PI * 2, timer: 1 + Math.random() * 3 };
    this.level = level;
    this.statuses = [];
    this.modifiers = modifiers;
    this.phase = 1;
    this.exposedTimer = 0;
    this.intent = null;
    this.facing = { x: 1, y: 0 };
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
    const slowEffects = [];
    this.statuses = this.statuses.filter((status) => {
      status.duration -= dt;
      if (status.id === 'burn') this.hp -= dt * (status.dps || 5);
      if (status.id === 'bleed') this.hp -= dt * (status.dps || 4);
      if (status.id === 'slow') slowEffects.push(status.strength || 0.2);
      return status.duration > 0;
    });

    this.exposedTimer = Math.max(0, this.exposedTimer - dt);
    if (this.type === 'rockling') {
      this.defense = this.exposedTimer > 0 ? Math.round(this.baseDefense * 0.5) : this.baseDefense;
    }

    const strongestSlow = slowEffects.length ? Math.max(...slowEffects) : 0;
    const haste = this.modifiers.some((m) => m.id === 'haste') ? 1.16 : 1;
    const baseSpeed = (ENEMY_TYPES[this.type]?.speed || ENEMY_TYPES.slime.speed) * (1 + (this.level - 1) * 0.08);
    this.speed = baseSpeed * haste * (1 - strongestSlow);
  }

  updateAI(dt, target, world) {
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.specialCooldown = Math.max(0, this.specialCooldown - dt);
    this.updateStatuses(dt);
    this.intent = null;

    if (this.type === 'boss' && this.hp / this.maxHp < 0.5 && this.phase === 1) {
      this.phase = 2;
      this.attack = Math.round(this.attack * 1.3);
      this.speed *= 1.2;
    }

    const dx = target.x - this.x;
    const dy = target.y - this.y;
    const dist = Math.hypot(dx, dy);

    if (this.type === 'wobble_mage' && dist < 250 && this.specialCooldown <= 0) {
      this.intent = Math.random() < 0.35 ? { type: 'ally_shield' } : { type: 'projectile' };
      this.specialCooldown = 2.8 + Math.random() * 1.4;
    }

    if (this.type === 'silkweaver' && dist < 220 && this.specialCooldown <= 0) {
      this.intent = Math.random() < 0.45 ? { type: 'web_trap' } : { type: 'summon_spiderling' };
      this.specialCooldown = 3.1 + Math.random() * 1.2;
    }

    if (this.type === 'pocket_drake' && dist < 220 && this.specialCooldown <= 0) {
      this.intent = Math.random() < 0.55 ? { type: 'fire_cone' } : { type: 'wing_gust' };
      this.specialCooldown = 2.4 + Math.random() * 1.1;
    }

    if (this.type === 'chef_slime' && dist < 260 && this.specialCooldown <= 0) {
      this.intent = Math.random() < 0.6 ? { type: 'food_projectile' } : { type: 'slime_heal' };
      this.specialCooldown = 2.2 + Math.random() * 1.3;
    }

    const keepsDistance = this.type === 'wobble_mage' || this.type === 'silkweaver' || this.type === 'pocket_drake';
    if (dist < this.alertRange) {
      const nx = dx / (dist || 1);
      const ny = dy / (dist || 1);
      const step = this.speed * dt;
      const retreat = keepsDistance && dist < 120;
      const moveScale = retreat ? -0.75 : 1;
      const next = world.resolveCollision(this.x + nx * step * moveScale, this.y + ny * step * moveScale, this.radius);
      this.x = next.x;
      this.y = next.y;
      this.facing = { x: nx * moveScale, y: ny * moveScale };
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
      this.facing = { x: Math.cos(this.wander.angle), y: Math.sin(this.wander.angle) };
    }

    return dist < this.attackRange && this.cooldown <= 0;
  }

  rollGold() {
    const [min, max] = this.goldRange;
    return Math.floor(min + Math.random() * (max - min + 1));
  }
}
