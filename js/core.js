'use strict';
/* Little Earth Explorers — core: helpers, save, audio, language, shared UI.
   No text is hard-coded here: words come from lang/*.json and data/*.json. */

const G = { game: null, chapters: [], lang: {}, save: null, profile: null, bodySvg: '', scale: 1, cleanup: [], test: false };

function h(tag, attrs, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(e.style, v);
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (k === 'html') e.innerHTML = v;
    else e.setAttribute(k, v);
  }
  for (const c of kids.flat()) { if (c == null || c === false) continue; e.append(c.nodeType ? c : document.createTextNode(c)); }
  return e;
}
const wait = ms => new Promise(r => setTimeout(r, ms));
const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const stage = () => document.getElementById('stage');

/* ---------- save ---------- */
const Store = {
  key: 'lee_save_v2',
  load() {
    let d = null;
    try { d = JSON.parse(localStorage.getItem(this.key)); } catch (e) { /* storage may be blocked */ }
    if (!d || d.v !== 1) d = { v: 1, settings: { lang: 'en', minutes: null }, profiles: [null, null], current: 0, time: { day: '', sec: 0 } };
    G.save = d; return d;
  },
  save() { try { localStorage.setItem(this.key, JSON.stringify(G.save)); } catch (e) { /* keep playing from memory */ } },
  newProfile() { return { color: G.game.colors[3], hat: G.game.hats[0].id, buddy: G.game.buddies[0].id, level: 1, stars: {}, plays: {}, stickers: [], skills: [], done: [], seen: {}, chapter: G.chapters[0].id, created: false }; }
};

/* ---------- audio ---------- */
const Snd = {
  ctx: null, bufs: new Map(), voiceId: 0, voiceSrc: null, bgmSrc: null, bgmWanted: false,
  unlock() {
    if (!this.ctx) { try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return; } }
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    if (this.bgmWanted && !this.bgmSrc) this.bgm(true);
  },
  // Load a sound file once. Resolves to null when the file is missing, so callers can fall back.
  buf(path) {
    if (!path || !this.ctx) return Promise.resolve(null);
    if (!this.bufs.has(path)) {
      this.bufs.set(path, fetch(path).then(r => {
        if (!r.ok || /text\/html/.test(r.headers.get('content-type') || '')) return null;
        return r.arrayBuffer().then(ab => new Promise(res => this.ctx.decodeAudioData(ab, res, () => res(null))));
      }).catch(() => null));
    }
    return this.bufs.get(path);
  },
  start(buf, vol, loop, offset, dur) {
    const src = this.ctx.createBufferSource(), g = this.ctx.createGain();
    src.buffer = buf; src.loop = !!loop; g.gain.value = vol; src.connect(g).connect(this.ctx.destination);
    if (offset != null) {   // a slice of a song: starts at full volume, tiny fade only at the end so the cut does not click
      const t = this.ctx.currentTime;
      g.gain.setValueAtTime(vol, t + dur - 0.06); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.start(0, offset, dur);
    } else src.start();
    return src;
  },
  async play(path, vol, loop) {
    const b = await this.buf(path);
    if (!b) return null;
    return this.start(b, vol, loop);
  },
  tone(freq, dur, vol, type, when, slideTo) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + (when || 0), o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type || 'sine'; o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.ctx.destination); o.start(t); o.stop(t + dur + 0.05);
  },
  note(midi, dur) { const f = 440 * Math.pow(2, (midi - 69) / 12); this.tone(f, dur || 0.5, 0.22); this.tone(f * 3, 0.12, 0.05); },
  // Soft built-in sounds, used until a matching file is dropped into assets/audio/sfx/.
  synth: {
    pop() { Snd.tone(520, 0.14, 0.2, 'sine', 0, 180); },
    tap() { Snd.tone(700, 0.07, 0.1, 'sine', 0, 500); },
    ding() { Snd.note(84, 0.5); Snd.tone(1568, 0.5, 0.1, 'sine', 0.09); },
    star() { [72, 76, 79].forEach((n, i) => Snd.tone(440 * Math.pow(2, (n - 69) / 12), 0.35, 0.16, 'sine', i * 0.09)); },
    levelup() { [60, 64, 67, 72, 76, 79, 84].forEach((n, i) => Snd.tone(440 * Math.pow(2, (n - 69) / 12), 0.4, 0.16, 'sine', i * 0.1)); },
    yawn() { Snd.tone(420, 1.1, 0.12, 'sine', 0, 180); }
  },
  sfx(name) {
    if (!this.ctx) return;
    this.play(G.game.sfx[name], G.game.volumes.sfx).then(s => { if (!s) (this.synth[name] || this.synth.pop)(); });
  },
  stopVoice() {
    this.voiceId++;
    if (this.voiceSrc) { try { this.voiceSrc.stop(); } catch (e) {} this.voiceSrc = null; }
    try { window.speechSynthesis && window.speechSynthesis.cancel(); } catch (e) {}
  },
  // Speak a line: recorded file first, device voice as the stand-in. Always resolves.
  async say(text, lang, path) {
    this.stopVoice();
    const id = this.voiceId;
    const src = await this.play(path, G.game.volumes.voice);
    if (id !== this.voiceId) { if (src) try { src.stop(); } catch (e) {} return; }
    if (src) { this.voiceSrc = src; return new Promise(res => { src.onended = res; setTimeout(res, 9000); }); }
    return new Promise(res => {
      const timer = setTimeout(res, 800 + text.length * 85);
      try {
        const ss = window.speechSynthesis; if (!ss) return;
        const u = new SpeechSynthesisUtterance(text);
        const code = G.game.ttsLang[lang] || 'en-US', v = this.voice(code);
        u.lang = code; if (v) u.voice = v; u.rate = 0.9; u.pitch = 1.0;
        u.onend = () => { clearTimeout(timer); res(); };
        ss.speak(u);
      } catch (e) { /* silent: the picture and text still show */ }
    });
  },
  // The gentlest voice the device offers: the one chosen by a grown-up, else the first match in
  // game.json "voicePreference", favouring the higher-quality "Enhanced/Premium/Natural" versions.
  voices(code) {
    let all = []; try { all = window.speechSynthesis.getVoices() || []; } catch (e) {}
    const base = code.split('-')[0];
    return all.filter(v => v.lang && v.lang.replace('_', '-').toLowerCase().startsWith(base));
  },
  voice(code) {
    const list = this.voices(code); if (!list.length) return null;
    const saved = (G.save.settings.voices || {})[code], pick = list.find(v => v.name === saved); if (pick) return pick;
    const pref = G.game.voicePreference || [];
    const score = v => { const i = pref.findIndex(p => v.name.indexOf(p) >= 0); return (i < 0 ? 0 : 100 - i) + (/premium|enhanced|natural|neural/i.test(v.name) ? 200 : 0) + (v.lang.replace('_', '-') === code ? 20 : 0) + (/compact|eloquence|novelty/i.test(v.voiceURI || '') ? -50 : 0); };
    return list.slice().sort((a, b) => score(b) - score(a))[0];
  },
  bgm(on) {
    this.bgmWanted = on;
    if (!this.ctx) return;
    if (on && !this.bgmSrc) { this.bgmSrc = 'loading'; this.play(G.game.bgm, G.game.volumes.bgm, true).then(s => { if (this.bgmWanted) this.bgmSrc = s; else { if (s) s.stop(); this.bgmSrc = null; } }); }
    if (!on && this.bgmSrc) { if (this.bgmSrc.stop) try { this.bgmSrc.stop(); } catch (e) {} this.bgmSrc = null; }
  }
};


/* ---------- microphone: record the child, play it straight back ----------
   Everything stays in memory: nothing is saved, uploaded or kept after the screen closes.
   Needs a secure page (https or localhost); anywhere else the game falls back to the old "speak now" moment. */
const Rec = {
  ok() {
    return G.save.settings.mic !== false && window.isSecureContext && !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia) && typeof window.MediaRecorder !== 'undefined';
  },
  // Records until the child stops talking (or maxSec). onLevel(0..1) drives the on-screen meter.
  // Resolves { blob, heard } or null when the microphone is not allowed / not available.
  async record(onLevel, maxSec) {
    if (!this.ok()) return null;
    let stream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } }); }
    catch (e) { return null; }   // refused or no microphone: quietly carry on without
    Snd.unlock();
    const type = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm', 'audio/aac'].find(t => { try { return MediaRecorder.isTypeSupported(t); } catch (e) { return false; } });
    let mr; try { mr = new MediaRecorder(stream, type ? { mimeType: type } : undefined); } catch (e) { stream.getTracks().forEach(t => t.stop()); return null; }
    const chunks = []; mr.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
    let an = null, src = null, data = null;
    try { src = Snd.ctx.createMediaStreamSource(stream); an = Snd.ctx.createAnalyser(); an.fftSize = 1024; src.connect(an); data = new Float32Array(an.fftSize); } catch (e) {}
    return new Promise(res => {
      const t0 = performance.now(); let heard = false, lastLoud = 0, stopped = false, noise = 0.01, frames = 0;
      const finish = () => { if (stopped) return; stopped = true; try { mr.stop(); } catch (e) { end(); } };
      const end = () => {
        stream.getTracks().forEach(t => t.stop()); try { src && src.disconnect(); } catch (e) {}
        onLevel && onLevel(0);
        res(chunks.length ? { blob: new Blob(chunks, { type: mr.mimeType || type || 'audio/mp4' }), heard } : { blob: null, heard });
      };
      mr.onstop = end;
      G.cleanup.push(finish); this.stopNow = finish;
      try { mr.start(); } catch (e) { end(); return; }
      const tick = () => {
        if (stopped) return;
        const now = performance.now(), sec = (now - t0) / 1000;
        let lvl = 0;
        if (an) { an.getFloatTimeDomainData(data); let sum = 0; for (let i = 0; i < data.length; i++) sum += data[i] * data[i]; lvl = Math.sqrt(sum / data.length); }
        if (++frames < 15) noise = Math.max(noise, lvl);           // first quarter-second: learn the room noise
        const loud = lvl > Math.max(0.02, noise * 2.2);
        if (loud) { lastLoud = now; if (sec > 0.25) heard = true; }
        onLevel && onLevel(Math.min(1, lvl * 9));
        if (sec > (maxSec || 5) || (heard && now - lastLoud > 1100) || (!heard && sec > 4.5) || (!an && sec > 3.2)) return finish();
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
      if (!an) heard = true;   // no meter on this device: trust the child
    });
  },
  // Plays a recording back (a little louder). Resolves when it ends.
  async play(blob) {
    if (!blob) return;
    Snd.unlock();
    try {
      const ab = await blob.arrayBuffer();
      const buf = await new Promise((ok, no) => Snd.ctx.decodeAudioData(ab, ok, no));
      const s = Snd.start(buf, 1.6);
      return new Promise(r => { s.onended = r; setTimeout(r, buf.duration * 1000 + 300); });
    } catch (e) {
      return new Promise(r => {   // some devices only play their own format through an <audio> element
        const url = URL.createObjectURL(blob), a = new Audio(url);
        const done = () => { URL.revokeObjectURL(url); r(); };
        a.onended = done; a.onerror = done; a.play().catch(done); setTimeout(done, 8000);
      });
    }
  }
};

/* ---------- language ---------- */
function T(key, vars) {
  const cur = G.save.settings.lang;
  let e = G.lang[cur] && G.lang[cur][key], lang = cur;
  if (!e) { e = G.lang.en[key]; lang = 'en'; }
  if (!e) return { text: '', audio: null, lang: 'en' };
  let text = e.t;
  for (const [k, v] of Object.entries(vars || {})) text = text.replace('{' + k + '}', v);
  return { text, audio: e.a || null, lang };
}
const sayKey = key => { const t = T(key); return Snd.say(t.text, t.lang, t.audio); };
const sayWord = kw => Snd.say(kw.word, 'en', kw.audio);
const kwOf = (ch, id) => ch.keywords.find(k => k.id === id);

/* ---------- shared UI ---------- */
function btn(icon, onTap, cls) {
  return h('button', { class: 'btn ' + (cls || ''), onclick: e => { Snd.unlock(); Snd.sfx('tap'); onTap(e); } }, h('img', { src: G.game.ui[icon] || icon, alt: '', draggable: 'false' }));
}
// One short line of text with its speaker button.
function line(key, cls) {
  const t = T(key);
  return h('div', { class: 'line ' + (cls || '') }, h('span', {}, t.text),
    h('button', { class: 'speaker', 'aria-label': 'listen', onclick: () => { Snd.unlock(); sayKey(key); } }, h('img', { src: G.game.ui.speaker, alt: '' })));
}
function show(el, opts) {
  G.cleanup.splice(0).forEach(f => { try { f(); } catch (e) {} });
  Snd.stopVoice();
  const s = stage(); s.className = (opts && opts.cls) || ''; s.style.background = (opts && opts.bg) || '';
  s.replaceChildren(el);
}
function explorerEl(p, size, withBuddy) {
  const w = h('div', { class: 'explorer', style: { width: size + 'px', height: size + 'px' } });
  w.append(h('div', { class: 'ex-body', html: G.bodySvg, style: { color: p.color } }));
  const hat = G.game.hats.find(x => x.id === p.hat);
  if (hat) w.append(h('img', { class: 'ex-hat', src: hat.img, alt: '' }));
  const b = G.game.buddies.find(x => x.id === p.buddy);
  if (withBuddy !== false && b) { w.append(h('img', { class: 'ex-buddy', src: b.img, alt: '' })); w.style.marginRight = Math.round(size * 0.46) + 'px'; }
  return w;
}
function starsEl(n, big) {
  return h('div', { class: 'stars' + (big ? ' big' : '') }, [1, 2, 3].map(i => h('img', { src: i <= n ? G.game.ui.star : G.game.ui.starOff, alt: '' })));
}
// Position of an element's centre in stage coordinates.
function centre(el) {
  const r = el.getBoundingClientRect(), s = stage().getBoundingClientRect();
  return { x: (r.left + r.width / 2 - s.left) / G.scale, y: (r.top + r.height / 2 - s.top) / G.scale };
}
function burst(x, y, n) {
  for (let i = 0; i < (n || 8); i++) {
    const a = Math.PI * 2 * i / (n || 8), d = 70 + Math.random() * 50;
    const s = h('img', { class: 'spark', src: G.game.ui.star, alt: '', style: { left: x + 'px', top: y + 'px' } });
    stage().append(s);
    s.animate([{ transform: 'translate(-50%,-50%) scale(.3)', opacity: 1 }, { transform: `translate(calc(-50% + ${Math.cos(a) * d}px), calc(-50% + ${Math.sin(a) * d}px)) scale(1)`, opacity: 0 }], { duration: 420, easing: 'ease-out' }).onfinish = () => s.remove();
  }
}
// Wordless "little hand" demo: the hand glides from A to B and taps.
function handDemo(from, to) {
  const hand = h('img', { class: 'hand', src: G.game.ui.hand, alt: '' });
  stage().append(hand);
  const a = hand.animate([
    { left: from.x + 'px', top: from.y + 'px', transform: 'scale(1)', opacity: 0 },
    { left: from.x + 'px', top: from.y + 'px', transform: 'scale(1)', opacity: 1, offset: 0.15 },
    { left: to.x + 'px', top: to.y + 'px', transform: 'scale(1)', opacity: 1, offset: 0.7 },
    { left: to.x + 'px', top: to.y + 'px', transform: 'scale(.8)', opacity: 1, offset: 0.82 },
    { left: to.x + 'px', top: to.y + 'px', transform: 'scale(1)', opacity: 0 }
  ], { duration: 2200, easing: 'ease-in-out' });
  const done = new Promise(res => { a.onfinish = () => { hand.remove(); res(); }; });
  G.cleanup.push(() => hand.remove());
  return done;
}
function fit() {
  // Some iPad web views report a size of 0 for a moment after loading; fall back and try again shortly.
  const de = document.documentElement, vv = window.visualViewport;
  const w = window.innerWidth || (vv && vv.width) || de.clientWidth || screen.width || 1024;
  const hgt = window.innerHeight || (vv && vv.height) || de.clientHeight || screen.height || 768;
  const sc = Math.min(w / 1024, hgt / 768);
  G.scale = sc > 0.05 && isFinite(sc) ? sc : 1;
  stage().style.transform = `translate(-50%,-50%) scale(${G.scale})`;
}

/* ---------- gentle screen-time reminder ---------- */
const Rest = {
  limitSec() { return (G.test ? G.game.screenTime.testMinutes : (G.save.settings.minutes || G.game.screenTime.defaultMinutes)) * 60; },
  start() {
    setInterval(() => {
      if (document.hidden || !G.profile || document.querySelector('.overlay')) return;
      const t = G.save.time, day = new Date().toDateString();
      if (t.day !== day) { t.day = day; t.sec = 0; }
      t.sec++;
      if (t.sec % 15 === 0) Store.save();
      if (t.sec >= this.limitSec()) { t.sec = 0; Store.save(); this.show(); }
    }, 1000);
  },
  show() {
    Snd.sfx('yawn');
    const ex = explorerEl(G.profile, 260); ex.classList.add('sleepy');
    const ov = h('div', { class: 'overlay night' }, h('div', { class: 'zzz' }, 'z z z'), ex, line('sleepy', 'light'),
      h('div', { class: 'row' },
        btn('moon', () => { ov.remove(); Screens.title(); }, 'huge'),
        btn('next', () => ov.remove(), 'small ghost')));
    stage().append(ov); sayKey('sleepy');
  }
};
