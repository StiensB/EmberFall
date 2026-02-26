const VERT_SRC = `
attribute vec2 aPos;
varying vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

const FRAG_SRC = `
precision mediump float;
varying vec2 vUv;
uniform sampler2D uScene;
uniform sampler2D uNormal;
uniform vec2 uResolution;
uniform vec2 uCamera;
uniform float uTime;
uniform float uZoom;
uniform float uCombatBoost;

vec3 parallax(vec2 uv, float depth) {
  vec2 wobble = vec2(sin((uv.y + uTime * 0.02) * 13.0), cos((uv.x + uTime * 0.015) * 9.0));
  vec2 p = uv + wobble * 0.01 * depth + uCamera * (0.00008 * depth);
  float clouds = smoothstep(0.25, 0.85, sin((p.x * 7.0) + (p.y * 4.0) + uTime * (0.03 + depth * 0.01)) * 0.5 + 0.5);
  vec3 cA = mix(vec3(0.11, 0.16, 0.33), vec3(0.21, 0.35, 0.62), depth);
  vec3 cB = mix(vec3(0.38, 0.24, 0.52), vec3(0.52, 0.72, 0.98), depth);
  return mix(cA, cB, clouds);
}

void main() {
  vec2 texel = 1.0 / uResolution;
  vec4 scene = texture2D(uScene, vUv);
  vec3 n = texture2D(uNormal, vUv).xyz * 2.0 - 1.0;

  vec2 lpos = vec2(0.5 + sin(uTime * 0.5) * 0.12, 0.34 + cos(uTime * 0.4) * 0.08);
  vec3 lightDir = normalize(vec3(lpos - vUv, 0.56));
  float diff = max(dot(normalize(n), lightDir), 0.0);
  float ambient = 0.37;

  vec4 b0 = texture2D(uScene, vUv + vec2(texel.x, 0.0));
  vec4 b1 = texture2D(uScene, vUv + vec2(-texel.x, 0.0));
  vec4 b2 = texture2D(uScene, vUv + vec2(0.0, texel.y));
  vec4 b3 = texture2D(uScene, vUv + vec2(0.0, -texel.y));
  vec3 bloom = max(max(b0.rgb, b1.rgb), max(b2.rgb, b3.rgb));
  bloom = max(vec3(0.0), bloom - 0.72) * 1.7;

  vec3 backdrop = parallax(vUv, 0.35) * 0.45 + parallax(vUv, 0.75) * 0.3 + parallax(vUv, 1.0) * 0.25;
  vec3 litScene = scene.rgb * (ambient + diff * 0.88);
  float sceneMask = max(max(scene.r, scene.g), scene.b);
  float scenePresence = smoothstep(0.01, 0.08, sceneMask);
  vec3 color = mix(backdrop * 0.45, litScene, scenePresence);
  color += backdrop * 0.18;
  color += bloom * (0.22 + uCombatBoost * 0.18);

  float vignette = smoothstep(0.95, 0.2, distance(vUv, vec2(0.5)));
  color *= vignette;

  gl_FragColor = vec4(color, 1.0);
}`;

function shader(gl, type, source) {
  const s = gl.createShader(type);
  gl.shaderSource(s, source);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) return null;
  return s;
}

export class HDRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.dpr = window.devicePixelRatio || 1;
    this.scaleFactor = 2;
    this.sceneCanvas = document.createElement('canvas');
    this.normalCanvas = document.createElement('canvas');
    this.sceneCtx = this.sceneCanvas.getContext('2d');
    this.normalCtx = this.normalCanvas.getContext('2d');
    this.gl = canvas.getContext('webgl', { alpha: false, antialias: true, powerPreference: 'high-performance' });
    this.webglEnabled = Boolean(this.gl);

    if (this.webglEnabled) {
      const ok = this.setupWebGL();
      this.webglEnabled = Boolean(ok);
    }
  }

  setupWebGL() {
    const gl = this.gl;
    const vert = shader(gl, gl.VERTEX_SHADER, VERT_SRC);
    const frag = shader(gl, gl.FRAGMENT_SHADER, FRAG_SRC);
    if (!vert || !frag) return false;

    const program = gl.createProgram();
    gl.attachShader(program, vert);
    gl.attachShader(program, frag);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return false;

    this.program = program;
    gl.useProgram(program);

    const quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);

    const aPos = gl.getAttribLocation(program, 'aPos');
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    this.sceneTex = gl.createTexture();
    this.normalTex = gl.createTexture();
    [this.sceneTex, this.normalTex].forEach((tex) => {
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    });

    gl.uniform1i(gl.getUniformLocation(program, 'uScene'), 0);
    gl.uniform1i(gl.getUniformLocation(program, 'uNormal'), 1);

    this.uniforms = {
      resolution: gl.getUniformLocation(program, 'uResolution'),
      camera: gl.getUniformLocation(program, 'uCamera'),
      time: gl.getUniformLocation(program, 'uTime'),
      zoom: gl.getUniformLocation(program, 'uZoom'),
      combatBoost: gl.getUniformLocation(program, 'uCombatBoost'),
    };
    return true;
  }

  resize(cssWidth, cssHeight) {
    this.dpr = window.devicePixelRatio || 1;
    this.canvas.width = Math.floor(cssWidth * this.dpr);
    this.canvas.height = Math.floor(cssHeight * this.dpr);
    this.canvas.style.width = `${cssWidth}px`;
    this.canvas.style.height = `${cssHeight}px`;

    const internalW = Math.floor(cssWidth * this.scaleFactor);
    const internalH = Math.floor(cssHeight * this.scaleFactor);
    this.sceneCanvas.width = internalW;
    this.sceneCanvas.height = internalH;
    this.normalCanvas.width = internalW;
    this.normalCanvas.height = internalH;

    if (this.webglEnabled) {
      this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    }
  }

  beginFrame() {
    this.sceneCtx.setTransform(1, 0, 0, 1, 0, 0);
    this.sceneCtx.clearRect(0, 0, this.sceneCanvas.width, this.sceneCanvas.height);
    this.normalCtx.setTransform(1, 0, 0, 1, 0, 0);
    this.normalCtx.fillStyle = 'rgb(128,128,255)';
    this.normalCtx.fillRect(0, 0, this.normalCanvas.width, this.normalCanvas.height);
    return { sceneCtx: this.sceneCtx, normalCtx: this.normalCtx, scale: this.scaleFactor };
  }

  drawNormalDisc(x, y, r, intensity = 0.9) {
    const g = this.normalCtx.createRadialGradient(x - r * 0.2, y - r * 0.3, 1, x, y, r);
    g.addColorStop(0, `rgba(${128 + Math.floor(80 * intensity)}, ${128 - Math.floor(70 * intensity)}, 255, 1)`);
    g.addColorStop(1, 'rgba(128,128,255,1)');
    this.normalCtx.fillStyle = g;
    this.normalCtx.beginPath();
    this.normalCtx.arc(x, y, r, 0, Math.PI * 2);
    this.normalCtx.fill();
  }

  compose({ camera, time, combatBoost, zoom }) {
    if (!this.webglEnabled) {
      const ctx = this.canvas.getContext('2d');
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      ctx.drawImage(this.sceneCanvas, 0, 0, this.sceneCanvas.width / this.scaleFactor, this.sceneCanvas.height / this.scaleFactor);
      return;
    }

    const gl = this.gl;
    gl.useProgram(this.program);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.sceneTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.sceneCanvas);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.normalTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.normalCanvas);

    gl.uniform2f(this.uniforms.resolution, this.sceneCanvas.width, this.sceneCanvas.height);
    gl.uniform2f(this.uniforms.camera, camera.x, camera.y);
    gl.uniform1f(this.uniforms.time, time);
    gl.uniform1f(this.uniforms.zoom, zoom);
    gl.uniform1f(this.uniforms.combatBoost, combatBoost);

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
}
