const EQUIPMENT_POOL = [
  { id: 'twig_blade', name: 'Twig Blade', slot: 'weapon', stats: { attack: 4 } },
  { id: 'cushion_armor', name: 'Cushion Armor', slot: 'armor', stats: { maxHp: 18, defense: 3 } },
  { id: 'comet_pin', name: 'Comet Pin', slot: 'charm', stats: { maxMana: 20 } },
];

export class InventorySystem {
  constructor() {
    this.gold = 40;
    this.items = new Map();
    this.equipmentBag = [...EQUIPMENT_POOL];
    this.addItem('Potion', 4);
  }

  addItem(name, count = 1) {
    this.items.set(name, (this.items.get(name) || 0) + count);
  }

  removeItem(name, count = 1) {
    const cur = this.items.get(name) || 0;
    if (cur < count) return false;
    this.items.set(name, cur - count);
    if (this.items.get(name) <= 0) this.items.delete(name);
    return true;
  }

  addLoot(dropName, gold) {
    this.addItem(dropName, 1);
    this.gold += gold;
    if (Math.random() < 0.17) this.equipmentBag.push({ ...EQUIPMENT_POOL[Math.floor(Math.random() * EQUIPMENT_POOL.length)] });
  }

  equip(member, itemId) {
    const idx = this.equipmentBag.findIndex((item) => item.id === itemId);
    if (idx === -1) return false;
    const item = this.equipmentBag[idx];
    const previous = member.equipment[item.slot];
    member.equipment[item.slot] = item;
    member.applyEquipmentBonuses();
    this.equipmentBag.splice(idx, 1);
    if (previous) this.equipmentBag.push(previous);
    return true;
  }

  serialize() {
    return {
      gold: this.gold,
      items: [...this.items.entries()],
      equipmentBag: this.equipmentBag,
    };
  }

  hydrate(data) {
    if (!data) return;
    this.gold = data.gold ?? this.gold;
    this.items = new Map(data.items || []);
    this.equipmentBag = data.equipmentBag || [];
  }
}
