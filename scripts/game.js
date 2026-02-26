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

class EmberFallGame {
  constructor() {
    this.canvas = document.getElementById('gameCanvas');
    this.ctx = this.canvas.getContext('2d');
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

  spawnEnemies() {
    const zone = this.world.zone;
    this.enemies = [];
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
    const nx = this.input.moveX;
    const ny = this.input.moveY;
    const len = Math.hypot(nx, ny);
    if (len > 0.02) {
      lead.direction = { x: nx / len, y: ny / len };
      const speed = lead.stats.speed * speedBoost;
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
        this.world.changeZone(exit.to);
        this.party.members.forEach((m) => {
          m.x = exit.spawn.x + Math.random() * 20;
          m.y = exit.spawn.y + Math.random() * 20;
        });
        this.spawnEnemies();
      }
    }
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
    this.party.updateFollow(dt);
    this.enemies.forEach((enemy) => {
      if (enemy.updateAI(dt, this.party.active, this.world)) this.combat.enemyAttack(enemy, this.party.active);
    });
    this.enemies = this.combat.processDeaths(this.enemies, (xp) => this.addXp(xp));
    this.combat.updateParticles(dt);

    if (!this.enemies.length && this.world.zoneId === 'dungeon' && this.dungeon.currentRun && !this.dungeon.currentRun.completed) {
      this.dungeon.completeRun();
      this.inventory.gold += 60 + this.progression.dungeonRank * 15;
      this.messages.unshift('Dungeon cleared! Return to town and scale up the guild hall.');
    }

    this.party.members.forEach((m) => {
      m.mana = Math.min(m.stats.maxMana, m.mana + dt * 4.5);
      if (this.world.zoneId === 'town' && m.hp > 0) m.hp = Math.min(m.stats.maxHp, m.hp + dt * (0.8 + this.progression.town.apothecary * 0.25));
    });

    this.ui.renderHud();
  }

  draw() {
    const ctx = this.ctx;
    const lead = this.party.active;
    const { width, height } = this.canvas;
    this.world.camera.x = Math.max(0, Math.min(this.world.zone.width - width, lead.x - width / 2));
    this.world.camera.y = Math.max(0, Math.min(this.world.zone.height - height, lead.y - height / 2));

    ctx.save();
    ctx.translate(-this.world.camera.x, -this.world.camera.y);
    this.world.draw(ctx);

    this.world.zone.npcs.forEach((npc) => {
      ctx.fillStyle = npc.color;
      ctx.beginPath();
      ctx.arc(npc.x, npc.y, 16, 0, Math.PI * 2);
      ctx.fill();
    });

    this.enemies.forEach((e) => {
      ctx.fillStyle = e.color;
      ctx.beginPath();
      ctx.arc(e.x, e.y, e.radius, 0, Math.PI * 2);
      ctx.fill();
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

    ctx.restore();
    ctx.fillStyle = '#fff';
    ctx.fillText(`${this.world.zone.name}`, 10, 16);
    ctx.fillText(`XP ${this.xp}/${this.levelXp}`, 10, 30);
    if (this.messages.length) ctx.fillText(this.messages[0], 10, 44);
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
    if (state.party?.members) {
      state.party.members.forEach((saved, idx) => Object.assign(this.party.members[idx], saved));
      this.party.activeIndex = state.party.activeIndex || 0;
    }
    this.inventory.hydrate(state.inventory);
    this.questSystem.hydrate(state.quests);
    this.progression.hydrate(state.progression);
    this.dungeon.hydrate(state.dungeon);
    if (this.dungeon.currentRun?.zone) this.world.setDynamicDungeon(this.dungeon.currentRun.zone);
    this.xp = state.xp || 0;
    this.levelXp = state.levelXp || 100;
  }

  resizeCanvas() {
    const ratio = window.devicePixelRatio || 1;
    const targetW = this.canvas.clientWidth;
    const targetH = this.canvas.clientHeight;
    this.canvas.width = Math.floor(targetW * ratio);
    this.canvas.height = Math.floor(targetH * ratio);
    this.ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  }
}

const game = new EmberFallGame();
window.__emberfall = game;
