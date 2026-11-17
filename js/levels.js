'use strict';
/* Level types. Each one is driven only by chapters.json:
   Levels[type](root, ctx) builds the level inside `root` and calls ctx.complete(word) or ctx.finish(stars) when over.
   Rules never change between chapters — only the words, pictures and sounds do. */

// Big picture + word shown for a moment whenever a word is spoken.
function wordFlash(kw) {
  const old = document.querySelector('.flash'); if (old) old.remove();
  const f = h('div', { class: 'flash' }, h('img', { src: kw.img, alt: '' }), h('span', {}, kw.word));
  stage().append(f); setTimeout(() => f.remove(), 1500);
}
function dots(n) { return h('div', { class: 'dots' }, Array.from({ length: n }, () => h('i'))); }
function fillDot(el, i) { const d = el.children[i]; if (d) d.classList.add('on'); }
const lightIf = ctx => (ctx.ch.theme.dark ? 'light' : '');

// Shared last step: "Can you say it?" — saying a word out loud earns the third star.
// Nothing is recorded; the game simply gives the child a moment to speak.
// Shared last step: "Can you say it?" — saying it out loud earns the third star.
// Tap the microphone, speak, and hear your own voice played back. Nothing is kept.
// If the microphone can't be used, it becomes a short "speak now" moment instead.
function sayStep(root, ctx, kw, promptKey) {
  return new Promise(res => {
    let busy = false, finished = false, tries = 0, last = null;
    const end = stars => { if (finished) return; finished = true; res(stars); };
    const praise = () => sayKey(ctx.type === 'think' ? 'praise.think' : 'praise.great');
    const meter = h('div', { class: 'meter' }, [0, 1, 2, 3, 4].map(() => h('i')));
    const setLevel = v => { mic.style.setProperty('--lvl', v.toFixed(2)); [...meter.children].forEach((b, i) => b.classList.toggle('on', v > 0.08 + i * 0.17)); };
    const mic = btn('mic', async () => {
      if (busy || finished) return; busy = true; tries++;
      Snd.stopVoice(); Snd.bgm(false);
      mic.classList.remove('pulse'); mic.classList.add('rec'); next.style.visibility = 'hidden'; replay.style.visibility = 'hidden';
      buddy.classList.add('listening');
      const r = Rec.ok() ? await Rec.record(setLevel, 5) : null;
      mic.classList.remove('rec'); buddy.classList.remove('listening'); setLevel(0);
      if (finished) return;
      if (r === null) {            // no microphone here: a short "speak now" moment instead
        mic.classList.add('rec'); buddy.classList.add('listening'); await wait(2800);
        mic.classList.remove('rec'); buddy.classList.remove('listening');
        Snd.sfx('star'); await praise(); return end(3);
      }
      if (!r.heard && tries < 2) { // didn't catch anything: the buddy says it again, then try once more
        await sayKey('say.again'); if (kw) await sayWord(kw);
        busy = false; mic.classList.add('pulse'); next.style.visibility = ''; point(); return;
      }
      last = r.blob;
      if (last) {                  // hear yourself!
        buddy.classList.add('dance'); box.classList.add('playing');
        await sayKey('listen.you'); await Rec.play(last);
        buddy.classList.remove('dance'); box.classList.remove('playing');
        replay.style.visibility = '';
      }
      Snd.sfx('star'); await praise();
      busy = false; mic.classList.add('pulse'); next.style.visibility = '';
      next.classList.add('pulse'); gotStar = true;
    }, 'huge pulse micbtn');
    let gotStar = false;
    const replay = btn('ear', () => { if (!busy && last) { busy = true; buddy.classList.add('dance'); Rec.play(last).then(() => { busy = false; buddy.classList.remove('dance'); }); } }, 'small');
    replay.style.visibility = 'hidden';
    const next = btn('next', () => { if (busy) return; end(gotStar ? 3 : 2); }, 'small ghost');
    const buddy = explorerEl(G.profile, 200);
    const box = h('div', { class: 'col center saybox' }, line(promptKey, lightIf(ctx)),
      h('div', { class: 'row' }, buddy, kw ? h('button', { class: 'card' + (kw.word.length > 12 ? ' long' : ''), onclick: () => { if (!busy) sayWord(kw); } }, h('img', { src: kw.img, alt: '' }), h('span', {}, kw.word)) : null),
      h('div', { class: 'row' }, replay, h('div', { class: 'col center micwrap' }, mic, meter), next));
    root.replaceChildren(box);
    // the little hand shows where to tap, and comes back if nothing happens
    const point = () => { if (!busy && !gotStar && !finished && mic.isConnected) { const c = centre(mic); handDemo({ x: c.x - 220, y: c.y - 40 }, c); } };
    const again = setInterval(point, 6000); G.cleanup.push(() => clearInterval(again));
    sayKey(promptKey).then(() => kw && sayWord(kw)).then(point);
  });
}

// After a collect level: everything caught lines up (with orbits for the solar system)
// and is named aloud one by one, starting from the first word in the list.
function lineup(root, ctx, words) {
  return new Promise(async res => {
    const p = ctx.lv.params.finale || {}, n = words.length, cx = 60, cy = 400;
    const xAt = i => (i === 0 ? 100 : 215 + (i - 1) * (735 / Math.max(1, n - 2)));
    let rings = '';
    const spots = words.map((kw, i) => {
      const r = xAt(i) - cx, a = i === 0 ? 0 : (i % 2 ? -1 : 1) * Math.min(0.5, 120 / r);
      if (i > 0 && p.orbits) rings += `<circle cx="${cx}" cy="${cy}" r="${r}"/>`;
      return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
    });
    const els = words.map((kw, i) => h('button', { class: 'orb' + (i === 0 ? ' first' : ''), style: { left: spots[i].x + 'px', top: spots[i].y + 'px' }, onclick: () => { Snd.unlock(); sayWord(kw); } },
      h('img', { src: kw.img, alt: '' }), h('span', {}, kw.word)));
    const go = btn('next', () => res(), 'huge pulse corner-bl'); go.style.visibility = 'hidden';
    root.replaceChildren(h('div', { class: 'full lineup' }, h('div', { html: `<svg class="rings" viewBox="0 0 1024 768">${rings}</svg>` }), p.text ? line(p.text, 'top ' + lightIf(ctx)) : null, els, go));
    let alive = true; G.cleanup.push(() => { alive = false; });
    if (p.text) await Promise.race([sayKey(p.text), wait(3000)]);
    for (let i = 0; i < n && alive; i++) {
      els[i].classList.add('show'); Snd.sfx('pop'); burst(spots[i].x, spots[i].y, 6);
      await Promise.race([sayWord(words[i]), wait(2600)]); await wait(280);
    }
    go.style.visibility = '';
  });
}

const Levels = {
  /* Collect: glide to each floating thing; it is named aloud and joins the tail.
     On replays the things must be caught in order (the next one glows). */
  collect(root, ctx) {
    const words = ctx.lv.params.words.map(id => kwOf(ctx.ch, id)).filter(Boolean);
    const speed = ctx.lv.params.speed || 280, ordered = !!ctx.lv.params.orderedOnReplay && !ctx.first;
    const field = h('div', { class: 'field' }), bar = dots(words.length);
    const me = explorerEl(G.profile, 130, false); me.classList.add('me');
    root.append(field, bar); field.append(me);
    const pos = { x: 512, y: 420 }, target = { x: 512, y: 420 }, trail = [], tail = [], keys = {};
    const spots = shuffle([[150, 190], [400, 150], [660, 180], [880, 230], [130, 440], [860, 470], [230, 640], [520, 650], [780, 660], [330, 380], [700, 400]]);
    const items = words.map((kw, i) => {
      const el = h('img', { class: 'item bob', src: kw.img, alt: '', style: { left: spots[i % spots.length][0] + 'px', top: spots[i % spots.length][1] + 'px', animationDelay: (-i * 0.4) + 's' } });
      field.append(el); return { kw, el, x: spots[i % spots.length][0], y: spots[i % spots.length][1], got: false, nudged: 0 };
    });
    let got = 0, alive = true, last = performance.now(), idle = 0;
    const nextItem = () => (ordered ? items[got] : items.find(i => !i.got));
    const mark = () => { items.forEach(i => i.el.classList.remove('next')); if (ordered && items[got]) items[got].el.classList.add('next'); };
    mark();
    const toStage = e => { const r = stage().getBoundingClientRect(); return { x: (e.clientX - r.left) / G.scale, y: (e.clientY - r.top) / G.scale }; };
    const point = e => { const p = toStage(e); target.x = p.x; target.y = Math.max(110, p.y); idle = 0; };
    field.addEventListener('pointerdown', e => { Snd.unlock(); point(e); field.setPointerCapture(e.pointerId); });
    field.addEventListener('pointermove', e => { if (e.buttons || e.pointerType === 'touch') point(e); });
    const kd = e => { keys[e.key] = true; idle = 0; }, ku = e => { keys[e.key] = false; };
    window.addEventListener('keydown', kd); window.addEventListener('keyup', ku);
    const demo = () => { const it = nextItem(); if (it && alive) handDemo({ x: pos.x, y: pos.y }, { x: it.x, y: it.y }); };
    setTimeout(demo, 600);
    function tick(now) {
      if (!alive) return;
      const dt = Math.min(0.05, (now - last) / 1000); last = now; idle += dt;
      if (idle > 7) { idle = 0; demo(); }
      const kx = (keys.ArrowRight ? 1 : 0) - (keys.ArrowLeft ? 1 : 0), ky = (keys.ArrowDown ? 1 : 0) - (keys.ArrowUp ? 1 : 0);
      if (kx || ky) { target.x = Math.max(60, Math.min(964, pos.x + kx * 80)); target.y = Math.max(110, Math.min(708, pos.y + ky * 80)); }
      const dx = target.x - pos.x, dy = target.y - pos.y, d = Math.hypot(dx, dy);
      if (d > 4) { const step = Math.min(d, speed * dt); pos.x += dx / d * step; pos.y += dy / d * step; trail.unshift({ x: pos.x, y: pos.y }); if (trail.length > 600) trail.pop(); }
      me.style.left = pos.x + 'px'; me.style.top = pos.y + 'px'; me.style.transform = `translate(-50%,-50%) scaleX(${dx < -4 ? -1 : 1})`;
      tail.forEach((t, i) => { const p = trail[Math.min(trail.length - 1, (i + 1) * 14)] || pos; t.style.left = p.x + 'px'; t.style.top = p.y + 'px'; });
      for (const it of items) {
        if (it.got || Math.hypot(it.x - pos.x, it.y - pos.y) > 80) continue;
        if (ordered && it !== items[got]) {      // not its turn yet: it wiggles and says its name, the right one keeps glowing
          if (now - it.nudged > 3000) { it.nudged = now; sayWord(it.kw); it.el.classList.add('wobble'); setTimeout(() => it.el.classList.remove('wobble'), 400); demo(); }
          continue;
        }
        it.got = true; got++; Snd.sfx('pop'); burst(it.x, it.y); sayWord(it.kw); wordFlash(it.kw); fillDot(bar, got - 1);
        it.el.classList.remove('bob', 'next'); it.el.classList.add('tail'); tail.push(it.el); mark();
        if (got === items.length) {
          alive = false;
          setTimeout(async () => { if (ctx.ended) return; if (ctx.lv.params.finale) await lineup(root, ctx, words); ctx.complete(words[Math.floor(Math.random() * words.length)]); }, 1700);
          return;
        }
      }
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
    G.cleanup.push(() => { alive = false; window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku); });
  },

  /* Listen: hear a word, tap one of three pictures. A miss is never called wrong:
     the buddy points to the answer once; a second miss and the game helps it through. */
  listen(root, ctx) {
    const pool = ctx.lv.params.words.map(id => kwOf(ctx.ch, id)).filter(Boolean);
    const rounds = shuffle(pool).slice(0, Math.min(ctx.lv.params.rounds || 6, pool.length));
    pickRounds(root, ctx, rounds.map(kw => ({ kw, play: () => sayWord(kw) })), pool, 3, 'level.listen');
  },

  /* Rap: the chapter song, one line at a time over a beat. Each line names one picture;
     tap it. Three pictures the first time, four on replays. */
  async rap(root, ctx) {
    const song = ctx.ch.song; if (!song) return ctx.complete(null);
    const lines = song.lines.map(l => ({ ...l, kw: kwOf(ctx.ch, l.word) })).filter(l => l.kw);
    const pool = [...new Set(lines.map(l => l.kw))];
    Snd.bgm(false);
    // With a finished song file and line times, each line is played straight from the song.
    const buf = song.lineTimes ? await Snd.buf(song.audio) : null;
    let beat = null, seg = null, dead = false;
    if (!buf) Snd.play(song.beat, G.game.volumes.song, true).then(s => { if (dead) { if (s) s.stop(); } else beat = s; });
    G.cleanup.push(() => { dead = true; [beat, seg].forEach(s => { if (s) try { s.stop(); } catch (e) {} }); });
    const lyric = h('div', { class: 'lyric' }); root.append(lyric);
    const rounds = lines.map((l, i) => ({
      kw: l.kw,
      show: () => lyric.replaceChildren(line(l.text, 'small ' + lightIf(ctx))),
      play: () => {
        if (!buf) { const t = T(l.text); return Snd.say(t.text, t.lang, t.audio); }
        if (seg) try { seg.stop(); } catch (e) {}
        const end = song.lineTimes[i + 1] || buf.duration, dur = end - song.lineTimes[i];
        seg = Snd.start(buf, G.game.volumes.song, false, song.lineTimes[i], dur);
        return wait(dur * 1000);
      }
    }));
    const dancer = explorerEl(G.profile, 150); dancer.classList.add('groove'); dancer.style.animationDuration = (60 / song.bpm) + 's';
    root.append(h('div', { class: 'dancer' }, dancer));
    pickRounds(root, ctx, rounds, pool, 4, 'level.rap');
  },

  /* Think: "Would you rather…?" Two imaginative pictures (or a few picture reasons).
     Every choice is a good one; saying why earns the third star. */
  think(root, ctx) {
    const list = ctx.ch.openQuestions || (ctx.ch.openQuestion ? [ctx.ch.openQuestion] : []);
    if (!list.length) return ctx.complete(null);
    const q = list[(G.profile.plays[ctx.lv.id] || 0) % list.length], opts = q.choices || q.reasons;
    const cards = opts.map(o => h('button', { class: 'card big pop-in' + (opts.length === 2 ? ' duo' : ''), onclick: async () => {
      Snd.unlock(); cards.forEach(c => c.disabled = true); Snd.sfx('ding');
      const c = centre(cards[opts.indexOf(o)]); burst(c.x, c.y, 10);
      cards.forEach(x => x.classList.toggle('fade', x !== cards[opts.indexOf(o)]));
      await sayKey(o.text); await wait(300);
      const stars = await sayStep(root, ctx, { img: o.img, word: T(o.text).text, audio: T(o.text).audio }, 'say.why');
      ctx.finish(stars);
    } }, h('img', { src: o.img, alt: '' })));
    const row = h('div', { class: 'row cards' }, opts.length === 2 ? [cards[0], h('div', { class: 'or bob' }, '?'), cards[1]] : cards);
    root.append(h('div', { class: 'col center think' }, line(q.text, 'small ' + lightIf(ctx)), row));
    sayKey(q.text).then(async () => { for (let i = 0; i < opts.length; i++) { if (cards[i].disabled || ctx.ended) return; cards[i].classList.add('squash'); await sayKey(opts[i].text); cards[i].classList.remove('squash'); await wait(250); } });
  }
};

// Shared "hear it, tap the picture" rounds, used by listen and rap.
function pickRounds(root, ctx, rounds, pool, nChoices, introKey) {
  const bar = dots(rounds.length), area = h('div', { class: 'col center listen' });
  root.append(bar, area);
  let r = 0;
  const next = () => {
    if (ctx.ended) return;
    if (r >= rounds.length) return ctx.complete(rounds[Math.floor(Math.random() * rounds.length)].kw);
    const rd = rounds[r], kw = rd.kw, opts = shuffle([kw, ...shuffle(pool.filter(k => k !== kw)).slice(0, nChoices - 1)]);
    let misses = 0, locked = false, played = rd.play;
    const ear = btn('speaker', () => rd.play(), 'huge pulse');
    const cards = opts.map(o => h('button', { class: 'card big pop-in' + (opts.length > 3 ? ' four' : '') }, h('img', { src: o.img, alt: '' }), h('span', { class: 'hide' }, o.word)));
    const win = async card => {
      locked = true; card.classList.add('yes'); card.querySelector('span').classList.remove('hide');
      const c = centre(card); burst(c.x, c.y, 10); Snd.sfx('ding'); fillDot(bar, r);
      await wait(350); await sayWord(kw); await wait(300); r++; next();
    };
    cards.forEach((card, i) => card.addEventListener('click', async () => {
      if (locked) return; Snd.unlock();
      if (opts[i] === kw) return win(card);
      misses++; locked = true; Snd.sfx('tap'); card.classList.add('wobble'); setTimeout(() => card.classList.remove('wobble'), 400);
      const right = cards[opts.indexOf(kw)];
      sayKey('help.look'); await handDemo(centre(ear), centre(right)); right.classList.add('hint');
      await sayWord(kw);
      if (misses >= 2) return win(right);
      right.classList.remove('hint'); locked = false;
    }));
    if (rd.show) rd.show();
    area.replaceChildren(ear, h('div', { class: 'row cards' }, cards));
    setTimeout(() => { if (!ctx.ended) played(); }, 350);
  };
  sayKey(introKey).then(next);
}

// Plays a chapter song. Uses the full song file when it exists; otherwise loops the beat and speaks the lines in time.
function playSong(song, cb) {
  const beat = 60000 / song.bpm, timers = []; let src = null, stopped = false;
  Snd.bgm(false);
  Snd.buf(song.audio).then(async buf => {
    if (stopped) return;
    src = buf ? Snd.start(buf, G.game.volumes.song) : await Snd.play(song.beat, G.game.volumes.song, true);
    if (stopped) { if (src) src.stop(); return; }
    song.lines.forEach((ln, i) => timers.push(setTimeout(() => {
      cb.onLine && cb.onLine(i, ln);
      if (!buf) { const t = T(ln.text); Snd.say(t.text, t.lang, t.audio); }
    }, buf && song.lineTimes ? song.lineTimes[i] * 1000 : i * song.beatsPerLine * beat)));
    if (buf) (song.extraLines || []).forEach(x => timers.push(setTimeout(() => cb.onExtra && cb.onExtra(x), x.time * 1000)));
    timers.push(setTimeout(() => cb.onEnd && cb.onEnd(), buf ? buf.duration * 1000 + 400 : song.lines.length * song.beatsPerLine * beat + 900));
  });
  return { stop() { stopped = true; timers.forEach(clearTimeout); if (src) try { src.stop(); } catch (e) {} Snd.stopVoice(); } };
}

// Sing-along scene "orbits": the centre picture sits in the middle; each body pops onto its own
// orbit when its lyric line is sung and keeps circling. During the hook everything spins faster.
function orbitScene(ch, song, lyricEl) {
  const sc = song.scene, cx = 512, cy = 430, bodies = sc.bodies.map(id => kwOf(ch, id)).filter(Boolean), n = bodies.length;
  let rings = '', boost = 3, alive = true, last = performance.now();
  const sun = h('img', { class: 'osun bob', src: kwOf(ch, sc.centre).img, alt: '' });
  const orbs = bodies.map((kw, i) => {
    const rx = 105 + i * (355 / Math.max(1, n - 1)), ry = rx * 0.62;
    rings += `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}"/>`;
    const el = h('div', { class: 'oplanet' }, h('img', { src: kw.img, alt: '' }), h('span', {}, kw.word));
    return { kw, el, rx, ry, a: -1.2 + i * 0.75, w: 0.5 / Math.pow(i + 1, 0.55), on: false };
  });
  const extra = h('img', { class: 'oextra', alt: '' });
  const root = h('div', { class: 'full orbits' }, h('div', { html: `<svg class="rings" viewBox="0 0 1024 768">${rings}</svg>` }), sun, orbs.map(o => o.el), extra);
  function tick(now) {
    if (!alive) return;
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    for (const o of orbs) { o.a += o.w * dt * boost; o.el.style.left = (cx + o.rx * Math.cos(o.a)) + 'px'; o.el.style.top = (cy + o.ry * Math.sin(o.a)) + 'px'; }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
  return {
    root, stop() { alive = false; },
    line(ln) {
      boost = 1; extra.classList.remove('show');
      const o = orbs.find(x => x.kw.id === ln.word);
      if (ln.word === sc.centre) { sun.classList.remove('squash'); void sun.offsetWidth; sun.classList.add('squash'); burst(cx, cy, 10); }
      else if (o) { o.on = true; o.el.classList.add('show', 'named'); const c = centre(o.el); burst(c.x, c.y, 8); setTimeout(() => o.el.classList.remove('named'), 2300); }
      else { const kw = kwOf(ch, ln.word); if (kw) { extra.src = kw.img; extra.classList.add('show'); } }
    },
    hook() { boost = 4; extra.classList.remove('show'); }
  };
}
