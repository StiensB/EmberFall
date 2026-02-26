import { QuestSystem } from './questSystem.js';
import { TALENT_TREES, TOWN_UPGRADES } from './progression.js';

export class UIController {
  constructor(game) {
    this.game = game;
    this.elements = {
      partyBars: document.getElementById('partyBars'),
      questTracker: document.getElementById('questTracker'),
      menu: document.getElementById('menu'),
      menuContent: document.getElementById('menuContent'),
      dialogueBox: document.getElementById('dialogueBox'),
      dialogueText: document.getElementById('dialogueText'),
      dialogueNext: document.getElementById('dialogueNext'),
      npcTalkPrompt: document.getElementById('npcTalkPrompt'),
      npcTalkPromptText: document.getElementById('npcTalkPromptText'),
      npcTalkBtn: document.getElementById('npcTalkBtn'),
      npcShopBtn: document.getElementById('npcShopBtn'),
      saveBtn: document.getElementById('saveBtn'),
      closeMenu: document.getElementById('closeMenu'),
      menuBtnTop: document.getElementById('menuBtnTop'),
      gameOverScreen: document.getElementById('gameOverScreen'),
      gameOverBtn: document.getElementById('gameOverBtn'),
    };
    this.menuTab = 'inventory';
    this.menuCharacterIndex = this.game.party.activeIndex;
    this.bindButtons();
  }

  get selectedCharacter() {
    return this.game.party.members[this.menuCharacterIndex] || this.game.party.active;
  }

  bindButtons() {
    this.elements.saveBtn.addEventListener('click', () => this.game.saveGame());
    this.elements.closeMenu.addEventListener('click', () => this.toggleMenu(false));
    this.elements.menuBtnTop?.addEventListener('click', () => this.toggleMenu());
    this.elements.dialogueNext.addEventListener('click', () => this.game.advanceDialogue?.());
    this.elements.npcTalkBtn?.addEventListener('click', () => this.game.tryTalk?.());
    this.elements.npcShopBtn?.addEventListener('click', () => this.game.tryOpenNearbyShop?.());
    this.elements.gameOverBtn?.addEventListener('click', () => this.game.restartFromTown?.());
    document.querySelectorAll('.tab-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.menuTab = btn.dataset.tab;
        document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        this.renderMenu();
      });
    });
  }

  toggleMenu(open = null) {
    const shouldOpen = open ?? this.elements.menu.classList.contains('hidden');
    this.elements.menu.classList.toggle('hidden', !shouldOpen);
    if (shouldOpen) this.renderMenu();
  }

  setDialogue(text, open = true) {
    this.elements.dialogueText.textContent = text;
    this.elements.dialogueBox.classList.toggle('hidden', !open);
    if (open) this.setNpcTalkPrompt(null);
  }

  setNpcTalkPrompt(npc = null, canOpenShop = false) {
    const hasDialogue = !this.elements.dialogueBox.classList.contains('hidden');
    const canTalk = !!npc && !hasDialogue;
    this.elements.npcTalkPrompt.classList.toggle('hidden', !canTalk);
    if (!canTalk) return;
    this.elements.npcTalkPromptText.textContent = `${npc.name} is nearby`;
    this.elements.npcShopBtn?.classList.toggle('hidden', !canOpenShop);
  }

  showGameOver() {
    this.elements.gameOverScreen?.classList.remove('hidden');
    this.setDialogue('', false);
    this.setNpcTalkPrompt(null);
  }

  hideGameOver() {
    this.elements.gameOverScreen?.classList.add('hidden');
  }

  openShop(shopName) {
    this.toggleMenu(true);
    this.menuTab = 'inventory';
    this.renderMenu();
    this.game.messages.unshift(`${shopName}'s wares are listed in your ledger inventory.`);
  }

  renderCharacterSelector() {
    const { party } = this.game;
    return `<div class="character-selector">${party.members
      .map((member, idx) => `<button class="ui-btn ${idx === this.menuCharacterIndex ? 'active-select' : ''}" data-select-char="${idx}">${member.name}</button>`)
      .join('')}</div>`;
  }

  bindCharacterSelector() {
    this.elements.menuContent.querySelectorAll('[data-select-char]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.menuCharacterIndex = Number(btn.dataset.selectChar);
        this.renderMenu();
      });
    });
  }

  renderHud() {
    const { party, inventory, questSystem, progression, dungeon } = this.game;
    this.elements.partyBars.innerHTML = party.members
      .map((m, idx) => {
        const hpPct = (m.hp / m.stats.maxHp) * 100;
        const mpPct = (m.mana / m.stats.maxMana) * 100;
        return `<article class="bar-card" style="outline:${idx === party.activeIndex ? '2px solid #ffbf5f' : 'none'}"><div>${m.name} Lv.${m.level}</div><div class="bar hp"><span style="width:${Math.max(0, hpPct)}%"></span></div><div class="bar mp"><span style="width:${Math.max(0, mpPct)}%"></span></div></article>`;
      })
      .join('');

    const lines = questSystem.trackerText().slice(0, 2).join('<br/>') || 'No active quests';
    const mods = dungeon.currentRun?.modifiers?.map((m) => m.name).join(', ') || 'None';
    this.elements.questTracker.innerHTML = `<strong>Gold</strong>: ${inventory.gold}<br/><strong>Talent Pts</strong>: ${progression.talentPoints}<br/><strong>Dungeon Rank</strong>: ${progression.dungeonRank}<br/><strong>Modifiers</strong>: ${mods}<br/><strong>Tasks</strong><br/>${lines}`;
    if (!this.elements.menu.classList.contains('hidden')) this.renderMenu();
  }

  renderMenu() {
    const { inventory, questSystem, world, progression, dungeon } = this.game;
    const member = this.selectedCharacter;

    if (this.menuTab === 'inventory') {
      const items = [...inventory.items.entries()].map(([name, count]) => `<li>${name} x${count}</li>`).join('') || '<li>No consumables yet.</li>';
      const equipment = inventory.equipmentBag
        .map((e) => `<li><span style="color:${e.rarityColor || '#fff'}">${e.name} ${e.rarity ? `[${e.rarity}]` : ''}</span><br/><small>${Object.entries(e.stats).map(([k, v]) => `+${v} ${k}`).join(', ')} ${e.affixes?.length ? `| ${e.affixes.join(', ')}` : ''}</small><br/><button data-equip="${e.id}" class="ui-btn">Equip to ${member.name}</button></li>`)
        .join('') || '<li>No gear found.</li>';
      this.elements.menuContent.innerHTML = `${this.renderCharacterSelector()}<h3>Bag</h3><ul>${items}</ul><h3>${member.name} Loadout</h3><p>Damage: ${member.stats.attack} • Armor: ${member.stats.defense}</p><ul>${equipment}</ul>`;
      this.bindCharacterSelector();
      this.elements.menuContent.querySelectorAll('[data-equip]').forEach((btn) => btn.addEventListener('click', () => {
        inventory.equip(member, btn.dataset.equip);
        this.game.rebuildStats();
        this.renderMenu();
      }));
    }

    if (this.menuTab === 'characters') {
      const talents = TALENT_TREES[member.className]
        .map((talent) => {
          const rank = progression.talents[member.name]?.[talent.id] || 0;
          return `<li><strong>${talent.name}</strong> ${rank}/${talent.maxRank}<br/><button class="ui-btn" data-talent="${talent.id}">Spend Point</button></li>`;
        })
        .join('');
      this.elements.menuContent.innerHTML = `${this.renderCharacterSelector()}<h3>${member.name} (${member.className})</h3><p>Talent Points: ${progression.talentPoints}</p><p>Damage: ${member.stats.attack} • Armor: ${member.stats.defense}</p><ul>${talents}</ul>`;
      this.bindCharacterSelector();
      this.elements.menuContent.querySelectorAll('[data-talent]').forEach((btn) => btn.addEventListener('click', () => {
        progression.spendTalent(member, btn.dataset.talent);
        this.game.rebuildStats();
        this.renderMenu();
      }));
    }

    if (this.menuTab === 'quests') {
      const active = [...questSystem.active.values()].map((state) => {
        const q = QuestSystem.QUESTS[state.id];
        return `<li><strong>${q.title}</strong> (${state.progress}/${q.count})<br/>${q.description}</li>`;
      }).join('') || '<li>No active quests.</li>';
      this.elements.menuContent.innerHTML = `<h3>Active Quests</h3><ul>${active}</ul>`;
    }

    if (this.menuTab === 'map') {
      const upgrades = Object.values(TOWN_UPGRADES).map((upgrade) => {
        const rank = progression.town[upgrade.id];
        return `<li>${upgrade.name}: ${rank}/${upgrade.maxRank} <button class="ui-btn" data-upgrade="${upgrade.id}">Upgrade (${progression.getUpgradeCost(upgrade.id)}g)</button></li>`;
      }).join('');
      const modifiers = dungeon.currentRun?.modifiers?.map((m) => `<li>${m.name}: ${m.description}</li>`).join('') || '<li>No active dungeon run.</li>';
      this.elements.menuContent.innerHTML = `<h3>Region: ${world.zone.name}</h3><p>Multi-region loop: Meadow, Caverns, Ruins + procedural dungeons.</p><h4>Town Upgrades</h4><ul>${upgrades}</ul><h4>Current Dungeon Modifiers</h4><ul>${modifiers}</ul>`;
      this.elements.menuContent.querySelectorAll('[data-upgrade]').forEach((btn) => btn.addEventListener('click', () => {
        progression.buyTownUpgrade(btn.dataset.upgrade, inventory);
        if (btn.dataset.upgrade === 'guildhall' && progression.town.guildhall >= 2) questSystem.unlockedAreas.add('ruins');
        this.renderMenu();
      }));
    }
  }
}
