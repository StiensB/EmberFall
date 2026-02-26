import { rollLoot } from './loot.js';

const EQUIPMENT_POOL = [
  { id: 'twig_blade', name: 'Twig Blade', slot: 'weapon', stats: { attack: 4 } },
  { id: 'cushion_armor', name: 'Cushion Armor', slot: 'armor', stats: { maxHp: 18, defense: 3 } },
  { id: 'comet_pin', name: 'Comet Pin', slot: 'charm', stats: { maxMana: 20 } },
];

const SHOP_STOCK = {
  chef: [
    { id: 'potion', name: 'Potion', price: 12, type: 'consumable', itemName: 'Potion', count: 1 },
    { id: 'mega_potion', name: 'Mega Potion', price: 28, type: 'consumable', itemName: 'Potion', count: 3 },
    { id: 'comet_pin', name: 'Comet Pin', price: 90, type: 'equipment', template: { id: 'comet_pin', name: 'Comet Pin', slot: 'charm', stats: { maxMana: 20 } } },
  ],
  smith: [
    { id: 'twig_blade', name: 'Twig Blade', price: 80, type: 'equipment', template: { id: 'twig_blade', name: 'Twig Blade', slot: 'weapon', stats: { attack: 4 } } },
    { id: 'cushion_armor', name: 'Cushion Armor', price: 85, type: 'equipment', template: { id: 'cushion_armor', name: 'Cushion Armor', slot: 'armor', stats: { maxHp: 18, defense: 3 } } },
    { id: 'smith_tonic', name: 'Smith Tonic', price: 20, type: 'consumable', itemName: 'Potion', count: 2 },
  ],
};

function createPurchasedEquipment(template) {
  return {
    ...template,
    id: `${template.id}_shop_${Date.now()}_${Math.floor(Math.random() * 9999)}`,
  };
}

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

  addLoot(dropName, gold, enemyLevel = 1) {
    this.addItem(dropName, 1);
    this.gold += gold;
    if (Math.random() < 0.22) {
      const base = EQUIPMENT_POOL[Math.floor(Math.random() * EQUIPMENT_POOL.length)];
      const loot = rollLoot({ ...base, id: `${base.id}_${Date.now()}_${Math.floor(Math.random() * 999)}` }, enemyLevel);
      this.equipmentBag.push(loot);
    }
  }

  equip(member, itemId) {
    const idx = this.equipmentBag.findIndex((item) => item.id === itemId);
    if (idx === -1) return false;
    const item = this.equipmentBag[idx];
    if (!item.slot) return false;
    const previous = member.equipment[item.slot];
    member.equipment[item.slot] = item;
    member.applyEquipmentBonuses();
    this.equipmentBag.splice(idx, 1);
    if (previous) this.equipmentBag.push(previous);
    return true;
  }

  getShopStock(shopId) {
    return SHOP_STOCK[shopId] || [];
  }

  buyFromShop(shopId, stockId) {
    const stock = this.getShopStock(shopId);
    const product = stock.find((item) => item.id === stockId);
    if (!product) return { ok: false, reason: 'missing' };
    if (this.gold < product.price) return { ok: false, reason: 'gold' };

    this.gold -= product.price;
    if (product.type === 'consumable') {
      this.addItem(product.itemName, product.count || 1);
      return { ok: true, bought: product.name };
    }
    if (product.type === 'equipment') {
      this.equipmentBag.push(createPurchasedEquipment(product.template));
      return { ok: true, bought: product.name };
    }
    return { ok: false, reason: 'invalid' };
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
