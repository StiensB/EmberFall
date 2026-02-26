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
      saveBtn: document.getElementById('saveBtn'),
      closeMenu: document.getElementById('closeMenu'),
      menuBtnTop: document.getElementById('menuBtnTop'),
    };
    this.menuTab = 'inventory';
    this.bindButtons();
  }

  bindButtons() {
    this.elements.saveBtn.addEventListener('click', () => this.game.saveGame());
    this.elements.closeMenu.addEventListener('click', () => this.toggleMenu(false));
    this.elements.menuBtnTop?.addEventListener('click', () => this.toggleMenu());
    this.elements.dialogueNext.addEventListener('click', () => this.game.advanceDialogue?.());
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
    const { inventory, party, questSystem, world, progression, dungeon } = this.game;

    if (this.menuTab === 'inventory') {
      const items = [...inventory.items.entries()].map(([name, count]) => `<li>${name} x${count}</li>`).join('') || '<li>No consumables yet.</li>';
      const equipment = inventory.equipmentBag
        .map((e) => `<li><span style="color:${e.rarityColor || '#fff'}">${e.name} ${e.rarity ? `[${e.rarity}]` : ''}</span><br/><small>${Object.entries(e.stats).map(([k,v]) => `+${v} ${k}`).join(', ')} ${e.affixes?.length ? `| ${e.affixes.join(', ')}` : ''}</small><br/><button data-equip="${e.id}" class="ui-btn">Equip</button></li>`)
        .join('') || '<li>No gear found.</li>';
      this.elements.menuContent.innerHTML = `<h3>Bag</h3><ul>${items}</ul><h3>Gear</h3><ul>${equipment}</ul>`;
      this.elements.menuContent.querySelectorAll('[data-equip]').forEach((btn) => btn.addEventListener('click', () => { inventory.equip(party.active, btn.dataset.equip); this.game.rebuildStats(); this.renderMenu(); }));
    }

    if (this.menuTab === 'characters') {
      const talents = TALENT_TREES[party.active.className]
        .map((talent) => {
          const rank = progression.talents[party.active.name]?.[talent.id] || 0;
          return `<li><strong>${talent.name}</strong> ${rank}/${talent.maxRank}<br/><button class="ui-btn" data-talent="${talent.id}">Spend Point</button></li>`;
        })
        .join('');
      this.elements.menuContent.innerHTML = `<h3>${party.active.name} (${party.active.className})</h3><p>Talent Points: ${progression.talentPoints}</p><ul>${talents}</ul>`;
      this.elements.menuContent.querySelectorAll('[data-talent]').forEach((btn) => btn.addEventListener('click', () => { progression.spendTalent(party.active, btn.dataset.talent); this.game.rebuildStats(); this.renderMenu(); }));
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
      this.elements.menuContent.querySelectorAll('[data-upgrade]').forEach((btn) => btn.addEventListener('click', () => { progression.buyTownUpgrade(btn.dataset.upgrade, inventory); if (btn.dataset.upgrade === 'guildhall' && progression.town.guildhall >= 2) questSystem.unlockedAreas.add('ruins'); this.renderMenu(); }));
    }
  }
}
