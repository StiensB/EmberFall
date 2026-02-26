function installRoundRectPolyfill() {
  const proto = window.CanvasRenderingContext2D?.prototype;
  if (!proto || typeof proto.roundRect === 'function') return;

  proto.roundRect = function roundRect(x, y, width, height, radii = 0) {
    const radiusValue = Array.isArray(radii)
      ? (radii[0] ?? 0)
      : (typeof radii === 'number' ? radii : Number(radii) || 0);
    const radius = Math.max(0, Math.min(Math.abs(radiusValue), Math.abs(width) / 2, Math.abs(height) / 2));

    this.moveTo(x + radius, y);
    this.lineTo(x + width - radius, y);
    this.arcTo(x + width, y, x + width, y + radius, radius);
    this.lineTo(x + width, y + height - radius);
    this.arcTo(x + width, y + height, x + width - radius, y + height, radius);
    this.lineTo(x + radius, y + height);
    this.arcTo(x, y + height, x, y + height - radius, radius);
    this.lineTo(x, y + radius);
    this.arcTo(x, y, x + radius, y, radius);

    return this;
  };
}

installRoundRectPolyfill();
