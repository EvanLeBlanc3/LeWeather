/* LeWeather — pixel weather engine. Data: Open-Meteo (no key), NWS alerts (US), BigDataCloud reverse geocode. */
(() => {
'use strict';

const $ = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const rnd = (a = 1, b) => b === undefined ? Math.random() * a : a + Math.random() * (b - a);
const irnd = (a, b) => Math.floor(rnd(a, b + 1));
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const hex2rgb = h => { h = h.replace('#', ''); return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]; };
const rgb = (c) => `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`;
const mix = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const shade = (c, f) => c.map(v => clamp(v * f, 0, 255));
const BAYER = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]];

const store = {
  get(k, d) { try { const v = localStorage.getItem('lw_' + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('lw_' + k, JSON.stringify(v)); } catch (e) { } }
};
const settings = Object.assign({ units: 'F', sound: true, ambient: true, crt: true, tilt: false, auto: true, shake: true }, store.get('settings', {}));
const saveSettings = () => store.set('settings', settings);

const BITMAPS = {
  pin: ['..XXXX..', '.XXXXXX.', 'XXX..XXX', 'XXX..XXX', '.XXXXXX.', '..XXXX..', '...XX...', '...XX...'],
  refresh: ['..XXXX.X', '.X....XX', 'X....XXX', 'X.......', 'X......X', 'X......X', '.X....X.', '..XXXX..'],
  gear: ['...XX...', '.X.XX.X.', '..XXXX..', 'XXX..XXX', 'XXX..XXX', '..XXXX..', '.X.XX.X.', '...XX...'],
  sound: ['...X....', '..XX..X.', 'XXXX...X', 'XXXX.X.X', 'XXXX.X.X', 'XXXX...X', '..XX..X.', '...X....'],
  mute: ['...X....', '..XX....', 'XXXX.X.X', 'XXXX..X.', 'XXXX..X.', 'XXXX.X.X', '..XX....', '...X....'],
  clock: ['..XXXX..', '.X....X.', 'X..X...X', 'X..X...X', 'X..XXX.X', 'X......X', '.X....X.', '..XXXX..'],
  cal: ['X.X..X.X', 'XXXXXXXX', 'X......X', 'X.X.X.XX', 'X......X', 'X.X.X..X', 'X......X', 'XXXXXXXX'],
  heart: ['.XX..XX.', 'XXXXXXXX', 'XXXXXXXX', 'XXXXXXXX', '.XXXXXX.', '..XXXX..', '...XX...', '........'],
  sun: ['X..X...X', '.X.X..X.', '..XXXX..', 'XXXXXXXX', '..XXXX..', '.XXXXX..', 'X..X..X.', '...X...X'],
  pad: ['........', '.XXXXXX.', 'XX.XXXXX', 'X...X.XX', 'XX.XXXXX', 'XXXX.XXX', 'XX....XX', '........'],
  alert: ['...XX...', '..XXXX..', '..X..X..', '.XX..XX.', '.XX..XX.', 'XXXXXXXX', 'XXX..XXX', 'XXXXXXXX'],
};
function pixelSVG(name, color = 'currentColor') {
  const rows = BITMAPS[name]; if (!rows) return '';
  let r = '';
  rows.forEach((row, y) => { for (let x = 0; x < 8; x++) if (row[x] === 'X') r += `<rect x="${x}" y="${y}" width="1.02" height="1.02"/>`; });
  return `<svg viewBox="0 0 8 8" shape-rendering="crispEdges" fill="${color}">${r}</svg>`;
}
function hydrateIcons(root = document) { root.querySelectorAll('i[data-icon]').forEach(i => { i.innerHTML = pixelSVG(i.dataset.icon); }); }

const WMO = {
  0: 'Clear Sky', 1: 'Mainly Clear', 2: 'Partly Cloudy', 3: 'Overcast', 45: 'Fog', 48: 'Freezing Fog',
  51: 'Light Drizzle', 53: 'Drizzle', 55: 'Heavy Drizzle', 56: 'Freezing Drizzle', 57: 'Heavy Freezing Drizzle',
  61: 'Light Rain', 63: 'Rain', 65: 'Heavy Rain', 66: 'Freezing Rain', 67: 'Heavy Freezing Rain',
  71: 'Light Snow', 73: 'Snow', 75: 'Heavy Snow', 77: 'Snow Grains', 80: 'Rain Showers', 81: 'Heavy Showers',
  82: 'Violent Showers', 85: 'Snow Showers', 86: 'Heavy Snow Showers', 95: 'Thunderstorm', 96: 'T-Storm + Hail', 99: 'Severe T-Storm + Hail'
};
function kindFor(code) {
  if (code === 0) return 'clear'; if (code === 1) return 'mostly'; if (code === 2) return 'partly'; if (code === 3) return 'cloudy';
  if (code === 45 || code === 48) return 'fog';
  if (code >= 51 && code <= 55) return 'drizzle';
  if (code === 56 || code === 57 || code === 66 || code === 67) return 'sleet';
  if (code === 61 || code === 63 || code === 80 || code === 81) return 'rain';
  if (code === 65 || code === 82) return 'heavy';
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow';
  if (code === 95) return 'storm';
  if (code === 96 || code === 99) return 'hail';
  return 'cloudy';
}

const iconCache = {};
function iconURL(kind, night = false, size = 16) {
  const key = kind + (night ? 'n' : 'd');
  if (iconCache[key]) return iconCache[key];
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d');
  const P = (x, y, col) => { g.fillStyle = col; g.fillRect(x, y, 1, 1); };
  const sun = (cx, cy, r) => {
    for (let a = 0; a < 8; a++) { const ang = a * Math.PI / 4; P(Math.round(cx + Math.cos(ang) * (r + 2)), Math.round(cy + Math.sin(ang) * (r + 2)), '#ffb13b'); }
    for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) {
      const d = x * x + y * y; if (d > r * r + r * .6) continue;
      const edge = d > (r - 1) * (r - 1) + (r - 1) * .6;
      P(cx + x, cy + y, edge ? '#e8711c' : (x + y < -1 ? '#fff6a8' : (x + y < 2 ? '#ffd84a' : '#ffb13b')));
    }
  };
  const moon = (cx, cy, r) => {
    for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) {
      const d = x * x + y * y; if (d > r * r + r * .6) continue;
      if ((x - 2) * (x - 2) + (y + 1) * (y + 1) < (r - .5) * (r - .5)) continue;
      P(cx + x, cy + y, d > (r - 1) * (r - 1) ? '#a9a2d8' : '#f2edc4');
    }
  };
  const cloud = (ox, oy, dark) => {
    const circ = [[4, 6, 3], [8, 4, 4], [11, 6, 3], [6, 7, 3]];
    const inside = (x, y) => y <= 9 && circ.some(([a, b, r]) => (x - a) ** 2 + (y - b) ** 2 <= r * r + r * .5);
    const pal = dark ? ['#7e85a8', '#5e6488', '#454a6b', '#2b2e45'] : ['#ffffff', '#dfe6ff', '#b7c2ea', '#5a6188'];
    for (let y = 0; y < 11; y++) for (let x = 0; x < 15; x++) {
      if (!inside(x, y)) continue;
      const edge = !inside(x + 1, y) || !inside(x - 1, y) || !inside(x, y + 1) || !inside(x, y - 1);
      P(ox + x, oy + y, edge ? pal[3] : (y < 4 ? pal[0] : y < 7 ? pal[1] : pal[2]));
    }
  };
  const drops = (col, list) => list.forEach(([x, y]) => { P(x, y, col); P(x, y + 1, col); });
  const flakes = list => list.forEach(([x, y]) => { P(x, y, '#fff'); P(x - 1, y, '#bfe0ff'); P(x + 1, y, '#bfe0ff'); P(x, y - 1, '#bfe0ff'); P(x, y + 1, '#bfe0ff'); });
  const body = night ? moon : sun;
  switch (kind) {
    case 'clear': body(8, 8, night ? 5 : 4); if (night) { P(2, 3, '#fff'); P(13, 12, '#fff'); P(3, 13, '#ccc'); } break;
    case 'mostly': body(6, 6, 4); cloud(3, 7, false); break;
    case 'partly': body(5, 5, 4); cloud(1, 5, false); break;
    case 'cloudy': cloud(2, 1, true); cloud(0, 4, false); break;
    case 'fog': cloud(1, 1, false); for (let i = 0; i < 3; i++) for (let x = 1 + (i % 2) * 2; x < 15 - (i % 2); x++) P(x, 11 + i * 2, i === 1 ? '#c9d2df' : '#9aa6b8'); break;
    case 'drizzle': cloud(1, 1, false); drops('#7cc6ff', [[4, 12], [8, 13], [12, 12]]); break;
    case 'rain': cloud(1, 1, true); drops('#4fb4ff', [[3, 12], [6, 14], [9, 12], [12, 14]]); break;
    case 'heavy': cloud(1, 0, true); drops('#2b8cff', [[2, 11], [4, 13], [6, 11], [8, 13], [10, 11], [12, 13], [14, 11]]); break;
    case 'sleet': cloud(1, 1, true); drops('#7cc6ff', [[4, 12], [10, 13]]); P(7, 13, '#fff'); P(7, 14, '#dfe8ff'); P(13, 12, '#fff'); break;
    case 'snow': cloud(1, 0, false); flakes([[4, 12], [9, 14], [13, 11]]); break;
    case 'storm': case 'hail':
      cloud(1, 0, true);
      [[8, 10], [7, 11], [6, 12], [7, 12], [8, 12], [7, 13], [6, 14], [5, 15]].forEach(([x, y]) => P(x, y, '#ffe94a'));
      if (kind === 'hail') { P(11, 12, '#fff'); P(12, 12, '#dfe8ff'); P(11, 13, '#dfe8ff'); P(13, 14, '#fff'); P(3, 13, '#fff'); }
      else drops('#4fb4ff', [[11, 12], [3, 12]]);
      break;
    default: cloud(0, 3, false);
  }
  return (iconCache[key] = c.toDataURL());
}
function moonPhaseURL(phase) {
  const S = 24, c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d'); const r = 10, cx = 12, cy = 12;
  const k = Math.cos(phase * 2 * Math.PI);
  for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) {
    if (x * x + y * y > r * r + r * .5) continue;
    const w = Math.sqrt(Math.max(0.01, r * r - y * y));
    const lit = phase < .5 ? (x / w > k) : (-x / w > k);
    const crater = ((x + 3) ** 2 + (y + 2) ** 2 < 6) || ((x - 4) ** 2 + (y - 4) ** 2 < 4) || ((x + 1) ** 2 + (y - 6) ** 2 < 2);
    g.fillStyle = lit ? (crater ? '#cfc9a0' : '#f4efc6') : (crater ? '#2a2850' : '#35325e');
    g.fillRect(cx + x, cy + y, 1, 1);
  }
  return c.toDataURL();
}
function moonPhase(date = new Date()) {
  const ref = Date.UTC(2000, 0, 6, 18, 14);
  let p = ((date.getTime() - ref) / 86400000) / 29.530588853; p = p - Math.floor(p);
  const names = ['New Moon', 'Waxing Crescent', 'First Quarter', 'Waxing Gibbous', 'Full Moon', 'Waning Gibbous', 'Last Quarter', 'Waning Crescent'];
  return { phase: p, name: names[Math.round(p * 8) % 8], illum: Math.round((1 - Math.cos(p * 2 * Math.PI)) / 2 * 100) };
}

const SFX = (() => {
  let ctx = null, master, amb, nodes = {}, cur = {};
  const enabled = () => settings.sound;
  function noiseBuffer(sec, brown) {
    const b = ctx.createBuffer(1, ctx.sampleRate * sec, ctx.sampleRate), d = b.getChannelData(0);
    let last = 0;
    for (let i = 0; i < d.length; i++) { const w = Math.random() * 2 - 1; if (brown) { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; } else d[i] = w; }
    return b;
  }
  function loop(buf, filters, vol = 0) {
    const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true;
    let n = s; filters.forEach(f => { n.connect(f); n = f; });
    const g = ctx.createGain(); g.gain.value = vol; n.connect(g); g.connect(amb); s.start();
    return g;
  }
  function filt(type, freq, Q = 1) { const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = Q; return f; }
  function init() {
    if (ctx) { if (ctx.state !== 'running') ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = 0.55; master.connect(ctx.destination);
    amb = ctx.createGain(); amb.gain.value = 0; amb.connect(master);
    const white = noiseBuffer(2.5), brown = noiseBuffer(3, true);
    nodes.rain = loop(white, [filt('highpass', 900), filt('lowpass', 7000)]);
    nodes.rainLow = loop(brown, [filt('lowpass', 500)]);
    const wf = filt('bandpass', 420, .8);
    nodes.wind = loop(brown, [wf]);
    nodes.fire = loop(brown, [filt('lowpass', 900)]);
    nodes.rumble = loop(brown, [filt('lowpass', 120)]);
    const lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = .13; lg.gain.value = 260; lfo.connect(lg); lg.connect(wf.frequency); lfo.start();
    setInterval(tickAmbient, 180);
    applyAmbient();
  }
  function env(g, t, a, d, v) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d); }
  function tone(f, dur = .1, type = 'square', vol = .15, when = 0, slide = null) {
    if (!ctx || !enabled()) return;
    const t = ctx.currentTime + when, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t); if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + dur);
    env(g, t, .005, dur, vol); o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + .05);
  }
  function burst(dur, type, freq, vol, when = 0, toFreq) {
    if (!ctx || !enabled()) return;
    const t = ctx.currentTime + when, s = ctx.createBufferSource(); s.buffer = noiseBuffer(dur + .1);
    const f = filt(type, freq, 1); if (toFreq) f.frequency.exponentialRampToValueAtTime(toFreq, t + dur);
    const g = ctx.createGain(); env(g, t, .01, dur, vol); s.connect(f); f.connect(g); g.connect(master); s.start(t); s.stop(t + dur + .1);
  }
  const api = {
    init,
    blip() { tone(880, .05, 'square', .09); tone(1320, .05, 'square', .07, .04); },
    tick() { tone(1500, .025, 'square', .05); },
    on() { tone(660, .06, 'square', .1); tone(990, .08, 'square', .1, .06); },
    off() { tone(660, .06, 'square', .1); tone(440, .09, 'square', .1, .06); },
    start() { [523, 659, 784, 1047].forEach((f, i) => tone(f, .12, 'square', .12, i * .09)); tone(1568, .4, 'triangle', .15, .38); tone(784, .4, 'square', .06, .38); },
    refresh() { [392, 523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, .06, 'square', .08, i * .045)); burst(.25, 'bandpass', 900, .08, 0, 4000); },
    coin() { tone(988, .07, 'square', .1); tone(1319, .3, 'square', .1, .07); },
    jump() { tone(300, .18, 'square', .12, 0, 900); },
    whoosh() { burst(.35, 'bandpass', 400, .25, 0, 2500); },
    error() { [440, 370, 311, 220].forEach((f, i) => tone(f, .12, 'square', .1, i * .1)); },
    alarm() { for (let i = 0; i < 3; i++) { tone(880, .12, 'square', .1, i * .3); tone(660, .12, 'square', .1, i * .3 + .15); } },
    thunder(big = 1) { burst(2.8, 'lowpass', 900, .55 * big, 0, 60); burst(1.2, 'lowpass', 2400, .25 * big, 0, 200); tone(55, 1.6, 'sawtooth', .12 * big, 0, 30); },
    plink() { tone(rnd(2200, 3400), .03, 'square', .025); },
    crackle() { burst(.03, 'highpass', 2500, rnd(.05, .14)); },
    chirp() { const f = rnd(2600, 3600); tone(f, .07, 'sine', .05, 0, f * 1.3); tone(f * 1.1, .07, 'sine', .05, .1, f * 1.4); },
    cricket() { for (let i = 0; i < 3; i++) tone(4200, .025, 'sine', .025, i * .05); },
    setScene(sc) { cur = sc || {}; applyAmbient(); },
    applyAmbient, suspend() { if (ctx) ctx.suspend(); }, resume() { if (ctx) ctx.resume(); }
  };
  function applyAmbient() {
    if (!ctx) return;
    const t = ctx.currentTime, on = settings.sound && settings.ambient;
    amb.gain.setTargetAtTime(on ? 0.7 : 0, t, .4);
    const s = cur, I = s.intensity || 0;
    const rainV = (s.precip === 'rain' || s.precip === 'drizzle' || s.precip === 'sleet') ? .05 + I * .22 : (s.precip === 'hail' ? .2 : 0);
    nodes.rain.gain.setTargetAtTime(rainV, t, .8);
    nodes.rainLow.gain.setTargetAtTime(rainV * .6, t, .8);
    nodes.wind.gain.setTargetAtTime(s.tornado ? 1.3 : (s.wind || 0) * .7 + (s.precip === 'snow' ? .1 : 0) + (s.cold ? .06 : 0), t, .8);
    nodes.fire.gain.setTargetAtTime(s.fire ? .45 : 0, t, .8);
    nodes.rumble.gain.setTargetAtTime(s.tornado ? .9 : (s.lightning ? .15 : 0), t, .8);
  }
  function tickAmbient() {
    if (!ctx || !settings.sound || !settings.ambient || document.hidden) return;
    const s = cur;
    if (s.fire && Math.random() < .6) api.crackle();
    if (s.birds && Math.random() < .04) api.chirp();
    if (s.fireflies && Math.random() < .25) api.cricket();
    if (s.precip === 'hail' && Math.random() < .5) api.plink();
    if (s.precip === 'sleet' && Math.random() < .25) api.plink();
  }
  return api;
})();

/* =================== THEMES =================== */
const THEMES = {
  day:     { sky: ['#2f6fd6', '#a6e0ff'], ground: '#3e8948', grid: '#8be87a', far: '#7088d8', near: '#2a6b45', tree: '#1d4d33', accent: '#ffd84a', accent2: '#ff5e7e' },
  night:   { sky: ['#06051a', '#3b2a72'], ground: '#170c30', grid: '#ff4fd8', far: '#2a2060', near: '#140c30', tree: '#0b0620', accent: '#c7a6ff', accent2: '#ff4fd8' },
  dusk:    { sky: ['#2b2466', '#ff8a5c'], ground: '#2a1a40', grid: '#ffb14f', far: '#5a3a7a', near: '#2b1a3d', tree: '#1a0f26', accent: '#ffb14f', accent2: '#ff5e7e' },
  cloudy:  { sky: ['#5e6e86', '#bcc6d2'], ground: '#45664a', grid: '#9fd09a', far: '#7d8aa3', near: '#3a5741', tree: '#2a4231', accent: '#d6e4ff', accent2: '#5e7aa8' },
  rain:    { sky: ['#323f56', '#8195ac'], ground: '#23384a', grid: '#7fd3ff', far: '#55657e', near: '#22384a', tree: '#162836', accent: '#7fd3ff', accent2: '#2b78d6' },
  storm:   { sky: ['#101219', '#454c60'], ground: '#192320', grid: '#5effb0', far: '#2e3444', near: '#151d1f', tree: '#0c1214', accent: '#ffe94a', accent2: '#6a4cff' },
  snow:    { sky: ['#86a8d8', '#f0f6ff'], ground: '#eef4ff', grid: '#9cc8ff', far: '#a8bde0', near: '#d8e4f5', tree: '#2f5a4a', accent: '#bfe6ff', accent2: '#4f7fd6' },
  cold:    { sky: ['#4f86d0', '#dcf2ff'], ground: '#dfeaf8', grid: '#7fb8ff', far: '#9db6e0', near: '#c5d6ee', tree: '#2f5a4a', accent: '#9fe8ff', accent2: '#3a6fd6' },
  heat:    { sky: ['#ff6a2a', '#ffe27a'], ground: '#d9a066', grid: '#ff5e3a', far: '#d07a4a', near: '#b9733f', tree: '#4f8f3a', accent: '#ffe94a', accent2: '#ff3b1f' },
  fire:    { sky: ['#1e0404', '#ff5a1f'], ground: '#2a1208', grid: '#ff3b1f', far: '#4a140c', near: '#240b06', tree: '#100503', accent: '#ffb13b', accent2: '#ff3b1f' },
  fog:     { sky: ['#8c979f', '#dadfe2'], ground: '#7b8a83', grid: '#c5d0cb', far: '#aab3b8', near: '#8e9a95', tree: '#5f6d68', accent: '#e8eef0', accent2: '#6f7f88' },
  tornado: { sky: ['#1a241a', '#8a9a5e'], ground: '#36442a', grid: '#c4ff5e', far: '#4a5838', near: '#2a3620', tree: '#18200f', accent: '#c4ff5e', accent2: '#ff5e3a' },
  wind:    { sky: ['#3f78c8', '#bfe4ff'], ground: '#4d8a52', grid: '#b8f0a0', far: '#7f95d8', near: '#2f6b48', tree: '#1d4d33', accent: '#d6f5ff', accent2: '#3fa8ff' },
};
const CLOUD_PAL = {
  white: ['#ffffff', '#e8eeff', '#c3cdef', '#8f9bc8', '#5a6188'],
  grey:  ['#d9dee6', '#b4bccb', '#8c95a8', '#6a7286', '#3f4558'],
  dark:  ['#7a8199', '#5a6078', '#434860', '#2e3246', '#14161f'],
  green: ['#8a9a72', '#6a7a56', '#4e5c40', '#36422c', '#1a2014'],
  smoke: ['#6a5048', '#4e3a34', '#3a2a26', '#7a3a1a', '#140c0a'],
  dusk:  ['#ffe0e8', '#ffb8c8', '#e88aa8', '#a85a88', '#4a2050'],
  night: ['#5a5a8a', '#46467a', '#343462', '#24244a', '#121230'],
  fog:   ['#f0f2f4', '#dde2e6', '#c3cad0', '#a8b0b8', '#7f8890'],
};

function makeScene(o) {
  const k = o.kind || 'clear';
  const s = { kind: k, night: !!o.night, dusk: !!o.dusk, precip: null, intensity: 0, clouds: 0, cloudType: 'white', lightning: false, fog: 0,
    wind: o.windy ? .75 : .12, tornado: !!o.tornado, fire: !!o.fire, heat: !!o.heat, cold: !!o.cold, smoke: !!o.smoke, temp: o.temp ?? 65 };
  switch (k) {
    case 'clear': s.clouds = 1; break;
    case 'mostly': s.clouds = 2; break;
    case 'partly': s.clouds = 4; break;
    case 'cloudy': s.clouds = 9; s.cloudType = 'grey'; break;
    case 'fog': s.clouds = 3; s.cloudType = 'fog'; s.fog = 1; break;
    case 'drizzle': s.precip = 'drizzle'; s.intensity = .25; s.clouds = 7; s.cloudType = 'grey'; break;
    case 'rain': s.precip = 'rain'; s.intensity = .55; s.clouds = 8; s.cloudType = 'dark'; break;
    case 'heavy': s.precip = 'rain'; s.intensity = 1; s.clouds = 10; s.cloudType = 'dark'; s.wind = Math.max(s.wind, .45); break;
    case 'sleet': s.precip = 'sleet'; s.intensity = .6; s.clouds = 8; s.cloudType = 'grey'; s.cold = true; break;
    case 'snow': s.precip = 'snow'; s.intensity = o.heavy ? 1 : .55; s.clouds = 8; s.cloudType = 'grey'; s.cold = true; if (o.heavy) s.wind = Math.max(s.wind, .7); break;
    case 'storm': s.precip = 'rain'; s.intensity = .85; s.clouds = 10; s.cloudType = 'dark'; s.lightning = true; s.wind = Math.max(s.wind, .5); break;
    case 'hail': s.precip = 'hail'; s.intensity = .8; s.clouds = 10; s.cloudType = 'dark'; s.lightning = true; s.wind = Math.max(s.wind, .5); break;
  }
  if (o.smoke) { s.fog = 1; s.cloudType = 'smoke'; s.clouds = 3; }
  if (s.tornado) { s.clouds = 10; s.cloudType = 'green'; s.lightning = true; s.wind = 1; if (!s.precip) { s.precip = 'rain'; s.intensity = .45; } }
  if (s.fire) { s.clouds = 4; s.cloudType = 'smoke'; s.precip = null; s.lightning = false; }
  let theme;
  if (s.fire) theme = 'fire';
  else if (s.tornado) theme = 'tornado';
  else if (k === 'storm' || k === 'hail') theme = 'storm';
  else if (k === 'snow' || k === 'sleet') theme = 'snow';
  else if (s.precip) theme = 'rain';
  else if (k === 'fog') theme = 'fog';
  else if (s.heat) theme = 'heat';
  else if (s.cold) theme = 'cold';
  else if (k === 'cloudy') theme = 'cloudy';
  else if (s.wind > .6) theme = 'wind';
  else theme = s.night ? 'night' : (s.dusk ? 'dusk' : 'day');
  s.theme = theme;
  s.dim = s.night && !['night', 'dusk', 'fire'].includes(theme);
  if (s.night && s.cloudType === 'white') s.cloudType = 'night';
  if (theme === 'dusk' && s.cloudType === 'white') s.cloudType = 'dusk';
  s.sun = !s.night && s.clouds <= 6 && !['storm', 'tornado', 'fog', 'rain', 'snow'].includes(theme);
  s.moon = s.night && s.clouds <= 7 && theme !== 'fog';
  s.stars = s.night && s.clouds <= 7 && theme !== 'fog';
  s.birds = !s.night && ['clear', 'mostly', 'partly'].includes(k) && !s.heat && !s.fire && !s.tornado;
  s.fireflies = s.night && !s.precip && s.temp >= 60 && !s.cold && !s.fire && !s.tornado;
  s.deck = s.clouds >= 8;
  s.key = JSON.stringify([theme, k, s.night, s.dusk, s.heat, s.cold, s.fire, s.tornado, s.wind > .6, s.precip, s.intensity, s.smoke]);
  s.level = levelName(s);
  return s;
}
function levelName(s) {
  if (s.tornado) return '⚠ FINAL BOSS · TORNADO ALLEY';
  if (s.fire) return 'WORLD 8-4 · INFERNO ZONE';
  if (s.kind === 'hail') return 'WORLD 6-3 · HAILSTORM HAVOC';
  if (s.kind === 'storm') return 'WORLD 6-1 · THUNDERDOME';
  if (s.kind === 'snow') return s.intensity > .8 ? 'WORLD 5-4 · BLIZZARD PEAK' : 'WORLD 5-1 · SNOWCAP SUMMIT';
  if (s.kind === 'sleet') return 'WORLD 5-2 · SLUSH SWAMP';
  if (s.kind === 'heavy') return 'WORLD 3-4 · MONSOON MAYHEM';
  if (s.kind === 'rain') return 'WORLD 3-1 · PUDDLE PALACE';
  if (s.kind === 'drizzle') return 'WORLD 3-0 · DRIZZLE DUNGEON';
  if (s.smoke) return 'WORLD 4-2 · SMOKE SCREEN';
  if (s.kind === 'fog') return 'WORLD 4-1 · FOG FOREST';
  if (s.heat) return 'WORLD 7-1 · LAVA LANDS';
  if (s.cold) return 'WORLD 5-0 · FROSTBITE FORTRESS';
  if (s.wind > .6) return 'WORLD 2-3 · GUSTY GORGE';
  if (s.kind === 'cloudy') return 'WORLD 2-1 · GREY ZONE';
  if (s.night) return 'WORLD 1-2 · NEON NIGHT';
  if (s.kind === 'partly') return 'WORLD 1-3 · CLOUD KINGDOM';
  return 'WORLD 1-1 · SUNNY MEADOWS';
}

const Scene = (() => {
  const cv = $('#scene'), ctx = cv.getContext('2d', { alpha: false });
  ctx.imageSmoothingEnabled = false;
  const mk = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(1, w | 0); c.height = Math.max(1, h | 0); c.getContext('2d').imageSmoothingEnabled = false; return c; };
  let W = 192, H = 400, scale = 2, HY = 200, FY = 264;
  let sc = makeScene({ kind: 'clear', night: false }), pal = THEMES.day;
  let L = {};
  let t = 0, last = 0, running = true;
  let drops = [], splashes = [], clouds = [], stars = [], bolts = [], streaks = [], leaves = [], embers = [], birds = [], flies = [], puffs = [], zzz = [], debris = [], drips = [];
  let flashA = 0, nextBolt = 2, nextBird = 2, nextShoot = 5, shoot = null, nextDrip = 1;
  let cam = 0, tilt = { x: 0, y: 0 }, tiltT = { x: 0, y: 0 };
  let fire = null;
  let sunFrac = .5, moonP = .5;
  const ch = { x: 0, jy: 0, vy: 0, blink: 3, blinking: 0, alarm: 0, breath: 1.5, wink: 0 };
  let buf = null;

  function P(g, x, y, c) { g.fillStyle = c; g.fillRect(x | 0, y | 0, 1, 1); }

  function resize() {
    const app = $('#app');
    const aw = app.clientWidth || window.innerWidth, ah = app.clientHeight || window.innerHeight;
    W = 192; scale = aw / W; H = Math.ceil(ah / scale);
    cv.width = W; cv.height = H; cv.style.width = aw + 'px'; cv.style.height = Math.ceil(H * scale) + 'px';
    ctx.imageSmoothingEnabled = false;
    HY = Math.round(H * .5); FY = Math.round(H * .66);
    ch.x = Math.round(W * .66);
    buf = mk(W, H);
    build();
  }

  function build() {
    pal = THEMES[sc.theme] || THEMES.day;
    const dim = sc.dim ? .42 : 1;
    const tint = c => { let v = hex2rgb(c); if (sc.dim) v = [v[0] * dim * .85, v[1] * dim * .9, v[2] * dim * 1.15 + 10]; return v; };
    const rng = mulberry32(1234);
    {
      const c = mk(W, HY + 2), g = c.getContext('2d'), img = g.createImageData(W, HY + 2), d = img.data;
      const a = tint(pal.sky[0]), b = tint(pal.sky[1]), bands = 9;
      for (let y = 0; y < HY + 2; y++) for (let x = 0; x < W; x++) {
        let tt = y / HY + (BAYER[y & 3][x & 3] / 16 - .5) / bands;
        tt = clamp(Math.floor(clamp(tt, 0, 1) * bands) / bands, 0, 1);
        const col = mix(a, b, Math.pow(tt, .9)); const i = (y * W + x) * 4;
        d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2]; d[i + 3] = 255;
      }
      g.putImageData(img, 0, 0); L.sky = c;
    }
    {
      const w = W + 60, c = mk(w, HY + 1), g = c.getContext('2d');
      const base = tint(pal.far), hi = shade(base, 1.25), lo = shade(base, .8);
      const snowy = !['heat', 'fire', 'tornado'].includes(sc.theme);
      const ph = [rng() * 6, rng() * 6, rng() * 6];
      const hf = x => Math.sin(x * .045 + ph[0]) * 14 + Math.sin(x * .11 + ph[1]) * 7;
      for (let x = 0; x < w; x++) {
        const hgt = 30 + hf(x) + Math.sin(x * .23 + ph[2]) * 3;
        const top = Math.round(HY - hgt);
        const slope = hf(x + 1) - hf(x);
        for (let y = top; y <= HY; y++) {
          let col = slope > 0 ? hi : lo;
          if (y - top > 6) col = base;
          if (snowy && y < HY - 36 && y - top < 5) col = sc.dim ? [150, 160, 200] : [240, 246, 255];
          if (y - top > 6 && BAYER[y & 3][x & 3] > 13) col = lo;
          g.fillStyle = rgb(col); g.fillRect(x, y, 1, 1);
        }
      }
      L.far = c;
    }
    {
      const w = W + 100, c = mk(w, HY + 1), g = c.getContext('2d');
      const base = tint(pal.near), hi = shade(base, 1.2), tree = tint(pal.tree);
      const ph = rng() * 6, tops = [];
      for (let x = 0; x < w; x++) {
        const top = Math.round(HY - 12 - Math.sin(x * .06 + ph) * 6 - Math.sin(x * .17) * 2);
        tops.push(top);
        g.fillStyle = rgb(base); g.fillRect(x, top, 1, HY - top + 1);
        g.fillStyle = rgb(hi); g.fillRect(x, top, 1, 1);
      }
      const snowTop = ['snow', 'cold'].includes(sc.theme);
      for (let x = 4; x < w - 4; x += 5 + Math.floor(rng() * 9)) {
        const ty = tops[x], hgt = 7 + Math.floor(rng() * 8);
        if (sc.theme === 'heat') {
          g.fillStyle = rgb([70, 140, 60]); g.fillRect(x, ty - hgt, 2, hgt);
          g.fillRect(x - 2, ty - hgt + 3, 2, 1); g.fillRect(x - 2, ty - hgt + 1, 1, 3); g.fillRect(x + 2, ty - hgt + 5, 2, 1); g.fillRect(x + 3, ty - hgt + 3, 1, 3);
          g.fillStyle = rgb([110, 190, 90]); g.fillRect(x, ty - hgt, 1, hgt);
          continue;
        }
        for (let i = 0; i < hgt; i++) {
          const half = Math.floor(i * .45) + (i % 3 === 2 ? 1 : 0);
          g.fillStyle = rgb(sc.theme === 'fire' ? [20, 8, 5] : tree); g.fillRect(x - half, ty - hgt + i, half * 2 + 1, 1);
          if (snowTop && i % 3 === 0) { g.fillStyle = '#f4f8ff'; g.fillRect(x - half, ty - hgt + i, half * 2 + 1, 1); }
          else if (sc.theme !== 'fire') { g.fillStyle = rgb(shade(tree, 1.35)); g.fillRect(x - half, ty - hgt + i, 1, 1); }
        }
        g.fillStyle = '#3a2416'; g.fillRect(x, ty - 1, 1, 2);
        if (sc.theme === 'fire' && rng() < .5) { g.fillStyle = '#ff7a1f'; g.fillRect(x, ty - hgt + 2, 1, 1); }
      }
      L.near = c;
    }
    {
      const h = H - HY, c = mk(W, h), g = c.getContext('2d'), img = g.createImageData(W, h), d = img.data;
      const base = tint(pal.ground), far = mix(base, tint(pal.sky[1]), .35), near = shade(base, 1.08);
      for (let y = 0; y < h; y++) for (let x = 0; x < W; x++) {
        let tt = Math.pow(y / h, .5) + (BAYER[y & 3][x & 3] / 16 - .5) / 6;
        tt = clamp(Math.floor(clamp(tt, 0, 1) * 6) / 6, 0, 1);
        const col = mix(far, near, tt), i = (y * W + x) * 4;
        d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2]; d[i + 3] = 255;
      }
      g.putImageData(img, 0, 0); L.ground = c;
    }
    {
      const hot = sc.heat, R = hot ? 14 : 11, c = mk(R * 2 + 12, R * 2 + 12), g = c.getContext('2d'), cx = R + 6, cy = R + 6;
      const pals = sc.theme === 'fire' ? ['#ffb08a', '#ff6a3a', '#d8301a', '#8a1a0a'] : hot ? ['#fffbd0', '#fff07a', '#ffb13b', '#ff6a1f'] : sc.theme === 'dusk' ? ['#fff0c0', '#ffc86a', '#ff8a3a', '#d8501a'] : ['#fffbe0', '#fff07a', '#ffd84a', '#ffaa2a'];
      for (let y = -R - 5; y <= R + 5; y++) for (let x = -R - 5; x <= R + 5; x++) {
        const dd = Math.sqrt(x * x + y * y);
        if (dd <= R) { const l = (-x - y) / (R * 1.4); P(g, cx + x, cy + y, l > .35 ? pals[0] : l > -.1 ? pals[1] : l > -.5 ? pals[2] : pals[3]); }
        else if (dd <= R + 4 && BAYER[(y + 99) & 3][(x + 99) & 3] < (R + 4 - dd) * 4) { g.fillStyle = pals[2] + '66'; g.fillRect(cx + x, cy + y, 1, 1); }
      }
      L.sun = c; L.sunR = R;
      const mr = 9, m = mk(mr * 2 + 14, mr * 2 + 14), mg = m.getContext('2d'), mc = mr + 7, k = Math.cos(moonP * 2 * Math.PI);
      for (let y = -mr - 6; y <= mr + 6; y++) for (let x = -mr - 6; x <= mr + 6; x++) {
        const dd = Math.sqrt(x * x + y * y);
        if (dd <= mr) {
          const w = Math.sqrt(Math.max(.01, mr * mr - y * y)), lit = moonP < .5 ? (x / w > k) : (-x / w > k);
          const crater = ((x + 3) ** 2 + (y + 2) ** 2 < 5) || ((x - 3) ** 2 + (y - 4) ** 2 < 3) || ((x + 1) ** 2 + (y - 5) ** 2 < 2);
          P(mg, mc + x, mc + y, lit ? (crater ? '#cfc8a0' : '#f6f0c8') : (crater ? '#2c2a52' : '#3a3766'));
        } else if (dd <= mr + 6 && BAYER[(y + 99) & 3][(x + 99) & 3] < (mr + 6 - dd) * 2.2) { mg.fillStyle = 'rgba(220,215,255,.25)'; mg.fillRect(mc + x, mc + y, 1, 1); }
      }
      L.moon = m;
    }
    {
      const cp = CLOUD_PAL[sc.cloudType] || CLOUD_PAL.white;
      const cpal = sc.dim ? cp.map(c => rgb(shade(hex2rgb(c), .5))) : cp;
      L.cloudSprites = [];
      for (let i = 0; i < 7; i++) L.cloudSprites.push(makeCloud(34 + Math.floor(rng() * 34), 16 + Math.floor(rng() * 10), cpal, mulberry32(77 + i * 13)));
      clouds = [];
      const n = sc.clouds;
      for (let i = 0; i < n; i++) {
        const spr = L.cloudSprites[i % L.cloudSprites.length], depth = .4 + (i / Math.max(1, n)) * .6;
        clouds.push({ spr, x: rnd(-40, W), y: Math.round(rnd(H * .05, H * (sc.deck ? .3 : .36))), depth, sp: rnd(.7, 1.3) });
      }
      clouds.sort((a, b) => a.depth - b.depth);
      if (sc.deck) {
        const w = W + 80, h = Math.round(H * .2), c = mk(w, h + 14), g = c.getContext('2d');
        for (let i = 0; i < 14; i++) { const s = L.cloudSprites[i % 7]; g.drawImage(s, (i * 19) % w - 10, Math.floor(rnd(-6, h - s.height + 6))); }
        g.globalCompositeOperation = 'destination-over'; g.fillStyle = cpal[2]; g.fillRect(0, 0, w, h * .55);
        L.deck = c;
      } else L.deck = null;
    }
    if (sc.fog || sc.smoke) {
      const w = W * 2, c = mk(w, H), g = c.getContext('2d'), r2 = mulberry32(9);
      const col = sc.smoke ? '150,110,90' : (sc.dim ? '120,130,150' : '235,240,245');
      const ph = [r2() * 9, r2() * 9, r2() * 9];
      for (let y = Math.floor(H * .2); y < H; y++) for (let x = 0; x < w; x++) {
        const v = .5 + .3 * Math.sin(x * .031 + ph[0] + y * .02) * Math.sin(y * .09 + ph[1]) + .2 * Math.sin(x * .09 + y * .05 + ph[2]);
        const band = clamp(1 - Math.abs(y - H * .55) / (H * .38), 0, 1);
        if (v * band * 16 > BAYER[y & 3][x & 3] + 2) { g.fillStyle = `rgba(${col},.55)`; g.fillRect(x, y, 1, 1); }
      }
      L.fog = c;
    } else L.fog = null;
    if (sc.cold || sc.theme === 'snow') {
      const c = mk(W, H), g = c.getContext('2d'), r2 = mulberry32(5);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const e = Math.min(x, W - 1 - x, y * 1.4, (H - 1 - y) * 1.2);
        const dens = clamp(1 - e / 16, 0, 1);
        if (dens > 0 && r2() < dens * dens * .7) { g.fillStyle = r2() < .3 ? 'rgba(255,255,255,.85)' : 'rgba(190,225,255,.55)'; g.fillRect(x, y, 1, 1); }
      }
      L.frost = c;
      const ic = mk(W, 40), ig = ic.getContext('2d'); L.icicleTips = [];
      const top = Math.round(54 / scale);
      for (let x = 1; x < W; x += 3 + Math.floor(r2() * 4)) {
        const len = 4 + Math.floor(r2() * 16);
        for (let i = 0; i < len; i++) { const wdt = Math.max(1, Math.round((1 - i / len) * 3)); ig.fillStyle = i < len * .4 ? '#e8f6ff' : '#a8d8ff'; ig.fillRect(x, i, wdt, 1); if (wdt > 1) { ig.fillStyle = '#ffffff'; ig.fillRect(x, i, 1, 1); } }
        L.icicleTips.push([x, top + len]);
      }
      L.icicles = ic; L.icicleTop = top;
    } else { L.frost = null; L.icicles = null; }
    stars = [];
    if (sc.stars) for (let i = 0; i < 80; i++) stars.push({ x: Math.floor(rng() * W), y: Math.floor(rng() * HY * .85), r: rng() * 5 + 1, p: rng() * 6, big: rng() < .1 });
    if (sc.fire) {
      const fw = W, fh = Math.round(H * .22); fire = { fw, fh, b: new Uint8Array(fw * fh), c: mk(fw, fh), acc: 0 };
      fire.img = fire.c.getContext('2d').createImageData(fw, fh);
    } else fire = null;
    drops = []; splashes = []; streaks = []; leaves = []; embers = []; birds = []; flies = []; debris = []; drips = [];
    if (sc.fireflies) for (let i = 0; i < 14; i++) flies.push({ x: rnd(W), y: rnd(HY - 10, FY + 10), vx: 0, vy: 0, p: rnd(6) });
    if (sc.tornado) for (let i = 0; i < 46; i++) debris.push({ a: rnd(6.28), u: rnd(.55, 1.05), s: rnd(2, 5), c: pick(['#5a3a1a', '#7a5a3a', '#3a3a3a', '#8a8a6a', '#a07040']), z: irnd(1, 2) });
    for (let i = 0; i < Math.round(4 + sc.wind * 22); i++) streaks.push({ x: rnd(W), y: rnd(H * .08, FY), len: irnd(5, 14), sp: rnd(80, 160) });
    const app = $('#app'); app.style.setProperty('--accent', pal.accent); app.style.setProperty('--accent2', pal.accent2);
  }

  function makeCloud(w, h, pal, r) {
    const c = mk(w, h), g = c.getContext('2d'), img = g.createImageData(w, h), d = img.data;
    const circ = [[w / 2, h * .55, h * .42]];
    const n = 4 + Math.floor(r() * 4);
    for (let i = 0; i < n; i++) { const rad = h * (.22 + r() * .22); circ.push([rad + r() * (w - 2 * rad), h * .62 - r() * h * .22, rad]); }
    const base = Math.floor(h * .84);
    const inside = (x, y) => y >= 0 && x >= 0 && x < w && y <= base && circ.some(([a, b, rr]) => (x - a) ** 2 + (y - b) ** 2 <= rr * rr);
    const cols = pal.map(hex => hex.startsWith('#') ? hex2rgb(hex) : hex.match(/\d+/g).map(Number));
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (!inside(x, y)) continue;
      let best = null, bd = -1e9;
      for (const cc of circ) { const dd = cc[2] - Math.hypot(x - cc[0], y - cc[1]); if (dd > bd) { bd = dd; best = cc; } }
      const nx = (x - best[0]) / best[2], ny = (y - best[1]) / best[2];
      let l = -.45 * nx - .9 * ny + (BAYER[y & 3][x & 3] / 16 - .5) * .35;
      if (y >= base - 1) l -= .6;
      let idx = l > .45 ? 0 : l > .05 ? 1 : l > -.4 ? 2 : 3;
      if (!inside(x, y + 1)) idx = 4; else if (!inside(x, y - 1) && idx > 1) idx = 1;
      const col = cols[idx], i = (y * w + x) * 4;
      d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2]; d[i + 3] = 255;
    }
    g.putImageData(img, 0, 0); return c;
  }

  /* ---------- character sprite: Evan edition ----------
     Swept-up light-brown quiff, mustache + stubble, rosy cheeks,
     signature smirk, olive tee, jeans, white sneakers. */
  const SPR = [
    '...kkkkkkk..',
    '..kHHHHHHHk.',
    '.kHHhhhhHHk.',
    '.khhhhhhhhk.',
    '.khhsssshhk.',
    'kSsesssseshk',
    'kSssssSsssSk',
    '.krssSSssrk.',
    '.ksbmmmmLsk.',
    '.kbbbbLLbbk.',
    '..kbbbbbbk..',
    '.kgggSSgggk.',
    'kggggggggggk',
    'kskggggggksk',
    'kskGGGGGGksk',
    '...kpkkpk...',
    '..kookkook..',
    '..kkkk.kkkk.'];
  const SPAL = { k: '#1a1c2c', h: '#8a5a32', H: '#b98048', s: '#f2c4a0', S: '#dba07e', r: '#ee9c88', e: '#3a2a1a', m: '#7a4524', L: '#b05a4a', b: '#cf9f80', g: '#7d8a62', G: '#5c6948', p: '#2f3a52', o: '#eee8da', w: '#fff', B: '#e43b44', T: '#ffd84a', U: '#e0a020' };
  function drawChar() {
    const S = 2, ox = Math.round(ch.x - cam * 3 - 12 + (sc.tornado ? rnd(-1, 1) : 0)), bob = (Math.floor(t * 2) % 2), oy = Math.round(FY - 36 + bob - ch.jy);
    const sp = (x, y, c) => { ctx.fillStyle = c; ctx.fillRect(ox + x * S, oy + y * S, S, S); };
    const shw = Math.max(6, 11 - ch.jy * .15);
    ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fillRect(Math.round(ox + 12 - shw), FY - 1, Math.round(shw * 2), 2); ctx.fillRect(Math.round(ox + 12 - shw + 2), FY - 2, Math.round(shw * 2 - 4), 1);
    const sleeping = sc.night && !sc.precip && !sc.tornado && !sc.fire && !sc.lightning;
    const beanie = sc.cold || sc.theme === 'snow';
    const wet = sc.precip && ['rain', 'drizzle', 'sleet', 'hail'].includes(sc.precip);
    for (let y = 0; y < SPR.length; y++) for (let x = 0; x < 12; x++) {
      let c = SPR[y][x]; if (c === '.') continue;
      if (c === 'e' && (ch.blinking > 0 || sleeping || (ch.wink > 0 && x === 8))) c = 'S';
      if (beanie && y < 4 && c !== 'k') c = y === 3 ? 'w' : 'B';
      if (sc.theme === 'heat' && c === 'g') c = 'T'; if (sc.theme === 'heat' && c === 'G') c = 'U';
      sp(x, y, SPAL[c]);
    }
    // legs: walking-ish idle shuffle on row 15 handled by sprite; add knee row
    if (sleeping) { sp(3, 5, '#1a1c2c'); sp(8, 5, '#1a1c2c'); }
    if (beanie) {
      sp(5, -1, '#fff'); sp(6, -1, '#fff'); sp(5, -2, '#dfe8ff'); sp(6, -2, '#fff');
      for (let x = 2; x < 10; x++) sp(x, 11, x % 2 ? '#e43b44' : '#fff');
      const fl = Math.floor(t * 6) % 2; sp(9 + fl, 12, '#e43b44'); sp(9 + fl, 13, '#fff'); sp(10 + fl, 14, '#e43b44');
    }
    const shades = sc.heat || sc.fire || (!sc.night && sc.kind === 'clear' && sc.temp >= 78);
    if (shades) { for (let x = 2; x < 10; x++) sp(x, 5, '#0b0b14'); [2, 3, 4, 7, 8, 9].forEach(x => sp(x, 6, '#0b0b14')); sp(3, 5, '#7ad7ff'); sp(8, 5, '#7ad7ff'); }
    if (sc.heat || sc.fire) { const dy = (t * 6) % 6; sp(11, 3 + Math.floor(dy), '#7cc6ff'); }
    if (wet) {
      for (let y = -2; y < 13; y++) sp(10, y, '#3a2a1a');
      sp(10, 13, '#f2c4a0');
      const cols = ['#e43b44', '#ffffff'];
      for (let y = 0; y < 6; y++) { const half = Math.round(Math.sqrt(1 - ((5 - y) / 6) ** 2) * 9.5); for (let x = -half; x <= half; x++) sp(10 + x, -8 + y, y === 5 && (x & 1) ? '#1a1c2c' : cols[Math.floor((x + 12) / 3) % 2]); }
      sp(10, -9, '#1a1c2c');
    }
    if (sc.fog) {
      sp(11, 12, '#1a1c2c'); sp(11, 13, '#ffe94a'); sp(11, 14, '#ffb13b');
      const gx = ox + 23, gy = oy + 27, fl = 7 + Math.sin(t * 9) * .7;
      for (let y = -9; y <= 9; y++) for (let x = -9; x <= 9; x++) { const dd = Math.hypot(x, y); if (dd < fl && BAYER[(y + 9) & 3][(x + 9) & 3] < (fl - dd) * 2.2) { ctx.fillStyle = 'rgba(255,230,120,.35)'; ctx.fillRect(gx + x, gy + y, 1, 1); } }
    }
    if (ch.alarm > 0 || sc.tornado) { if (Math.floor(t * 4) % 2) { ctx.fillStyle = '#ff3b3b'; ctx.fillRect(ox + 10, oy - 18, 4, 9); ctx.fillRect(ox + 10, oy - 7, 4, 3); } }
    L.charHead = { x: ox + 12, y: oy - (wet ? 20 : 6) };
  }

  function line(x0, y0, x1, y1, col) {
    x0 |= 0; y0 |= 0; x1 |= 0; y1 |= 0; ctx.fillStyle = col;
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1; let err = dx + dy;
    for (let n = 0; n < 400; n++) { ctx.fillRect(x0, y0, 1, 1); if (x0 === x1 && y0 === y1) break; const e2 = 2 * err; if (e2 >= dy) { err += dy; x0 += sx; } if (e2 <= dx) { err += dx; y0 += sy; } }
  }

  function spawnBolt() {
    const x0 = rnd(W * .1, W * .9), y0 = H * rnd(.1, .2), y1 = HY + rnd(-4, 10);
    const pts = [[x0, y0]]; let x = x0, y = y0; const branches = [];
    while (y < y1) { x += rnd(-6, 6); y += rnd(4, 9); pts.push([x, Math.min(y, y1)]); if (Math.random() < .22) branches.push([[x, y], [x + rnd(-14, 14), y + rnd(8, 18)], [x + rnd(-20, 20), y + rnd(18, 28)]]); }
    bolts.push({ pts, branches, life: .32 });
    flashA = 1;
    const fl = $('#flash'); fl.classList.remove('go'); void fl.offsetWidth; fl.classList.add('go');
    if (settings.shake) shakeScreen(false);
    ch.alarm = 1.2;
    setTimeout(() => SFX.thunder(rnd(.6, 1)), rnd(120, 900));
  }
  function shakeScreen(big) { const st = $('#stage'); st.classList.remove('shake', 'shake-big'); void st.offsetWidth; st.classList.add(big ? 'shake-big' : 'shake'); }

  function update(dt) {
    tilt.x = lerp(tilt.x, tiltT.x, .08); tilt.y = lerp(tilt.y, tiltT.y, .08);
    cam = tilt.x * 5 + Math.sin(t * .25) * 1.5;
    const wind = sc.wind;
    for (const c of clouds) { c.x += (3 + wind * 22) * c.depth * c.sp * dt; if (c.x > W + 30) { c.x = -c.spr.width - 20; c.y = Math.round(rnd(H * .05, H * (sc.deck ? .3 : .36))); } }
    if (sc.precip) {
      const I = sc.intensity, rate = { rain: 60 + 380 * I, drizzle: 70, snow: 30 + 130 * I, sleet: 160, hail: 110 }[sc.precip] || 0;
      let n = rate * dt; while (n > 0) { if (Math.random() < n) spawnDrop(); n -= 1; }
    }
    for (let i = drops.length - 1; i >= 0; i--) {
      const d = drops[i];
      if (d.type === 'snow') { d.x += (Math.sin(t * 1.5 + d.p) * 10 + wind * 40) * dt; d.y += d.vy * dt; }
      else { d.x += d.vx * dt; d.y += d.vy * dt; if (d.bounce) d.vy += 380 * dt; }
      if (d.y >= d.gy && !d.landed) {
        if ((d.type === 'hail' || d.type === 'pellet') && !d.bounce) { d.bounce = true; d.vy = -d.vy * rnd(.2, .35); d.vx = rnd(-20, 20); d.y = d.gy - 1; d.gy += 2; continue; }
        if (d.type === 'rain') { for (let k = 0; k < 2; k++) splashes.push({ x: d.x, y: d.gy, vx: rnd(-18, 18), vy: rnd(-40, -15), life: .25 }); if (Math.random() < .25) splashes.push({ x: d.x, y: d.gy, ring: 1, life: .45 }); }
        if (d.type === 'snow') { d.landed = true; d.life = 1.2; continue; }
        drops.splice(i, 1); continue;
      }
      if (d.landed) { d.life -= dt; if (d.life <= 0) drops.splice(i, 1); continue; }
      if (d.y > H + 4 || d.x < -20 || d.x > W + 20) drops.splice(i, 1);
    }
    for (let i = splashes.length - 1; i >= 0; i--) { const s = splashes[i]; s.life -= dt; if (!s.ring) { s.x += s.vx * dt; s.y += s.vy * dt; s.vy += 260 * dt; } if (s.life <= 0) splashes.splice(i, 1); }
    if (sc.lightning) { nextBolt -= dt; if (nextBolt <= 0) { spawnBolt(); nextBolt = sc.tornado ? rnd(1.8, 5) : rnd(3, 9); } }
    for (let i = bolts.length - 1; i >= 0; i--) { bolts[i].life -= dt; if (bolts[i].life <= 0) bolts.splice(i, 1); }
    flashA = Math.max(0, flashA - dt * 3.2);
    ch.alarm = Math.max(0, ch.alarm - dt);
    for (const s of streaks) { s.x += s.sp * (.3 + wind) * dt; if (s.x > W + 20) { s.x = -20; s.y = rnd(H * .08, FY); } }
    if (wind > .5 && sc.precip !== 'snow' && leaves.length < 14 && Math.random() < dt * 6) leaves.push({ x: -4, y: rnd(HY - 30, FY + 6), vx: rnd(60, 130) * wind, vy: rnd(-10, 10), p: rnd(6), c: pick(sc.theme === 'fire' ? ['#ff7a1f', '#ffb13b'] : ['#e8a13b', '#c8502a', '#7fbf4a', '#d8c03a']) });
    for (let i = leaves.length - 1; i >= 0; i--) { const l = leaves[i]; l.x += l.vx * dt; l.y += (l.vy + Math.sin(t * 5 + l.p) * 30) * dt; if (l.x > W + 6) leaves.splice(i, 1); }
    if (sc.fire) { if (Math.random() < dt * 30) embers.push({ x: rnd(W), y: FY - 4, vx: rnd(-8, 8), vy: rnd(-45, -20), life: rnd(1.2, 3), c: pick(['#ffe94a', '#ffb13b', '#ff6a1f']) }); updateFire(dt); }
    for (let i = embers.length - 1; i >= 0; i--) { const e = embers[i]; e.x += (e.vx + Math.sin(t * 4 + i) * 10) * dt; e.y += e.vy * dt; e.life -= dt; if (e.life <= 0) embers.splice(i, 1); }
    if (sc.birds) { nextBird -= dt; if (nextBird <= 0) { const n = irnd(1, 4), y = rnd(H * .1, H * .3); for (let i = 0; i < n; i++) birds.push({ x: -6 - i * 7, y: y + (i % 2) * 4, sp: rnd(22, 30), p: rnd(6) }); nextBird = rnd(5, 12); } }
    for (let i = birds.length - 1; i >= 0; i--) { birds[i].x += birds[i].sp * dt; if (birds[i].x > W + 8) birds.splice(i, 1); }
    for (const f of flies) { f.vx += rnd(-30, 30) * dt; f.vy += rnd(-30, 30) * dt; f.vx *= .97; f.vy *= .97; f.x += f.vx * dt; f.y += f.vy * dt; if (f.x < 0) f.x = W; if (f.x > W) f.x = 0; f.y = clamp(f.y, HY - 30, FY + 20); }
    if (sc.stars) { nextShoot -= dt; if (nextShoot <= 0 && !shoot) { shoot = { x: rnd(W * .2, W), y: rnd(4, HY * .4), life: .7 }; nextShoot = rnd(6, 14); } }
    if (shoot) { shoot.x -= 160 * dt; shoot.y += 70 * dt; shoot.life -= dt; if (shoot.life <= 0) shoot = null; }
    for (const d of debris) d.a += dt * (5 + (1 - d.u) * 6);
    if (sc.tornado && Math.random() < dt * .25 && settings.shake) shakeScreen(true);
    if (L.icicles) { nextDrip -= dt; if (nextDrip <= 0) { const tip = pick(L.icicleTips); drips.push({ x: tip[0], y: tip[1], vy: 0 }); nextDrip = rnd(.6, 2); } }
    for (let i = drips.length - 1; i >= 0; i--) { const d = drips[i]; d.vy += 300 * dt; d.y += d.vy * dt; if (d.y > H) drips.splice(i, 1); }
    if (ch.jy > 0 || ch.vy) { ch.vy -= 420 * dt; ch.jy += ch.vy * dt; if (ch.jy <= 0) { ch.jy = 0; ch.vy = 0; } }
    ch.blink -= dt; if (ch.blink <= 0) { ch.blinking = .12; ch.blink = rnd(2.5, 5); } ch.blinking = Math.max(0, ch.blinking - dt);
    ch.wink = Math.max(0, ch.wink - dt);
    if (sc.cold || sc.theme === 'snow') { ch.breath -= dt; if (ch.breath <= 0) { puffs.push({ x: ch.x - cam * 3 - 2, y: FY - 21 - ch.jy, life: 1.2 }); ch.breath = rnd(1.4, 2.4); } }
    for (let i = puffs.length - 1; i >= 0; i--) { puffs[i].x -= 6 * dt; puffs[i].y -= 5 * dt; puffs[i].life -= dt; if (puffs[i].life <= 0) puffs.splice(i, 1); }
    const sleeping = sc.night && !sc.precip && !sc.tornado && !sc.fire && !sc.lightning;
    if (sleeping && Math.random() < dt * .8) zzz.push({ x: ch.x - cam * 3 + 8, y: FY - 34, life: 2.4 });
    for (let i = zzz.length - 1; i >= 0; i--) { zzz[i].y -= 9 * dt; zzz[i].x += Math.sin(t * 3 + i) * 6 * dt; zzz[i].life -= dt; if (zzz[i].life <= 0) zzz.splice(i, 1); }
  }

  function spawnDrop() {
    const p = sc.precip, gy = rnd(HY + 2, H);
    const near = (gy - HY) / (H - HY);
    const windVx = sc.wind * 70;
    if (p === 'rain' || p === 'drizzle') drops.push({ type: 'rain', x: rnd(-20, W + 10), y: rnd(-10, H * .15), vx: windVx * (.6 + near), vy: (p === 'drizzle' ? 140 : 230) * (.7 + near * .6), len: p === 'drizzle' ? 2 : Math.round(3 + near * 4 + sc.intensity * 2), gy, near });
    else if (p === 'snow') drops.push({ type: 'snow', x: rnd(-30, W + 10), y: rnd(-10, H * .1), vy: rnd(14, 26) * (.6 + near * .8), p: rnd(6), sz: near > .6 ? 2 : 1, gy, near });
    else if (p === 'sleet') { if (Math.random() < .55) drops.push({ type: 'rain', x: rnd(-10, W), y: -4, vx: windVx, vy: 260, len: 2, gy, near }); else drops.push({ type: 'pellet', x: rnd(-10, W), y: -4, vx: windVx * .8, vy: 200 + near * 60, gy, near }); }
    else if (p === 'hail') drops.push({ type: 'hail', x: rnd(-10, W), y: -4, vx: windVx * .5, vy: 210 + near * 80, gy, near, sz: near > .5 ? 2 : 1 });
  }

  const FIREPAL = [[7,7,7],[31,7,7],[47,15,7],[71,15,7],[87,23,7],[103,31,7],[119,31,7],[143,39,7],[159,47,7],[175,63,7],[191,71,7],[199,71,7],[223,79,7],[223,87,7],[223,87,7],[215,95,7],[215,95,7],[215,103,15],[207,111,15],[207,119,15],[207,127,15],[207,135,23],[199,135,23],[199,143,23],[199,151,31],[191,159,31],[191,159,31],[191,167,39],[191,167,39],[191,175,47],[183,175,47],[183,183,47],[183,183,55],[207,207,111],[223,223,159],[239,239,199],[255,255,255]];
  function updateFire(dt) {
    fire.acc += dt; if (fire.acc < 1 / 30) return; fire.acc = 0;
    const { fw, fh, b } = fire;
    for (let x = 0; x < fw; x++) { const v = Math.sin(x * .13 + t * 1.3) * .5 + Math.sin(x * .37 - t * 2.1) * .5; b[(fh - 1) * fw + x] = v > -.35 ? 36 : 14; }
    for (let x = 0; x < fw; x++) for (let y = 1; y < fh; y++) {
      const src = y * fw + x, px = b[src];
      if (px === 0) { b[src - fw] = 0; continue; }
      const r = (Math.random() * 3.5) & 3, dst = src - r + 1 - fw;
      if (dst >= 0 && dst < b.length) b[dst] = Math.max(0, px - (r & 1));
    }
    const d = fire.img.data;
    for (let i = 0; i < b.length; i++) { const c = FIREPAL[b[i]], j = i * 4; d[j] = c[0]; d[j + 1] = c[1]; d[j + 2] = c[2]; d[j + 3] = b[i] === 0 ? 0 : Math.min(255, b[i] * 55); }
    fire.c.getContext('2d').putImageData(fire.img, 0, 0);
  }

  function draw() {
    ctx.globalAlpha = 1;
    ctx.drawImage(L.sky, 0, 0);
    if (flashA > 0) { ctx.fillStyle = `rgba(230,225,255,${flashA * .55})`; ctx.fillRect(0, 0, W, HY); }
    for (const s of stars) { const b = .5 + .5 * Math.sin(t * s.r + s.p); if (b < .25) continue; ctx.fillStyle = `rgba(255,255,240,${b})`; ctx.fillRect(s.x - (cam * .2 | 0), s.y, 1, 1);
      if (s.big && b > .8) { ctx.fillStyle = 'rgba(200,200,255,.6)'; ctx.fillRect(s.x - 1, s.y, 3, 1); ctx.fillRect(s.x, s.y - 1, 1, 3); } }
    if (shoot) { for (let i = 0; i < 10; i++) { ctx.fillStyle = `rgba(255,255,255,${(1 - i / 10) * shoot.life})`; ctx.fillRect(Math.round(shoot.x + i * 2.2), Math.round(shoot.y - i), 1, 1); } }
    const bx = Math.round(W * .8 - cam * .3), arc = Math.sin(clamp(sunFrac, 0, 1) * Math.PI);
    if (sc.sun) {
      const sy = Math.round(HY * .72 - arc * HY * .3), R = L.sunR;
      const rays = sc.heat ? 16 : 12, rl = sc.heat ? 8 : 5;
      ctx.fillStyle = sc.heat ? '#ff8a2a' : '#ffd84a';
      if (sc.theme !== 'fire') for (let i = 0; i < rays; i++) { const a = i / rays * 6.283 + t * .4, pul = Math.sin(t * 3 + i) * 1.5; for (let k = 0; k < rl + pul; k++) { const r = R + 3 + k; ctx.fillRect(Math.round(bx + Math.cos(a) * r), Math.round(sy + Math.sin(a) * r), 1, 1); } }
      ctx.drawImage(L.sun, bx - L.sun.width / 2 | 0, sy - L.sun.height / 2 | 0);
    }
    if (sc.moon) { const my = Math.round(HY * .44); ctx.drawImage(L.moon, bx - L.moon.width / 2 | 0, my - L.moon.height / 2 | 0); }
    ctx.drawImage(L.far, Math.round(-30 - cam * 1), 0);
    if (L.deck) { const dx = ((t * (4 + sc.wind * 10)) % 80); ctx.drawImage(L.deck, Math.round(dx - 80), -6); ctx.drawImage(L.deck, Math.round(dx - 80 + L.deck.width), -6); }
    for (const c of clouds) if (c.depth < .7) ctx.drawImage(c.spr, Math.round(c.x - cam * c.depth * 2), c.y);
    for (const b of bolts) {
      if (Math.floor(b.life * 30) % 3 === 0) continue;
      const dr = (pts, col, w) => { for (let i = 1; i < pts.length; i++) { line(pts[i - 1][0] - w, pts[i - 1][1], pts[i][0] - w, pts[i][1], col); if (w) line(pts[i - 1][0] + w, pts[i - 1][1], pts[i][0] + w, pts[i][1], col); } };
      dr(b.pts, 'rgba(170,150,255,.6)', 1); dr(b.pts, '#fffbe0', 0); b.branches.forEach(br => dr(br, '#e8e0ff', 0));
    }
    ctx.drawImage(L.near, Math.round(-50 - cam * 2.2), 0);
    ctx.drawImage(L.ground, 0, HY);
    drawGrid();
    if (sc.theme === 'snow' || sc.cold) { for (let i = 0; i < 18; i++) { const x = (i * 37 + Math.floor(t * 2) * 13) % W, y = HY + 4 + (i * 53) % (H - HY - 4); if ((i + Math.floor(t * 3)) % 4 === 0) { ctx.fillStyle = '#fff'; ctx.fillRect(x, y, 1, 1); ctx.fillStyle = 'rgba(180,220,255,.8)'; ctx.fillRect(x - 1, y, 1, 1); ctx.fillRect(x + 1, y, 1, 1); } } }
    if (sc.tornado) drawTornado();
    if (fire) ctx.drawImage(fire.c, 0, FY - fire.fh + 6);
    for (const f of flies) { const b = .5 + .5 * Math.sin(t * 3 + f.p); if (b < .4) continue; ctx.fillStyle = `rgba(200,255,90,${b * .35})`; ctx.fillRect(Math.round(f.x) - 1, Math.round(f.y) - 1, 3, 3); ctx.fillStyle = `rgba(230,255,140,${b})`; ctx.fillRect(Math.round(f.x), Math.round(f.y), 1, 1); }
    for (const s of splashes) {
      if (s.ring) { const r = Math.round((.45 - s.life) * 10) + 1; ctx.fillStyle = 'rgba(190,230,255,.6)'; ctx.fillRect(Math.round(s.x - r), Math.round(s.y), 1, 1); ctx.fillRect(Math.round(s.x + r), Math.round(s.y), 1, 1); ctx.fillRect(Math.round(s.x - r + 1), Math.round(s.y - 1), r * 2 - 1, 1); }
      else { ctx.fillStyle = 'rgba(200,235,255,.85)'; ctx.fillRect(Math.round(s.x), Math.round(s.y), 1, 1); }
    }
    drawChar();
    for (const p of puffs) { const a = p.life / 1.2; ctx.fillStyle = `rgba(255,255,255,${a * .7})`; const r = Math.round((1.2 - p.life) * 3) + 1; ctx.fillRect(Math.round(p.x - r), Math.round(p.y - r / 2), r * 2, r); }
    for (const z of zzz) { const a = Math.min(1, z.life); ctx.fillStyle = `rgba(220,220,255,${a})`; const x = Math.round(z.x), y = Math.round(z.y); ctx.fillRect(x, y, 4, 1); ctx.fillRect(x + 2, y + 1, 1, 1); ctx.fillRect(x + 1, y + 2, 1, 1); ctx.fillRect(x, y + 3, 4, 1); }
    for (const c of clouds) if (c.depth >= .7) ctx.drawImage(c.spr, Math.round(c.x - cam * c.depth * 2), c.y);
    ctx.fillStyle = sc.night ? '#ccc' : '#1a1c2c';
    for (const b of birds) { const x = Math.round(b.x), y = Math.round(b.y), f = Math.floor(t * 8 + b.p) % 2; if (f) { ctx.fillRect(x - 2, y - 1, 1, 1); ctx.fillRect(x - 1, y, 1, 1); ctx.fillRect(x, y, 1, 1); ctx.fillRect(x + 1, y, 1, 1); ctx.fillRect(x + 2, y - 1, 1, 1); } else { ctx.fillRect(x - 2, y + 1, 1, 1); ctx.fillRect(x - 1, y, 3, 1); ctx.fillRect(x + 2, y + 1, 1, 1); } }
    for (const d of drops) {
      const x = Math.round(d.x), y = Math.round(d.y);
      if (d.type === 'rain') { ctx.fillStyle = d.near > .5 ? 'rgba(200,232,255,.85)' : 'rgba(170,210,255,.55)'; const sl = d.vx / d.vy; for (let k = 0; k < d.len; k++) ctx.fillRect(Math.round(x - sl * k), y - k, 1, 1); }
      else if (d.type === 'snow') { const a = d.landed ? d.life / 1.2 : 1; ctx.fillStyle = `rgba(255,255,255,${a})`; ctx.fillRect(x, y, d.sz, d.sz); if (d.sz > 1 && !d.landed) { ctx.fillStyle = 'rgba(200,225,255,.7)'; ctx.fillRect(x - 1, y, 1, 1); ctx.fillRect(x + 2, y + 1, 1, 1); } }
      else if (d.type === 'pellet') { ctx.fillStyle = '#eef6ff'; ctx.fillRect(x, y, 1, 1); ctx.fillStyle = 'rgba(150,200,255,.7)'; ctx.fillRect(x, y - 1, 1, 1); }
      else if (d.type === 'hail') { ctx.fillStyle = '#ffffff'; ctx.fillRect(x, y, d.sz + 1, d.sz + 1); ctx.fillStyle = '#a8c0dc'; ctx.fillRect(x + d.sz, y + d.sz, 1, 1); }
    }
    if (sc.wind > .3) { ctx.fillStyle = `rgba(255,255,255,${.15 + sc.wind * .3})`; for (const s of streaks) ctx.fillRect(Math.round(s.x), Math.round(s.y), s.len, 1); }
    for (const l of leaves) { ctx.fillStyle = l.c; const f = Math.floor(t * 10 + l.p) % 2; ctx.fillRect(Math.round(l.x), Math.round(l.y), f ? 2 : 1, f ? 1 : 2); }
    for (const e of embers) { ctx.fillStyle = e.c; ctx.fillRect(Math.round(e.x), Math.round(e.y), 1, 1); }
    if (L.fog) { const o1 = (t * 5) % (W * 2), o2 = (t * 9) % (W * 2); ctx.globalAlpha = sc.smoke ? .5 : .75; ctx.drawImage(L.fog, -o1, 0); ctx.drawImage(L.fog, -o1 + W * 2, 0); ctx.globalAlpha = .45; ctx.drawImage(L.fog, -o2, 12); ctx.drawImage(L.fog, -o2 + W * 2, 12); ctx.globalAlpha = 1; ctx.fillStyle = sc.dim ? 'rgba(90,100,120,.25)' : 'rgba(220,226,230,.22)'; ctx.fillRect(0, 0, W, H); }
    if (sc.heat || sc.fire) {
      const bg = buf.getContext('2d'); bg.drawImage(cv, 0, 0);
      const amp = sc.fire ? 1.6 : 1.2;
      for (let y = HY - 40; y < H; y++) { const off = Math.round(Math.sin(y * .45 + t * 7) * amp * ((y - HY + 40) / (H - HY + 40))); if (off) ctx.drawImage(buf, 0, y, W, 1, off, y, W, 1); }
      if (sc.heat) { ctx.fillStyle = 'rgba(255,140,40,.08)'; ctx.fillRect(0, 0, W, H); }
    }
    if (sc.fire) { ctx.fillStyle = `rgba(255,80,20,${.08 + Math.sin(t * 8) * .03})`; ctx.fillRect(0, 0, W, H); }
    if (L.frost) ctx.drawImage(L.frost, 0, 0);
    if (L.icicles) { ctx.drawImage(L.icicles, 0, L.icicleTop); ctx.fillStyle = '#bfe6ff'; for (const d of drips) ctx.fillRect(Math.round(d.x), Math.round(d.y), 1, 2); }
    if (sc.dim) { ctx.fillStyle = 'rgba(10,10,40,.12)'; ctx.fillRect(0, 0, W, H); }
  }

  function drawGrid() {
    const g = pal.grid, gc = sc.dim ? rgb(shade(hex2rgb(g), .55)) : g, speed = sc.tornado ? .6 : .18 + sc.wind * .3;
    const phase = (t * speed) % 1, gh = H - HY;
    ctx.fillStyle = gc;
    for (let i = 0; i < 16; i++) { const z = i + 1 - phase; if (z < .55) continue; const y = Math.round(HY + gh * .55 / z); if (y >= H || y <= HY) continue; ctx.globalAlpha = clamp(1.2 - z * .07, .12, .9); ctx.fillRect(0, y, W, 1); }
    const vp = W / 2 - cam * 1.2;
    for (let j = -10; j <= 10; j++) {
      const bxx = W / 2 + j * 26 - cam * 4;
      for (let y = HY + 1; y < H; y++) { const f = (y - HY) / gh; ctx.globalAlpha = clamp(f * 2.2, .1, .85); ctx.fillRect(Math.round(vp + (bxx - vp) * f), y, 1, 1); }
    }
    ctx.globalAlpha = .55; ctx.fillRect(0, HY, W, 1); ctx.globalAlpha = 1;
  }

  function drawTornado() {
    const top = Math.round(H * .14), bot = HY + 22, tx = W * .32 + Math.sin(t * .15) * W * .18 - cam * 1.5;
    const cxAt = u => tx + Math.sin(t * 1.7 + u * 5) * 7 * u + Math.sin(t * .6) * 3 * (1 - u);
    const rAt = u => lerp(34, 3, Math.pow(u, .5));
    const C = ['#7d8a6e', '#5a6650', '#3e4838', '#232a1e'];
    for (const d of debris) if (Math.sin(d.a) < 0) { const y = top + (bot - top) * d.u, r = rAt(d.u) * 1.5; ctx.fillStyle = d.c; ctx.fillRect(Math.round(cxAt(d.u) + Math.cos(d.a) * r), Math.round(y + Math.sin(d.a) * 2), d.z, d.z); }
    for (let y = top; y <= bot; y++) {
      const u = (y - top) / (bot - top), cx = cxAt(u), r = rAt(u);
      for (let x = -Math.ceil(r); x <= Math.ceil(r); x++) {
        const e = Math.abs(x) / r; if (e > 1) continue;
        if (e > .82 && BAYER[y & 3][(x + 64) & 3] > 9) continue;
        const stripe = ((x / r) * 3 + t * 9 + y * .4) % 2;
        let idx = stripe < 1 ? 1 : 2; if (x < -r * .5) idx--; if (e > .75) idx = 3; idx = clamp(idx, 0, 3);
        ctx.fillStyle = C[idx]; ctx.fillRect(Math.round(cx + x), y, 1, 1);
      }
    }
    const bcx = cxAt(1);
    for (let y = -6; y <= 2; y++) for (let x = -22; x <= 22; x++) { const dd = (x * x) / 484 + (y * y) / 36; if (dd < 1 && BAYER[(y + 8) & 3][(x + 64) & 3] < (1 - dd) * 18) { ctx.fillStyle = ((x + Math.floor(t * 20)) & 4) ? '#6a5a3a' : '#8a7a5a'; ctx.fillRect(Math.round(bcx + x), bot + y, 1, 1); } }
    for (const d of debris) if (Math.sin(d.a) >= 0) { const y = top + (bot - top) * d.u, r = rAt(d.u) * 1.5; ctx.fillStyle = d.c; ctx.fillRect(Math.round(cxAt(d.u) + Math.cos(d.a) * r), Math.round(y + Math.sin(d.a) * 2), d.z, d.z); }
  }

  function frame(now) {
    requestAnimationFrame(frame);
    if (!running || !L.sky) return;
    const dt = Math.min(.05, (now - last) / 1000 || .016); last = now; t += dt;
    update(dt); draw();
  }
  requestAnimationFrame(frame);

  return {
    resize,
    set(newSc, { silent } = {}) {
      const changed = newSc.key !== sc.key;
      sc = newSc;
      if (changed) { build(); if (!silent) { const app = $('#app'); app.classList.remove('glitch'); void app.offsetWidth; app.classList.add('glitch'); setTimeout(() => app.classList.remove('glitch'), 520); SFX.whoosh(); } }
      SFX.setScene(sc);
      return changed;
    },
    get scene() { return sc; },
    setSun(f) { sunFrac = f; },
    setMoon(p) { if (Math.abs(p - moonP) > .01) { moonP = p; build(); } },
    setTilt(x, y) { tiltT.x = clamp(x, -1, 1); tiltT.y = clamp(y, -1, 1); },
    jump() { if (ch.jy <= 0) { ch.vy = 130; ch.jy = .1; ch.wink = .6; SFX.jump(); } },
    head() { const h = L.charHead || { x: W * .66, y: FY - 40 }; return { x: h.x * scale, y: h.y * scale }; },
    heroBottom() { return (FY + 6) * scale; },
    pause(p) { running = !p; last = performance.now(); },
    shake: shakeScreen
  };
})();

/* =================== APP STATE =================== */
let loc = store.get('loc', null);
let data = store.get('data', null);
let busy = false, offline = false, count = 60, demo = null, started = false, pendingSearch = false;

const isF = () => settings.units === 'F';
const fT = f => f == null || isNaN(f) ? '--' : Math.round(isF() ? f : (f - 32) * 5 / 9) + '°';
const fW = m => m == null ? '--' : isF() ? Math.round(m) + ' mph' : Math.round(m * 1.609) + ' km/h';
const fWn = m => m == null ? '--' : String(Math.round(isF() ? m : m * 1.609));
const fP = i => i == null ? '--' : isF() ? i.toFixed(2) + ' in' : (i * 25.4).toFixed(1) + ' mm';
const fPres = h => h == null ? '--' : isF() ? (h * .02953).toFixed(2) + ' inHg' : Math.round(h) + ' hPa';
const visMeters = (v, unit) => /ft/.test(unit || '') ? v * .3048 : v;
function fVis(v, unit) { if (v == null) return '--'; const m = visMeters(v, unit); if (isF()) { const mi = m / 1609.34; return mi >= 10 ? '10+ mi' : mi.toFixed(mi < 1 ? 1 : 0) + ' mi'; } const km = m / 1000; return km >= 16 ? '16+ km' : km.toFixed(km < 1 ? 1 : 0) + ' km'; }
const mins = s => parseInt(s.slice(11, 13)) * 60 + parseInt(s.slice(14, 16));
function fTime(s) { if (!s) return '--'; let h = parseInt(s.slice(11, 13)); const m = s.slice(14, 16), ap = h >= 12 ? 'PM' : 'AM'; h = h % 12 || 12; return `${h}:${m} ${ap}`; }
function fHour(s) { let h = parseInt(s.slice(11, 13)); const ap = h >= 12 ? 'P' : 'A'; h = h % 12 || 12; return h + ap; }
const DOW = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const dow = s => DOW[new Date(s.slice(0, 10) + 'T12:00:00').getDay()];
const COMPASS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
const dir16 = d => COMPASS[Math.round(((d % 360) + 360) % 360 / 22.5) % 16];
function beaufort(mph) { const t = [[1, 'Calm'], [4, 'Light Air'], [8, 'Light Breeze'], [13, 'Gentle Breeze'], [19, 'Moderate Breeze'], [25, 'Fresh Breeze'], [32, 'Strong Breeze'], [39, 'Near Gale'], [47, 'Gale'], [55, 'Strong Gale'], [64, 'Storm'], [73, 'Violent Storm']]; for (const [m, n] of t) if (mph < m) return n; return 'Hurricane Force'; }
function uvRisk(u) { return u < 3 ? ['Low', '#5dff7a'] : u < 6 ? ['Moderate', '#ffd84a'] : u < 8 ? ['High', '#ff9a3b'] : u < 11 ? ['Very High', '#ff3b5c'] : ['Extreme', '#c45cff']; }
function aqiCat(a) { return a <= 50 ? ['Good', '#5dff7a'] : a <= 100 ? ['Moderate', '#ffd84a'] : a <= 150 ? ['Unhealthy (Sensitive)', '#ff9a3b'] : a <= 200 ? ['Unhealthy', '#ff3b5c'] : a <= 300 ? ['Very Unhealthy', '#c45cff'] : ['Hazardous', '#8a1630']; }
function tempColor(f) { const st = [[0, '#b58cff'], [32, '#4fb4ff'], [50, '#5dff7a'], [70, '#ffd84a'], [85, '#ff7a3b'], [100, '#ff3b5c']]; if (f <= st[0][0]) return st[0][1]; for (let i = 1; i < st.length; i++) if (f <= st[i][0]) { const t = (f - st[i - 1][0]) / (st[i][0] - st[i - 1][0]); return rgb(mix(hex2rgb(st[i - 1][1]), hex2rgb(st[i][1]), t)); } return st[st.length - 1][1]; }

async function fetchT(url, ms = 12000, opts = {}) {
  const ac = new AbortController(); const id = setTimeout(() => ac.abort(), ms);
  try { return await fetch(url, { ...opts, signal: ac.signal, cache: 'no-store' }); } finally { clearTimeout(id); }
}
const CUR = ['temperature_2m', 'relative_humidity_2m', 'apparent_temperature', 'is_day', 'precipitation', 'weather_code', 'cloud_cover', 'pressure_msl', 'wind_speed_10m', 'wind_direction_10m', 'wind_gusts_10m'];
const CUR_X = ['dew_point_2m', 'visibility', 'uv_index'];
const HR = ['temperature_2m', 'apparent_temperature', 'precipitation_probability', 'precipitation', 'weather_code', 'wind_speed_10m', 'wind_direction_10m', 'wind_gusts_10m', 'is_day', 'visibility', 'uv_index', 'relative_humidity_2m', 'dew_point_2m', 'cloud_cover', 'pressure_msl'];
const DY = ['weather_code', 'temperature_2m_max', 'temperature_2m_min', 'apparent_temperature_max', 'apparent_temperature_min', 'sunrise', 'sunset', 'daylight_duration', 'uv_index_max', 'precipitation_sum', 'precipitation_probability_max', 'wind_speed_10m_max', 'wind_gusts_10m_max', 'wind_direction_10m_dominant'];
async function fetchForecast(lat, lon, lite = false) {
  const p = new URLSearchParams({ latitude: lat.toFixed(4), longitude: lon.toFixed(4), current: (lite ? CUR : CUR.concat(CUR_X)).join(','), hourly: HR.join(','), daily: DY.join(','),
    temperature_unit: 'fahrenheit', wind_speed_unit: 'mph', precipitation_unit: 'inch', timezone: 'auto', forecast_days: '10' });
  if (!lite) { p.set('minutely_15', 'precipitation'); p.set('forecast_minutely_15', '8'); }
  const r = await fetchT('https://api.open-meteo.com/v1/forecast?' + p);
  if (!r.ok) { if (!lite && r.status === 400) return fetchForecast(lat, lon, true); throw new Error('Weather HTTP ' + r.status); }
  return r.json();
}
async function fetchAQ(lat, lon) {
  const r = await fetchT(`https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat.toFixed(4)}&longitude=${lon.toFixed(4)}&current=us_aqi,pm2_5,pm10,ozone&timezone=auto`, 9000);
  if (!r.ok) throw new Error('AQ'); return r.json();
}
async function fetchAlerts(lat, lon) {
  if (lat < 17 || lat > 72 || lon < -180 || lon > -64) return [];
  const r = await fetchT(`https://api.weather.gov/alerts/active?point=${lat.toFixed(4)},${lon.toFixed(4)}`, 9000, { headers: { Accept: 'application/geo+json' } });
  if (!r.ok) throw new Error('NWS'); const j = await r.json();
  return (j.features || []).map(f => f.properties).map(p => ({ event: p.event, headline: p.headline, desc: p.description, instr: p.instruction, severity: p.severity, ends: p.ends || p.expires }));
}
async function reverseName(lat, lon) {
  try {
    const r = await fetchT(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=en`, 8000);
    const j = await r.json(); const city = j.city || j.locality || 'Your Spot';
    const reg = (j.principalSubdivisionCode || '').split('-')[1] || j.countryCode || '';
    return reg ? `${city}, ${reg}` : city;
  } catch (e) { return `${lat.toFixed(2)}, ${lon.toFixed(2)}`; }
}
function getPosition() {
  return new Promise((res, rej) => {
    if (!navigator.geolocation) return rej({ code: 'noloc' });
    navigator.geolocation.getCurrentPosition(p => res(p.coords), e => rej({ code: e.code === 1 ? 'denied' : 'noloc', e }), { enableHighAccuracy: false, timeout: 12000, maximumAge: 300000 });
  });
}
const distKm = (a, b, c, d) => { const R = 6371, dLa = (c - a) * Math.PI / 180, dLo = (d - b) * Math.PI / 180; const x = Math.sin(dLa / 2) ** 2 + Math.cos(a * Math.PI / 180) * Math.cos(c * Math.PI / 180) * Math.sin(dLo / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(x)); };

async function refresh(manual = false) {
  if (busy) return; busy = true; setSpin(true); count = 60; titleStatus(loc ? 'LOADING WORLD…' : 'REQUESTING LOCATION…');
  try {
    if (!loc || loc.mode === 'gps') {
      try {
        const c = await getPosition();
        const moved = !loc || !loc.name || distKm(loc.lat, loc.lon, c.latitude, c.longitude) > 2;
        loc = { lat: c.latitude, lon: c.longitude, name: loc && !moved ? loc.name : null, mode: 'gps' };
      } catch (e) { if (!loc || loc.lat == null) throw { code: e.code || 'noloc' }; }
    }
    titleStatus('LOADING WORLD…');
    const [wx, aq, al] = await Promise.allSettled([fetchForecast(loc.lat, loc.lon), fetchAQ(loc.lat, loc.lon), fetchAlerts(loc.lat, loc.lon)]);
    if (wx.status !== 'fulfilled') throw wx.reason;
    const prevAlerts = (data && data.alerts) || [];
    data = { wx: wx.value, aq: aq.status === 'fulfilled' ? aq.value : (data && data.aq) || null, alerts: al.status === 'fulfilled' ? al.value : prevAlerts, at: Date.now() };
    store.set('data', data);
    if (!loc.name) loc.name = await reverseName(loc.lat, loc.lon);
    store.set('loc', loc);
    offline = false;
    render();
    const newAlert = data.alerts.some(a => !prevAlerts.find(p => p.event === a.event));
    if (newAlert && started) SFX.alarm();
    if (manual) { SFX.refresh(); toast('WORLD RELOADED · +1 XP'); $('#temp').classList.remove('pop'); void $('#temp').offsetWidth; $('#temp').classList.add('pop'); }
    else if (started) SFX.tick();
    titleStatus('READY!');
  } catch (e) {
    if (e && (e.code === 'denied' || e.code === 'noloc') && !loc) {
      titleStatus('NO LOCATION · TAP START, THEN PICK A CITY');
      if (started) { openSheet('search'); toast('LOCATION OFF · PICK A CITY'); } else pendingSearch = true;
    } else {
      offline = true;
      if (data) { render(); if (manual) toast('OFFLINE · SHOWING SAVED DATA'); titleStatus('OFFLINE · USING SAVED WORLD'); }
      else { titleStatus('NO SIGNAL · TAP TO RETRY'); if (manual) toast('NO SIGNAL · TRY AGAIN'); }
      if (manual) SFX.error();
    }
  } finally { busy = false; setSpin(false); updateRing(); }
}

function sceneFromData() {
  const w = data.wx, c = w.current, code = c.weather_code; let kind = kindFor(code);
  const ev = (data.alerts || []).map(a => (a.event || '').toLowerCase()), has = re => ev.some(e => re.test(e));
  const T = c.temperature_2m, F = c.apparent_temperature;
  const tornado = has(/tornado warning/);
  const fire = has(/red flag|fire weather|fire warning|extreme fire/) || T >= 105;
  const heat = F >= 90 || has(/heat/);
  const cold = F <= 32 || has(/wind chill|extreme cold|cold weather|freeze warning|hard freeze/);
  const windy = c.wind_speed_10m >= 22 || c.wind_gusts_10m >= 35 || has(/high wind|wind advisory/);
  const pm = data.aq && data.aq.current && isFinite(data.aq.current.pm2_5) ? data.aq.current.pm2_5 : 0;
  let smoke = false;
  if (pm > 55.4 && ['clear', 'mostly', 'partly', 'cloudy'].includes(kind)) { kind = 'fog'; smoke = true; }
  if (has(/dense fog/) && ['clear', 'mostly', 'partly', 'cloudy'].includes(kind)) kind = 'fog';
  const now = mins(c.time), rise = mins(w.daily.sunrise[0]), set = mins(w.daily.sunset[0]);
  const dusk = Math.abs(now - rise) < 40 || Math.abs(now - set) < 40;
  Scene.setSun((now - rise) / Math.max(1, set - rise));
  return makeScene({ kind, night: !c.is_day, dusk, heat, cold, fire, tornado, windy, temp: T, heavy: code === 75 || code === 86, smoke });
}

const DROP = '<svg class="drop" viewBox="0 0 5 7" shape-rendering="crispEdges" fill="#4fb4ff"><rect x="2" y="0" width="1" height="2"/><rect x="1" y="2" width="3" height="1"/><rect x="0" y="3" width="5" height="3"/><rect x="1" y="6" width="3" height="1"/><rect x="1" y="3" width="1" height="1" fill="#cfeaff"/></svg>';
const esc = s => String(s || '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function hourIdx() { const w = data.wx, key = w.current.time.slice(0, 13); const i = w.hourly.time.findIndex(t => t.slice(0, 13) === key); return i < 0 ? 0 : i; }
function render() {
  if (!data || !data.wx) return;
  $('#loc-name').textContent = (loc && loc.name) || 'UNKNOWN LAND';
  if (!demo) Scene.set(sceneFromData(), { silent: !started });
  renderHero(); renderAlerts(); renderNext(); renderHourly(); renderDaily(); renderStats(); renderSky();
  Scene.setMoon(moonPhase().phase);
}
function renderHero() {
  const w = data.wx, c = w.current, d = w.daily, sc = Scene.scene;
  $('#temp').textContent = fT(c.temperature_2m);
  $('#cond').textContent = demo ? demo.name : (data.alerts.some(a => /tornado warning/i.test(a.event)) ? 'TORNADO WARNING' : (WMO[c.weather_code] || 'Weather').toUpperCase());
  $('#level').textContent = sc.level + (demo ? ' · DEMO' : '');
  $('#hilo').textContent = `H ${fT(d.temperature_2m_max[0])}  L ${fT(d.temperature_2m_min[0])}  ·  FEELS ${fT(c.apparent_temperature)}`;
  statusLine();
  const ab = $('#alert-banner');
  if (data.alerts.length) { ab.hidden = false; ab.textContent = `⚠ BOSS ALERT: ${data.alerts[0].event.toUpperCase()}${data.alerts.length > 1 ? ` +${data.alerts.length - 1} MORE` : ''} ▶`; } else ab.hidden = true;
}
function ago(ms) { const m = Math.round((Date.now() - ms) / 60000); return m < 1 ? 'JUST NOW' : m < 60 ? `${m} MIN AGO` : `${Math.round(m / 60)} HR AGO`; }
function statusLine() {
  if (!data) return;
  const s = $('#status-line');
  if (offline) { s.style.color = '#ffb3c0'; s.textContent = `⚠ OFFLINE · SAVED ${ago(data.at)}`; }
  else { s.style.color = '#bfffc8'; s.textContent = `● LIVE · UPDATED ${new Date(data.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }).toUpperCase()}`; }
}
function renderAlerts() {
  const p = $('#p-alerts');
  if (!data.alerts.length) { p.hidden = true; return; }
  p.hidden = false;
  $('#alerts-list').innerHTML = data.alerts.map((a, i) => `<div class="alert-item" data-i="${i}"><h3>⚠ ${esc(a.event)}</h3><p>${esc(a.headline || '')}${a.instr ? '\n\nWHAT TO DO: ' + esc(a.instr) : ''}${a.desc ? '\n\n' + esc(a.desc) : ''}</p></div>`).join('');
}
function renderNext() {
  const w = data.wx, c = w.current, hi = hourIdx(), m = w.minutely_15;
  const T = c.temperature_2m, kind = kindFor(c.weather_code);
  const word = kind === 'sleet' ? 'Sleet' : (kind === 'snow' || T <= 33) ? 'Snow' : 'Rain';
  const wet = a => a >= .005;
  let slots = null; const labels = ['NOW', '+15', '+30', '+45'];
  if (m && m.time && m.precipitation) { let i = m.time.findIndex(t => t >= c.time); if (i > 0 && m.time[i] > c.time) i--; if (i < 0) i = 0; slots = m.precipitation.slice(i, i + 4); }
  let text;
  const probNext = Math.max(w.hourly.precipitation_probability[hi] || 0, w.hourly.precipitation_probability[hi + 1] || 0);
  if (slots && slots.length === 4) {
    const nowWet = wet(slots[0]) || c.precipitation > 0;
    if (nowWet) { const stop = slots.findIndex(a => !wet(a)); text = stop === -1 ? `${word} continuing all hour. Umbrella: equipped.` : `${word} easing up in ~${Math.max(15, stop * 15)} min.`; }
    else { const st = slots.findIndex(wet); text = st === -1 ? `No ${word.toLowerCase()} expected in the next hour. Dry run!` : `${word} starting in ~${st * 15} min. Prepare your hitbox.`; }
    const max = Math.max(.05, ...slots);
    $('#next-bars').innerHTML = slots.map((a, i) => `<div class="nb"><small>${a >= .005 ? fP(a).replace(' ', '') : '0'}</small><div class="bar ${a < .005 ? 'none' : (word === 'Snow' ? 'snow' : '')}" style="height:${a < .005 ? 4 : Math.max(10, a / max * 100)}%"></div><small>${labels[i]}</small></div>`).join('');
  } else {
    text = probNext >= 50 ? `${word} likely within the hour (${probNext}%).` : probNext >= 20 ? `Slight ${word.toLowerCase()} chance this hour (${probNext}%).` : `No ${word.toLowerCase()} expected in the next hour. Dry run!`;
    const ps = [0, 1, 2, 3].map(k => w.hourly.precipitation_probability[hi + k] || 0);
    $('#next-bars').innerHTML = ps.map((p, k) => `<div class="nb"><small>${p}%</small><div class="bar ${p < 10 ? 'none' : ''}" style="height:${Math.max(4, p)}%"></div><small>${k ? fHour(w.hourly.time[hi + k]) : 'NOW'}</small></div>`).join('');
  }
  $('#next-summary').textContent = text;
  const nt = w.hourly.temperature_2m[hi + 1], nTime = w.hourly.time[hi + 1];
  const trend = nt > T + .5 ? '▲ warming to' : nt < T - .5 ? '▼ cooling to' : '● holding near';
  $('#next-sub').textContent = `${trend} ${fT(nt)} by ${fHour(nTime).replace('A', ' AM').replace('P', ' PM')} · ${probNext}% chance of precip · wind ${fW(w.hourly.wind_speed_10m[hi + 1])}`;
}
function renderHourly() {
  const w = data.wx, h = w.hourly, hi = hourIdx(), N = Math.min(48, h.time.length - hi);
  let html = '';
  for (let k = 0; k < N; k++) {
    const i = hi + k, t = h.time[i], newDay = k > 0 && t.slice(11, 13) === '00', pp = h.precipitation_probability[i];
    html += `<div class="hc ${k === 0 ? 'now' : ''} ${newDay ? 'newday day0' : ''}" data-day="${newDay ? dow(t) : ''}"><div class="t">${k === 0 ? 'NOW' : fHour(t)}</div><img alt="" src="${iconURL(kindFor(h.weather_code[i]), !h.is_day[i])}"><div class="tp">${fT(h.temperature_2m[i])}</div><div class="pp">${pp >= 10 ? DROP + pp + '%' : ''}</div><div class="wd">${fWn(h.wind_speed_10m[i])}${isF() ? 'mph' : 'kmh'}</div></div>`;
  }
  $('#h-row').innerHTML = html;
  const cv = $('#h-graph'), cw = 58 * N, chh = 90, dpr = Math.min(2, window.devicePixelRatio || 1);
  cv.width = cw * dpr; cv.height = chh * dpr; cv.style.width = cw + 'px'; cv.style.height = chh + 'px';
  const g = cv.getContext('2d'); g.scale(dpr, dpr); g.imageSmoothingEnabled = false;
  const temps = h.temperature_2m.slice(hi, hi + N), lo = Math.min(...temps), hiT = Math.max(...temps), rng = Math.max(1, hiT - lo);
  const yOf = v => Math.round(8 + (1 - (v - lo) / rng) * 44);
  for (let k = 0; k < N; k++) { const p = h.precipitation_probability[hi + k] || 0; if (p < 5) continue; const bh = Math.round(p / 100 * 26); g.fillStyle = 'rgba(79,180,255,.55)'; g.fillRect(k * 58 + 14, chh - bh - 2, 30, bh); g.fillStyle = '#4fb4ff'; g.fillRect(k * 58 + 14, chh - bh - 2, 30, 2); }
  g.fillStyle = 'rgba(255,255,255,.08)'; for (let y = 8; y < 56; y += 11) g.fillRect(0, y, cw, 1);
  for (let k = 1; k < N; k++) { const x0 = (k - 1) * 58 + 29, x1 = k * 58 + 29, y0 = yOf(temps[k - 1]), y1 = yOf(temps[k]); for (let s = 0; s <= 12; s++) { const x = Math.round(lerp(x0, x1, s / 12) / 3) * 3, y = Math.round(lerp(y0, y1, s / 12) / 3) * 3; g.fillStyle = '#2a1033'; g.fillRect(x + 2, y + 2, 4, 4); g.fillStyle = '#ffb13b'; g.fillRect(x, y, 4, 4); } }
  for (let k = 0; k < N; k++) { const x = k * 58 + 29, y = yOf(temps[k]); g.fillStyle = '#000'; g.fillRect(x - 4, y - 4, 10, 10); g.fillStyle = tempColor(temps[k]); g.fillRect(x - 3, y - 3, 8, 8); if (temps[k] === hiT || temps[k] === lo) { g.fillStyle = '#fff'; g.font = '16px VT323, monospace'; g.fillText(fT(temps[k]), x - 8, y < 30 ? y + 22 : y - 8); } }
}
function renderDaily() {
  const d = data.wx.daily, c = data.wx.current, n = d.time.length;
  const gmin = Math.min(...d.temperature_2m_min), gmax = Math.max(...d.temperature_2m_max), span = Math.max(1, gmax - gmin);
  let html = '';
  for (let i = 0; i < n; i++) {
    const lo = d.temperature_2m_min[i], hi = d.temperature_2m_max[i], left = (lo - gmin) / span * 100, wid = Math.max(4, (hi - lo) / span * 100), pp = d.precipitation_probability_max[i];
    const nowDot = i === 0 ? `<i class="nowdot" style="left:calc(${clamp((c.temperature_2m - gmin) / span * 100, 0, 100)}% - 3px)"></i>` : '';
    html += `<div class="drow ${i === 0 ? 'today' : ''}" data-i="${i}">
      <div class="dn">${i === 0 ? 'TODAY' : dow(d.time[i])}</div><img alt="" src="${iconURL(kindFor(d.weather_code[i]), false)}">
      <div class="dp">${pp != null && pp >= 10 ? pp + '%' : ''}</div><div class="lo">${fT(lo)}</div>
      <div class="rng"><b style="left:${left}%;width:${wid}%;background:linear-gradient(90deg,${tempColor(lo)},${tempColor(hi)})"></b>${nowDot}</div><div class="hi">${fT(hi)}</div>
      <div class="dmore"><span>${(WMO[d.weather_code[i]] || '').toUpperCase()}</span><span>FEELS <b>${fT(d.apparent_temperature_min[i])}–${fT(d.apparent_temperature_max[i])}</b></span>
      <span>PRECIP <b>${fP(d.precipitation_sum[i])}</b></span><span>CHANCE <b>${pp ?? '--'}%</b></span>
      <span>WIND <b>${fW(d.wind_speed_10m_max[i])} ${dir16(d.wind_direction_10m_dominant[i] || 0)}</b></span><span>GUSTS <b>${fW(d.wind_gusts_10m_max[i])}</b></span>
      <span>UV MAX <b>${(d.uv_index_max[i] ?? 0).toFixed(0)} ${uvRisk(d.uv_index_max[i] || 0)[0]}</b></span><span>☀ <b>${fTime(d.sunrise[i])} – ${fTime(d.sunset[i])}</b></span></div></div>`;
  }
  $('#d-list').innerHTML = html;
}
function meter(frac, color, n = 10) { let s = '<div class="meter">'; for (let i = 0; i < n; i++) s += `<i style="${i < Math.round(frac * n) ? `background:${color}` : ''}"></i>`; return s + '</div>'; }
function renderStats() {
  const w = data.wx, c = w.current, h = w.hourly, d = w.daily, hi = hourIdx(), hu = w.hourly_units || {};
  const dew = c.dew_point_2m ?? h.dew_point_2m[hi], vis = c.visibility ?? h.visibility[hi], uv = c.uv_index ?? h.uv_index[hi];
  const visUnit = (w.current_units && w.current_units.visibility) || hu.visibility;
  const diff = c.apparent_temperature - c.temperature_2m;
  const feelsWhy = Math.abs(diff) < 2 ? 'Same as actual temp' : diff < 0 ? (c.wind_speed_10m > 3 ? 'Wind is stealing your HP' : 'Feels cooler') : (c.relative_humidity_2m > 50 ? 'Humidity buff active' : 'Sun says hi');
  const p3 = h.pressure_msl[Math.max(0, hi - 3)], pt = c.pressure_msl - p3, ptxt = pt > 1 ? '▲ Rising' : pt < -1 ? '▼ Falling' : '● Steady';
  const vm = vis == null ? null : visMeters(vis, visUnit), vtxt = vm == null ? '' : vm > 16000 ? 'Max render distance' : vm > 8000 ? 'Clear' : vm > 3000 ? 'Hazy' : vm > 1000 ? 'Poor' : 'Fog of war';
  const [uvT, uvC] = uvRisk(uv || 0);
  const comfort = dew == null ? '' : dew < 50 ? 'Dry & comfy' : dew < 60 ? 'Comfortable' : dew < 65 ? 'A bit sticky' : dew < 70 ? 'Sticky' : 'Swamp mode';
  const aq = data.aq && data.aq.current, aqi = aq && isFinite(aq.us_aqi) ? Math.round(aq.us_aqi) : null, [aqT, aqC] = aqi != null ? aqiCat(aqi) : ['Unavailable', '#555'];
  const dl = d.daylight_duration ? d.daylight_duration[0] : (mins(d.sunset[0]) - mins(d.sunrise[0])) * 60;
  const tiles = [
    ['FEELS LIKE', fT(c.apparent_temperature), feelsWhy, ''],
    ['HUMIDITY', c.relative_humidity_2m + '%', `Dew point ${fT(dew)}`, meter(c.relative_humidity_2m / 100, '#4fb4ff')],
    ['WIND', fW(c.wind_speed_10m), `${dir16(c.wind_direction_10m)} · ${beaufort(c.wind_speed_10m)}`, `<div class="compass"><span class="n">N</span><div class="needle" style="transform:rotate(${c.wind_direction_10m}deg)"></div></div>`],
    ['GUSTS', fW(c.wind_gusts_10m), c.wind_gusts_10m >= 40 ? 'Hold onto your hat!' : c.wind_gusts_10m >= 25 ? 'Breezy bursts' : 'Chill', meter(Math.min(1, c.wind_gusts_10m / 60), '#d6f5ff')],
    ['PRESSURE', fPres(c.pressure_msl), ptxt + ' (3 hr)', ''],
    ['VISIBILITY', fVis(vis, visUnit), vtxt, ''],
    ['UV INDEX', uv == null ? '--' : uv.toFixed(0), uvT, meter(Math.min(1, (uv || 0) / 11), uvC, 11)],
    ['CLOUD COVER', c.cloud_cover + '%', c.cloud_cover < 20 ? 'Blue skies' : c.cloud_cover < 60 ? 'Some clouds' : 'Cloud fortress', meter(c.cloud_cover / 100, '#c3cdef')],
    ['PRECIP TODAY', fP(d.precipitation_sum[0]), `${d.precipitation_probability_max[0] ?? 0}% max chance`, meter((d.precipitation_probability_max[0] || 0) / 100, '#4fb4ff')],
    ['AIR QUALITY', aqi ?? '--', aqi != null ? `US AQI · ${aqT}` : aqT, meter(Math.min(1, (aqi || 0) / 300), aqC)],
    ['DEW POINT', fT(dew), comfort, ''],
    ['DAYLIGHT', `${Math.floor(dl / 3600)}h ${Math.round(dl % 3600 / 60)}m`, `${fTime(d.sunrise[0])} → ${fTime(d.sunset[0])}`, ''],
  ];
  $('#stats').innerHTML = tiles.map(([k, v, s, x]) => `<div class="st"><div class="k">${k}</div><div class="v">${v}</div><div class="s">${s}</div>${x}</div>`).join('');
}
function renderSky() {
  const d = data.wx.daily, c = data.wx.current, mp = moonPhase();
  const rise = mins(d.sunrise[0]), set = mins(d.sunset[0]), now = mins(c.time), f = clamp((now - rise) / Math.max(1, set - rise), 0, 1);
  const W = 120, H = 44, cvs = document.createElement('canvas'); cvs.width = W; cvs.height = H; const g = cvs.getContext('2d');
  g.fillStyle = 'rgba(255,255,255,.15)'; g.fillRect(0, H - 6, W, 1);
  for (let i = 0; i <= 60; i++) { const u = i / 60, x = Math.round(10 + u * (W - 20)), y = Math.round(H - 6 - Math.sin(u * Math.PI) * (H - 14)); if (i % 2 === 0) { g.fillStyle = u <= f ? '#ffd84a' : 'rgba(255,255,255,.3)'; g.fillRect(x, y, 1, 1); } }
  const up = now >= rise && now <= set;
  if (up) { const x = Math.round(10 + f * (W - 20)), y = Math.round(H - 6 - Math.sin(f * Math.PI) * (H - 14)); g.fillStyle = 'rgba(255,216,74,.4)'; g.fillRect(x - 4, y - 4, 9, 9); g.fillStyle = '#ffd84a'; g.fillRect(x - 3, y - 2, 7, 5); g.fillRect(x - 2, y - 3, 5, 7); g.fillStyle = '#fff6a8'; g.fillRect(x - 1, y - 1, 2, 2); }
  g.fillStyle = '#ffb13b'; g.fillRect(8, H - 7, 5, 3); g.fillStyle = '#ff7a3b'; g.fillRect(W - 13, H - 7, 5, 3);
  const dl = d.daylight_duration ? d.daylight_duration[0] : (set - rise) * 60;
  const left = up ? `${Math.floor((set - now) / 60)}h ${(set - now) % 60}m of daylight left` : (now < rise ? `Sunrise in ${Math.floor((rise - now) / 60)}h ${(rise - now) % 60}m` : 'Sun has logged off for the day');
  $('#sky-box').innerHTML = `<div class="sky-wrap"><img id="sun-arc" src="${cvs.toDataURL()}" alt="">
    <div class="sky-cell">SUNRISE<b>${fTime(d.sunrise[0])}</b></div><div class="sky-cell">SUNSET<b>${fTime(d.sunset[0])}</b></div>
    <div class="sky-cell" style="grid-column:1/-1">${left} · ${Math.floor(dl / 3600)}h ${Math.round(dl % 3600 / 60)}m total</div>
    <div class="moon-row" style="grid-column:1/-1"><img src="${moonPhaseURL(mp.phase)}" alt=""><div class="sky-cell">MOON PHASE<b>${mp.name}</b>${mp.illum}% illuminated</div></div></div>`;
}

function quip() {
  const s = Scene.scene;
  const Q = {
    tornado: ['TAKE SHELTER NOW. Lowest floor, interior room, no windows!', 'This boss cannot be beaten. Only hidden from. Basement!'],
    fire: ['This is fine. (It is not fine. Follow local fire guidance.)', 'Red flag = no sparks, no grills, no campfires.'],
    hail: ['Free ice cubes! (Do not catch them with your face.)', 'Park the car under cover if you can!'],
    storm: ['When thunder roars, go indoors!', 'Do NOT be the tallest pixel outside.', '+10 Drama. +0 Picnics.'],
    sleet: ['Rain and snow had a crunchy baby.', 'Roads = ice rink. Drive like a sloth.'],
    snow: ['Snow on the \'stache. Worth it.', 'Bridges freeze first. Take it slow!', 'Achievement unlocked: Snow Day?'],
    rain: ['Rain will NOT ruin this hair. Umbrella up.', 'Splash damage incoming!', 'Puddles: now with 100% more puddle.'],
    drizzle: ['It is not raining. It is spitting. Rudely.', 'Mist-tery weather.'],
    fog: ['Render distance: 2 blocks.', 'Low beams, not high beams!', 'Fog of war is real.'],
    heat: ['I am melting at 60 FPS.', 'Hydrate or diedrate. Drink water!', 'Sunscreen is a power-up.'],
    cold: ['My mustache has icicles.', 'Layers = extra armor.', 'Brrr. Loading body heat…'],
    wind: ['The hair. Is. Holding. Barely.', 'Trampolines: please secure.'],
    night: ['Zzz… night mode engaged.', '…five more minutes…', 'Shh. The pixels are sleeping.'],
    cloudy: ['Grey skies, still smirking.', 'The sun is buffering.'],
    clear: ['Sun\'s out, smirk out.', 'Perfect stats today. Go touch grass!', 'Weather: S-Rank. Like the mustache.'],
  };
  const k = s.tornado ? 'tornado' : s.fire ? 'fire' : s.kind === 'hail' ? 'hail' : s.kind === 'storm' ? 'storm' : s.kind === 'sleet' ? 'sleet' : s.kind === 'snow' ? 'snow' : s.precip === 'rain' ? 'rain' : s.kind === 'drizzle' ? 'drizzle' : s.fog ? 'fog' : s.heat ? 'heat' : s.cold ? 'cold' : s.wind > .6 ? 'wind' : s.night ? 'night' : s.kind === 'cloudy' ? 'cloudy' : 'clear';
  return pick(Q[k]);
}
let bubbleT = 0;
function showBubble(text) {
  const b = $('#bubble'), h = Scene.head();
  b.textContent = text; b.hidden = false; b.style.animation = 'none'; void b.offsetWidth; b.style.animation = '';
  const app = $('#app'), bw = Math.min(220, app.clientWidth - 20);
  b.style.left = clamp(h.x, bw / 2 + 10, app.clientWidth - bw / 2 - 10) + 'px'; b.style.top = (h.y - 8) + 'px';
  clearTimeout(bubbleT); bubbleT = setTimeout(() => b.hidden = true, 3400);
}

let toastT = 0;
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2200); }
function titleStatus(s) { const e = $('#title-status'); if (e) e.textContent = s; }
function setSpin(on) { $('#refresh-btn').classList.toggle('spin', on); }
function updateRing() {
  $('#refresh-btn').classList.toggle('off', !settings.auto);
  $('#count').textContent = settings.auto ? count : '⟳';
  $('#ring-fg').style.strokeDashoffset = settings.auto ? (106.8 * (1 - count / 60)).toFixed(1) : 0;
  $('#auto-btn').classList.toggle('on', settings.auto);
  $('#auto-label').textContent = settings.auto ? 'AUTO' : 'MANUAL';
}
function syncSettingsUI() {
  $$('.opt').forEach(o => { const k = o.dataset.opt; if (k === 'units') o.querySelectorAll('em').forEach(e => e.classList.toggle('sel', e.dataset.v === settings.units)); else o.classList.toggle('on', !!settings[k]); });
  $('#crt').classList.toggle('off', !settings.crt);
  const si = $('#sound-icon'); si.dataset.icon = settings.sound ? 'sound' : 'mute'; si.innerHTML = pixelSVG(si.dataset.icon);
  updateRing();
}
function openSheet(id) { $('#' + id).hidden = false; SFX.blip(); if (id === 'search') setTimeout(() => $('#q').focus(), 250); }
function closeSheet(id) { $('#' + id).hidden = true; }

const DEMOS = [
  ['SUNNY MEADOWS', { kind: 'clear', temp: 74 }], ['NEON NIGHT', { kind: 'clear', night: true, temp: 66 }], ['GOLDEN HOUR', { kind: 'mostly', dusk: true }],
  ['PARTLY CLOUDY', { kind: 'partly' }], ['OVERCAST', { kind: 'cloudy' }], ['FOG', { kind: 'fog' }], ['DRIZZLE', { kind: 'drizzle' }], ['RAIN', { kind: 'rain' }],
  ['HEAVY RAIN', { kind: 'heavy' }], ['THUNDERSTORM', { kind: 'storm' }], ['HAIL', { kind: 'hail' }], ['SLEET / FREEZING RAIN', { kind: 'sleet', temp: 31 }],
  ['SNOW', { kind: 'snow', temp: 28 }], ['BLIZZARD', { kind: 'snow', heavy: true, windy: true, temp: 14 }], ['FREEZING COLD', { kind: 'clear', cold: true, temp: 4 }],
  ['HEAT WAVE', { kind: 'clear', heat: true, temp: 101 }], ['WILDFIRE / RED FLAG', { kind: 'clear', fire: true, temp: 108 }], ['WINDY', { kind: 'partly', windy: true }],
  ['TORNADO WARNING', { kind: 'storm', tornado: true }], ['RAINY NIGHT', { kind: 'rain', night: true }], ['SNOWY NIGHT', { kind: 'snow', night: true, temp: 25 }], ['SMOKE HAZE', { kind: 'fog', smoke: true }],
];
function setDemo(i) {
  i = (i + DEMOS.length) % DEMOS.length; demo = { i, name: DEMOS[i][0] };
  const o = DEMOS[i][1]; Scene.setSun(o.dusk ? .02 : .5); Scene.set(makeScene(o));
  $('#demo-name').textContent = `${i + 1}/${DEMOS.length} · ${demo.name}`; $('#demo-bar').hidden = false; $('#app').classList.add('demo-on');
  if (data) renderHero(); else { $('#level').textContent = Scene.scene.level + ' · DEMO'; $('#cond').textContent = demo.name; }
  $('#scroller').scrollTo({ top: 0, behavior: 'smooth' });
}
function exitDemo() { demo = null; $('#demo-bar').hidden = true; $('#app').classList.remove('demo-on'); if (data) { Scene.set(sceneFromData()); renderHero(); } SFX.off(); }

function applyOrientation() {
  const html = document.documentElement, coarse = matchMedia('(pointer: coarse)').matches;
  const land = window.innerWidth > window.innerHeight && coarse;
  const ang = (screen.orientation && typeof screen.orientation.angle === 'number') ? screen.orientation.angle : (window.orientation || 0);
  html.classList.toggle('rot-cw', land && (ang === 270 || ang === -90));
  html.classList.toggle('rot-ccw', land && !(ang === 270 || ang === -90));
  requestAnimationFrame(() => { Scene.resize(); layoutHero(); });
}
function layoutHero() { const tb = $('#topbar').offsetHeight; $('#hero').style.height = Math.max(200, Scene.heroBottom() - tb) + 'px'; }

function onTilt(e) { if (!settings.tilt) return; const gx = clamp((e.gamma || 0) / 30, -1, 1), gy = clamp(((e.beta || 45) - 45) / 30, -1, 1); Scene.setTilt(gx, gy); $('#hero-text').style.transform = `rotateY(${gx * 14}deg) rotateX(${-gy * 8}deg)`; }
async function enableTilt() {
  try { if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') { const r = await DeviceOrientationEvent.requestPermission(); if (r !== 'granted') throw 0; } window.addEventListener('deviceorientation', onTilt); return true; }
  catch (e) { return false; }
}

function bind() {
  hydrateIcons();
  const tap = (sel, fn) => $(sel).addEventListener('click', e => { SFX.init(); fn(e); });
  tap('#title', startGame);
  tap('#refresh-btn', () => { SFX.blip(); refresh(true); });
  tap('#auto-btn', () => { settings.auto = !settings.auto; saveSettings(); settings.auto ? SFX.on() : SFX.off(); count = 60; syncSettingsUI(); toast(settings.auto ? 'AUTO REFRESH: ON (1 MIN)' : 'AUTO REFRESH: OFF'); });
  tap('#sound-btn', () => { settings.sound = !settings.sound; saveSettings(); syncSettingsUI(); SFX.applyAmbient(); if (settings.sound) SFX.on(); toast(settings.sound ? 'SOUND ON' : 'SOUND OFF'); });
  tap('#gear-btn', () => openSheet('settings'));
  tap('#loc-btn', () => openSheet('search'));
  $$('[data-close]').forEach(b => b.addEventListener('click', () => { SFX.blip(); closeSheet(b.dataset.close); }));
  $$('.sheet').forEach(s => s.addEventListener('click', e => { if (e.target === s) closeSheet(s.id); }));
  $$('.opt').forEach(o => o.addEventListener('click', async e => {
    SFX.init(); const k = o.dataset.opt;
    if (k === 'units') { const em = e.target.closest('em'); settings.units = em ? em.dataset.v : (settings.units === 'F' ? 'C' : 'F'); SFX.blip(); }
    else if (k === 'tilt') { if (!settings.tilt) { const ok = await enableTilt(); if (!ok) { toast('MOTION ACCESS DENIED'); return; } settings.tilt = true; } else { settings.tilt = false; Scene.setTilt(0, 0); $('#hero-text').style.transform = ''; } }
    else settings[k] = !settings[k];
    if (k !== 'units') settings[k] ? SFX.on() : SFX.off();
    saveSettings(); syncSettingsUI(); SFX.applyAmbient(); if (k === 'auto') count = 60; if (k === 'units') render();
  }));
  tap('#opt-loc', () => { closeSheet('settings'); openSheet('search'); });
  const gal = () => { closeSheet('settings'); SFX.coin(); setDemo(demo ? demo.i : 0); };
  tap('#opt-gallery', gal); tap('#gallery-btn', gal);
  tap('#demo-prev', () => setDemo(demo.i - 1)); tap('#demo-next', () => setDemo(demo.i + 1)); tap('#demo-exit', exitDemo);
  tap('#use-gps', () => { closeSheet('search'); toast('LOCKING ON TO GPS…'); if (loc) { loc.mode = 'gps'; loc.name = null; } refresh(true); });
  const doSearch = async () => {
    const q = $('#q').value.trim(); if (!q) return; const res = $('#results'); res.innerHTML = '<p class="fine">SEARCHING…</p>';
    try {
      const r = await fetchT(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=8&language=en&format=json`, 9000); const j = await r.json();
      if (!j.results || !j.results.length) { res.innerHTML = '<p class="fine">NO MATCHES. TRY ANOTHER SPELLING.</p>'; return; }
      res.innerHTML = j.results.map((p, i) => `<button class="res" data-i="${i}">${esc(p.name)}<br><small>${esc([p.admin1, p.country].filter(Boolean).join(', '))}</small></button>`).join('');
      res.querySelectorAll('.res').forEach(b => b.addEventListener('click', () => {
        const p = j.results[+b.dataset.i]; const reg = p.country_code === 'US' && p.admin1 ? p.admin1 : (p.country_code || '');
        loc = { lat: p.latitude, lon: p.longitude, name: `${p.name}${reg ? ', ' + reg : ''}`, mode: 'manual' }; store.set('loc', loc);
        closeSheet('search'); SFX.coin(); toast('WARPING TO ' + p.name.toUpperCase()); $('#loc-name').textContent = loc.name; refresh(true);
      }));
    } catch (e) { res.innerHTML = '<p class="fine">NO SIGNAL. CHECK CONNECTION.</p>'; }
  };
  tap('#q-go', doSearch); $('#q').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); $('#q').blur(); doSearch(); } });
  $('#hero').addEventListener('click', e => { if (e.target.closest('#alert-banner')) return; SFX.init(); Scene.jump(); showBubble(quip()); });
  tap('#alert-banner', () => { SFX.alarm(); $('#p-alerts').scrollIntoView({ behavior: 'smooth' }); });
  $('#alerts-list').addEventListener('click', e => { const it = e.target.closest('.alert-item'); if (it) { it.classList.toggle('open'); SFX.blip(); } });
  $('#d-list').addEventListener('click', e => { const r = e.target.closest('.drow'); if (r) { r.classList.toggle('open'); SFX.blip(); } });
  const sc = $('#scroller'), ptr = $('#ptr'), ptrT = $('#ptr-text'); let y0 = null, pulled = 0;
  sc.addEventListener('scroll', () => { if (!$('#bubble').hidden && sc.scrollTop > 40) $('#bubble').hidden = true; }, { passive: true });
  sc.addEventListener('touchstart', e => { y0 = sc.scrollTop <= 0 ? e.touches[0].clientY : null; pulled = 0; }, { passive: true });
  sc.addEventListener('touchmove', e => { if (y0 == null) return; pulled = e.touches[0].clientY - y0; if (pulled > 10) { ptr.style.opacity = Math.min(1, pulled / 80); ptrT.textContent = pulled > 80 ? 'RELEASE TO REFRESH!' : 'PULL TO REFRESH'; } }, { passive: true });
  sc.addEventListener('touchend', () => { if (y0 != null && pulled > 80) { SFX.init(); refresh(true); } y0 = null; ptr.style.opacity = 0; });
  // watch mode: push UI off-screen
  const setWatch = on => {
    $('#app').classList.toggle('watch', on); $('#bubble').hidden = true;
    if (on) { $('#scroller').scrollTo({ top: 0 }); SFX.whoosh(); toast('WATCH MODE · TAP ▲ TO RETURN'); } else SFX.jump();
  };
  tap('#hide-ui', e => { e.stopPropagation(); setWatch(true); });
  tap('#show-ui', () => setWatch(false));
  $('#stage').addEventListener('click', () => { if (!$('#app').classList.contains('watch')) return; SFX.init(); Scene.jump(); showBubble(quip()); });
  let wy = null;
  $('#stage').addEventListener('touchstart', e => { wy = e.touches[0].clientY; }, { passive: true });
  $('#stage').addEventListener('touchend', e => { if (wy != null && $('#app').classList.contains('watch') && wy - e.changedTouches[0].clientY > 70) setWatch(false); wy = null; });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { Scene.pause(true); SFX.suspend(); }
    else { Scene.pause(false); SFX.resume(); if (settings.auto && data && Date.now() - data.at > 60000) refresh(false); statusLine(); }
  });
  window.addEventListener('resize', applyOrientation);
  window.addEventListener('orientationchange', () => setTimeout(applyOrientation, 200));
  window.addEventListener('online', () => { toast('BACK ONLINE'); refresh(false); });
  window.addEventListener('offline', () => { offline = true; statusLine(); toast('OFFLINE MODE'); });
  document.addEventListener('gesturestart', e => e.preventDefault());
  document.addEventListener('touchend', () => SFX.init(), { passive: true });
}

function startGame() {
  if (started) return; started = true;
  SFX.init(); SFX.start();
  const t = $('#title'); t.classList.add('out'); setTimeout(() => t.remove(), 650);
  if (settings.tilt) enableTilt();
  SFX.setScene(Scene.scene);
  if (pendingSearch && !data) { openSheet('search'); toast('LOCATION OFF · PICK A CITY'); }
  else if (!data && !busy) refresh(true);
  setTimeout(() => { if (data) showBubble(quip()); }, 900);
}

function boot() {
  bind(); syncSettingsUI(); applyOrientation();
  if (data && data.wx) { offline = !navigator.onLine; try { render(); } catch (e) { console.warn(e); } }
  refresh(false);
  setInterval(() => {
    if (!settings.auto || busy || document.hidden || !started) { updateRing(); return; }
    count--; if (count <= 0) refresh(false); updateRing();
    if (count % 15 === 0) statusLine();
  }, 1000);
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    const hadController = !!navigator.serviceWorker.controller; let reloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (hadController && !reloaded) { reloaded = true; location.reload(); } });
    navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then(r => {
      r.update().catch(() => { });
      document.addEventListener('visibilitychange', () => { if (!document.hidden) r.update().catch(() => { }); });
    }).catch(() => { });
  }
}
boot();
})();
