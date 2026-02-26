const TILE = 48;

function rect(x, y, w, h) {
  return { x, y, w, h };
}

export const WORLD_DATA = {
  town: {
    name: 'Sprouton Town',
    width: 1700,
    height: 1700,
    colorA: '#7bd7ff',
    colorB: '#a8ecb8',
    blockers: [rect(220, 230, 200, 90), rect(720, 240, 260, 120), rect(1130, 320, 190, 170), rect(510, 830, 370, 140)],
    exits: [
      { x: 1470, y: 1450, w: 170, h: 170, to: 'meadow', spawn: { x: 180, y: 180 } },
      { x: 70, y: 1300, w: 160, h: 160, to: 'caverns', spawn: { x: 1520, y: 250 }, requiresArea: 'caverns', lockedMessage: 'The cavern gate is sealed. Mayor Puffle must approve access first.' },
      { x: 1320, y: 80, w: 180, h: 120, to: 'ruins', spawn: { x: 260, y: 1380 }, requiresArea: 'ruins', lockedMessage: 'The ruins bridge is under repair. Upgrade the guild hall.' },
      { x: 760, y: 20, w: 180, h: 120, to: 'dungeon', spawn: { x: 180, y: 180 } },
    ],
    npcs: [
      { id: 'mayor', name: 'Mayor Puffle', x: 900, y: 610, color: '#ffe189', questId: 'mayor_clearance', lines: ['Keep the town safe, hero-ish people!', 'Prove yourself and I\'ll unseal the cavern gate.'] },
      { id: 'chef', name: 'Chef Truffle', x: 390, y: 640, color: '#ffba8f', questId: 'chef_collect', lines: ['I need Slime Gel for jelly stew!', 'Bring me 3 and I\'ll open my kitchen shop.'] },
      { id: 'smith', name: 'Smith Bop', x: 1210, y: 900, color: '#cab5ff', questId: 'smith_delivery', lines: ['Could you deliver this Spark Coil to Mimi?', 'Do that and I\'ll open my forge stock.'] },
    ],
    enemySpawns: [],
  },
  meadow: {
    name: 'Sunny Meadow Frontier',
    width: 2000,
    height: 1800,
    colorA: '#8ee8a5',
    colorB: '#60c9ff',
    blockers: [rect(540, 420, 270, 220), rect(1080, 650, 230, 280), rect(280, 980, 340, 150), rect(1330, 1230, 310, 130), rect(1480, 420, 220, 240)],
    exits: [{ x: 10, y: 10, w: 120, h: 120, to: 'town', spawn: { x: 1370, y: 1380 } }],
    npcs: [{ id: 'scout', name: 'Scout Nib', x: 300, y: 220, color: '#ffd4f0', lines: ['The frontier has hidden cellar rifts. They change each run.'] }],
    enemySpawns: [{ type: 'slime', count: 7, level: 1 }, { type: 'bat', count: 4, level: 2 }, { type: 'mushroom', count: 4, level: 2 }],
  },
  caverns: {
    name: 'Giggle Caverns',
    width: 2100,
    height: 1800,
    colorA: '#5f7dff',
    colorB: '#b888ff',
    blockers: [rect(380, 400, 240, 260), rect(710, 980, 420, 140), rect(1190, 350, 300, 170), rect(1520, 900, 280, 230)],
    exits: [{ x: 1880, y: 40, w: 150, h: 150, to: 'town', spawn: { x: 200, y: 1340 } }],
    npcs: [],
    enemySpawns: [{ type: 'bat', count: 7, level: 3 }, { type: 'mushroom', count: 6, level: 3 }, { type: 'wraith', count: 4, level: 4 }, { type: 'boss', count: 1, level: 4 }],
  },
  ruins: {
    name: 'Whispering Ruins',
    width: 2200,
    height: 1800,
    colorA: '#87d4c7',
    colorB: '#8bb4ff',
    blockers: [rect(500, 260, 330, 140), rect(980, 520, 180, 330), rect(1340, 340, 260, 210), rect(260, 1000, 290, 230), rect(1480, 980, 420, 160)],
    exits: [{ x: 20, y: 1650, w: 160, h: 120, to: 'town', spawn: { x: 1300, y: 200 } }],
    npcs: [],
    enemySpawns: [{ type: 'slime', count: 4, level: 4 }, { type: 'sentinel', count: 7, level: 5 }, { type: 'wraith', count: 6, level: 5 }, { type: 'boss', count: 1, level: 6 }],
  },
};

export class World {
  constructor() {
    this.zoneId = 'town';
    this.camera = { x: 0, y: 0 };
    this.dynamicDungeon = null;
  }

  get zone() {
    if (this.zoneId === 'dungeon' && this.dynamicDungeon) return this.dynamicDungeon;
    return WORLD_DATA[this.zoneId];
  }

  setDynamicDungeon(zone) {
    this.dynamicDungeon = zone;
  }

  changeZone(id) {
    this.zoneId = id;
  }

  resolveCollision(x, y, radius) {
    const zone = this.zone;
    x = Math.max(radius, Math.min(zone.width - radius, x));
    y = Math.max(radius, Math.min(zone.height - radius, y));

    for (const b of zone.blockers) {
      const nearestX = Math.max(b.x, Math.min(x, b.x + b.w));
      const nearestY = Math.max(b.y, Math.min(y, b.y + b.h));
      const dx = x - nearestX;
      const dy = y - nearestY;
      if (dx * dx + dy * dy < radius * radius) {
        if (Math.abs(dx) > Math.abs(dy)) x = nearestX + Math.sign(dx || 1) * radius;
        else y = nearestY + Math.sign(dy || 1) * radius;
      }
    }

    return { x, y };
  }

  nearestNpc(x, y, range = 80) {
    let selected = null;
    let best = range;
    for (const npc of this.zone.npcs) {
      const d = Math.hypot(npc.x - x, npc.y - y);
      if (d < best) {
        best = d;
        selected = npc;
      }
    }
    return selected;
  }

  getExitAt(x, y) {
    return this.zone.exits.find((e) => x > e.x && x < e.x + e.w && y > e.y && y < e.y + e.h) || null;
  }

  drawParallax(ctx, zone) {
    const px = this.camera.x;
    const py = this.camera.y;
    for (let i = 0; i < 3; i += 1) {
      const speed = 0.14 + i * 0.09;
      const alpha = 0.1 + i * 0.07;
      ctx.fillStyle = i === 2 ? 'rgba(255,255,255,0.15)' : 'rgba(224,241,255,0.1)';
      for (let k = 0; k < 11; k += 1) {
        const x = ((k * 260 + (px * speed * (i + 1))) % (zone.width + 460)) - 220;
        const y = ((k * 190 + (py * speed * (i + 0.5))) % (zone.height + 320)) - 160;
        ctx.globalAlpha = alpha;
        ctx.beginPath();
        ctx.ellipse(x, y, 120 - i * 20, 45 - i * 8, i * 0.2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  draw(ctx) {
    const zone = this.zone;
    const g = ctx.createLinearGradient(0, 0, zone.width, zone.height);
    g.addColorStop(0, zone.colorA);
    g.addColorStop(1, zone.colorB);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, zone.width, zone.height);
    this.drawParallax(ctx, zone);

    ctx.globalAlpha = 0.1;
    ctx.fillStyle = '#ffffff';
    for (let y = 0; y < zone.height; y += TILE) {
      for (let x = 0; x < zone.width; x += TILE) {
        if ((x / TILE + y / TILE) % 2 === 0) ctx.fillRect(x, y, TILE, TILE);
      }
    }
    ctx.globalAlpha = 1;

    for (let i = 0; i < 75; i += 1) {
      const px = ((i * 173) % zone.width) + 12;
      const py = ((i * 223) % zone.height) + 12;
      const hue = zone.name.includes('Cavern') || zone.name.includes('Depth') ? '#9c8dff' : '#8fe39a';
      ctx.fillStyle = hue;
      ctx.beginPath();
      ctx.arc(px, py, 6 + (i % 4), 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.fillStyle = '#4e6485';
    zone.blockers.forEach((b) => {
      ctx.fillRect(b.x, b.y, b.w, b.h);
      ctx.fillStyle = '#2d3f58';
      ctx.fillRect(b.x + 8, b.y + 8, b.w - 16, b.h - 16);
      ctx.fillStyle = '#4e6485';
    });

    zone.exits.forEach((e) => {
      ctx.strokeStyle = '#ffe77f';
      ctx.lineWidth = 3;
      ctx.strokeRect(e.x, e.y, e.w, e.h);
    });
  }
}
