import './canvasCompat.js';
import { Party } from './player.js';
import { Enemy } from './enemy.js';
import { World } from './world.js';
import { CombatSystem } from './combat.js';
import { QuestSystem } from './questSystem.js';
import { InventorySystem } from './inventory.js';
import { UIController } from './ui.js';
import { AudioSystem } from './audio.js';
import { ProgressionSystem } from './progression.js';
import { DungeonSystem } from './dungeon.js';
import { loadState, saveState } from './saveSystem.js';
import { HDRenderer } from './renderer.js';

class EmberFallGame {
  constructor() {
    this.canvas = document.getElementById('gameCanvas');
    this.renderer = new HDRenderer(this.canvas);
    this.ctx = null;
    this.world = new World();
    this.party = new Party({ x: 760, y: 1320 });
    this.inventory = new InventorySystem();
    this.questSystem = new QuestSystem();
    this.progression = new ProgressionSystem();
    this.dungeon = new DungeonSystem();
    this.combat = new CombatSystem(this.party, this.world, this.inventory, this.questSystem, this.progression);
    this.ui = new UIController(this);
    this.audio = new AudioSystem();

    this.xp = 0;
    this.levelXp = 100;
    this.enemies = [];
    this.messages = ['Tap canvas once to enable tiny synth sounds.'];
    this.dialogueQueue = [];
    this.lastTime = performance.now();
    this.elapsed = 0;
    this.input = { moveX: 0, moveY: 0 };
    this.renderCamera = { x: 0, y: 0 };
    this.renderZoom = 1;
    this.zoneRespawnAt = 0;
    this.enemyProjectiles = [];
    this.worldPickups = [];

    this.installControls();
    this.loadGame();
    this.rebuildStats();
    this.spawnEnemies();
    this.resizeCanvas();
    window.addEventListener('resize', () => this.resizeCanvas());
    requestAnimationFrame((t) => this.loop(t));
  }

  installControls() {
    const base = document.getElementById('joystickBase');
    const knob = document.getElementById('joystickKnob');
    let pointerId = null;

    const updateFromPoint = (clientX, clientY) => {
      const rect = base.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      let dx = clientX - cx;
      let dy = clientY - cy;
      const max = rect.width * 0.32;
      const len = Math.hypot(dx, dy) || 1;
      if (len > max) {
        dx = (dx / len) * max;
        dy = (dy / len) * max;
      }
      knob.style.left = `${rect.width / 2 - knob.offsetWidth / 2 + dx}px`;
      knob.style.top = `${rect.height / 2 - knob.offsetHeight / 2 + dy}px`;
      this.input.moveX = dx / max;
      this.input.moveY = dy / max;
    };

    base.addEventListener('pointerdown', (ev) => {
      pointerId = ev.pointerId;
      base.setPointerCapture(pointerId);
      updateFromPoint(ev.clientX, ev.clientY);
    });
    base.addEventListener('pointermove', (ev) => {
      if (ev.pointerId !== pointerId) return;
      updateFromPoint(ev.clientX, ev.clientY);
    });
    const resetStick = () => {
      pointerId = null;
      const rect = base.getBoundingClientRect();
      knob.style.left = `${rect.width / 2 - knob.offsetWidth / 2}px`;
      knob.style.top = `${rect.height / 2 - knob.offsetHeight / 2}px`;
      this.input.moveX = 0;
      this.input.moveY = 0;
    };
    base.addEventListener('pointerup', resetStick);
    base.addEventListener('pointercancel', resetStick);

    document.querySelectorAll('.skill-btn').forEach((btn) => btn.addEventListener('click', () => this.onSkillButton(btn.dataset.skill)));
    this.canvas.addEventListener('click', () => {
      this.audio.ensure();
      if (this.messages[0]?.includes('Tap canvas')) this.messages.shift();
    });

    const movementKeys = {
      ArrowUp: [0, -1],
      KeyW: [0, -1],
      ArrowDown: [0, 1],
      KeyS: [0, 1],
      ArrowLeft: [-1, 0],
      KeyA: [-1, 0],
      ArrowRight: [1, 0],
      KeyD: [1, 0],
    };
    const pressed = new Set();
    const updateKeyboardMovement = () => {
      let moveX = 0;
      let moveY = 0;
      pressed.forEach((code) => {
        const vector = movementKeys[code];
        if (!vector) return;
        moveX += vector[0];
        moveY += vector[1];
      });
      const len = Math.hypot(moveX, moveY) || 1;
      this.input.moveX = moveX === 0 ? 0 : moveX / len;
      this.input.moveY = moveY === 0 ? 0 : moveY / len;
    };

    window.addEventListener('keydown', (ev) => {
      if (ev.code === 'Space') {
        ev.preventDefault();
        this.onSkillButton('attack');
        return;
      }
      if (ev.code === 'KeyQ') {
        ev.preventDefault();
        this.onSkillButton('skill1');
        return;
      }
      if (ev.code === 'KeyE') {
        ev.preventDefault();
        this.onSkillButton('skill2');
        return;
      }
      if (movementKeys[ev.code]) {
        ev.preventDefault();
        pressed.add(ev.code);
        updateKeyboardMovement();
      }
    });

    window.addEventListener('keyup', (ev) => {
      if (!movementKeys[ev.code]) return;
      pressed.delete(ev.code);
      updateKeyboardMovement();
    });

    window.addEventListener('blur', () => {
      pressed.clear();
      updateKeyboardMovement();
    });
  }

  rebuildStats() {
    this.party.members.forEach((member) => {
      member.applyEquipmentBonuses();
      this.progression.applyTalents(member);
      member.hp = Math.min(member.hp, member.stats.maxHp);
      member.mana = Math.min(member.mana, member.stats.maxMana);
    });
  }

  onSkillButton(skill) {
    if (skill === 'menu') return this.ui.toggleMenu();
    if (skill === 'switch') {
      this.party.switchActive();
      return;
    }
    if (skill === 'attack') return this.combat.tryAttack(this.enemies);
    if (skill === 'skill1' || skill === 'skill2') this.combat.trySkill(skill, this.enemies, this.elapsed);
  }

  startDungeon(regionId = 'meadow') {
    const run = this.dungeon.createRun(regionId, this.progression.dungeonRank);
    this.world.setDynamicDungeon(run.zone);
  }

  tryTalk() {
    const lead = this.party.active;
    const npc = this.world.nearestNpc(lead.x, lead.y);
    if (!npc) return;

    const lines = [...(npc.lines || [])];
    const questToTurnIn = this.questSystem.getTurnInQuestForNpc(npc.id);
    if (questToTurnIn) {
      const ok = this.questSystem.claim(questToTurnIn, this.inventory, (xp) => this.addXp(xp));
      if (ok) {
        this.refreshWorldPickups();
        this.audio.playQuest();
        lines.push('Quest complete! Rewards delivered.');
        if (npc.id === 'chef') lines.push('Kitchen shop unlocked and new orders are posted.');
        if (npc.id === 'smith') lines.push('Forge shop unlocked and a fresh forge request is available.');
        if (npc.id === 'mayor') lines.push('Cavern gate unlocked. The boss is waiting beyond town.');
      }
    }

    const activeNpcQuestId = this.questSystem.getActiveQuestForNpc(npc.id);
    const activeNpcQuest = activeNpcQuestId ? QuestSystem.QUESTS[activeNpcQuestId] : null;

    if (npc.id === 'smith') {
      if (this.questSystem.isShopUnlocked('smith')) {
        this.activeShop = 'smith';
        this.ui.openShop(npc.name);
        lines.push('Browse my upgrades in the shop ledger.');
      } else {
        this.activeShop = null;
        lines.push('Finish my Spark Delivery first, then the forge opens.');
      }
      if (activeNpcQuest) lines.push(`Current request: ${activeNpcQuest.description}`);
    }

    if (npc.id === 'chef') {
      if (this.questSystem.isShopUnlocked('chef')) {
        this.activeShop = 'chef';
        this.ui.openShop(npc.name);
        lines.push('Hungry? Grab some healing food from the shop ledger.');
      } else {
        this.activeShop = null;
        lines.push('Bring me 3 Slime Gel and I\'ll open the kitchen shop.');
      }
      if (activeNpcQuest) lines.push(`Current order: ${activeNpcQuest.description}`);
    }

    if (npc.id === 'mayor' && !this.questSystem.isAreaUnlocked('caverns')) {
      lines.push('Chef then smith, then me. That\'s the official heroic paperwork route.');
    }

    this.dialogueQueue = lines;
    this.advanceDialogue();
  }

  advanceDialogue() {
    if (!this.dialogueQueue.length) {
      this.ui.setDialogue('', false);
      return;
    }
    const next = this.dialogueQueue.shift();
    this.ui.setDialogue(next, true);
  }

  spawnEnemies() {
    const zone = this.world.zone;
    this.enemies = [];
    this.zoneRespawnAt = 0;
    this.enemyProjectiles = [];
    this.refreshWorldPickups();
    const modifiers = this.world.zoneId === 'dungeon' ? this.dungeon.currentRun?.modifiers || [] : [];
    for (const pack of zone.enemySpawns) {
      for (let i = 0; i < pack.count; i += 1) {
        this.enemies.push(new Enemy({ type: pack.type, level: pack.level, modifiers, x: 120 + Math.random() * (zone.width - 240), y: 120 + Math.random() * (zone.height - 240) }));
      }
    }
  }

  moveLeader(dt) {
    const lead = this.party.active;
    if (lead.hp <= 0) return;
    const speedBoost = lead.speedBoostTimer && this.elapsed < lead.speedBoostTimer ? 1.5 : 1;
    const hindrance = (lead.statuses || []).reduce((acc, status) => {
      if (status.id === 'slowed') return Math.max(acc, status.strength || 0.3);
      if (status.id === 'ensnared') return Math.max(acc, status.strength || 0.55);
      return acc;
    }, 0);
    const nx = this.input.moveX;
    const ny = this.input.moveY;
    const len = Math.hypot(nx, ny);
    if (len > 0.02) {
      lead.direction = { x: nx / len, y: ny / len };
      const speed = lead.stats.speed * speedBoost * (1 - hindrance);
      const next = this.world.resolveCollision(lead.x + (nx / len) * speed * dt, lead.y + (ny / len) * speed * dt, lead.radius);
      lead.x = next.x;
      lead.y = next.y;
    }

    const exit = this.world.getExitAt(lead.x, lead.y);
    if (exit) {
      if (exit.requiresArea && !this.questSystem.isAreaUnlocked(exit.requiresArea)) {
        this.messages.unshift(exit.lockedMessage || 'This path is locked.');
      } else {
        if (exit.to === 'dungeon') this.startDungeon('meadow');
        if (!this.world.changeZone(exit.to)) {
          this.messages.unshift('That route is unstable right now. Try another exit.');
          return;
        }
        this.party.members.forEach((m) => {
          m.x = exit.spawn.x + Math.random() * 20;
          m.y = exit.spawn.y + Math.random() * 20;
        });
        this.spawnEnemies();
      }
    }
  }


  refreshWorldPickups() {
    const pickupActive = this.questSystem.active.get('smith_delivery')?.progress < 1;
    this.worldPickups = pickupActive ? [{ id: 'frost_coil', zone: 'north', x: 1560, y: 360, radius: 20, item: 'Frost Coil' }] : [];
  }

  checkWorldPickupCollection() {
    const lead = this.party.active;
    this.worldPickups = this.worldPickups.filter((pickup) => {
      if (pickup.zone !== this.world.zoneId) return true;
      if (Math.hypot(lead.x - pickup.x, lead.y - pickup.y) > lead.radius + pickup.radius) return true;
      this.questSystem.onItemCollected(pickup.item);
      this.messages.unshift(`Picked up ${pickup.item} for Smith Bop.`);
      return false;
    });
  }


  handleEnemyIntent(enemy) {
    if (!enemy.intent) return;
    const lead = this.party.active;

    if (enemy.intent.type === 'projectile') {
      const dx = lead.x - enemy.x;
      const dy = lead.y - enemy.y;
      const dist = Math.hypot(dx, dy) || 1;
      this.enemyProjectiles.push({
        x: enemy.x,
        y: enemy.y,
        vx: (dx / dist) * 130,
        vy: (dy / dist) * 130,
        life: 2.6,
        radius: 8,
        damage: Math.round(enemy.attack * 0.95),
      });
      this.combat.spawnParticles(enemy.x, enemy.y, '#9dd8ff', 12);
    }

    if (enemy.intent.type === 'ally_shield') {
      const allies = this.enemies
        .filter((other) => other !== enemy && other.hp > 0 && Math.hypot(other.x - enemy.x, other.y - enemy.y) < 180)
        .slice(0, 2);
      allies.forEach((ally) => ally.addStatus('barrier', 3.2, { reduction: 0.35 }));
      if (allies.length) this.combat.spawnParticles(enemy.x, enemy.y, '#d9f2ff', 18);
    }

    if (enemy.intent.type === 'web_trap') {
      lead.statuses = lead.statuses || [];
      lead.statuses.push({ id: 'ensnared', duration: 1.7, strength: 0.45 });
      this.combat.spawnParticles(lead.x, lead.y, '#e8efff', 10);
    }

    if (enemy.intent.type === 'summon_spiderling') {
      this.enemies.push(new Enemy({ type: 'spiderling', level: Math.max(1, enemy.level - 1), x: enemy.x + (Math.random() - 0.5) * 80, y: enemy.y + (Math.random() - 0.5) * 80 }));
      this.combat.spawnParticles(enemy.x, enemy.y, '#d8def4', 14);
    }

    enemy.intent = null;
  }

  updateEnemyProjectiles(dt) {
    const lead = this.party.active;
    this.enemyProjectiles = this.enemyProjectiles.filter((proj) => {
      proj.life -= dt;
      proj.x += proj.vx * dt;
      proj.y += proj.vy * dt;
      if (proj.life <= 0) return false;

      if (Math.hypot(proj.x - lead.x, proj.y - lead.y) < lead.radius + proj.radius) {
        const defense = lead.stats?.defense ?? lead.baseStats?.defense ?? 0;
        const damage = Math.max(1, Math.round(proj.damage - defense * 0.25));
        lead.hp = Math.max(0, lead.hp - damage);
        lead.statuses = lead.statuses || [];
        lead.statuses.push({ id: 'slowed', duration: 2, strength: 0.35 });
        this.combat.spawnParticles(lead.x, lead.y, '#9ed8ff', 12);
        return false;
      }

      return true;
    });
  }
  addXp(value) {
    this.xp += value;
    while (this.xp >= this.levelXp) {
      this.xp -= this.levelXp;
      this.levelXp = Math.round(this.levelXp * 1.2);
      this.party.members.forEach((m) => m.gainLevel());
      this.progression.grantTalentPoint();
      this.rebuildStats();
      this.messages.unshift('Party leveled up! Talent point earned.');
    }
  }

  update(dt) {
    this.elapsed += dt;
    this.moveLeader(dt);
    this.checkWorldPickupCollection();
    this.party.updateFollow(dt);
    this.enemies.forEach((enemy) => {
      if (enemy.updateAI(dt, this.party.active, this.world)) this.combat.enemyAttack(enemy, this.party.active);
      this.handleEnemyIntent(enemy);
    });
    this.updateEnemyProjectiles(dt);
    this.enemies = this.combat.processDeaths(this.enemies, (xp) => this.addXp(xp));
    this.combat.updateParticles(dt);

    if (!this.enemies.length && this.world.zoneId !== 'town' && this.world.zoneId !== 'dungeon') {
      if (!this.zoneRespawnAt) {
        this.zoneRespawnAt = this.elapsed + 7;
      } else if (this.elapsed >= this.zoneRespawnAt) {
        this.spawnEnemies();
        this.messages.unshift(`${this.world.zone.name} stirs... New enemies emerge.`);
      }
    }

    if (!this.enemies.length && this.world.zoneId === 'dungeon' && this.dungeon.currentRun && !this.dungeon.currentRun.completed) {
      this.dungeon.completeRun();
      this.inventory.gold += 60 + this.progression.dungeonRank * 15;
      this.messages.unshift('Dungeon cleared! Return to town and scale up the guild hall.');
    }

    this.party.members.forEach((m) => {
      m.mana = Math.min(m.stats.maxMana, m.mana + dt * 4.5);
      if (this.world.zoneId === 'town' && m.hp > 0) m.hp = Math.min(m.stats.maxHp, m.hp + dt * (0.8 + this.progression.town.apothecary * 0.25));
    });
    const nearbyNpc = this.world.nearestNpc(this.party.active.x, this.party.active.y);
    this.ui.setNpcTalkPrompt(nearbyNpc);
    if (Math.floor(this.elapsed * 2) % 2 === 0) this.ui.renderHud();
  }

  drawCharacter(member, isLead) {
    const ctx = this.renderer.sceneCtx;
    const bob = Math.sin(this.elapsed * 8 + member.x * 0.01) * 1.8;

    // Class-themed palette accents for readability
    const classVisuals = {
      Warrior: { hair: '#634a3d', trim: '#ffd773', cloth: '#b9474f' },
      Mage: { hair: '#6f5db3', trim: '#9be6ff', cloth: '#7f63d6' },
      Ranger: { hair: '#4f7d45', trim: '#90d46d', cloth: '#6ba66c' },
    };
    const visual = classVisuals[member.className] || { hair: '#4f4d79', trim: '#ffe067', cloth: member.color };

    // Shadow
    ctx.fillStyle = 'rgba(22, 24, 36, 0.35)';
    ctx.beginPath();
    ctx.ellipse(member.x, member.y + 20, 13, 5, 0, 0, Math.PI * 2);
    ctx.fill();

    // Base body with richer shading for HD readability
    const bodyGrad = ctx.createLinearGradient(member.x, member.y - 2 + bob, member.x, member.y + 20 + bob);
    bodyGrad.addColorStop(0, '#ffffff2e');
    bodyGrad.addColorStop(0.35, member.color);
    bodyGrad.addColorStop(1, '#1c213a66');
    ctx.fillStyle = bodyGrad;
    ctx.beginPath();
    ctx.roundRect(member.x - 10, member.y - 2 + bob, 20, 20, 6);
    ctx.fill();
    ctx.strokeStyle = 'rgba(17, 20, 36, 0.45)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.roundRect(member.x - 10, member.y - 2 + bob, 20, 20, 6);
    ctx.stroke();

    // Class outfit silhouettes
    if (member.className === 'Warrior') {
      // Armor shoulder plates + chest trim
      ctx.fillStyle = '#ced6ea';
      ctx.fillRect(member.x - 12, member.y + 1 + bob, 4, 5);
      ctx.fillRect(member.x + 8, member.y + 1 + bob, 4, 5);
      ctx.fillStyle = '#7f8aa8';
      ctx.fillRect(member.x - 3, member.y + 1 + bob, 6, 9);
      ctx.fillStyle = visual.trim;
      ctx.fillRect(member.x - 9, member.y + 10 + bob, 18, 2);
      // Bracer accents
      ctx.fillStyle = '#8e9cc3';
      ctx.fillRect(member.x - 11, member.y + 8 + bob, 3, 5);
      ctx.fillRect(member.x + 8, member.y + 8 + bob, 3, 5);
    } else if (member.className === 'Mage') {
      // Arcane robe + pendant
      ctx.fillStyle = visual.cloth;
      ctx.beginPath();
      ctx.moveTo(member.x - 10, member.y + 6 + bob);
      ctx.lineTo(member.x + 10, member.y + 6 + bob);
      ctx.lineTo(member.x + 6, member.y + 18 + bob);
      ctx.lineTo(member.x - 6, member.y + 18 + bob);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#d6f5ff';
      ctx.fillRect(member.x - 1, member.y + 6 + bob, 2, 6);
      ctx.fillStyle = visual.trim;
      ctx.beginPath();
      ctx.arc(member.x, member.y + 13 + bob, 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#d5f2ff';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(member.x, member.y + 6 + bob);
      ctx.lineTo(member.x, member.y + 16 + bob);
      ctx.stroke();
    } else if (member.className === 'Ranger') {
      // Ranger vest + quiver strap
      ctx.fillStyle = '#3f6448';
      ctx.fillRect(member.x - 9, member.y + 1 + bob, 18, 10);
      ctx.fillStyle = '#7f5a34';
      ctx.fillRect(member.x - 8, member.y - 1 + bob, 16, 2);
      ctx.save();
      ctx.translate(member.x, member.y + 5 + bob);
      ctx.rotate(-0.55);
      ctx.fillStyle = '#d8c293';
      ctx.fillRect(-1, -9, 2, 18);
      ctx.restore();
      ctx.fillStyle = '#5e7a43';
      ctx.fillRect(member.x - 4, member.y + 8 + bob, 8, 2);
    }

    // Head + class-themed hair
    ctx.fillStyle = '#ffe8d2';
    ctx.beginPath();
    ctx.arc(member.x, member.y - 10 + bob, 14, 0, Math.PI * 2);
    ctx.fill();
    const skinHi = ctx.createRadialGradient(member.x - 4, member.y - 15 + bob, 1, member.x, member.y - 10 + bob, 13);
    skinHi.addColorStop(0, 'rgba(255,255,255,0.35)');
    skinHi.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = skinHi;
    ctx.beginPath();
    ctx.arc(member.x, member.y - 10 + bob, 14, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = visual.hair;
    ctx.beginPath();
    ctx.arc(member.x, member.y - 14 + bob, 11, Math.PI, 0);
    ctx.fill();

    if (member.className === 'Warrior') {
      // Helmet rim
      ctx.strokeStyle = '#d4dfef';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(member.x, member.y - 14 + bob, 11, Math.PI * 1.06, Math.PI * 1.94);
      ctx.stroke();
    } else if (member.className === 'Mage') {
      // Wizard hat tip
      ctx.fillStyle = '#8a74de';
      ctx.beginPath();
      ctx.moveTo(member.x, member.y - 26 + bob);
      ctx.lineTo(member.x - 7, member.y - 15 + bob);
      ctx.lineTo(member.x + 7, member.y - 15 + bob);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#d7f6ff';
      ctx.fillRect(member.x - 1, member.y - 23 + bob, 2, 3);
    } else if (member.className === 'Ranger') {
      // Feather cap accent
      ctx.fillStyle = '#a7e57f';
      ctx.beginPath();
      ctx.ellipse(member.x + 8, member.y - 17 + bob, 2, 6, 0.7, 0, Math.PI * 2);
      ctx.fill();
    }

    // Face details
    ctx.fillStyle = '#2b315d';
    ctx.fillRect(member.x - 5, member.y - 14 + bob, 3, 3);
    ctx.fillRect(member.x + 2, member.y - 14 + bob, 3, 3);
    ctx.fillStyle = '#ffb4c7';
    ctx.fillRect(member.x - 8, member.y - 9 + bob, 2, 2);
    ctx.fillRect(member.x + 6, member.y - 9 + bob, 2, 2);

    // subtle boots for fuller silhouette
    ctx.fillStyle = '#2f3857';
    ctx.fillRect(member.x - 8, member.y + 17 + bob, 5, 2);
    ctx.fillRect(member.x + 3, member.y + 17 + bob, 5, 2);

    // Lead indicator
    if (isLead) {
      ctx.strokeStyle = '#ffe067';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(member.x, member.y - 24 + bob, 8, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  drawNpc(npc) {
    const ctx = this.renderer.sceneCtx;
    const bob = Math.sin(this.elapsed * 5 + npc.x * 0.02) * 1.5;

    ctx.save();
    ctx.textAlign = 'center';
    ctx.font = 'bold 11px sans-serif';
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(15, 18, 34, 0.85)';
    ctx.fillStyle = '#ffffff';
    ctx.strokeText(npc.name, npc.x, npc.y - 38 + bob);
    ctx.fillText(npc.name, npc.x, npc.y - 38 + bob);
    ctx.restore();

    // soft ground shadow with slight glow
    ctx.fillStyle = 'rgba(18, 24, 38, 0.34)';
    ctx.beginPath();
    ctx.ellipse(npc.x, npc.y + 20, 14, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.beginPath();
    ctx.ellipse(npc.x, npc.y + 18, 9, 2.5, 0, 0, Math.PI * 2);
    ctx.fill();

    // rounded torso with modern shading
    const torsoGrad = ctx.createLinearGradient(npc.x, npc.y - 4 + bob, npc.x, npc.y + 18 + bob);
    torsoGrad.addColorStop(0, '#ffffff33');
    torsoGrad.addColorStop(1, '#00000022');
    ctx.fillStyle = npc.color;
    ctx.beginPath();
    ctx.roundRect(npc.x - 11, npc.y - 2 + bob, 22, 21, 8);
    ctx.fill();
    ctx.fillStyle = torsoGrad;
    ctx.beginPath();
    ctx.roundRect(npc.x - 11, npc.y - 2 + bob, 22, 21, 8);
    ctx.fill();

    // neck and scarf accent
    ctx.fillStyle = '#f9d6bf';
    ctx.fillRect(npc.x - 3, npc.y - 5 + bob, 6, 4);
    ctx.fillStyle = 'rgba(255, 239, 187, 0.88)';
    ctx.beginPath();
    ctx.roundRect(npc.x - 9, npc.y - 1 + bob, 18, 5, 3);
    ctx.fill();

    // layered head with richer hair shape
    ctx.fillStyle = '#ffe9d8';
    ctx.beginPath();
    ctx.arc(npc.x, npc.y - 12 + bob, 13, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#4f4f78';
    ctx.beginPath();
    ctx.arc(npc.x, npc.y - 15 + bob, 11.5, Math.PI, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(npc.x - 11, npc.y - 15 + bob, 4, 8);
    ctx.fillRect(npc.x + 7, npc.y - 15 + bob, 4, 8);

    // subtle highlight on hair
    ctx.fillStyle = 'rgba(255,255,255,0.24)';
    ctx.beginPath();
    ctx.arc(npc.x - 4, npc.y - 18 + bob, 4, 0, Math.PI * 2);
    ctx.fill();

    // eyes, lashes, mouth, blush
    ctx.fillStyle = '#22284d';
    ctx.fillRect(npc.x - 5, npc.y - 14 + bob, 2, 3);
    ctx.fillRect(npc.x + 3, npc.y - 14 + bob, 2, 3);
    ctx.fillRect(npc.x - 6, npc.y - 15 + bob, 3, 1);
    ctx.fillRect(npc.x + 3, npc.y - 15 + bob, 3, 1);
    ctx.fillStyle = '#6a3550';
    ctx.fillRect(npc.x - 1, npc.y - 9 + bob, 2, 1);
    ctx.fillStyle = '#ffb6c8';
    ctx.fillRect(npc.x - 8, npc.y - 11 + bob, 2, 2);
    ctx.fillRect(npc.x + 6, npc.y - 11 + bob, 2, 2);

    // tiny boots for silhouette readability
    ctx.fillStyle = '#303957';
    ctx.fillRect(npc.x - 8, npc.y + 17 + bob, 6, 2);
    ctx.fillRect(npc.x + 2, npc.y + 17 + bob, 6, 2);

    // quest marker modernized: ring + sparkle
    if (this.questSystem.hasQuestForNpc(npc.id)) {
      const markerY = npc.y - 32 + bob;
      ctx.strokeStyle = '#ffe88a';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(npc.x, markerY, 5.5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = '#fff4b2';
      ctx.beginPath();
      ctx.arc(npc.x, markerY, 2.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(npc.x - 1, markerY - 8, 2, 16);
    }

    this.ui.renderHud();
  }


  drawEnemySprite(enemy) {
    const ctx = this.renderer.sceneCtx;
    const pulse = Math.sin(this.elapsed * 6 + enemy.x * 0.02) * 0.8;

    if (enemy.type === 'slime') {
      ctx.fillStyle = enemy.color;
      ctx.beginPath();
      ctx.ellipse(enemy.x, enemy.y + 2 + pulse, enemy.radius + 3, enemy.radius - 2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.28)';
      ctx.beginPath();
      ctx.ellipse(enemy.x - 4, enemy.y - 4 + pulse, enemy.radius * 0.45, enemy.radius * 0.3, -0.4, 0, Math.PI * 2);
      ctx.fill();
    } else if (enemy.type === 'bat') {
      ctx.fillStyle = '#7f6fdb';
      ctx.beginPath();
      ctx.ellipse(enemy.x, enemy.y + pulse, enemy.radius * 0.7, enemy.radius * 0.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#9f8cff';
      ctx.beginPath();
      ctx.moveTo(enemy.x - enemy.radius * 0.5, enemy.y + pulse);
      ctx.quadraticCurveTo(enemy.x - enemy.radius * 1.6, enemy.y - enemy.radius * 0.8 + pulse, enemy.x - enemy.radius * 1.9, enemy.y + enemy.radius * 0.3 + pulse);
      ctx.quadraticCurveTo(enemy.x - enemy.radius * 1.3, enemy.y + enemy.radius * 0.1 + pulse, enemy.x - enemy.radius * 0.7, enemy.y + enemy.radius * 0.55 + pulse);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(enemy.x + enemy.radius * 0.5, enemy.y + pulse);
      ctx.quadraticCurveTo(enemy.x + enemy.radius * 1.6, enemy.y - enemy.radius * 0.8 + pulse, enemy.x + enemy.radius * 1.9, enemy.y + enemy.radius * 0.3 + pulse);
      ctx.quadraticCurveTo(enemy.x + enemy.radius * 1.3, enemy.y + enemy.radius * 0.1 + pulse, enemy.x + enemy.radius * 0.7, enemy.y + enemy.radius * 0.55 + pulse);
      ctx.closePath();
      ctx.fill();
    } else if (enemy.type === 'mushroom') {
      const skullY = enemy.y - 2 + pulse;
      ctx.fillStyle = '#e9e6dc';
      ctx.beginPath();
      ctx.arc(enemy.x, skullY, enemy.radius + 1, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#c7c2b4';
      ctx.fillRect(enemy.x - 7, enemy.y + enemy.radius - 2, 14, 8);
      ctx.fillStyle = '#ece9de';
      ctx.fillRect(enemy.x - 6, enemy.y + enemy.radius - 1, 2, 6);
      ctx.fillRect(enemy.x - 2, enemy.y + enemy.radius - 1, 2, 6);
      ctx.fillRect(enemy.x + 2, enemy.y + enemy.radius - 1, 2, 6);

      ctx.fillStyle = '#1d2238';
      ctx.beginPath();
      ctx.arc(enemy.x - 4, skullY - 2, 2.6, 0, Math.PI * 2);
      ctx.arc(enemy.x + 4, skullY - 2, 2.6, 0, Math.PI * 2);
      ctx.fill();

      ctx.beginPath();
      ctx.moveTo(enemy.x, skullY + 1);
      ctx.lineTo(enemy.x - 2, skullY + 4);
      ctx.lineTo(enemy.x + 2, skullY + 4);
      ctx.closePath();
      ctx.fill();

      ctx.strokeStyle = '#bcb6a8';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(enemy.x - enemy.radius - 8, enemy.y + 3);
      ctx.lineTo(enemy.x + enemy.radius + 8, enemy.y + 3);
      ctx.stroke();

      ctx.fillStyle = '#e9e6dc';
      ctx.beginPath();
      ctx.arc(enemy.x - enemy.radius - 8, enemy.y + 3, 2.5, 0, Math.PI * 2);
      ctx.arc(enemy.x + enemy.radius + 8, enemy.y + 3, 2.5, 0, Math.PI * 2);
      ctx.fill();
    } else if (enemy.type === 'wraith') {
      const grad = ctx.createLinearGradient(enemy.x, enemy.y - enemy.radius - 4, enemy.x, enemy.y + enemy.radius + 8);
      grad.addColorStop(0, '#b8c4ff');
      grad.addColorStop(1, 'rgba(122,141,255,0.2)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(enemy.x, enemy.y - enemy.radius - 4 + pulse);
      ctx.quadraticCurveTo(enemy.x - enemy.radius - 5, enemy.y - 2, enemy.x - enemy.radius + 2, enemy.y + enemy.radius + 7);
      ctx.quadraticCurveTo(enemy.x - 2, enemy.y + enemy.radius - 2, enemy.x + enemy.radius - 3, enemy.y + enemy.radius + 7);
      ctx.quadraticCurveTo(enemy.x + enemy.radius + 7, enemy.y - 1, enemy.x, enemy.y - enemy.radius - 4 + pulse);
      ctx.fill();
    } else if (enemy.type === 'sentinel') {
      ctx.fillStyle = '#8dc8c5';
      ctx.beginPath();
      ctx.roundRect(enemy.x - enemy.radius + 2, enemy.y - enemy.radius + 2, enemy.radius * 2 - 4, enemy.radius * 2 - 4, 6);
      ctx.fill();
      ctx.fillStyle = '#6ea8a5';
      ctx.fillRect(enemy.x - 3, enemy.y - enemy.radius + 4, 6, enemy.radius * 2 - 8);
      ctx.fillRect(enemy.x - enemy.radius + 4, enemy.y - 3, enemy.radius * 2 - 8, 6);
    } else if (enemy.type === 'rockling') {
      ctx.fillStyle = enemy.exposedTimer > 0 ? '#c4d2e4' : '#7f92aa';
      ctx.beginPath();
      ctx.roundRect(enemy.x - enemy.radius, enemy.y - enemy.radius, enemy.radius * 2, enemy.radius * 2, 5);
      ctx.fill();
      ctx.fillStyle = '#5f7088';
      ctx.fillRect(enemy.x - 5, enemy.y - enemy.radius + 3, 10, enemy.radius * 2 - 6);
    } else if (enemy.type === 'wobble_mage') {
      ctx.fillStyle = '#8fc7ff';
      ctx.beginPath();
      ctx.arc(enemy.x, enemy.y, enemy.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#dff0ff';
      ctx.fillRect(enemy.x - 3, enemy.y - enemy.radius - 9, 6, 10);
      ctx.fillStyle = '#b7e0ff';
      ctx.beginPath();
      ctx.arc(enemy.x, enemy.y + enemy.radius + 2, enemy.radius * 0.8, 0, Math.PI * 2);
      ctx.fill();
    } else if (enemy.type === 'silkweaver' || enemy.type === 'spiderling') {
      ctx.fillStyle = enemy.type === 'silkweaver' ? '#cdd8f7' : '#9ca8cb';
      ctx.beginPath();
      ctx.arc(enemy.x, enemy.y, enemy.radius * 0.75, 0, Math.PI * 2);
      ctx.fill();
      for (let i = -1; i <= 1; i += 1) {
        ctx.strokeStyle = '#7f8fb7';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(enemy.x - enemy.radius * 0.6, enemy.y + i * 4);
        ctx.lineTo(enemy.x - enemy.radius - 7, enemy.y + i * 8);
        ctx.moveTo(enemy.x + enemy.radius * 0.6, enemy.y + i * 4);
        ctx.lineTo(enemy.x + enemy.radius + 7, enemy.y + i * 8);
        ctx.stroke();
      }
    } else {
      ctx.fillStyle = '#ff76a7';
      ctx.beginPath();
      ctx.arc(enemy.x, enemy.y, enemy.radius + 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffd57e';
      ctx.beginPath();
      ctx.moveTo(enemy.x, enemy.y - enemy.radius - 8);
      ctx.lineTo(enemy.x - 8, enemy.y - enemy.radius + 2);
      ctx.lineTo(enemy.x + 8, enemy.y - enemy.radius + 2);
      ctx.closePath();
      ctx.fill();
    }

    ctx.fillStyle = '#1a1d35';
    ctx.fillRect(enemy.x - 6, enemy.y - 3, 3, 3);
    ctx.fillRect(enemy.x + 3, enemy.y - 3, 3, 3);
  }

  draw() {
    const { sceneCtx: ctx, scale } = this.renderer.beginFrame();
    const lead = this.party.active;
    const sceneWidth = this.renderer.sceneCanvas.width;
    const sceneHeight = this.renderer.sceneCanvas.height;

    const targetZoom = this.combat.comboTimer > 0.01 ? 1.06 : 1;
    this.renderZoom += (targetZoom - this.renderZoom) * 0.12;

    const targetCamX = Math.max(0, Math.min(this.world.zone.width - sceneWidth / scale, lead.x - sceneWidth / (2 * scale)));
    const targetCamY = Math.max(0, Math.min(this.world.zone.height - sceneHeight / scale, lead.y - sceneHeight / (2 * scale)));
    this.renderCamera.x += (targetCamX - this.renderCamera.x) * 0.12;
    this.renderCamera.y += (targetCamY - this.renderCamera.y) * 0.12;
    this.world.camera.x = this.renderCamera.x;
    this.world.camera.y = this.renderCamera.y;
    ctx.save();
    ctx.scale(scale * this.renderZoom, scale * this.renderZoom);
    ctx.translate(-this.world.camera.x, -this.world.camera.y);
    this.world.draw(ctx);

    this.world.zone.npcs.forEach((npc) => {
      ctx.fillStyle = npc.color;
      this.drawNpc(npc);
      this.renderer.drawNormalDisc(npc.x * scale, npc.y * scale, 24 * scale, 0.85);
    });

    this.worldPickups.filter((pickup) => pickup.zone === this.world.zoneId).forEach((pickup) => {
      const bob = Math.sin(this.elapsed * 4 + pickup.x * 0.03) * 2;
      ctx.fillStyle = '#8fe9ff';
      ctx.beginPath();
      ctx.arc(pickup.x, pickup.y - 6 + bob, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#e9fbff';
      ctx.lineWidth = 2;
      ctx.strokeRect(pickup.x - 8, pickup.y - 24 + bob, 16, 16);
    });

    this.enemies.forEach((e) => {
      ctx.fillStyle = 'rgba(10, 12, 22, 0.35)';
      ctx.beginPath();
      ctx.arc(e.x, e.y, 16, 0, Math.PI * 2);
      ctx.fill();
      this.renderer.drawNormalDisc(e.x * scale, e.y * scale, (e.radius + 8) * scale, 0.95);
    });
    this.enemies.forEach((e) => {
      this.drawEnemySprite(e);
      ctx.fillStyle = '#112';
      ctx.fillRect(e.x - 16, e.y - e.radius - 14, 32, 4);
      ctx.fillStyle = '#ff7b99';
      ctx.fillRect(e.x - 16, e.y - e.radius - 14, 32 * (e.hp / e.maxHp), 4);
    });

    this.party.members.forEach((m, idx) => {
      ctx.fillStyle = m.color;
      ctx.beginPath();
      ctx.arc(m.x, m.y, 14, 0, Math.PI * 2);
      ctx.fill();
      if (idx === this.party.activeIndex) {
        ctx.strokeStyle = '#ffe067';
        ctx.strokeRect(m.x - 16, m.y - 16, 32, 32);
      }
    });

    this.party.members.forEach((m, idx) => this.drawCharacter(m, idx === this.party.activeIndex));
    this.party.members.forEach((m) => this.renderer.drawNormalDisc(m.x * scale, m.y * scale, 26 * scale, 1));

    this.enemyProjectiles.forEach((proj) => {
      ctx.fillStyle = '#9fd7ff';
      ctx.beginPath();
      ctx.arc(proj.x, proj.y, proj.radius, 0, Math.PI * 2);
      ctx.fill();
    });

    this.combat.particles.forEach((p) => {
      ctx.globalAlpha = Math.max(0, p.life);
      const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size * 2);
      grad.addColorStop(0, p.color);
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * 2, 0, Math.PI * 2);
      ctx.fill();
      this.renderer.drawNormalDisc(p.x * scale, p.y * scale, (p.size + 2) * scale, p.glow);
    });

    ctx.restore();
    ctx.fillStyle = '#fff';
    ctx.fillText(`${this.world.zone.name}`, 10, 16);
    ctx.fillText(`XP ${this.xp}/${this.levelXp}`, 10, 30);
    if (this.messages.length) ctx.fillText(this.messages[0], 10, 44);

    this.drawOverlay();

    this.renderer.compose({
      camera: this.world.camera,
      time: this.elapsed,
      combatBoost: Math.min(1, this.combat.comboCount / 8),
      zoom: this.renderZoom,
    });
  }

  drawOverlay() {
    const ctx = this.renderer.sceneCtx;
    const screenW = this.renderer.sceneCanvas.width;
    const screenH = this.renderer.sceneCanvas.height;
    const minimapX = screenW - 272;
    const minimapY = screenH - 496;

    ctx.fillStyle = 'rgba(18,20,32,0.6)';
    ctx.fillRect(minimapX, minimapY, 256, 224);
    ctx.fillStyle = '#fff';
    ctx.font = '24px sans-serif';
    ctx.fillText('Minimap', minimapX + 8, minimapY + 32);
    const scaleX = 232 / this.world.zone.width;
    const scaleY = 172 / this.world.zone.height;
    const mm = ctx.createLinearGradient(minimapX + 8, minimapY + 44, minimapX + 240, minimapY + 216);
    mm.addColorStop(0, '#a5dcff');
    mm.addColorStop(1, '#79b7ff');
    ctx.fillStyle = mm;
    ctx.fillRect(minimapX + 8, minimapY + 44, 232, 172);
    ctx.fillStyle = '#ffea7b';
    ctx.fillRect(minimapX + 8 + this.party.active.x * scaleX - 4, minimapY + 44 + this.party.active.y * scaleY - 4, 8, 8);

    ctx.fillStyle = '#fff';
    ctx.fillText(`${this.world.zone.name}`, 24, 40);
    ctx.fillText(`XP ${this.xp}/${this.levelXp}`, 24, 72);
    ctx.fillText(`Combo ${this.combat.comboCount}`, 24, 104);

    if (this.messages.length) {
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.fillRect(180, 16, screenW - 196, 48);
      ctx.fillStyle = '#fff';
      ctx.fillText(this.messages[0], 192, 48);
    }
  }

  loop(now) {
    const dt = Math.min(0.033, (now - this.lastTime) / 1000);
    this.lastTime = now;
    this.update(dt);
    this.draw();
    requestAnimationFrame((t) => this.loop(t));
  }

  saveGame() {
    saveState({
      zoneId: this.world.zoneId,
      party: { members: this.party.members, activeIndex: this.party.activeIndex },
      inventory: this.inventory.serialize(),
      quests: this.questSystem.serialize(),
      progression: this.progression.serialize(),
      dungeon: this.dungeon.serialize(),
      xp: this.xp,
      levelXp: this.levelXp,
    });
    this.messages.unshift('Game saved locally.');
  }

  loadGame() {
    const state = loadState();
    if (!state) return;
    this.world.changeZone(state.zoneId || 'town');
    if (Array.isArray(state.party?.members)) {
      state.party.members.forEach((saved, idx) => {
        const member = this.party.members[idx];
        if (!member || !saved || typeof saved !== 'object') return;
        Object.assign(member, saved);
      });
      this.party.members.forEach((member) => {
        member.statuses = Array.isArray(member.statuses) ? member.statuses : [];
        member.cooldowns = { attack: 0, skill1: 0, skill2: 0, ...(member.cooldowns || {}) };
        if (!member.direction || typeof member.direction !== 'object') member.direction = { x: 1, y: 0 };
        if (!member.stats || typeof member.stats !== 'object') member.stats = { ...member.baseStats };
        if (!Number.isFinite(member.x) || !Number.isFinite(member.y)) {
          member.x = this.party.members[0].x;
          member.y = this.party.members[0].y;
        }
        member.hp = Number.isFinite(member.hp) ? Math.max(0, Math.min(member.hp, member.stats.maxHp || member.baseStats.maxHp)) : (member.stats.maxHp || member.baseStats.maxHp);
        member.mana = Number.isFinite(member.mana) ? Math.max(0, Math.min(member.mana, member.stats.maxMana || member.baseStats.maxMana)) : (member.stats.maxMana || member.baseStats.maxMana);
      });
      const maxIndex = Math.max(0, this.party.members.length - 1);
      const savedIndex = Number.isInteger(state.party.activeIndex) ? state.party.activeIndex : 0;
      this.party.activeIndex = Math.max(0, Math.min(maxIndex, savedIndex));
    }
    this.inventory.hydrate(state.inventory);
    this.questSystem.hydrate(state.quests);
    this.progression.hydrate(state.progression);
    this.dungeon.hydrate(state.dungeon);
    if (this.dungeon.currentRun?.zone) this.world.setDynamicDungeon(this.dungeon.currentRun.zone);
    this.xp = state.xp || 0;
    this.levelXp = state.levelXp || 100;
    this.refreshWorldPickups();
  }

  resizeCanvas() {
    const targetW = this.canvas.clientWidth;
    const targetH = this.canvas.clientHeight;
    this.renderer.resize(targetW, targetH);
  }
}

const game = new EmberFallGame();
window.__emberfall = game;
