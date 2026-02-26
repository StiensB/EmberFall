import { Party } from './player.js';
import { Enemy } from './enemy.js';
import { World } from './world.js';
import { CombatSystem } from './combat.js';
import { QuestSystem } from './questSystem.js';
import { InventorySystem } from './inventory.js';
import { UIController } from './ui.js';
import { AudioSystem } from './audio.js';
import { loadState, saveState } from './saveSystem.js';

class EmberFallGame {
  constructor() {
    this.canvas = document.getElementById('gameCanvas');
    this.ctx = this.canvas.getContext('2d');
    this.world = new World();
    this.party = new Party({ x: 760, y: 1320 });
    this.inventory = new InventorySystem();
    this.questSystem = new QuestSystem();
    this.combat = new CombatSystem(this.party, this.world, this.inventory, this.questSystem);
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
      knob.style.left = '28px';
      knob.style.top = '28px';
      this.input.moveX = 0;
      this.input.moveY = 0;
    };
    base.addEventListener('pointerup', resetStick);
    base.addEventListener('pointercancel', resetStick);

    document.querySelectorAll('.skill-btn').forEach((btn) => {
      btn.addEventListener('click', () => this.onSkillButton(btn.dataset.skill));
    });

    this.canvas.addEventListener('click', () => {
      this.audio.ensure();
      if (this.messages[0]?.includes('Tap canvas')) this.messages.shift();
    });

    window.addEventListener('keydown', (ev) => {
      if (ev.key === ' ') this.onSkillButton('attack');
      if (ev.key === '1') this.onSkillButton('skill1');
      if (ev.key === '2') this.onSkillButton('skill2');
      if (ev.key.toLowerCase() === 'q') this.onSkillButton('switch');
      if (ev.key.toLowerCase() === 'e') this.tryTalk();
    });
  }

  onSkillButton(skill) {
    if (skill === 'menu') {
      this.ui.toggleMenu();
      return;
    }
    if (skill === 'switch') {
      this.party.switchActive();
      this.messages.unshift(`Active: ${this.party.active.name}`);
      return;
    }
    if (skill === 'attack') {
      this.combat.tryAttack(this.enemies);
      this.audio.playHit();
      return;
    }
    if (skill === 'skill1' || skill === 'skill2') {
      this.combat.trySkill(skill, this.enemies, this.elapsed);
      this.audio.playSkill();
    }
  }

  tryTalk() {
    const lead = this.party.active;
    const npc = this.world.nearestNpc(lead.x, lead.y);
    if (!npc) return;

    const lines = [...(npc.lines || [])];
    if (npc.questId && this.questSystem.canTurnIn(npc.questId, npc.id)) {
      const ok = this.questSystem.claim(npc.questId, this.inventory, (xp) => this.addXp(xp));
      if (ok) {
        this.audio.playQuest();
        lines.push('Quest complete! Rewards delivered.');
      }
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

  addXp(value) {
    this.xp += value;
    while (this.xp >= this.levelXp) {
      this.xp -= this.levelXp;
      this.levelXp = Math.round(this.levelXp * 1.2);
      this.party.members.forEach((m) => m.gainLevel());
      this.messages.unshift('Party leveled up! Stats boosted.');
    }
  }

  spawnEnemies() {
    const zone = this.world.zone;
    this.enemies = [];
    for (const pack of zone.enemySpawns) {
      for (let i = 0; i < pack.count; i += 1) {
        this.enemies.push(
          new Enemy({
            type: pack.type,
            level: pack.level,
            x: 120 + Math.random() * (zone.width - 240),
            y: 120 + Math.random() * (zone.height - 240),
          }),
        );
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
      const speed = lead.stats.speed * (lead.className === 'Ranger' ? 1.08 : 1) * speedBoost;
      const next = this.world.resolveCollision(lead.x + (nx / len) * speed * dt, lead.y + (ny / len) * speed * dt, lead.radius);
      lead.x = next.x;
      lead.y = next.y;
    }

    const exit = this.world.getExitAt(lead.x, lead.y);
    if (exit) {
      this.world.changeZone(exit.to);
      this.party.members.forEach((m) => {
        m.x = exit.spawn.x + Math.random() * 20;
        m.y = exit.spawn.y + Math.random() * 20;
      });
      this.spawnEnemies();
      this.messages.unshift(`Entered ${this.world.zone.name}`);
    }
  }

  updateEnemies(dt) {
    const target = this.party.active;
    this.enemies.forEach((enemy) => {
      if (enemy.updateAI(dt, target, this.world)) this.combat.enemyAttack(enemy, target);
    });
    this.enemies = this.combat.processDeaths(this.enemies, (xp) => this.addXp(xp));
  }

  updateManaRegen(dt) {
    const inTown = this.world.zoneId === 'town';
    this.party.members.forEach((m) => {
      m.mana = Math.min(m.stats.maxMana, m.mana + dt * 4.5);
      if (inTown && m.hp > 0) m.hp = Math.min(m.stats.maxHp, m.hp + dt * 0.8);
    });
  }
    this.party.members.forEach((m) => {
      m.mana = Math.min(m.stats.maxMana, m.mana + dt * 4.5);
      if (m.hp > 0) m.hp = Math.min(m.stats.maxHp, m.hp + dt * 0.8);
    });
  })}
  

  update(dt) {
    this.elapsed += dt;
    if (this.party.isWiped()) {
      this.messages = ['Party wiped! Returning to town fountain.'];
      this.world.changeZone('town');
      this.party.members.forEach((m) => {
        m.x = 750;
        m.y = 1300;
        m.hp = m.stats.maxHp;
        m.mana = m.stats.maxMana;
      });
      this.spawnEnemies();
      return;
    }
    

    this.moveLeader(dt);
    this.party.updateFollow(dt);
    this.updateEnemies(dt);
    this.updateManaRegen(dt);
    this.combat.updateParticles(dt);

    if (Math.floor(this.elapsed * 2) % 2 === 0) this.ui.renderHud();
  }

  drawCharacter(member, isLead) {
    const ctx = this.ctx;
    const bob = Math.sin(this.elapsed * 8 + member.x * 0.01) * 1.8;

    // Shadow
    ctx.fillStyle = 'rgba(22, 24, 36, 0.35)';
    ctx.beginPath();
    ctx.ellipse(member.x, member.y + 20, 13, 5, 0, 0, Math.PI * 2);
    ctx.fill();

    // Chibi body + tiny cape
    ctx.fillStyle = member.color;
    ctx.fillRect(member.x - 10, member.y - 2 + bob, 20, 20);
    ctx.fillStyle = 'rgba(255,255,255,0.24)';
    ctx.fillRect(member.x - 8, member.y + 1 + bob, 16, 3);

    // Chibi head + hair cap
    // Chibi body
    ctx.fillStyle = member.color;
    ctx.beginPath();
    ctx.arc(member.x, member.y + 6 + bob, 10, 0, Math.PI * 2);
    ctx.fill();

    // Chibi head
    ctx.fillStyle = '#ffe8d2';
    ctx.beginPath();
    ctx.arc(member.x, member.y - 10 + bob, 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#4f4d79';
    ctx.beginPath();
    ctx.arc(member.x, member.y - 14 + bob, 11, Math.PI, 0);
    ctx.fill();

    // Eyes + blush
    ctx.fillStyle = '#2b315d';
    ctx.fillRect(member.x - 5, member.y - 14 + bob, 3, 3);
    ctx.fillRect(member.x + 2, member.y - 14 + bob, 3, 3);
    ctx.fillStyle = '#ffb4c7';
    ctx.fillRect(member.x - 8, member.y - 9 + bob, 2, 2);
    ctx.fillRect(member.x + 6, member.y - 9 + bob, 2, 2);

    ctx.fillStyle = '#2b315d';
    ctx.fillRect(member.x - 5, member.y - 14 + bob, 3, 3);
    ctx.fillRect(member.x + 2, member.y - 14 + bob, 3, 3);

    if (isLead) {
      ctx.strokeStyle = '#ffe067';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(member.x, member.y - 24 + bob, 8, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  drawNpc(npc) {
    const ctx = this.ctx;
    const bob = Math.sin(this.elapsed * 5 + npc.x * 0.02) * 1.5;

    // soft ground shadow
    ctx.fillStyle = 'rgba(20, 24, 38, 0.3)';
    ctx.beginPath();
    ctx.ellipse(npc.x, npc.y + 20, 12, 4, 0, 0, Math.PI * 2);
    ctx.fill();

    // body cloak
    ctx.fillStyle = npc.color;
    ctx.fillRect(npc.x - 10, npc.y - 1 + bob, 20, 18);
    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    ctx.fillRect(npc.x - 8, npc.y + 2 + bob, 16, 3);

    // head
    ctx.fillStyle = '#ffe8d2';
    ctx.beginPath();
    ctx.arc(npc.x, npc.y - 11 + bob, 13, 0, Math.PI * 2);
    ctx.fill();

    // hair/hat accent
    ctx.fillStyle = '#5c567f';
    ctx.beginPath();
    ctx.arc(npc.x, npc.y - 14 + bob, 10, Math.PI, 0);
    ctx.fill();

    // face details
    ctx.fillStyle = '#2b315d';
    ctx.fillRect(npc.x - 4, npc.y - 14 + bob, 2, 2);
    ctx.fillRect(npc.x + 2, npc.y - 14 + bob, 2, 2);
    ctx.fillRect(npc.x - 1, npc.y - 9 + bob, 2, 1);
    ctx.fillStyle = '#ffb4c7';
    ctx.fillRect(npc.x - 7, npc.y - 10 + bob, 2, 2);
    ctx.fillRect(npc.x + 5, npc.y - 10 + bob, 2, 2);

    // quest marker sparkle
    if (npc.questId) {
      ctx.fillStyle = '#ffe37a';
      ctx.beginPath();
      ctx.arc(npc.x, npc.y - 29 + bob, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(npc.x - 1, npc.y - 37 + bob, 2, 16);
    }

    // name plate bubble for readability
    const nameW = Math.max(40, npc.name.length * 6.5);
    ctx.fillStyle = 'rgba(24, 28, 50, 0.72)';
    ctx.fillRect(npc.x - nameW / 2, npc.y - 42, nameW, 14);
    ctx.strokeStyle = 'rgba(163, 193, 255, 0.8)';
    ctx.lineWidth = 1;
    ctx.strokeRect(npc.x - nameW / 2, npc.y - 42, nameW, 14);
    ctx.fillStyle = '#f4f9ff';
    ctx.font = '11px sans-serif';
    ctx.fillText(npc.name, npc.x - nameW / 2 + 4, npc.y - 32);
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
      this.drawNpc(npc);
      ctx.fillStyle = npc.color;
      ctx.beginPath();
      ctx.arc(npc.x, npc.y, 16, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#222';
      ctx.fillText(npc.name, npc.x - 28, npc.y - 24);
    });

    this.enemies.forEach((e) => {
      ctx.fillStyle = 'rgba(10, 12, 22, 0.35)';
      ctx.beginPath();
      ctx.ellipse(e.x, e.y + e.radius + 5, e.radius * 0.8, 5, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = e.color;
      ctx.beginPath();
      ctx.arc(e.x, e.y, e.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      ctx.beginPath();
      ctx.arc(e.x - e.radius * 0.3, e.y - e.radius * 0.3, e.radius * 0.35, 0, Math.PI * 2);
      ctx.fill();

      // Face details for friendly/chibi readability
      ctx.fillStyle = '#1d2244';
      ctx.fillRect(e.x - 5, e.y - 3, 2, 2);
      ctx.fillRect(e.x + 3, e.y - 3, 2, 2);
      ctx.fillRect(e.x - 2, e.y + 2, 4, 2);

      ctx.fillStyle = '#112';
      const hpW = 34;
      ctx.fillRect(e.x - hpW / 2, e.y - e.radius - 14, hpW, 4);
      ctx.fillStyle = '#ff7b99';
      ctx.fillRect(e.x - hpW / 2, e.y - e.radius - 14, hpW * (e.hp / e.maxHp), 4);
    });

    this.party.members.forEach((m, idx) => this.drawCharacter(m, idx === this.party.activeIndex));

    this.combat.particles.forEach((p) => {
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x, p.y, 3, 3);
    });
    ctx.globalAlpha = 1;

    ctx.restore();

    this.drawOverlay();
  }

  drawOverlay() {
    const ctx = this.ctx;
    ctx.fillStyle = 'rgba(18,20,32,0.6)';
    ctx.fillRect(8, this.canvas.height - 122, 128, 112);
    ctx.fillStyle = '#fff';
    ctx.font = '12px sans-serif';
    ctx.fillText('Minimap', 12, this.canvas.height - 106);
    const scaleX = 116 / this.world.zone.width;
    const scaleY = 86 / this.world.zone.height;
    const mm = ctx.createLinearGradient(12, this.canvas.height - 100, 128, this.canvas.height - 14);
    mm.addColorStop(0, '#a5dcff');
    mm.addColorStop(1, '#79b7ff');
    ctx.fillStyle = mm;
    ctx.fillStyle = '#9ad3ff';
    ctx.fillRect(12, this.canvas.height - 100, 116, 86);
    ctx.fillStyle = '#ffea7b';
    ctx.fillRect(12 + this.party.active.x * scaleX - 2, this.canvas.height - 100 + this.party.active.y * scaleY - 2, 4, 4);

    ctx.fillStyle = '#fff';
    ctx.fillText(`${this.world.zone.name}`, 12, 20);
    ctx.fillText(`XP ${this.xp}/${this.levelXp}`, 12, 36);
    ctx.fillText(`Combo ${this.combat.comboCount}`, 12, 52);

    if (this.messages.length) {
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.fillRect(90, 8, this.canvas.width - 98, 24);
      ctx.fillStyle = '#fff';
      ctx.fillText(this.messages[0], 96, 24);
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
      party: {
        members: this.party.members,
        activeIndex: this.party.activeIndex,
      },
      inventory: this.inventory.serialize(),
      quests: this.questSystem.serialize(),
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
      state.party.members.forEach((saved, idx) => {
        const m = this.party.members[idx];
        if (!m) return;
        Object.assign(m, saved);
      });
      this.party.activeIndex = state.party.activeIndex || 0;
    }

    this.inventory.hydrate(state.inventory);
    this.questSystem.hydrate(state.quests);
    this.xp = state.xp || 0;
    this.levelXp = state.levelXp || 100;
    this.messages.unshift('Loaded local save.');
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
window.addEventListener('dblclick', () => game.tryTalk());
