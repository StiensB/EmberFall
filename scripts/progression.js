const TALENT_TREES = {
  Warrior: [
    { id: 'war_vanguard', name: 'Vanguard', maxRank: 3, bonus: { defense: 2, maxHp: 10 } },
    { id: 'war_cleave', name: 'Cleave', maxRank: 3, bonus: { attack: 2 } },
  ],
  Mage: [
    { id: 'mag_focus', name: 'Arcane Focus', maxRank: 3, bonus: { maxMana: 14 } },
    { id: 'mag_overload', name: 'Overload', maxRank: 3, bonus: { attack: 3 } },
  ],
  Ranger: [
    { id: 'ran_scout', name: 'Scoutstep', maxRank: 3, bonus: { speed: 4 } },
    { id: 'ran_venom', name: 'Venomcraft', maxRank: 3, bonus: { attack: 2 } },
  ],
};

const TOWN_UPGRADES = {
  forge: { id: 'forge', name: 'Forge Level', maxRank: 5, baseCost: 120 },
  apothecary: { id: 'apothecary', name: 'Apothecary', maxRank: 5, baseCost: 100 },
  guildhall: { id: 'guildhall', name: 'Guild Hall', maxRank: 5, baseCost: 150 },
};

export class ProgressionSystem {
  constructor() {
    this.talentPoints = 0;
    this.talents = {};
    this.statPoints = {};
    this.town = { forge: 0, apothecary: 0, guildhall: 0 };
    this.dungeonRank = 1;
  }

  grantTalentPoint() {
    this.talentPoints += 1;
  }

  spendTalent(member, talentId) {
    const tree = TALENT_TREES[member.className] || [];
    const talent = tree.find((entry) => entry.id === talentId);
    if (!talent || this.talentPoints <= 0) return false;

    const memberTalents = (this.talents[member.name] ||= {});
    const rank = memberTalents[talentId] || 0;
    if (rank >= talent.maxRank) return false;
    memberTalents[talentId] = rank + 1;
    this.talentPoints -= 1;
    return true;
  }

  applyTalents(member) {
    const tree = TALENT_TREES[member.className] || [];
    const memberTalents = this.talents[member.name] || {};
    tree.forEach((talent) => {
      const rank = memberTalents[talent.id] || 0;
      Object.entries(talent.bonus).forEach(([stat, value]) => {
        member.stats[stat] = (member.stats[stat] || 0) + value * rank;
      });
    });

    const permanentStats = this.statPoints[member.name] || {};
    member.stats.attack += permanentStats.attack || 0;
    member.stats.defense += permanentStats.defense || 0;
    member.stats.speed += (permanentStats.speed || 0) * 2;
    member.stats.maxHp += (permanentStats.maxHp || 0) * 12;
    member.stats.maxMana += (permanentStats.maxMana || 0) * 10;
  }

  spendAttributePoint(member, stat) {
    if (this.talentPoints <= 0) return false;
    const allowed = ['attack', 'defense', 'speed', 'maxHp', 'maxMana'];
    if (!allowed.includes(stat)) return false;
    const ledger = (this.statPoints[member.name] ||= {});
    ledger[stat] = (ledger[stat] || 0) + 1;
    this.talentPoints -= 1;
    return true;
  }

  getUpgradeCost(upgradeId) {
    const upgrade = TOWN_UPGRADES[upgradeId];
    if (!upgrade) return Number.MAX_SAFE_INTEGER;
    const rank = this.town[upgradeId] || 0;
    return Math.round(upgrade.baseCost * (1 + rank * 0.75));
  }

  buyTownUpgrade(upgradeId, inventory) {
    const upgrade = TOWN_UPGRADES[upgradeId];
    if (!upgrade) return false;
    const rank = this.town[upgradeId] || 0;
    if (rank >= upgrade.maxRank) return false;
    const cost = this.getUpgradeCost(upgradeId);
    if (inventory.gold < cost) return false;
    inventory.gold -= cost;
    this.town[upgradeId] = rank + 1;
    if (upgradeId === 'guildhall') this.dungeonRank += 1;
    return true;
  }

  serialize() {
    return {
      talentPoints: this.talentPoints,
      talents: this.talents,
      statPoints: this.statPoints,
      town: this.town,
      dungeonRank: this.dungeonRank,
    };
  }

  hydrate(data) {
    if (!data) return;
    this.talentPoints = data.talentPoints || 0;
    this.talents = data.talents || {};
    this.statPoints = data.statPoints || {};
    this.town = { ...this.town, ...(data.town || {}) };
    this.dungeonRank = data.dungeonRank || 1;
  }
}

export { TALENT_TREES, TOWN_UPGRADES };
