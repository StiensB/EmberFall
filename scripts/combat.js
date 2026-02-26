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

  calcDamage(attacker, defender, powerScale = 1) {
    const raw = attacker.stats.attack * powerScale;
    const defense = defender.defense || 0;
    const randomFactor = 0.84 + Math.random() * 0.32;
    return Math.max(1, Math.round((raw - defense * 0.45) * randomFactor));
  }

  tryAttack(enemies) {
    const actor = this.party.active;
    if (actor.cooldowns.attack > 0 || actor.hp <= 0) return;
    actor.cooldowns.attack = 0.42;

    const attackProfile = {
      Warrior: { range: 66, powerScale: 1.2 },
      Mage: { range: 150, powerScale: 0.92 },
      Ranger: { range: 180, powerScale: 0.95 },
    }[actor.className] || { range: 66, powerScale: 1 };

    const { range, powerScale } = attackProfile;
    const hit = enemies.filter((e) => Math.hypot(e.x - actor.x, e.y - actor.y) < range);
    hit.forEach((enemy) => {
      enemy.hp -= this.calcDamage(actor, enemy, powerScale);
      if (actor.className === 'Mage') enemy.addStatus('burn', 2.8, { dps: 8 });
      if (actor.className === 'Ranger') enemy.addStatus('slow', 2.5);
      this.spawnParticles(enemy.x, enemy.y, '#ffffff', 8);
    });

    if (actor.className === 'Mage') actor.mana = Math.min(actor.stats.maxMana, actor.mana + 3);
    this.bumpCombo(hit.length);
  }

  trySkill(slot, enemies, elapsed) {
    const actor = this.party.active;
    if (actor.hp <= 0) return;

    if (slot === 'skill1' && actor.cooldowns.skill1 <= 0) {
      if (actor.className === 'Warrior' && actor.mana >= 14) {
        actor.mana -= 14;
        actor.cooldowns.skill1 = 3.2;
        enemies.forEach((e) => {
          if (Math.hypot(e.x - actor.x, e.y - actor.y) < 80) {
            e.hp -= this.calcDamage(actor, e, 1.8);
            e.addStatus('slow', 2);
          }
        });
        this.spawnParticles(actor.x, actor.y, '#ffd376', 24);
      }
      if (actor.className === 'Mage' && actor.mana >= 18) {
        actor.mana -= 18;
        actor.cooldowns.skill1 = 4.2;
        const target = enemies[0];
        if (target) {
          target.hp -= this.calcDamage(actor, target, 2.4);
          target.addStatus('burn', 4, { dps: 11 });
        }
        this.spawnParticles(actor.x + 20, actor.y - 8, '#b6d0ff', 18);
      }
      if (actor.className === 'Ranger' && actor.mana >= 12) {
        actor.mana -= 12;
        actor.cooldowns.skill1 = 3.4;
        enemies.slice(0, 3).forEach((e) => {
          e.hp -= this.calcDamage(actor, e, 1.2);
          e.addStatus('bleed', 3, { dps: 5 });
        });
        this.spawnParticles(actor.x, actor.y, '#a9ffba', 16);
      }
    }

    if (slot === 'skill2' && actor.cooldowns.skill2 <= 0) {
      if (actor.className === 'Warrior' && actor.mana >= 16) {
        actor.mana -= 16;
        actor.cooldowns.skill2 = 6;
        actor.hp = Math.min(actor.stats.maxHp, actor.hp + 28);
      }
      if (actor.className === 'Mage' && actor.mana >= 20) {
        actor.mana -= 20;
        actor.cooldowns.skill2 = 5.8;
        enemies.forEach((e) => {
          if (Math.hypot(e.x - actor.x, e.y - actor.y) < 120) {
            e.hp -= this.calcDamage(actor, e, 1.5);
            e.addStatus('burn', 4.5, { dps: 9 });
          }
        });
      }
      if (actor.className === 'Ranger' && actor.mana >= 18) {
        actor.mana -= 18;
        actor.cooldowns.skill2 = 7;
        actor.speedBoostTimer = elapsed + 3.4;
      }
    }
  }

  enemyAttack(enemy, target) {
    enemy.cooldown = enemy.type === 'boss' ? 0.75 : 1.2;
    const base = Math.max(1, Math.round(enemy.attack * (0.9 + Math.random() * 0.25)));
    const defense = target.stats.defense;
    const passiveMit = target.className === 'Warrior' ? 0.9 : 1;
    const damage = Math.max(1, Math.round((base - defense * 0.35) * passiveMit * 1.18));
    target.hp -= damage;

    if (enemy.modifiers.some((m) => m.id === 'plague') && Math.random() < 0.22) {
      target.statuses = target.statuses || [];
      target.statuses.push({ id: 'poison', duration: 4, dps: 4 + enemy.level * 0.5 });
    }

    if (enemy.type === 'boss' && enemy.phase === 2 && Math.random() < 0.25) {
      this.party.members.forEach((member) => {
        if (member.hp > 0 && Math.hypot(member.x - enemy.x, member.y - enemy.y) < 170) {
          member.hp -= Math.max(1, Math.round(enemy.attack * 0.35));
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
    for (let i = 0; i < count; i += 1) {
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
