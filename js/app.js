'use strict';
/* Screens and game flow: title → (first-time demo) → make explorer → map → chapter → level → reward → back. */

const chapterOf = id => G.chapters.find(c => c.id === id);
const chapterOpen = ch => { const i = G.chapters.indexOf(ch); return i === 0 || G.profile.done.includes(G.chapters[i - 1].id); };
const chapterPlayable = ch => chapterOpen(ch) && !ch.comingSoon && ch.levels.some(l => Levels[l.type]);
const variantOf = lv => { const n = G.profile.plays[lv.id] || 0; return n === 0 ? 'day' : (n % 2 ? 'night' : 'rain'); };

const Screens = {
  title() {
    G.profile = null; Snd.bgm(true);
    const slots = G.save.profiles.map((p, i) => h('button', { class: 'slot pop-in', onclick: () => {
      Snd.unlock(); Snd.sfx('ding'); G.save.current = i;
      if (!p) { G.save.profiles[i] = Store.newProfile(); }
      G.profile = G.save.profiles[i]; Store.save();
      if (!G.profile.created) Screens.tutorial(); else Screens.map();
    } }, p && p.created ? [explorerEl(p, 190), starsCount(p)] : h('img', { class: 'plus', src: G.game.ui.play, alt: '' })));
    const el = h('div', { class: 'col center full' },
      h('img', { class: 'logo bob', src: G.game.ui.logo, alt: '' }),
      line('title', 'title light'),
      h('div', { class: 'row slots' }, slots),
      h('div', { class: 'parade' }, G.game.buddies.map((b, i) => h('img', { class: 'bob', src: b.img, alt: '', style: { animationDelay: (-i * 0.4) + 's' } }))),
      btn('gear', () => parentGate(), 'small ghost corner-tr'));
    show(el, { cls: 'space' });
  },

  // First-time opening ("Hello, World!"): a wordless demo under 30 seconds.
  async tutorial() {
    const earth = h('img', { class: 'logo big bob', src: G.game.ui.logo, alt: '' });
    const spots = [[230, 250], [790, 230], [512, 620]];
    let left = spots.length;
    const stars = spots.map(([x, y]) => h('button', { class: 'tstar pulse', style: { left: x + 'px', top: y + 'px' } }, h('img', { src: G.game.ui.star, alt: '' })));
    const pop = s => { if (s.dataset.done) return; s.dataset.done = 1; Snd.unlock(); Snd.sfx('pop'); const c = centre(s); burst(c.x, c.y, 10); s.classList.add('gone'); if (--left === 0) setTimeout(() => Screens.creator(true), 700); };
    stars.forEach(s => s.addEventListener('click', () => pop(s)));
    show(h('div', { class: 'full' }, h('div', { class: 'col center full' }, earth, line('tutorial.tap', 'light')), stars), { cls: 'space' });
    sayKey('tutorial.tap');
    await wait(900); await handDemo({ x: 512, y: 420 }, { x: spots[0][0], y: spots[0][1] }); pop(stars[0]);
    const again = setInterval(() => { const s = stars.find(x => !x.dataset.done); if (s) { const c = centre(s); handDemo({ x: 512, y: 420 }, c); } }, 6000);
    G.cleanup.push(() => clearInterval(again));
  },

  creator(first) {
    const p = G.profile, preview = h('div', { class: 'preview' });
    const draw = () => { preview.replaceChildren(explorerEl(p, 300)); preview.firstChild.classList.add('squash'); };
    const steps = [
      { key: 'creator.color', items: G.game.colors.map(c => ({ el: h('i', { class: 'swatch', style: { background: c } }), pick: () => p.color = c, on: () => p.color === c })) },
      { key: 'creator.hat', items: G.game.hats.map(x => ({ el: h('img', { src: x.img, alt: '' }), pick: () => p.hat = x.id, on: () => p.hat === x.id })) },
      { key: 'creator.buddy', items: G.game.buddies.map(x => ({ el: h('img', { src: x.img, alt: '' }), pick: () => p.buddy = x.id, on: () => p.buddy === x.id })) }
    ];
    let si = 0; const panel = h('div', { class: 'col center panel' });
    const render = () => {
      const st = steps[si];
      const choices = st.items.map(it => h('button', { class: 'choice' + (it.on() ? ' on' : ''), onclick: () => { Snd.unlock(); Snd.sfx('pop'); it.pick(); draw(); render(); } }, it.el));
      panel.replaceChildren(line(st.key), h('div', { class: 'grid c' + st.items.length }, choices),
        h('div', { class: 'row' }, si > 0 ? btn('back', () => { si--; render(); sayKey(steps[si].key); }, 'small') : null,
          btn('next', () => { if (si < steps.length - 1) { si++; render(); sayKey(steps[si].key); } else { p.created = true; Store.save(); Snd.sfx('star'); Screens.map(); } }, 'huge pulse')));
    };
    show(h('div', { class: 'row full creator' }, preview, panel)); draw(); render(); sayKey(steps[0].key);
    if (first) setTimeout(() => { const c = panel.querySelector('.choice'); if (c) handDemo({ x: 700, y: 600 }, centre(c)); }, 1200);
  },

  map() {
    Snd.bgm(true); const p = G.profile;
    const nodes = G.chapters.map(ch => {
      const open = chapterPlayable(ch), done = p.done.includes(ch.id);
      return h('button', { class: 'node' + (open ? ' open' : ' locked') + (open && !done ? ' pulse' : ''), style: { left: ch.mapPos.x + '%', top: ch.mapPos.y + '%' }, onclick: () => { Snd.unlock(); Snd.sfx('ding'); open ? Screens.chapter(ch) : previewChapter(ch); } },
        h('img', { src: ch.icon, alt: '' }), open ? (done ? h('img', { class: 'badge', src: G.game.ui.star, alt: '' }) : null) : h('img', { class: 'badge', src: G.game.ui.lock, alt: '' }));
    });
    const pts = G.chapters.map(c => `${c.mapPos.x * 10.24},${c.mapPos.y * 7.68}`).join(' ');
    const cur = chapterOf(p.chapter) || G.chapters[0];
    const me = explorerEl(p, 150); me.classList.add('on-map'); me.style.left = (cur.mapPos.x - 13) + '%'; me.style.top = (cur.mapPos.y + 14) + '%';
    const el = h('div', { class: 'full' },
      h('div', { html: `<svg class="path" viewBox="0 0 1024 768"><polyline points="${pts}" /></svg>` }),
      h('img', { class: 'deco cloud c1', src: G.game.ui.cloud, alt: '' }), h('img', { class: 'deco cloud c2', src: G.game.ui.cloud, alt: '' }),
      h('img', { class: 'deco tree', src: G.game.ui.tree, alt: '' }), h('img', { class: 'deco tree t2', src: G.game.ui.tree, alt: '' }),
      line('map.where', 'top'), nodes, me,
      h('div', { class: 'lvl-badge' }, h('img', { src: G.game.ui.star, alt: '' }), h('b', {}, String(p.level))),
      h('div', { class: 'row dock' }, btn('home', () => Screens.title(), 'small'), btn('book', () => Screens.stickers()), btn('paint', () => Screens.creator(false)), btn('card', () => Screens.card())));
    show(el, { cls: 'map' }); sayKey('map.where');
  },

  chapter(ch) {
    const p = G.profile; p.chapter = ch.id; Store.save();
    if (!p.seen[ch.id]) { p.seen[ch.id] = true; Store.save(); return chapterIntro(ch); }
    Snd.bgm(true);
    const nextIdx = ch.levels.findIndex(l => (p.stars[l.id] || 0) < 2);
    const lvls = ch.levels.map((lv, i) => {
      const v = variantOf(lv);
      return h('div', { class: 'col center' },
        h('button', { class: 'node open lvl' + (i === nextIdx ? ' pulse' : ''), onclick: () => { Snd.unlock(); Snd.sfx('ding'); startLevel(ch, i); } },
          h('img', { src: lv.icon || G.game.levelIcons[lv.type], alt: '' }), v !== 'day' ? h('img', { class: 'badge', src: G.game.ui[v === 'night' ? 'moon' : 'rain'], alt: '' }) : null),
        starsEl(p.stars[lv.id] || 0));
    });
    const hasAll = ch.stickers.every(s => p.stickers.includes(ch.id + ':' + s));
    show(h('div', { class: 'col center full' },
      h('div', { class: 'row' }, h('img', { class: 'ch-icon bob', src: ch.icon, alt: '' }), line(ch.title, 'title ' + (ch.theme.dark ? 'light' : ''))),
      h('div', { class: 'row lvls' }, lvls),
      h('div', { class: 'row dock' }, btn('back', () => Screens.map(), 'small'), ch.song ? btn('song', () => Screens.karaoke(ch), hasAll ? 'pulse' : '') : null)),
      { bg: `linear-gradient(${ch.theme.bg2}, ${ch.theme.bg})` });
    sayKey('chapter.pick');
    if (nextIdx >= 0 && !Object.keys(p.stars).length) setTimeout(() => handDemo({ x: 512, y: 660 }, centre(lvls[nextIdx].firstChild)), 900);
  },

  stickers() {
    const p = G.profile;
    const pages = G.chapters.map(ch => h('div', { class: 'page' }, h('img', { class: 'ch-icon', src: ch.icon, alt: '' }),
      h('div', { class: 'grid c6' }, ch.stickers.map(id => { const kw = kwOf(ch, id), has = p.stickers.includes(ch.id + ':' + id);
        return h('button', { class: 'sticker' + (has ? ' has' : ''), onclick: () => { if (has && kw) { Snd.unlock(); sayWord(kw); wordFlash(kw); } } }, kw ? h('img', { src: kw.img, alt: '' }) : null); })),
      ch.song ? btn('song', () => Screens.karaoke(ch)) : h('i', { class: 'spacer' })));
    show(h('div', { class: 'col center full book' }, line('stickers'), pages, h('div', { class: 'row dock' }, btn('back', () => Screens.map(), 'small'))));
    sayKey('stickers');
  },

  // The whole chapter song, any time. With a "scene" in chapters.json the pictures act the song out.
  karaoke(ch) {
    const song = ch.song, light = ch.theme.dark ? 'light' : '', lyric = h('div', { class: 'lyric' });
    const setLyric = key => lyric.replaceChildren(line(key, 'small ' + light));
    const bg = { bg: `linear-gradient(${ch.theme.bg2}, ${ch.theme.bg})`, cls: ch.theme.dark ? 'dark' : '' };
    let pl;
    if (song.scene && song.scene.type === 'orbits') {
      const sc = orbitScene(ch, song, lyric);
      show(h('div', { class: 'full' }, sc.root, lyric, btn('back', () => Screens.chapter(ch), 'small ghost corner-tl')), bg);
      pl = playSong(song, { onLine: (i, ln) => { setLyric(ln.text); sc.line(ln); }, onExtra: x => { setLyric(x.text); sc.hook(); }, onEnd: () => Screens.chapter(ch) });
      G.cleanup.push(() => sc.stop());
    } else {
      const ex = explorerEl(G.profile, 220), pic = h('img', { class: 'kpic', src: ch.icon, alt: '' }); ex.classList.add('groove'); ex.style.animationDuration = (60 / song.bpm) + 's';
      lyric.classList.add('mid');
      show(h('div', { class: 'col center full' }, lyric, h('div', { class: 'row' }, ex, pic), h('div', { class: 'row dock' }, btn('back', () => Screens.chapter(ch), 'small'))), bg);
      pl = playSong(song, { onLine: (i, ln) => { setLyric(ln.text); const kw = kwOf(ch, ln.word); if (kw) pic.src = kw.img; }, onExtra: x => setLyric(x.text), onEnd: () => Screens.chapter(ch) });
    }
    G.cleanup.push(() => pl.stop());
  },

  // Printable "My Explorer Card".
  card() {
    const p = G.profile, total = Object.values(p.stars).reduce((a, b) => a + b, 0);
    const card = h('div', { class: 'xcard' }, h('div', { class: 'xhead' }, T('card.title').text),
      h('div', { class: 'row' }, explorerEl(p, 240),
        h('div', { class: 'col' }, h('div', { class: 'xstat' }, h('img', { src: G.game.ui.logo, alt: '' }), h('b', {}, String(p.level))), h('div', { class: 'xstat' }, h('img', { src: G.game.ui.star, alt: '' }), h('b', {}, '× ' + total)),
          h('div', { class: 'xstickers' }, p.stickers.map(s => { const [c, id] = s.split(':'); const kw = kwOf(chapterOf(c), id); return kw ? h('img', { src: kw.img, alt: '' }) : null; })))),
      h('div', { class: 'xname' }));
    show(h('div', { class: 'col center full' }, card, h('div', { class: 'row dock noprint' }, btn('back', () => Screens.map(), 'small'),
      h('button', { class: 'textbtn', onclick: () => { try { window.print(); } catch (e) {} } }, T('parent.print').text))));
    sayKey('card.title');
  }
};

// "Go on" button: a big arrow, with the little hand pointing at it if the child waits.
function nextBtn(onTap, hintAfter) {
  const b = btn('next', onTap, 'huge pulse');
  const t = setTimeout(() => { if (b.isConnected) { const c = centre(b); handDemo({ x: c.x - 230, y: c.y - 60 }, c); } }, hintAfter || 3000);
  G.cleanup.push(() => clearTimeout(t));
  return b;
}
function starsCount(p) { const n = Object.values(p.stars).reduce((a, b) => a + b, 0); return h('div', { class: 'xstat sm' }, h('img', { src: G.game.ui.star, alt: '' }), h('b', {}, String(n))); }

// About ten seconds: the chapter picture arrives, then three of its words, one at a time. Tap to skip.
async function chapterIntro(ch) {
  let skip = false; const words = (ch.introWords || []).map(id => kwOf(ch, id)).filter(Boolean);
  const row = h('div', { class: 'row cards' });
  const el = h('div', { class: 'col center full', onclick: () => { skip = true; Snd.unlock(); } }, h('img', { class: 'logo big zoom-in', src: ch.icon, alt: '' }), line(ch.title, 'title ' + (ch.theme.dark ? 'light' : '')), row);
  show(el, { bg: `linear-gradient(${ch.theme.bg2}, ${ch.theme.bg})` });
  Snd.sfx('star'); await Promise.race([sayKey(ch.title), wait(2500)]);
  for (const kw of words) { if (skip) break; row.append(h('div', { class: 'card pop-in' }, h('img', { src: kw.img, alt: '' }), h('span', {}, kw.word))); Snd.sfx('pop'); await Promise.race([sayWord(kw).then(() => wait(500)), wait(2400)]); }
  if (!skip) await wait(700);
  Screens.chapter(ch);
}

// Locked chapters stay tappable: a peek at the pictures and words to come.
function previewChapter(ch) {
  const ov = h('div', { class: 'overlay' }, h('div', { class: 'sheet col center' },
    h('div', { class: 'row' }, h('img', { class: 'ch-icon', src: ch.icon, alt: '' }), h('img', { class: 'ch-icon sm', src: G.game.ui.lock, alt: '' })),
    line(ch.title), h('div', { class: 'grid c5' }, ch.keywords.slice(0, 10).map(kw => h('button', { class: 'sticker has', onclick: () => { sayWord(kw); wordFlash(kw); } }, h('img', { src: kw.img, alt: '' })))),
    line('map.locked'), btn('back', () => ov.remove(), 'small')));
  stage().append(ov); sayKey(ch.title).then(() => sayKey('map.locked'));
}

function startLevel(ch, idx) {
  const lv = ch.levels[idx], run = Levels[lv.type]; if (!run) return;
  const variant = variantOf(lv), first = !(G.profile.plays[lv.id]);
  const root = h('div', { class: 'full level' });
  const ctx = { ch, lv, idx, variant, type: lv.type, first, ended: false,
    // A finished level ends with "Can you say it?" for the third star.
    async complete(kw) { if (ctx.ended) return; const stars = kw ? await sayStep(root, ctx, kw, 'say.it') : 2; ctx.finish(stars); },
    finish(stars) { if (ctx.ended) return; ctx.ended = true; reward(ctx, stars); } };
  // Weather button: tap to change the sky. The game says the weather word each time.
  const kinds = G.game.weather; let wi = Math.max(0, kinds.findIndex(k => k.id === variant));
  const fx = h('div', { class: 'wfx' }), wbtn = h('button', { class: 'btn small weather' }, h('img', { src: kinds[wi].icon, alt: '' }));
  const applyWeather = () => { const s = stage(); kinds.forEach(k => s.classList.remove('var-' + k.id)); s.classList.add('var-' + kinds[wi].id); fx.className = 'wfx ' + kinds[wi].id; wbtn.firstChild.src = kinds[wi].icon; };
  wbtn.addEventListener('click', e => { e.stopPropagation(); Snd.unlock(); wi = (wi + 1) % kinds.length; applyWeather(); Snd.sfx('pop'); wbtn.classList.remove('squash'); void wbtn.offsetWidth; wbtn.classList.add('squash'); if (lv.type !== 'rap') Snd.say(kinds[wi].word, 'en', kinds[wi].audio); });
  const frame = h('div', { class: 'full' }, root, btn('home', () => ctx.finish(1), 'small ghost corner-tl'), wbtn, fx);
  show(frame, { bg: `linear-gradient(${ch.theme.bg2}, ${ch.theme.bg})`, cls: (ch.theme.dark ? 'dark' : '') });
  applyWeather();
  Snd.bgm(lv.type !== 'rap');
  if (lv.type === 'collect') sayKey(lv.params.orderedOnReplay && !first ? 'collect.order' : G.game.levelIntro.collect);
  run(root, ctx);
}

function reward(ctx, stars) {
  const p = G.profile, { ch, lv, idx } = ctx;
  p.stars[lv.id] = Math.max(p.stars[lv.id] || 0, stars);
  let sticker = null;
  if (stars >= 2) {
    p.plays[lv.id] = (p.plays[lv.id] || 0) + 1;
    const own = id => p.stickers.includes(ch.id + ':' + id);
    const id = ctx.first ? ch.stickers[idx] : ch.stickers.slice(ch.levels.length).find(s => !own(s));
    if (id && !own(id)) { p.stickers.push(ch.id + ':' + id); sticker = kwOf(ch, id); }
  }
  const chapterDone = !p.done.includes(ch.id) && ch.levels.every(l => (p.stars[l.id] || 0) >= 2);
  if (chapterDone) { p.done.push(ch.id); p.level++; if (ch.skill && !p.skills.includes(ch.skill)) p.skills.push(ch.skill); }
  Store.save();   // auto-save after every level
  const st = starsEl(0, true), ex = explorerEl(p, 200); ex.classList.add('dance');
  const el = h('div', { class: 'col center full tight' }, st, ex,
    sticker ? h('div', { class: 'col center' }, h('div', { class: 'sticker has new pop-in' }, h('img', { src: sticker.img, alt: '' })), line('reward.sticker')) : null,
    h('div', { class: 'row' }, nextBtn(() => chapterDone ? levelUp(ch) : Screens.chapter(ch), 1500 + stars * 450)));
  show(el, { cls: 'party' });
  [...st.children].forEach((img, i) => setTimeout(() => { if (i < stars) { img.src = G.game.ui.star; img.classList.add('pop-in'); Snd.sfx('ding'); const c = centre(img); burst(c.x, c.y, 6); } }, 400 + i * 450));
  setTimeout(() => { if (sticker) sayKey('reward.sticker'); else if (stars >= 2) sayKey('praise.great'); }, 400 + stars * 450);
}

function levelUp(ch) {
  const p = G.profile, skill = G.game.skills[ch.skill], ex = explorerEl(p, 210); ex.classList.add('jump');
  show(h('div', { class: 'col center full tight' }, h('img', { class: 'rainbow zoom-in', src: G.game.ui.rainbow, alt: '' }), line('levelup', 'title'),
    h('div', { class: 'row' }, ex, h('div', { class: 'lvl-badge static pop-in' }, h('img', { src: G.game.ui.star, alt: '' }), h('b', {}, String(p.level))),
      skill ? h('div', { class: 'sticker has new pop-in' }, h('img', { src: skill.img, alt: '' })) : null),
    skill ? line(skill.text) : null, nextBtn(() => Screens.map(), 4000)), { cls: 'party' });
  Snd.sfx('levelup'); burst(512, 300, 14);
  sayKey('levelup').then(() => skill && sayKey(skill.text));
}

/* ---------- grown-ups ---------- */
function parentGate() {
  const a = 3 + Math.floor(Math.random() * 6), b = 4 + Math.floor(Math.random() * 5);
  const opts = shuffle([a + b, a + b + 2, a + b - 3, a + b + 5]);
  const ov = h('div', { class: 'overlay' }, h('div', { class: 'sheet col center' }, h('p', { class: 'ptext' }, T('parent.gate', { a, b }).text),
    h('div', { class: 'row' }, opts.map(o => h('button', { class: 'textbtn num', onclick: () => { ov.remove(); if (o === a + b) parentPanel(); } }, String(o)))),
    btn('back', () => ov.remove(), 'small')));
  stage().append(ov);
}
function parentPanel() {
  const s = G.save.settings, render = () => { ov.remove(); parentPanel(); };
  const mins = G.game.screenTime.choices.map(m => h('button', { class: 'textbtn' + ((s.minutes || G.game.screenTime.defaultMinutes) === m ? ' on' : ''), onclick: () => { s.minutes = m; Store.save(); render(); } }, String(m)));
  const langs = G.game.languages.map(l => h('button', { class: 'textbtn' + (s.lang === l ? ' on' : ''), onclick: () => { s.lang = l; Store.save(); render(); } }, l));
  const code = G.game.ttsLang.en, cur = Snd.voice(code);
  const voices = Snd.voices(code).slice(0, 12).map(v => h('button', { class: 'textbtn sm' + (cur && cur.name === v.name ? ' on' : ''), onclick: () => { s.voices = s.voices || {}; s.voices[code] = v.name; Store.save(); render(); setTimeout(() => sayKey('praise.great'), 200); } }, v.name.replace(/\s*\(.*?\)\s*$/, m => /enhanced|premium/i.test(m) ? ' ★' : '')));
  const dels = G.save.profiles.map((p, i) => p && p.created ? h('button', { class: 'textbtn warn', onclick: e => { if (e.target.dataset.sure) { G.save.profiles[i] = null; Store.save(); ov.remove(); Screens.title(); } else { e.target.dataset.sure = 1; e.target.textContent = T('parent.resetConfirm').text; } } }, T('parent.reset').text + ' ' + (i + 1)) : null);
  const ov = h('div', { class: 'overlay' }, h('div', { class: 'sheet col' },
    h('p', { class: 'ptext' }, T('parent.minutes').text), h('div', { class: 'row wrap' }, mins),
    h('p', { class: 'ptext' }, T('parent.language').text), h('div', { class: 'row wrap' }, langs),
    h('p', { class: 'ptext' }, T('parent.mic').text),
    h('div', { class: 'row wrap' }, [true, false].map(v => h('button', { class: 'textbtn' + ((s.mic !== false) === v ? ' on' : ''), onclick: () => { s.mic = v; Store.save(); render(); } }, T(v ? 'parent.on' : 'parent.off').text)),
      window.isSecureContext ? null : h('span', { class: 'pnote' }, T('parent.micHttps').text)),
    voices.length ? h('p', { class: 'ptext' }, T('parent.voice').text) : null, h('div', { class: 'row wrap' }, voices),
    h('div', { class: 'row wrap' }, h('button', { class: 'textbtn', onclick: () => { G.test = true; G.save.time.sec = 0; ov.remove(); } }, T('parent.testReminder').text), dels),
    h('button', { class: 'textbtn on', onclick: () => { ov.remove(); Screens.title(); } }, T('parent.close').text)));
  stage().append(ov);
}

/* ---------- boot ---------- */
async function boot() {
  const json = p => fetch(p).then(r => r.json());
  Store.load();
  G.test = /[?&]test=1/.test(location.search) || location.hash === '#test';
  [G.game, G.chapters] = await Promise.all([json('data/game.json'), json('data/chapters.json')]);
  await Promise.all(G.game.languages.map(l => json('lang/' + l + '.json').then(d => G.lang[l] = d).catch(() => G.lang[l] = {})));
  G.bodySvg = await fetch(G.game.explorerBody).then(r => r.text());
  fit(); window.addEventListener('resize', fit); window.addEventListener('orientationchange', () => setTimeout(fit, 300));
  if (window.visualViewport) window.visualViewport.addEventListener('resize', fit);
  [100, 400, 1000, 2500].forEach(ms => setTimeout(fit, ms));
  document.addEventListener('pointerdown', () => Snd.unlock(), { passive: true });
  document.addEventListener('visibilitychange', () => { if (document.hidden) { Store.save(); Snd.stopVoice(); if (Snd.ctx) Snd.ctx.suspend(); } else if (Snd.ctx) Snd.ctx.resume(); });
  Rest.start(); Screens.title();
  try { if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => {}); } catch (e) { /* not allowed inside some web views */ }
}
boot().catch(e => { console.error(e); if (window.__report) window.__report('boot: ' + (e && e.message || e)); });
