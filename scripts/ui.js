import { QuestSystem } from './questSystem.js';

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
    };
    this.menuTab = 'inventory';
    this.bindButtons();
  }

  bindButtons() {
    this.elements.saveBtn.addEventListener('click', () => this.game.saveGame());
    this.elements.closeMenu.addEventListener('click', () => this.toggleMenu(false));
    this.elements.dialogueNext.addEventListener('click', () => this.game.advanceDialogue());

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

  setDialogue(text, isOpen) {
    this.elements.dialogueText.textContent = text;
    this.elements.dialogueBox.classList.toggle('hidden', !isOpen);
  }

  renderHud() {
    const { party, inventory, questSystem } = this.game;
    this.elements.partyBars.innerHTML = party.members
      .map((m, idx) => {
        const hpPct = (m.hp / m.stats.maxHp) * 100;
        const mpPct = (m.mana / m.stats.maxMana) * 100;
        return `<article class="bar-card" style="outline:${idx === party.activeIndex ? '2px solid #ffbf5f' : 'none'}">
          <div>${m.name} (${m.className}) Lv.${m.level}</div>
          <div class="bar hp"><span style="width:${Math.max(0, hpPct)}%"></span></div>
          <div class="bar mp"><span style="width:${Math.max(0, mpPct)}%"></span></div>
        </article>`;
      })
      .join('');

    const lines = questSystem.trackerText().slice(0, 3).join('<br/>') || 'No active quests';
    this.elements.questTracker.innerHTML = `<strong>Gold:</strong> ${inventory.gold}<br/><strong>Quest:</strong><br/>${lines}`;
    if (!this.elements.menu.classList.contains('hidden')) this.renderMenu();
  }

  renderMenu() {
    const { inventory, party, questSystem, world } = this.game;

    if (this.menuTab === 'inventory') {
      const items = [...inventory.items.entries()].map(([name, count]) => `<li>${name} x${count}</li>`).join('') || '<li>No consumables yet.</li>';
      const equipment = inventory.equipmentBag
        .map((e) => `<li>${e.name} <button data-equip="${e.id}" class="ui-btn">Equip to Active</button></li>`)
        .join('') || '<li>No gear found.</li>';
      this.elements.menuContent.innerHTML = `<h3>Bag</h3><ul>${items}</ul><h3>Gear</h3><ul>${equipment}</ul>`;
      this.elements.menuContent.querySelectorAll('[data-equip]').forEach((btn) => {
        btn.addEventListener('click', () => inventory.equip(party.active, btn.dataset.equip));
      });
    }

    if (this.menuTab === 'characters') {
      this.elements.menuContent.innerHTML = party.members
        .map((m) => `<article><h3>${m.name} - ${m.className}</h3>
          <p>${m.passive}</p>
          <p>HP ${Math.round(m.hp)}/${m.stats.maxHp}, MP ${Math.round(m.mana)}/${m.stats.maxMana}</p>
          <p>ATK ${m.stats.attack}, DEF ${m.stats.defense}, SPD ${m.stats.speed}</p>
          <p>Skills: ${m.skills.join(', ')}</p></article>`)
        .join('');

      this.elements.menuContent.innerHTML += '<button id="deliverBtn" class="ui-btn">Deliver Spark Coil to Mimi</button>';
      this.elements.menuContent.querySelector('#deliverBtn')?.addEventListener('click', () => {
        if (!questSystem.deliveryDone) {
          questSystem.completeDelivery();
          this.game.messages.push('Delivery done! Return for reward.');
        }
      });
    }

    if (this.menuTab === 'quests') {
      const active = [...questSystem.active.values()]
        .map((state) => {
          const q = QuestSystem.QUESTS[state.id];
          return `<li><strong>${q.title}</strong> (${state.progress}/${q.count})<br/>${q.description}</li>`;
        })
        .join('') || '<li>No active quests.</li>';
      this.elements.menuContent.innerHTML = `<h3>Active Quests</h3><ul>${active}</ul>`;
    }

    if (this.menuTab === 'map') {
      this.elements.menuContent.innerHTML = `<h3>Region</h3><p>${world.zone.name}</p><p>Use glowing rectangles for zone exits.</p><p>Boss waits in Giggle Cavern.</p>`;
    }
  }
}
