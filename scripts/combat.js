const ATTACK_KITS = {
  Warrior: { range: 74, arc: 125, limit: 3, power: 1.15, cooldown: 0.42 },
  Mage: { range: 170, arc: 360, limit: 2, power: 0.95, cooldown: 0.45 },
  Ranger: { range: 195, arc: 50, limit: 4, power: 1.0, cooldown: 0.38 },
};

const SKILL_BOOK = {
  Warrior: {
    skill1: {
      mana: 16,
      cooldown: 3.4,
      cast: (ctx) => {
        const targets = ctx.pickTargets({ range: 104, arc: 360, limit: 99 });
        targets.forEach((enemy) => {
          ctx.damage(enemy, 1.65, { critChance: 0.18 });
          enemy.addStatus('slow', 1.8, { strength: 0.35 });
          enemy.addStatus('vulnerable', 3.2, { amp: 0.14 });
        });
        ctx.healSelf(10 + targets.length * 2);
        ctx.spawn(ctx.actor.x, ctx.actor.y, '#ffd376', 24);
        return targets.length;
      },
    },
    skill2: {
      mana: 18,
      cooldown: 7,
      cast: (ctx) => {
        ctx.healSelf(42);
        ctx.actor.addStatus('guard', 3.2, { reduction: 0.4 });
        ctx.spawn(ctx.actor.x, ctx.actor.y, '#fff2a8', 18);
        return 1;
      },
    },
  },
  Mage: {
    skill1: {
      mana: 18,
      cooldown: 4.6,
      cast: (ctx) => {
        const primary = ctx.pickTargets({ range: 210, arc: 360, limit: 1 })[0];
        if (!primary) return 0;

        const chain = [primary];
        const remaining = ctx.enemies
          .filter((enemy) => enemy !== primary)
          .sort((a, b) => ctx.distance(primary, a) - ctx.distance(primary, b))
          .slice(0, 2);
        chain.push(...remaining);

        chain.forEach((enemy, index) => {
          ctx.damage(enemy, 2.2 - index * 0.32, { critChance: 0.12 });
          enemy.addStatus('burn', 4.2, { dps: 10 + ctx.actor.level });
        });
        ctx.spawn(primary.x, primary.y, '#b6d0ff', 24);
        return chain.length;
      },
    },
    skill2: {
      mana: 22,
      cooldown: 6,
      cast: (ctx) => {
        const targets = ctx.pickTargets({ range: 130, arc: 360, limit: 99 });
        targets.forEach((enemy) => {
          ctx.damage(enemy, 1.45, { critChance: 0.1 });
          enemy.addStatus('slow', 2.7, { strength: 0.45 });
          enemy.addStatus('burn', 3.8, { dps: 8 + ctx.actor.level * 0.6 });
        });
        ctx.actor.mana = Math.min(ctx.actor.stats.maxMana, ctx.actor.mana + 8);
        ctx.spawn(ctx.actor.x, ctx.actor.y, '#9be8ff', 26);
        return targets.length;
      },
    },
  },
  Ranger: {
    skill1: {
      mana: 12,
      cooldown: 3.1,
      cast: (ctx) => {
        const targets = ctx.pickTargets({ range: 240, arc: 70, limit: 5 });
        targets.forEach((enemy) => {
          ctx.damage(enemy, 1.18, { critChance: 0.24, critMult: 1.85 });
          enemy.addStatus('bleed', 4, { dps: 4 + ctx.actor.level * 0.7 });
        });
        ctx.spawn(ctx.actor.x, ctx.actor.y, '#a9ffba', 18);
        return targets.length;
      },
    },
    skill2: {
      mana: 18,
      cooldown: 7.4,
      cast: (ctx) => {
        const now = ctx.elapsed;
        ctx.actor.speedBoostTimer = now + 4.1;
        const targets = ctx.pickTargets({ range: 210, arc: 360, limit: 3 });
        targets.forEach((enemy) => {
          ctx.damage(enemy, 1.35, { critChance: 0.2 });
          enemy.addStatus('slow', 2, { strength: 0.28 });
        });
        ctx.spawn(ctx.actor.x, ctx.actor.y, '#cbffd8', 16);
        return Math.max(1, targets.length);
      },
    },
  },
};

export class CombatSystem {
  constructor(party, world, inventory, questSystem, progression) {
    this.party = party;
    this.world = world;
    this.inventory = inventory;
    this.questSystem = questSystem;
    this.progression = progression;
    this.particles = [];
    this.comboTimer = 0;
    this.comboCount = 0;
  }

  distance(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  calcDamage(attacker, defender, powerScale = 1, options = {}) {
    const attack = attacker.stats.attack * powerScale;
    const defense = defender.defense || 0;
    const spread = 0.9 + Math.random() * 0.22;
    let damage = Math.max(1, (attack - defense * 0.44) * spread);

    const vulnerable = defender.statuses?.find((status) => status.id === 'vulnerable');
    if (vulnerable) damage *= 1 + (vulnerable.amp || 0.1);

    const critChance = options.critChance || 0;
    if (Math.random() < critChance) damage *= options.critMult || 1.6;

    return Math.max(1, Math.round(damage));
  }

  pickTargets(actor, enemies, { range, arc = 360, limit = 99 }) {
    const facing = actor.direction || { x: 1, y: 0 };
    const facingLength = Math.hypot(facing.x, facing.y) || 1;
    const nx = facing.x / facingLength;
    const ny = facing.y / facingLength;
    const halfArc = (arc * Math.PI) / 360;

    const selected = enemies
      .filter((enemy) => {
        const dx = enemy.x - actor.x;
        const dy = enemy.y - actor.y;
        const dist = Math.hypot(dx, dy);
        if (dist > range) return false;
        if (arc >= 359) return true;
        const dot = (dx / (dist || 1)) * nx + (dy / (dist || 1)) * ny;
        const angle = Math.acos(Math.max(-1, Math.min(1, dot)));
        return angle <= halfArc;
      })
      .sort((a, b) => this.distance(actor, a) - this.distance(actor, b));

    return selected.slice(0, limit);
  }

  damageEnemy(actor, enemy, powerScale, options = {}) {
    const value = this.calcDamage(actor, enemy, powerScale, options);
    enemy.hp -= value;
    this.spawnParticles(enemy.x, enemy.y, options.color || '#ffffff', options.particles || 8);
    return value;
  }

  buildSkillContext(actor, enemies, elapsed) {
    return {
      actor,
      enemies,
      elapsed,
      pickTargets: (query) => this.pickTargets(actor, enemies, query),
      damage: (enemy, scale, options) => this.damageEnemy(actor, enemy, scale, options),
      spawn: (x, y, color, count) => this.spawnParticles(x, y, color, count),
      healSelf: (amount) => {
        actor.hp = Math.min(actor.stats.maxHp, actor.hp + amount);
      },
      distance: (a, b) => this.distance(a, b),
    };
  }

  tryAttack(enemies) {
    const actor = this.party.active;
    if (actor.cooldowns.attack > 0 || actor.hp <= 0) return;

    const kit = ATTACK_KITS[actor.className] || ATTACK_KITS.Warrior;
    actor.cooldowns.attack = kit.cooldown;

    const targets = this.pickTargets(actor, enemies, {
      range: kit.range,
      arc: kit.arc,
      limit: kit.limit,
    });

    targets.forEach((enemy) => {
      this.damageEnemy(actor, enemy, kit.power, {
        critChance: actor.className === 'Ranger' ? 0.16 : 0.08,
      });
      if (actor.className === 'Mage') enemy.addStatus('burn', 2.4, { dps: 7 + actor.level * 0.6 });
      if (actor.className === 'Ranger') enemy.addStatus('bleed', 2.3, { dps: 3 + actor.level * 0.4 });
    });

    if (actor.className === 'Mage') actor.mana = Math.min(actor.stats.maxMana, actor.mana + 4);
    this.bumpCombo(targets.length);
  }

  trySkill(slot, enemies, elapsed) {
    const actor = this.party.active;
    if (actor.hp <= 0) return;

    const skill = SKILL_BOOK[actor.className]?.[slot];
    if (!skill) return;
    if (actor.cooldowns[slot] > 0) return;
    if (actor.mana < skill.mana) return;

    actor.mana -= skill.mana;
    actor.cooldowns[slot] = skill.cooldown;

    const hits = skill.cast(this.buildSkillContext(actor, enemies, elapsed));
    this.bumpCombo(hits);
  }

  enemyAttack(enemy, target) {
    enemy.cooldown = enemy.type === 'boss' ? 0.72 : 1.12;
    const base = Math.max(1, Math.round(enemy.attack * (0.92 + Math.random() * 0.22)));
    const defense = target.stats?.defense ?? target.baseStats?.defense ?? 0;

    const guard = target.statuses?.find((status) => status.id === 'guard');
    const guardReduction = guard ? 1 - (guard.reduction || 0.25) : 1;

    const passiveMit = target.className === 'Warrior' ? 0.9 : 1;
    const damage = Math.max(1, Math.round((base - defense * 0.34) * passiveMit * 1.15 * guardReduction));
    target.hp = Math.max(0, target.hp - damage);

    if (enemy.modifiers.some((m) => m.id === 'plague') && Math.random() < 0.22) {
      target.statuses = target.statuses || [];
      target.statuses.push({ id: 'poison', duration: 4, dps: 4 + enemy.level * 0.5 });
    }

    if (enemy.type === 'boss' && enemy.phase === 2 && Math.random() < 0.2) {
      this.party.members.forEach((member) => {
        if (member.hp > 0 && Math.hypot(member.x - enemy.x, member.y - enemy.y) < 185) {
          member.hp = Math.max(0, member.hp - Math.max(1, Math.round(enemy.attack * 0.32)));
        }
      });
    }

    this.spawnParticles(target.x, target.y, '#ff8ea8', 10);
  }

  processDeaths(enemies, awardXp) {
    const alive = [];
    enemies.forEach((enemy) => {
      if (enemy.hp > 0) alive.push(enemy);
      else {
        const gold = enemy.rollGold();
        this.inventory.addLoot(enemy.drop, gold, enemy.level);
        this.questSystem.onEnemyDefeated(enemy.type);
        this.questSystem.onItemCollected(enemy.drop);
        awardXp(enemy.xp);
      }
    });
    return alive;
  }

  spawnParticles(x, y, color, count) {
    const maxParticles = 700;
    const room = Math.max(0, maxParticles - this.particles.length);
    const spawnCount = Math.min(count, room);
    for (let i = 0; i < spawnCount; i += 1) {
      this.particles.push({
        x,
        y,
        vx: (Math.random() - 0.5) * 160,
        vy: (Math.random() - 0.6) * 170,
        life: 0.45 + Math.random() * 0.55,
        color,
        size: 2 + Math.random() * 4,
        glow: 0.4 + Math.random() * 0.6,
      });
    }
  }

  updateParticles(dt) {
    this.comboTimer = Math.max(0, this.comboTimer - dt);
    if (this.comboTimer <= 0) this.comboCount = 0;

    this.particles = this.particles.filter((p) => {
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 220 * dt;
      p.size = Math.max(0.8, p.size * (1 - dt * 0.9));
      return p.life > 0;
    });
  }

  bumpCombo(hits) {
    if (!hits) return;
    this.comboCount += hits;
    this.comboTimer = 2.4;
  }
}
