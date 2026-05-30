/* ============================================================
   NEON RUSH — Endless Runner
   Complete game engine in vanilla JS + Canvas API
   ============================================================ */

'use strict';

// ─────────────────────────────────────────────
//  CONSTANTS
// ─────────────────────────────────────────────
const LANES      = 3;
const BASE_SPEED = 6;
const LANE_WIDTH_RATIO = 0.22; // fraction of canvas width per lane
const PLAYER_Y_RATIO   = 0.65; // player vertical position ratio
const JUMP_HEIGHT   = 160;
const JUMP_DURATION = 500;   // ms
const SLIDE_DURATION = 600; // ms
const COIN_RADIUS   = 12;
const OBSTACLE_POOL_SIZE = 20;
const COIN_POOL_SIZE     = 40;
const POWERUP_POOL_SIZE  = 6;
const PARTICLE_POOL_SIZE = 120;
const DAY_CYCLE = 30000; // ms for full day→night cycle

// ─────────────────────────────────────────────
//  UTILITIES
// ─────────────────────────────────────────────
const rand = (min, max) => Math.random() * (max - min) + min;
const randInt = (min, max) => Math.floor(rand(min, max + 1));
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const lerp  = (a, b, t)   => a + (b - a) * t;

function hexToRgb(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return { r, g, b };
}

// ─────────────────────────────────────────────
//  AUDIO MANAGER
// ─────────────────────────────────────────────
class AudioManager {
  constructor() {
    this.ctx     = null;
    this.enabled = true;
    this.musicOn = true;
    this.musicNode = null;
    this._init();
  }

  _init() {
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    } catch(e) { this.enabled = false; }
  }

  _resume() {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }

  _beep(freq, dur, vol = 0.3, type = 'sine', fadeOut = true) {
    if (!this.enabled || !this.ctx) return;
    this._resume();
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.connect(g); g.connect(this.ctx.destination);
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(vol, this.ctx.currentTime);
    if (fadeOut) g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + dur);
    o.start(); o.stop(this.ctx.currentTime + dur);
  }

  playCoin()     { this._beep(880, 0.12, 0.25, 'sine'); setTimeout(() => this._beep(1100, 0.1, 0.2, 'sine'), 60); }
  playJump()     { if (!this.enabled || !this.ctx) return; this._resume(); const o = this.ctx.createOscillator(); const g = this.ctx.createGain(); o.connect(g); g.connect(this.ctx.destination); o.type = 'sawtooth'; o.frequency.setValueAtTime(300, this.ctx.currentTime); o.frequency.exponentialRampToValueAtTime(600, this.ctx.currentTime + 0.15); g.gain.setValueAtTime(0.15, this.ctx.currentTime); g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.2); o.start(); o.stop(this.ctx.currentTime + 0.25); }
  playCollision(){ this._beep(80, 0.4, 0.4, 'square', true); this._beep(60, 0.3, 0.3, 'sawtooth', true); }
  playPowerUp()  { [440,550,660,880].forEach((f,i) => setTimeout(() => this._beep(f, 0.15, 0.2, 'sine'), i * 70)); }
  playGameOver() { [300,250,200,150].forEach((f,i) => setTimeout(() => this._beep(f, 0.3, 0.3, 'square'), i * 120)); }

  startBGM() {
    if (!this.enabled || !this.ctx || !this.musicOn) return;
    this.stopBGM();
    this._resume();
    // Simple procedural beat using noise + oscillators
    const schedule = () => {
      if (!this.musicOn || !this.enabled) return;
      const t = this.ctx.currentTime;
      const bpm = 128;
      const beat = 60 / bpm;
      for (let i = 0; i < 8; i++) {
        // kick
        const kick = this.ctx.createOscillator();
        const kg = this.ctx.createGain();
        kick.connect(kg); kg.connect(this.ctx.destination);
        kick.type = 'sine';
        kick.frequency.setValueAtTime(150, t + i * beat);
        kick.frequency.exponentialRampToValueAtTime(0.01, t + i * beat + 0.25);
        kg.gain.setValueAtTime(0.18, t + i * beat);
        kg.gain.exponentialRampToValueAtTime(0.001, t + i * beat + 0.3);
        kick.start(t + i * beat); kick.stop(t + i * beat + 0.35);
        // hi-hat on offbeat
        const hat = this.ctx.createOscillator();
        const hg = this.ctx.createGain();
        hat.connect(hg); hg.connect(this.ctx.destination);
        hat.type = 'square'; hat.frequency.value = 4000 + Math.random() * 2000;
        hg.gain.setValueAtTime(0.03, t + i * beat + beat * 0.5);
        hg.gain.exponentialRampToValueAtTime(0.001, t + i * beat + beat * 0.5 + 0.05);
        hat.start(t + i * beat + beat * 0.5); hat.stop(t + i * beat + beat * 0.5 + 0.07);
      }
      // bass melody
      const notes = [55, 55, 65, 65, 55, 55, 49, 55];
      notes.forEach((n, i) => {
        const b = this.ctx.createOscillator();
        const bg = this.ctx.createGain();
        b.connect(bg); bg.connect(this.ctx.destination);
        b.type = 'sawtooth'; b.frequency.value = n;
        bg.gain.setValueAtTime(0.06, t + i * beat);
        bg.gain.exponentialRampToValueAtTime(0.001, t + i * beat + beat * 0.9);
        b.start(t + i * beat); b.stop(t + i * beat + beat);
      });
      this._musicTimer = setTimeout(schedule, 8 * beat * 1000 - 50);
    };
    schedule();
  }

  stopBGM() {
    if (this._musicTimer) { clearTimeout(this._musicTimer); this._musicTimer = null; }
  }

  toggleMusic() {
    this.musicOn = !this.musicOn;
    if (this.musicOn) this.startBGM();
    else this.stopBGM();
    return this.musicOn;
  }
}

// ─────────────────────────────────────────────
//  PARTICLE
// ─────────────────────────────────────────────
class Particle {
  constructor() { this.active = false; }

  init(x, y, color, vx, vy, life, size = 4) {
    this.x = x; this.y = y;
    this.vx = vx; this.vy = vy;
    this.color = color;
    this.life = life; this.maxLife = life;
    this.size = size;
    this.active = true;
  }

  update(dt) {
    if (!this.active) return;
    this.x  += this.vx * dt;
    this.y  += this.vy * dt;
    this.vy += 300 * dt; // gravity
    this.life -= dt * 1000;
    if (this.life <= 0) this.active = false;
  }

  draw(ctx) {
    if (!this.active) return;
    const alpha = clamp(this.life / this.maxLife, 0, 1);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = this.color;
    ctx.shadowColor = this.color;
    ctx.shadowBlur = 6;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.size * alpha, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

// ─────────────────────────────────────────────
//  COIN
// ─────────────────────────────────────────────
class Coin {
  constructor() { this.active = false; }

  init(x, y, lane) {
    this.x = x; this.y = y; this.lane = lane;
    this.radius = COIN_RADIUS;
    this.active = true;
    this.collected = false;
    this.animOffset = Math.random() * Math.PI * 2;
    this.rotAngle = 0;
  }

  update(dt, speed) {
    if (!this.active) return;
    this.y += speed;
    this.rotAngle += dt * 4;
    if (this.y > 1200) this.active = false;
  }

  draw(ctx) {
    if (!this.active) return;
    const squeeze = Math.abs(Math.cos(this.rotAngle));
    const w = this.radius * 2 * squeeze;
    const h = this.radius * 2;
    ctx.save();
    ctx.translate(this.x, this.y);
    // glow
    ctx.shadowColor = '#ffdd00';
    ctx.shadowBlur = 12;
    const grad = ctx.createRadialGradient(0, -h * 0.2, 0, 0, 0, this.radius);
    grad.addColorStop(0, '#fff8aa');
    grad.addColorStop(0.5, '#ffdd00');
    grad.addColorStop(1, '#ff9900');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.ellipse(0, 0, Math.max(1, w / 2), h / 2, 0, 0, Math.PI * 2);
    ctx.fill();
    // shine
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.beginPath();
    ctx.ellipse(-w * 0.15, -h * 0.2, Math.max(0.5, w * 0.15), h * 0.15, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

// ─────────────────────────────────────────────
//  POWER-UP
// ─────────────────────────────────────────────
const POWERUP_TYPES = [
  { id: 'magnet',  label: '🧲 MAGNET',       color: '#ff006e', duration: 6000 },
  { id: 'shield',  label: '🛡️ SHIELD',        color: '#00f5ff', duration: 8000 },
  { id: 'double',  label: '✖️ DOUBLE SCORE', color: '#ffdd00', duration: 7000 },
  { id: 'boost',   label: '⚡ SPEED BOOST',   color: '#39ff14', duration: 4000 },
];

class PowerUp {
  constructor() { this.active = false; }

  init(x, y, lane) {
    this.x = x; this.y = y; this.lane = lane;
    this.type = POWERUP_TYPES[randInt(0, POWERUP_TYPES.length - 1)];
    this.radius = 18;
    this.active = true;
    this.angle = 0;
  }

  update(dt, speed) {
    if (!this.active) return;
    this.y += speed;
    this.angle += dt * 2;
    if (this.y > 1200) this.active = false;
  }

  draw(ctx) {
    if (!this.active) return;
    ctx.save();
    ctx.translate(this.x, this.y);
    const pulse = 1 + 0.12 * Math.sin(this.angle * 3);
    ctx.scale(pulse, pulse);
    ctx.shadowColor = this.type.color;
    ctx.shadowBlur = 20;
    ctx.fillStyle = this.type.color + '33';
    ctx.strokeStyle = this.type.color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.font = `${this.radius}px serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(this.type.label.split(' ')[0], 0, 1);
    ctx.restore();
  }
}

// ─────────────────────────────────────────────
//  OBSTACLE
// ─────────────────────────────────────────────
const OBSTACLE_TYPES = [
  { id: 'barrier',   w: 60, h: 80,  reqJump: false, reqSlide: false, color: '#ff006e', label: 'BARRIER' },
  { id: 'lowblock',  w: 70, h: 40,  reqJump: true,  reqSlide: false, color: '#bf00ff', label: 'LOW BLOCK' },
  { id: 'highblock', w: 65, h: 100, reqJump: false, reqSlide: true,  color: '#ff5500', label: 'HIGH BLOCK' },
  { id: 'train',     w: 55, h: 120, reqJump: false, reqSlide: false, color: '#0066ff', label: 'TRAIN' },
  { id: 'roadblock', w: 80, h: 55,  reqJump: false, reqSlide: false, color: '#ff2200', label: 'ROADBLOCK' },
];

class Obstacle {
  constructor() { this.active = false; }

  init(x, y, lane) {
    this.x = x; this.y = y; this.lane = lane;
    this.type = OBSTACLE_TYPES[randInt(0, OBSTACLE_TYPES.length - 1)];
    this.w = this.type.w;
    this.h = this.type.h;
    this.active = true;
    this.glowPhase = Math.random() * Math.PI * 2;
  }

  update(dt, speed) {
    if (!this.active) return;
    this.y += speed;
    this.glowPhase += dt * 3;
    if (this.y > 1300) this.active = false;
  }

  draw(ctx) {
    if (!this.active) return;
    const glow = 0.7 + 0.3 * Math.sin(this.glowPhase);
    ctx.save();
    ctx.shadowColor = this.type.color;
    ctx.shadowBlur = 15 * glow;

    // 3D-ish box
    const x = this.x - this.w / 2;
    const y = this.y - this.h;
    const depth = 14;

    // top face
    ctx.fillStyle = this._lighten(this.type.color, 0.5);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + this.w, y);
    ctx.lineTo(x + this.w - depth, y - depth);
    ctx.lineTo(x - depth, y - depth);
    ctx.closePath();
    ctx.fill();

    // right face
    ctx.fillStyle = this._darken(this.type.color, 0.4);
    ctx.beginPath();
    ctx.moveTo(x + this.w, y);
    ctx.lineTo(x + this.w, y + this.h);
    ctx.lineTo(x + this.w - depth, y + this.h - depth);
    ctx.lineTo(x + this.w - depth, y - depth);
    ctx.closePath();
    ctx.fill();

    // front face
    const grad = ctx.createLinearGradient(x, y, x + this.w, y + this.h);
    grad.addColorStop(0, this.type.color);
    grad.addColorStop(1, this._darken(this.type.color, 0.5));
    ctx.fillStyle = grad;
    ctx.fillRect(x, y, this.w, this.h);

    // edge glow
    ctx.strokeStyle = this.type.color;
    ctx.lineWidth = 1.5;
    ctx.globalAlpha = glow * 0.7;
    ctx.strokeRect(x, y, this.w, this.h);
    ctx.globalAlpha = 1;

    // label
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.font = 'bold 9px Orbitron, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(this.type.label, this.x, y + this.h / 2);

    ctx.restore();
  }

  _darken(hex, amt) {
    const c = hexToRgb(hex);
    return `rgb(${Math.max(0,c.r*(1-amt))|0},${Math.max(0,c.g*(1-amt))|0},${Math.max(0,c.b*(1-amt))|0})`;
  }
  _lighten(hex, amt) {
    const c = hexToRgb(hex);
    return `rgb(${Math.min(255,c.r+(255-c.r)*amt)|0},${Math.min(255,c.g+(255-c.g)*amt)|0},${Math.min(255,c.b+(255-c.b)*amt)|0})`;
  }

  // Returns hitbox accounting for obstacle type (y is bottom of obstacle)
  getHitbox(playerState) {
    return {
      x: this.x - this.w / 2 + 6,
      y: this.y - this.h + (this.type.reqJump ? this.h - 35 : 0),
      w: this.w - 12,
      h: this.type.reqJump ? 35 : this.h,
    };
  }
}

// ─────────────────────────────────────────────
//  PLAYER
// ─────────────────────────────────────────────
class Player {
  constructor(game) {
    this.game = game;
    this.lane = 1; // 0,1,2
    this.targetLane = 1;
    this.x = 0; this.y = 0;
    this.baseY = 0;
    this.w = 36; this.h = 64;
    this.jumping = false;
    this.sliding = false;
    this.jumpProgress = 0;
    this.jumpVY = 0;
    this.jumpY = 0;
    this.slideTimer = 0;
    this.laneX = 0;
    this.laneTransition = 0;
    this.prevLaneX = 0;
    this.nextLaneX = 0;
    this.invincible = false;
    this.invincibleTimer = 0;
    this.runFrame = 0;
    this.runTimer = 0;
    this.shieldActive = false;
    this.alive = true;
    this.deathAnim = 0;
  }

  reset(baseY, laneXPositions) {
    this.lane = 1; this.targetLane = 1;
    this.laneX = laneXPositions[1];
    this.prevLaneX = this.laneX;
    this.nextLaneX = this.laneX;
    this.laneTransition = 1;
    this.x = this.laneX;
    this.baseY = baseY;
    this.y = baseY;
    this.jumping = false; this.sliding = false;
    this.jumpY = 0; this.slideTimer = 0;
    this.invincible = false; this.invincibleTimer = 0;
    this.shieldActive = false;
    this.alive = true; this.deathAnim = 0;
    this.runFrame = 0;
  }

  moveLeft(laneXPositions) {
    if (this.lane > 0) this._changeLane(this.lane - 1, laneXPositions);
  }
  moveRight(laneXPositions) {
    if (this.lane < LANES - 1) this._changeLane(this.lane + 1, laneXPositions);
  }

  _changeLane(newLane, laneXPositions) {
    this.prevLaneX = this.x;
    this.lane = newLane;
    this.targetLane = newLane;
    this.nextLaneX = laneXPositions[newLane];
    this.laneTransition = 0;
  }

  jump(audio) {
    if (!this.jumping && !this.sliding) {
      this.jumping = true;
      this.jumpY = 0;
      this._jumpStart = performance.now();
      audio.playJump();
    }
  }

  slide() {
    if (!this.jumping) {
      this.sliding = true;
      this.slideTimer = SLIDE_DURATION;
    }
  }

  update(dt, now) {
    // Lane transition
    if (this.laneTransition < 1) {
      this.laneTransition = Math.min(1, this.laneTransition + dt * 10);
      const t = easeInOut(this.laneTransition);
      this.x = lerp(this.prevLaneX, this.nextLaneX, t);
    }

    // Jump physics
    if (this.jumping) {
      const elapsed = now - this._jumpStart;
      const t = clamp(elapsed / JUMP_DURATION, 0, 1);
      // parabolic arc
      this.jumpY = -JUMP_HEIGHT * 4 * t * (1 - t);
      if (t >= 1) { this.jumping = false; this.jumpY = 0; }
    }

    // Slide timer
    if (this.sliding) {
      this.slideTimer -= dt * 1000;
      if (this.slideTimer <= 0) { this.sliding = false; this.slideTimer = 0; }
    }

    // Invincibility flash timer
    if (this.invincible) {
      this.invincibleTimer -= dt * 1000;
      if (this.invincibleTimer <= 0) { this.invincible = false; }
    }

    // Run animation
    this.runTimer += dt;
    if (this.runTimer > 0.1) { this.runTimer = 0; this.runFrame = (this.runFrame + 1) % 6; }

    this.y = this.baseY + this.jumpY;

    // Death animation
    if (!this.alive) { this.deathAnim += dt * 3; }
  }

  getHitbox() {
    const slideH = this.h * 0.45;
    const h = this.sliding ? slideH : this.h;
    const yOff = this.sliding ? this.h - slideH : 0;
    return {
      x: this.x - this.w / 2 + 6,
      y: this.y - h + yOff * 0.5,
      w: this.w - 12,
      h: h - 4,
    };
  }

  draw(ctx) {
    if (!this.alive && this.deathAnim > 1) return;
    ctx.save();
    const flicker = this.invincible && Math.floor(performance.now() / 80) % 2 === 0;
    if (flicker) { ctx.restore(); return; }

    ctx.translate(this.x, this.y);

    const slideH = this.h * 0.45;
    const currentH = this.sliding ? slideH : this.h;
    const currentW = this.w;

    if (!this.alive) {
      ctx.rotate(this.deathAnim * 0.5);
      ctx.globalAlpha = Math.max(0, 1 - this.deathAnim * 0.5);
    }

    // Shadow on ground
    if (!this.jumping || this.jumpY > -20) {
      ctx.save();
      ctx.globalAlpha = 0.2;
      ctx.fillStyle = '#000';
      ctx.beginPath();
      const shadowW = currentW * (1 + this.jumpY / -JUMP_HEIGHT * 0.4);
      ctx.ellipse(0, this.sliding ? 4 : 2, shadowW * 0.6, 8, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // Body
    const bodyY = this.sliding ? -currentH * 0.5 : -currentH;
    const runBob = this.jumping ? 0 : Math.sin(this.runFrame / 6 * Math.PI * 2) * 2;

    // Legs (running animation)
    if (!this.sliding) {
      ctx.fillStyle = '#223399';
      const legPhase = this.runFrame / 6 * Math.PI * 2;
      // left leg
      ctx.save();
      ctx.translate(-currentW * 0.18, -currentH * 0.18);
      ctx.rotate(Math.sin(legPhase) * 0.4);
      ctx.fillRect(-5, 0, 10, currentH * 0.4);
      ctx.restore();
      // right leg
      ctx.save();
      ctx.translate(currentW * 0.18, -currentH * 0.18);
      ctx.rotate(-Math.sin(legPhase) * 0.4);
      ctx.fillRect(-5, 0, 10, currentH * 0.4);
      ctx.restore();
      // shoes
      ctx.fillStyle = '#ff3366';
      ctx.beginPath();
      ctx.ellipse(-currentW * 0.18 + Math.sin(legPhase) * 8, -5, 10, 6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(currentW * 0.18 - Math.sin(legPhase) * 8, -5, 10, 6, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // Main body / torso
    const torsoY = this.sliding ? -currentH + 4 : -currentH + runBob;
    ctx.shadowColor = '#00f5ff';
    ctx.shadowBlur = 12;
    // jacket
    const jacketGrad = ctx.createLinearGradient(-currentW / 2, torsoY, currentW / 2, torsoY + currentH * 0.55);
    jacketGrad.addColorStop(0, '#00aaff');
    jacketGrad.addColorStop(1, '#0044cc');
    ctx.fillStyle = jacketGrad;
    const torsoH = this.sliding ? currentH * 0.65 : currentH * 0.55;
    ctx.beginPath();
    ctx.roundRect(-currentW / 2, torsoY + (this.sliding ? 0 : currentH * 0.17), currentW, torsoH, 6);
    ctx.fill();

    // Neon stripes on jacket
    ctx.shadowBlur = 0;
    ctx.strokeStyle = '#00f5ff';
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.6;
    ctx.beginPath();
    const stripY = torsoY + (this.sliding ? 5 : currentH * 0.25);
    ctx.moveTo(-currentW * 0.4, stripY);
    ctx.lineTo(currentW * 0.4, stripY);
    ctx.stroke();
    ctx.globalAlpha = 1;

    // Arms
    if (!this.sliding) {
      ctx.fillStyle = '#00aaff';
      const armPhase = this.runFrame / 6 * Math.PI * 2;
      ctx.save();
      ctx.translate(-currentW * 0.6, torsoY + currentH * 0.22);
      ctx.rotate(Math.sin(armPhase + Math.PI) * 0.5);
      ctx.fillRect(-5, 0, 10, currentH * 0.3);
      ctx.restore();
      ctx.save();
      ctx.translate(currentW * 0.6, torsoY + currentH * 0.22);
      ctx.rotate(Math.sin(armPhase) * 0.5);
      ctx.fillRect(-5, 0, 10, currentH * 0.3);
      ctx.restore();
    }

    // Head
    if (!this.sliding) {
      ctx.shadowColor = '#00f5ff';
      ctx.shadowBlur = 8;
      const headY = torsoY - 24 + runBob;
      ctx.fillStyle = '#ffccaa';
      ctx.beginPath();
      ctx.arc(0, headY, 13, 0, Math.PI * 2);
      ctx.fill();
      // Hair
      ctx.fillStyle = '#111';
      ctx.beginPath();
      ctx.ellipse(0, headY - 8, 13, 8, 0, Math.PI, 0);
      ctx.fill();
      // Eyes
      ctx.fillStyle = '#00f5ff';
      ctx.beginPath();
      ctx.arc(-4, headY - 2, 2.5, 0, Math.PI * 2);
      ctx.arc(4, headY - 2, 2.5, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // Slide: head low
      ctx.fillStyle = '#ffccaa';
      ctx.beginPath();
      ctx.arc(currentW * 0.3, torsoY + currentH * 0.2, 12, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#111';
      ctx.beginPath();
      ctx.ellipse(currentW * 0.3, torsoY + currentH * 0.2 - 7, 12, 7, 0, Math.PI, 0);
      ctx.fill();
    }

    // Shield effect
    if (this.shieldActive) {
      ctx.shadowColor = '#00f5ff';
      ctx.shadowBlur = 25;
      ctx.strokeStyle = `rgba(0,245,255,${0.5 + 0.4 * Math.sin(Date.now() * 0.005)})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(0, -currentH / 2, currentW * 0.8, currentH * 0.65, 0, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.restore();
  }
}

function easeInOut(t) {
  return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
}

// ─────────────────────────────────────────────
//  UI MANAGER
// ─────────────────────────────────────────────
class UIManager {
  constructor() {
    this.hud            = document.getElementById('hud');
    this.startScreen    = document.getElementById('start-screen');
    this.pauseScreen    = document.getElementById('pause-screen');
    this.gameoverScreen = document.getElementById('gameover-screen');
    this.scoreValue     = document.getElementById('score-value');
    this.coinValue      = document.getElementById('coin-value');
    this.hiScoreValue   = document.getElementById('hi-score-value');
    this.comboDisplay   = document.getElementById('combo-display');
    this.comboValue     = document.getElementById('combo-value');
    this.powerUpDisplay = document.getElementById('power-up-display');
    this.missionBar     = document.getElementById('mission-bar');
    this.missionText    = document.getElementById('mission-text');
    this.missionFill    = document.getElementById('mission-progress-fill');
    this.life1 = document.getElementById('life1');
    this.life2 = document.getElementById('life2');
    this.life3 = document.getElementById('life3');
    this.lifeEls = [this.life1, this.life2, this.life3];
    this.dailyReward    = document.getElementById('daily-reward');
    this.achievToast    = document.getElementById('achievement-toast');
    this.startHiScore   = document.getElementById('start-hi-score');
    this.startTotalCoins= document.getElementById('start-total-coins');
    this.missionsPreview= document.getElementById('missions-preview');
    this.finalScore     = document.getElementById('final-score');
    this.finalCoins     = document.getElementById('final-coins');
    this.finalHi        = document.getElementById('final-hi');
    this.newBestBadge   = document.getElementById('new-best-badge');
    this.missionsComplete = document.getElementById('missions-complete');
    this.musicBtns      = [document.getElementById('music-toggle'), document.getElementById('music-toggle-pause')];
  }

  showStart() {
    this.startScreen.classList.remove('hidden');
    this.pauseScreen.classList.add('hidden');
    this.gameoverScreen.classList.add('hidden');
    this.hud.classList.add('hidden');
    this.missionBar.classList.add('hidden');
  }

  showHUD() {
    this.hud.classList.remove('hidden');
    this.startScreen.classList.add('hidden');
    this.pauseScreen.classList.add('hidden');
    this.gameoverScreen.classList.add('hidden');
    this.missionBar.classList.remove('hidden');
  }

  showPause() { this.pauseScreen.classList.remove('hidden'); }
  hidePause() { this.pauseScreen.classList.add('hidden'); }

  showGameOver(score, coins, hiScore, isNew, completedMissions) {
    this.gameoverScreen.classList.remove('hidden');
    this.hud.classList.add('hidden');
    this.missionBar.classList.add('hidden');
    this.finalScore.textContent = score.toLocaleString();
    this.finalCoins.textContent = coins;
    this.finalHi.textContent    = hiScore.toLocaleString();
    if (isNew) this.newBestBadge.classList.remove('hidden');
    else this.newBestBadge.classList.add('hidden');
    if (completedMissions.length > 0) {
      this.missionsComplete.innerHTML = '🏆 MISSIONS: ' + completedMissions.join(' · ');
    } else { this.missionsComplete.innerHTML = ''; }
  }

  updateScore(score) { this.scoreValue.textContent = score.toLocaleString(); }
  updateCoins(coins) { this.coinValue.textContent = coins; }
  updateHiScore(hi)  { this.hiScoreValue.textContent = hi.toLocaleString(); }

  updateLives(lives) {
    this.lifeEls.forEach((el, i) => {
      if (i < lives) el.classList.remove('lost');
      else el.classList.add('lost');
    });
  }

  updateCombo(combo) {
    if (combo > 1) {
      this.comboDisplay.classList.remove('hidden');
      this.comboValue.textContent = `x${combo}`;
    } else {
      this.comboDisplay.classList.add('hidden');
    }
  }

  updatePowerUp(label) {
    this.powerUpDisplay.textContent = label || '';
  }

  updateMission(text, progress) {
    this.missionText.textContent = text;
    this.missionFill.style.width = `${clamp(progress * 100, 0, 100)}%`;
  }

  showDailyReward(show) {
    if (show) this.dailyReward.classList.remove('hidden');
    else this.dailyReward.classList.add('hidden');
  }

  showAchievement(text) {
    this.achievToast.textContent = '🏆 ' + text;
    this.achievToast.classList.remove('hidden');
    setTimeout(() => this.achievToast.classList.add('hidden'), 3000);
  }

  updateStartScreen(hiScore, totalCoins) {
    this.startHiScore.textContent = hiScore.toLocaleString();
    this.startTotalCoins.textContent = totalCoins;
  }

  renderMissionsPreview(missions) {
    this.missionsPreview.innerHTML = missions.map(m => {
      const done = m.progress >= m.target;
      const pct = Math.min(1, m.progress / m.target);
      return `<div class="mission-item${done?' done':''}">
        <span class="m-name">${m.name}</span>
        <span class="${done?'m-done':'m-prog'}">${done ? '✔' : `${m.progress}/${m.target}`}</span>
      </div>`;
    }).join('');
  }

  updateMusicBtn(on) {
    this.musicBtns.forEach(b => { if(b) b.textContent = on ? '🔊' : '🔇'; });
  }
}

// ─────────────────────────────────────────────
//  OBJECT POOLS
// ─────────────────────────────────────────────
class Pool {
  constructor(ctor, size) {
    this.items = Array.from({ length: size }, () => new ctor());
  }
  get() {
    return this.items.find(i => !i.active) || null;
  }
  active() {
    return this.items.filter(i => i.active);
  }
}

// ─────────────────────────────────────────────
//  ENVIRONMENT RENDERER
// ─────────────────────────────────────────────
class Environment {
  constructor() {
    this.scrollY   = 0;
    this.trackScrollY = 0;
    this.buildingOffsets = Array.from({ length: 10 }, (_, i) => ({
      x: (i % 5) < 2.5 ? -1 : 1,
      xOff: rand(30, 120),
      y: rand(-200, 800),
      w: rand(60, 120),
      h: rand(100, 280),
      color: [`#0a1a3a`,`#0d1f3a`,`#091530`,`#071228`][randInt(0, 3)],
      windows: rand(0.4, 0.9),
    }));
    this.starPositions = Array.from({ length: 80 }, () => ({
      x: Math.random(), y: Math.random(), r: rand(0.5, 2), twinkle: Math.random() * Math.PI * 2,
    }));
    this.cloudPositions = Array.from({ length: 5 }, () => ({
      x: Math.random(), y: rand(0.05, 0.3), w: rand(80, 200), opacity: rand(0.3, 0.7),
    }));
  }

  update(dt, speed) {
    this.scrollY += speed;
    this.trackScrollY = this.scrollY % 200;
    this.buildingOffsets.forEach(b => {
      b.y += speed * 0.15;
      if (b.y > 1000) b.y = -300;
    });
    this.cloudPositions.forEach(c => {
      c.x += dt * 0.02;
      if (c.x > 1.2) c.x = -0.2;
    });
  }

  drawSky(ctx, W, H, dayNightT) {
    // dayNightT: 0=day, 1=night
    const dayTop    = '#1a1a3a'; // always keep dark for neon vibe
    const dayBottom = '#0a0a18';
    const nightTop  = '#000005';
    const nightBtm  = '#0a0015';

    const topColor    = lerpColor(dayTop, nightTop, dayNightT);
    const bottomColor = lerpColor(dayBottom, nightBtm, dayNightT);

    const skyGrad = ctx.createLinearGradient(0, 0, 0, H * 0.6);
    skyGrad.addColorStop(0, topColor);
    skyGrad.addColorStop(1, bottomColor);
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, W, H * 0.6);

    // Stars (more visible at night)
    ctx.save();
    const starAlpha = 0.3 + dayNightT * 0.7;
    this.starPositions.forEach(s => {
      const t = performance.now() * 0.001 + s.twinkle;
      const a = starAlpha * (0.5 + 0.5 * Math.sin(t * 2));
      ctx.globalAlpha = a;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(s.x * W, s.y * H * 0.55, s.r, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.restore();

    // Moon / sun
    const moonX = W * 0.8;
    const moonY = H * 0.12;
    if (dayNightT > 0.3) {
      ctx.save();
      ctx.globalAlpha = (dayNightT - 0.3) / 0.7;
      ctx.shadowColor = '#fff8cc';
      ctx.shadowBlur = 20 * dayNightT;
      ctx.fillStyle = '#fffee0';
      ctx.beginPath();
      ctx.arc(moonX, moonY, 20, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    } else {
      ctx.save();
      ctx.globalAlpha = (0.3 - dayNightT) / 0.3;
      ctx.shadowColor = '#ffaa00';
      ctx.shadowBlur = 30;
      const sg = ctx.createRadialGradient(moonX, moonY, 0, moonX, moonY, 30);
      sg.addColorStop(0, '#ffee88');
      sg.addColorStop(0.5, '#ffaa33');
      sg.addColorStop(1, 'transparent');
      ctx.fillStyle = sg;
      ctx.beginPath();
      ctx.arc(moonX, moonY, 30, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  drawBuildings(ctx, W, H) {
    this.buildingOffsets.forEach(b => {
      const side = b.x < 0;
      const baseX = side ? b.xOff : W - b.xOff - b.w;
      ctx.save();
      ctx.fillStyle = b.color;
      ctx.fillRect(baseX, b.y, b.w, b.h);
      // windows
      const cols = Math.floor(b.w / 18);
      const rows = Math.floor(b.h / 22);
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          if (Math.random() < b.windows) {
            ctx.fillStyle = Math.random() < 0.3 ? '#ffdd00' : (Math.random() < 0.5 ? '#00aaff' : '#ff6600');
            ctx.globalAlpha = 0.5 + Math.random() * 0.5;
            ctx.fillRect(baseX + c * 18 + 4, b.y + r * 22 + 4, 8, 12);
          }
        }
      }
      // neon sign on rooftop
      ctx.globalAlpha = 0.7;
      ctx.strokeStyle = Math.random() < 0.5 ? '#00f5ff' : '#ff006e';
      ctx.lineWidth = 2;
      ctx.shadowColor = ctx.strokeStyle;
      ctx.shadowBlur = 8;
      ctx.strokeRect(baseX + 5, b.y - 5, b.w - 10, 8);
      ctx.restore();
    });
  }

  drawClouds(ctx, W, H) {
    this.cloudPositions.forEach(c => {
      ctx.save();
      ctx.globalAlpha = c.opacity * 0.4;
      ctx.fillStyle = '#334466';
      ctx.beginPath();
      const cx = c.x * W, cy = c.y * H;
      ctx.ellipse(cx, cy, c.w * 0.5, 20, 0, 0, Math.PI * 2);
      ctx.ellipse(cx - c.w * 0.2, cy + 8, c.w * 0.3, 15, 0, 0, Math.PI * 2);
      ctx.ellipse(cx + c.w * 0.2, cy + 5, c.w * 0.35, 18, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });
  }

  drawGround(ctx, W, H, laneXArr, laneW) {
    const groundTop = H * 0.55;
    const groundH   = H - groundTop;

    // Road surface
    const roadGrad = ctx.createLinearGradient(0, groundTop, 0, H);
    roadGrad.addColorStop(0, '#111122');
    roadGrad.addColorStop(1, '#0a0a18');
    ctx.fillStyle = roadGrad;
    ctx.fillRect(0, groundTop, W, groundH);

    // Lane dividers (dashed lines)
    ctx.save();
    ctx.strokeStyle = 'rgba(0,245,255,0.25)';
    ctx.lineWidth = 2;
    ctx.setLineDash([30, 20]);
    ctx.lineDashOffset = -this.trackScrollY * 2;
    for (let i = 1; i < LANES; i++) {
      const divX = laneXArr[i - 1] + laneW / 2;
      ctx.beginPath();
      ctx.moveTo(divX, groundTop);
      ctx.lineTo(divX, H);
      ctx.stroke();
    }
    ctx.restore();

    // Outer lane lines
    ctx.save();
    ctx.strokeStyle = 'rgba(0,245,255,0.5)';
    ctx.lineWidth = 3;
    ctx.shadowColor = '#00f5ff';
    ctx.shadowBlur = 8;
    ctx.setLineDash([]);
    const leftX = laneXArr[0] - laneW * 0.45;
    const rightX = laneXArr[LANES - 1] + laneW * 0.45;
    ctx.beginPath(); ctx.moveTo(leftX, groundTop); ctx.lineTo(leftX, H); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(rightX, groundTop); ctx.lineTo(rightX, H); ctx.stroke();
    ctx.restore();

    // Perspective grid lines
    ctx.save();
    ctx.strokeStyle = 'rgba(0,245,255,0.08)';
    ctx.lineWidth = 1;
    const horizY = groundTop;
    const vanishX = W / 2;
    for (let i = 0; i < 12; i++) {
      const progress = i / 12;
      const y = horizY + groundH * (progress * progress);
      const spreadX = 10 + progress * W * 0.5;
      ctx.beginPath();
      ctx.moveTo(vanishX - spreadX, y);
      ctx.lineTo(vanishX + spreadX, y);
      ctx.stroke();
    }
    ctx.restore();

    // Sidewalks
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, groundTop, leftX - 2, groundH);
    ctx.fillRect(rightX + 2, groundTop, W, groundH);

    // Horizon glow
    ctx.save();
    const horizGrad = ctx.createLinearGradient(0, groundTop - 20, 0, groundTop + 40);
    horizGrad.addColorStop(0, 'transparent');
    horizGrad.addColorStop(0.5, 'rgba(0,245,255,0.08)');
    horizGrad.addColorStop(1, 'transparent');
    ctx.fillStyle = horizGrad;
    ctx.fillRect(0, groundTop - 20, W, 60);
    ctx.restore();
  }
}

function lerpColor(hex1, hex2, t) {
  const c1 = hexToRgb(hex1);
  const c2 = hexToRgb(hex2);
  const r = Math.round(lerp(c1.r, c2.r, t));
  const g = Math.round(lerp(c1.g, c2.g, t));
  const b = Math.round(lerp(c1.b, c2.b, t));
  return `rgb(${r},${g},${b})`;
}

// ─────────────────────────────────────────────
//  MISSION SYSTEM
// ─────────────────────────────────────────────
class MissionSystem {
  constructor() {
    this.missions = [
      { id: 'coins100',  name: 'Collect 100 coins',    target: 100,  progress: 0, type: 'coins',    done: false },
      { id: 'survive5m', name: 'Survive 5 minutes',    target: 300,  progress: 0, type: 'seconds',  done: false },
      { id: 'score10k',  name: 'Reach 10,000 score',   target: 10000,progress: 0, type: 'score',    done: false },
    ];
    this.activeMissionIdx = 0;
    this._load();
  }

  _load() {
    const saved = localStorage.getItem('nr_missions');
    if (saved) {
      const data = JSON.parse(saved);
      this.missions.forEach(m => {
        if (data[m.id] !== undefined) m.progress = data[m.id];
        if (m.progress >= m.target) m.done = true;
      });
    }
  }

  _save() {
    const data = {};
    this.missions.forEach(m => { data[m.id] = m.progress; });
    localStorage.setItem('nr_missions', JSON.stringify(data));
  }

  update(coins, seconds, score) {
    this.missions.forEach(m => {
      if (m.done) return;
      if (m.type === 'coins')   m.progress = Math.max(m.progress, coins);
      if (m.type === 'seconds') m.progress = Math.max(m.progress, Math.floor(seconds));
      if (m.type === 'score')   m.progress = Math.max(m.progress, score);
      if (m.progress >= m.target) m.done = true;
    });
  }

  getActive() {
    return this.missions.find(m => !m.done) || this.missions[this.missions.length - 1];
  }

  completedThisRun(prevDone) {
    return this.missions.filter((m, i) => m.done && !prevDone[i]);
  }

  save() { this._save(); }
  getAll() { return this.missions; }
}

// ─────────────────────────────────────────────
//  ACHIEVEMENT SYSTEM
// ─────────────────────────────────────────────
const ACHIEVEMENTS = [
  { id: 'first_run',   name: 'First Steps',       check: (s) => s.totalRuns >= 1 },
  { id: 'coin_50',     name: 'Coin Collector',     check: (s) => s.totalCoins >= 50 },
  { id: 'coin_500',    name: 'Coin Hoarder',       check: (s) => s.totalCoins >= 500 },
  { id: 'score_5k',    name: 'Speed Demon',        check: (s) => s.hiScore >= 5000 },
  { id: 'score_20k',   name: 'Untouchable',        check: (s) => s.hiScore >= 20000 },
  { id: 'combo_10',    name: 'On Fire',            check: (s) => s.maxCombo >= 10 },
  { id: 'powerup_all', name: 'Power Freak',        check: (s) => s.powerUpsUsed >= 4 },
];

class AchievementSystem {
  constructor() {
    this.unlocked = new Set(JSON.parse(localStorage.getItem('nr_achievements') || '[]'));
  }

  check(stats) {
    const newOnes = [];
    ACHIEVEMENTS.forEach(a => {
      if (!this.unlocked.has(a.id) && a.check(stats)) {
        this.unlocked.add(a.id);
        newOnes.push(a.name);
      }
    });
    if (newOnes.length) localStorage.setItem('nr_achievements', JSON.stringify([...this.unlocked]));
    return newOnes;
  }
}

// ─────────────────────────────────────────────
//  MAIN GAME CLASS
// ─────────────────────────────────────────────
class Game {
  constructor() {
    this.canvas  = document.getElementById('gameCanvas');
    this.ctx     = this.canvas.getContext('2d');
    this.ui      = new UIManager();
    this.audio   = new AudioManager();
    this.env     = new Environment();
    this.player  = new Player(this);
    this.missions   = new MissionSystem();
    this.achievements = new AchievementSystem();

    // Pools
    this.obstaclePool = new Pool(Obstacle, OBSTACLE_POOL_SIZE);
    this.coinPool     = new Pool(Coin, COIN_POOL_SIZE);
    this.powerUpPool  = new Pool(PowerUp, POWERUP_POOL_SIZE);
    this.particlePool = new Pool(Particle, PARTICLE_POOL_SIZE);

    // State
    this.state = 'start'; // start, playing, paused, gameover
    this.score = 0;
    this.coins = 0;
    this.lives = 3;
    this.speed = BASE_SPEED;
    this.combo = 0;
    this.comboTimer = 0;
    this.distance = 0;
    this.playTime = 0;

    // Active power-ups
    this.activePowerUps = {};

    // Spawn timers
    this.obstacleTimer = 0;
    this.coinTimer     = 0;
    this.powerUpTimer  = 0;
    this.spawnInterval = 1800;

    // Day/night
    this.dayNightT    = 0;
    this.dayNightDir  = 1;
    this.dayNightTime = 0;

    // Layout
    this.W = 0; this.H = 0;
    this.laneXArr = [];
    this.laneW = 0;
    this.groundY = 0;

    // Stored stats
    this.hiScore    = parseInt(localStorage.getItem('nr_hi') || '0');
    this.totalCoins = parseInt(localStorage.getItem('nr_total_coins') || '0');
    this.totalRuns  = parseInt(localStorage.getItem('nr_runs') || '0');
    this.maxCombo   = parseInt(localStorage.getItem('nr_max_combo') || '0');
    this.powerUpsUsed = parseInt(localStorage.getItem('nr_powerups') || '0');

    // Daily reward
    this._checkDailyReward();

    // Touch swipe
    this._touchStartX = 0; this._touchStartY = 0;

    this._bindEvents();
    this._resize();
    window.addEventListener('resize', () => this._resize());

    this._lastTime = 0;
    requestAnimationFrame((t) => this._loop(t));

    // Init UI
    this.ui.updateStartScreen(this.hiScore, this.totalCoins);
    this.ui.renderMissionsPreview(this.missions.getAll());
    this.ui.updateHiScore(this.hiScore);
    this.ui.updateMusicBtn(this.audio.musicOn);
  }

  _checkDailyReward() {
    const last = localStorage.getItem('nr_last_daily');
    const today = new Date().toDateString();
    if (last !== today) {
      this.totalCoins += 50;
      localStorage.setItem('nr_total_coins', this.totalCoins);
      localStorage.setItem('nr_last_daily', today);
      this.ui.showDailyReward(true);
    }
  }

  _resize() {
    this.W = this.canvas.width  = this.canvas.offsetWidth;
    this.H = this.canvas.height = this.canvas.offsetHeight;
    this.groundY = this.H * PLAYER_Y_RATIO;
    this.laneW   = this.W * LANE_WIDTH_RATIO;
    const totalW = this.laneW * LANES;
    const startX = (this.W - totalW) / 2 + this.laneW / 2;
    this.laneXArr = [startX, startX + this.laneW, startX + this.laneW * 2];
    if (this.state === 'playing' || this.state === 'paused') {
      this.player.laneX = this.laneXArr[this.player.lane];
      this.player.x = this.laneXArr[this.player.lane];
      this.player.baseY = this.groundY;
    }
  }

  _bindEvents() {
    // Keyboard
    document.addEventListener('keydown', (e) => {
      if (this.state !== 'playing') return;
      if (e.key === 'ArrowLeft')  { e.preventDefault(); this.player.moveLeft(this.laneXArr); }
      if (e.key === 'ArrowRight') { e.preventDefault(); this.player.moveRight(this.laneXArr); }
      if (e.key === 'ArrowUp')    { e.preventDefault(); this.player.jump(this.audio); }
      if (e.key === 'ArrowDown')  { e.preventDefault(); this.player.slide(); }
      if (e.key === 'Escape' || e.key === 'p' || e.key === 'P') this._togglePause();
    });

    // Touch
    this.canvas.addEventListener('touchstart', (e) => {
      this._touchStartX = e.touches[0].clientX;
      this._touchStartY = e.touches[0].clientY;
      e.preventDefault();
    }, { passive: false });

    this.canvas.addEventListener('touchend', (e) => {
      if (this.state === 'start') { this._startGame(); return; }
      if (this.state !== 'playing') return;
      const dx = e.changedTouches[0].clientX - this._touchStartX;
      const dy = e.changedTouches[0].clientY - this._touchStartY;
      const absDx = Math.abs(dx), absDy = Math.abs(dy);
      if (absDx < 10 && absDy < 10) { this.player.jump(this.audio); return; }
      if (absDx > absDy) {
        if (dx < 0) this.player.moveLeft(this.laneXArr);
        else this.player.moveRight(this.laneXArr);
      } else {
        if (dy < 0) this.player.jump(this.audio);
        else this.player.slide();
      }
      e.preventDefault();
    }, { passive: false });

    // Buttons
    document.getElementById('start-btn').addEventListener('click', () => this._startGame());
    document.getElementById('pause-btn').addEventListener('click', () => this._togglePause());
    document.getElementById('resume-btn').addEventListener('click', () => this._togglePause());
    document.getElementById('restart-btn').addEventListener('click', () => this._startGame());
    document.getElementById('restart-btn-pause').addEventListener('click', () => { this._hidePause(); this._startGame(); });
    document.getElementById('menu-btn').addEventListener('click', () => this._goToMenu());

    document.getElementById('music-toggle').addEventListener('click', () => this._toggleMusic());
    document.getElementById('music-toggle-pause').addEventListener('click', () => this._toggleMusic());
  }

  _toggleMusic() {
    const on = this.audio.toggleMusic();
    this.ui.updateMusicBtn(on);
  }

  _startGame() {
    this.state = 'playing';
    this.score = 0;
    this.coins = 0;
    this.lives = 3;
    this.speed = BASE_SPEED;
    this.combo = 0;
    this.comboTimer = 0;
    this.distance = 0;
    this.playTime = 0;
    this.activePowerUps = {};
    this.obstacleTimer = 0;
    this.coinTimer = 0;
    this.powerUpTimer = 0;
    this.spawnInterval = 1800;
    this.dayNightT = 0;
    this.dayNightDir = 1;
    this.dayNightTime = 0;
    this._prevMissionDone = this.missions.getAll().map(m => m.done);

    // Reset pools
    [...this.obstaclePool.items, ...this.coinPool.items, ...this.powerUpPool.items, ...this.particlePool.items]
      .forEach(i => { i.active = false; });

    this.player.reset(this.groundY, this.laneXArr);
    this.ui.showHUD();
    this.ui.updateScore(0);
    this.ui.updateCoins(0);
    this.ui.updateLives(3);
    this.ui.updateHiScore(this.hiScore);
    this.ui.updateCombo(0);
    this.ui.updatePowerUp('');

    const active = this.missions.getActive();
    if (active) this.ui.updateMission(active.name, active.progress / active.target);

    this.audio.startBGM();
    this._lastTime = performance.now();
  }

  _togglePause() {
    if (this.state === 'playing') {
      this.state = 'paused';
      this.ui.showPause();
      this.audio.stopBGM();
    } else if (this.state === 'paused') {
      this._hidePause();
    }
  }

  _hidePause() {
    this.state = 'playing';
    this.ui.hidePause();
    this.audio.startBGM();
    this._lastTime = performance.now();
  }

  _goToMenu() {
    this.state = 'start';
    this.ui.showStart();
    this.ui.updateStartScreen(this.hiScore, this.totalCoins);
    this.ui.renderMissionsPreview(this.missions.getAll());
    this.audio.stopBGM();
  }

  _gameOver() {
    if (this.state === 'gameover') return;
    this.state = 'gameover';
    this.audio.stopBGM();
    this.audio.playGameOver();

    const isNew = this.score > this.hiScore;
    if (isNew) { this.hiScore = this.score; localStorage.setItem('nr_hi', this.hiScore); }
    this.totalCoins += this.coins;
    this.totalRuns++;
    this.maxCombo = Math.max(this.maxCombo, this.combo);
    localStorage.setItem('nr_total_coins', this.totalCoins);
    localStorage.setItem('nr_runs', this.totalRuns);
    localStorage.setItem('nr_max_combo', this.maxCombo);
    localStorage.setItem('nr_powerups', this.powerUpsUsed);

    this.missions.update(this.coins, this.playTime, this.score);
    this.missions.save();

    const completed = this.missions.completedThisRun(this._prevMissionDone || []);
    const stats = { totalRuns: this.totalRuns, totalCoins: this.totalCoins, hiScore: this.hiScore, maxCombo: this.maxCombo, powerUpsUsed: this.powerUpsUsed };
    const newAchievements = this.achievements.check(stats);
    if (newAchievements.length) {
      setTimeout(() => this.ui.showAchievement(newAchievements[0]), 600);
    }

    this.ui.showGameOver(
      this.score,
      this.coins,
      this.hiScore,
      isNew,
      completed.map(m => m.name)
    );
  }

  _spawnObstacle() {
    const lane = randInt(0, LANES - 1);
    const obj = this.obstaclePool.get();
    if (!obj) return;
    obj.init(this.laneXArr[lane], -120, lane);
  }

  _spawnCoin(lane, y) {
    const c = this.coinPool.get();
    if (!c) return;
    c.init(this.laneXArr[lane !== undefined ? lane : randInt(0, LANES-1)], y || -60, lane);
  }

  _spawnCoinRow() {
    // Spawn 3-6 coins in a row on a random lane
    const lane = randInt(0, LANES - 1);
    const count = randInt(3, 6);
    for (let i = 0; i < count; i++) {
      const c = this.coinPool.get();
      if (!c) break;
      c.init(this.laneXArr[lane], -60 - i * 45, lane);
    }
  }

  _spawnPowerUp() {
    const lane = randInt(0, LANES - 1);
    const p = this.powerUpPool.get();
    if (!p) return;
    p.init(this.laneXArr[lane], -80, lane);
  }

  _spawnParticles(x, y, color, count = 8) {
    for (let i = 0; i < count; i++) {
      const p = this.particlePool.get();
      if (!p) break;
      const angle = (Math.PI * 2 * i / count) + rand(-0.3, 0.3);
      const speed = rand(80, 220);
      p.init(x, y, color, Math.cos(angle) * speed, Math.sin(angle) * speed - rand(50, 150), rand(400, 700), rand(3, 6));
    }
  }

  _checkCollisions() {
    const ph = this.player.getHitbox();

    // Obstacles
    this.obstaclePool.active().forEach(obs => {
      const oh = obs.getHitbox();
      if (rectsOverlap(ph, oh)) {
        // Check if player avoids it
        const canJumpOver = obs.type.reqJump && this.player.jumping && this.player.jumpY < -30;
        const canSlideUnder = obs.type.reqSlide && this.player.sliding;
        if (canJumpOver || canSlideUnder) return;

        if (this.activePowerUps.shield) {
          delete this.activePowerUps.shield;
          this.player.shieldActive = false;
          this.ui.updatePowerUp('');
          this._spawnParticles(this.player.x, this.player.y, '#00f5ff', 15);
          obs.active = false;
          return;
        }
        if (this.player.invincible) return;

        this.lives--;
        this.ui.updateLives(this.lives);
        this.audio.playCollision();
        this._spawnParticles(this.player.x, this.player.y - 30, '#ff006e', 12);
        obs.active = false;
        this.combo = 0;
        this.ui.updateCombo(0);

        if (this.lives <= 0) {
          this.player.alive = false;
          setTimeout(() => this._gameOver(), 800);
        } else {
          this.player.invincible = true;
          this.player.invincibleTimer = 2000;
        }
      }
    });

    // Coins
    this.coinPool.active().forEach(coin => {
      let collect = false;
      if (this.activePowerUps.magnet) {
        const dx = this.player.x - coin.x;
        const dy = (this.player.y - 30) - coin.y;
        const dist = Math.sqrt(dx*dx + dy*dy);
        if (dist < 150) {
          coin.x += dx * 0.1;
          coin.y += dy * 0.1;
        }
        if (dist < 30) collect = true;
      }
      if (!collect) {
        const ch = { x: coin.x - coin.radius, y: coin.y - coin.radius, w: coin.radius*2, h: coin.radius*2 };
        if (rectsOverlap(ph, ch)) collect = true;
      }
      if (collect) {
        coin.active = false;
        this.combo++;
        this.comboTimer = 3000;
        const multiplier = this.activePowerUps.double ? 2 : 1;
        this.coins += multiplier;
        this.score += 10 * this.combo * multiplier;
        this.ui.updateScore(this.score);
        this.ui.updateCoins(this.coins);
        this.ui.updateCombo(this.combo);
        this.audio.playCoin();
        this._spawnParticles(coin.x, coin.y, '#ffdd00', 6);
      }
    });

    // Power-ups
    this.powerUpPool.active().forEach(pu => {
      const ph2 = { x: pu.x - pu.radius, y: pu.y - pu.radius, w: pu.radius*2, h: pu.radius*2 };
      if (rectsOverlap(ph, ph2)) {
        pu.active = false;
        this.audio.playPowerUp();
        this._activatePowerUp(pu.type);
        this._spawnParticles(pu.x, pu.y, pu.type.color, 12);
        this.powerUpsUsed++;
        localStorage.setItem('nr_powerups', this.powerUpsUsed);
      }
    });
  }

  _activatePowerUp(type) {
    this.activePowerUps[type.id] = { timer: type.duration, label: type.label };
    if (type.id === 'shield') this.player.shieldActive = true;
    this.ui.updatePowerUp(type.label);
  }

  _updatePowerUps(dt) {
    let label = '';
    Object.keys(this.activePowerUps).forEach(key => {
      const pu = this.activePowerUps[key];
      pu.timer -= dt * 1000;
      if (pu.timer <= 0) {
        delete this.activePowerUps[key];
        if (key === 'shield') this.player.shieldActive = false;
      } else {
        label = pu.label + ` ${(pu.timer/1000).toFixed(1)}s`;
      }
    });
    this.ui.updatePowerUp(label);
  }

  _loop(now) {
    requestAnimationFrame((t) => this._loop(t));
    const dt = Math.min((now - this._lastTime) / 1000, 0.05);
    this._lastTime = now;

    if (this.state === 'playing') {
      this._update(dt, now);
    }
    this._draw(now);
  }

  _update(dt, now) {
    // Speed ramp
    this.speed = BASE_SPEED + this.distance * 0.0015;
    this.speed = Math.min(this.speed, 22);

    // Timers
    this.playTime += dt;
    this.distance += this.speed * dt * 60 / 1000;
    const scoreInc = Math.floor(this.speed * 0.5 * (this.activePowerUps.double ? 2 : 1));
    this.score += scoreInc;
    this.ui.updateScore(this.score);

    // Combo timer
    if (this.comboTimer > 0) {
      this.comboTimer -= dt * 1000;
      if (this.comboTimer <= 0) { this.combo = 0; this.ui.updateCombo(0); }
    }

    // Day/night cycle
    this.dayNightTime += dt * 1000;
    this.dayNightT = 0.5 - 0.5 * Math.cos(this.dayNightTime / DAY_CYCLE * Math.PI * 2);

    // Spawn
    this.obstacleTimer += dt * 1000;
    this.coinTimer     += dt * 1000;
    this.powerUpTimer  += dt * 1000;

    const adjustedInterval = Math.max(900, this.spawnInterval - this.distance * 0.5);

    if (this.obstacleTimer >= adjustedInterval) {
      this.obstacleTimer = 0;
      this._spawnObstacle();
      if (Math.random() < 0.4) this._spawnObstacle(); // double spawn at higher levels
    }
    if (this.coinTimer >= 900) {
      this.coinTimer = 0;
      if (Math.random() < 0.6) this._spawnCoinRow();
      else this._spawnCoin();
    }
    if (this.powerUpTimer >= 8000 + rand(-2000, 2000)) {
      this.powerUpTimer = 0;
      if (Math.random() < 0.35) this._spawnPowerUp();
    }

    // Update entities
    this.player.update(dt, now);
    this.obstaclePool.active().forEach(o => o.update(dt, this.speed * dt * 60));
    this.coinPool.active().forEach(c => c.update(dt, this.speed * dt * 60));
    this.powerUpPool.active().forEach(p => p.update(dt, this.speed * dt * 60));
    this.particlePool.active().forEach(p => p.update(dt));
    this.env.update(dt, this.speed * dt * 60 * 0.25);

    if (this.player.alive) this._checkCollisions();
    this._updatePowerUps(dt);

    // Missions update
    this.missions.update(this.coins, this.playTime, this.score);
    const active = this.missions.getActive();
    if (active) {
      let prog = 0;
      if (active.type === 'coins')   prog = this.coins / active.target;
      if (active.type === 'seconds') prog = this.playTime / active.target;
      if (active.type === 'score')   prog = this.score / active.target;
      this.ui.updateMission(active.name, prog);
    }
  }

  _draw(now) {
    const { ctx, W, H } = this;
    ctx.clearRect(0, 0, W, H);

    // Sky & environment
    this.env.drawSky(ctx, W, H, this.dayNightT);
    this.env.drawClouds(ctx, W, H);
    this.env.drawBuildings(ctx, W, H);
    this.env.drawGround(ctx, W, H, this.laneXArr, this.laneW);

    // Draw order: obstacles → coins → powerups → player → particles
    this.obstaclePool.active().forEach(o => o.draw(ctx));
    this.coinPool.active().forEach(c => c.draw(ctx));
    this.powerUpPool.active().forEach(p => p.draw(ctx));
    this.player.draw(ctx);
    this.particlePool.active().forEach(p => p.draw(ctx));

    // Speed lines effect at high speed
    if (this.state === 'playing') {
      const speedFactor = (this.speed - BASE_SPEED) / (22 - BASE_SPEED);
      if (speedFactor > 0.3) {
        ctx.save();
        ctx.globalAlpha = speedFactor * 0.15;
        ctx.strokeStyle = '#00f5ff';
        ctx.lineWidth = 1;
        for (let i = 0; i < 8; i++) {
          const x = rand(0, W);
          const y = rand(H * 0.4, H * 0.9);
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x + rand(-5, 5), y + rand(20, 60) * speedFactor);
          ctx.stroke();
        }
        ctx.restore();
      }
    }

    // Screen flash on collision
    if (this.player.invincible && Math.floor(now / 120) % 2 === 0) {
      ctx.save();
      ctx.fillStyle = 'rgba(255,0,80,0.05)';
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }

    // Start screen: animated preview
    if (this.state === 'start') {
      ctx.save();
      const t = now * 0.001;
      const grad = ctx.createLinearGradient(0, 0, W, H);
      grad.addColorStop(0, `rgba(0,245,255,${0.03 + 0.02 * Math.sin(t)})`);
      grad.addColorStop(1, `rgba(255,0,110,${0.03 + 0.02 * Math.cos(t)})`);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }
  }
}

function rectsOverlap(a, b) {
  return a.x < b.x + b.w &&
         a.x + a.w > b.x &&
         a.y < b.y + b.h &&
         a.y + a.h > b.y;
}

// ─────────────────────────────────────────────
//  BOOT
// ─────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  // Add roundRect polyfill for older browsers
  if (!CanvasRenderingContext2D.prototype.roundRect) {
    CanvasRenderingContext2D.prototype.roundRect = function(x, y, w, h, r) {
      r = Math.min(r, Math.min(w, h) / 2);
      this.beginPath();
      this.moveTo(x + r, y);
      this.lineTo(x + w - r, y);
      this.quadraticCurveTo(x + w, y, x + w, y + r);
      this.lineTo(x + w, y + h - r);
      this.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
      this.lineTo(x + r, y + h);
      this.quadraticCurveTo(x, y + h, x, y + h - r);
      this.lineTo(x, y + r);
      this.quadraticCurveTo(x, y, x + r, y);
      this.closePath();
      return this;
    };
  }

  window._game = new Game();
});