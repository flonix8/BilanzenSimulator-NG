'use strict';
// Oberfläche: Steuerung, Bilanzen, Verbindungslinien, Zeitachse, Speicherung
(() => {
  const SCENARIOS = [ScenarioTransfer, ScenarioStaat, ScenarioKreislauf];
  const PREFIX = 'bilanzen-sim:v1:';
  const SIDE = { A: 'Aktiva', P: 'Passiva', R: 'Realwert' };
  const { fmt, fmtDelta, replay, SimError } = Engine;

  const $ = (sel) => document.querySelector(sel);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const keyOf = (m) => `${m.e}|${m.s}|${m.k}`;

  const settings = { scenario: SCENARIOS[0].id, animate: true, speed: 1.2, ...Store.load(PREFIX + 'settings', {}) };

  let scn;        // aktives Szenario
  let data;       // gespeicherter Spielstand: { history, cursor, inputs }
  let sim;        // Ergebnis von replay(): txs, positions, final
  let ctx;        // was gerade angezeigt wird
  let linkIndex = new Map();
  let hoverKey = null;
  let timer = null;
  let messageTimer = null;

  const board = $('#board');
  const wrap = $('#boardWrap');
  const svg = $('#links');

  // ---------- Spielstand ----------

  function controlItems() {
    return scn.controls.flatMap((g) => g.items);
  }

  function loadScenario(id) {
    stop();
    scn = SCENARIOS.find((s) => s.id === id) || SCENARIOS[0];
    settings.scenario = scn.id;
    Store.save(PREFIX + 'settings', settings);
    const defaults = Object.fromEntries(controlItems().filter((i) => i.input).map((i) => [i.input, i.value]));
    const saved = Store.load(PREFIX + scn.id, {});
    data = { history: saved.history || [], cursor: saved.cursor, inputs: { ...defaults, ...saved.inputs } };
    try {
      sim = replay(scn, data.history);
    } catch (e) {
      console.warn('Gespeicherter Spielstand ungültig, starte neu.', e);
      data.history = [];
      sim = replay(scn, []);
    }
    data.cursor = clamp(data.cursor ?? lastPos());
    renderTabs();
    renderControls();
    render();
  }

  function save() {
    Store.save(PREFIX + scn.id, data);
  }

  const lastPos = () => sim.positions.length - 1;
  const clamp = (p) => Math.max(0, Math.min(lastPos(), Number.isFinite(p) ? p : lastPos()));

  // Zustand, auf den eine neue Aktion aufsetzt: Ende der gerade gezeigten Transaktion
  function baseState() {
    const pos = sim.positions[data.cursor];
    return pos.tx >= 0 ? sim.positions[sim.txs[pos.tx].end].state : sim.positions[0].state;
  }

  // ---------- Aktionen ----------

  function doAction(item) {
    const pos = sim.positions[data.cursor];
    const kept = data.history.slice(0, pos.tx + 1);
    const history = [...kept, { type: item.action, params: item.params(data.inputs) }];
    let next;
    try {
      next = replay(scn, history);
    } catch (e) {
      if (!(e instanceof SimError)) throw e;
      showMessage(e.message, 'error');
      return;
    }
    const dropped = data.history.length - kept.length;
    if (dropped > 0 && !confirm(`Du siehst gerade einen früheren Zeitpunkt. ${dropped} spätere Transaktion(en) werden verworfen. Fortfahren?`)) return;
    stop();
    data.history = history;
    sim = next;
    const tx = sim.txs[sim.txs.length - 1];
    showMessage(`#${sim.txs.length} ${tx.title} gebucht.`, 'ok');
    if (settings.animate) {
      go(tx.start);
      play();
    } else {
      go(tx.end);
    }
  }

  function undo() {
    if (!data.history.length) return;
    stop();
    data.history.pop();
    sim = replay(scn, data.history);
    go(lastPos());
  }

  function reset() {
    if (!confirm('Alle Transaktionen dieses Spiels löschen?')) return;
    stop();
    data.history = [];
    sim = replay(scn, []);
    go(0);
  }

  function showMessage(text, kind) {
    const el = $('#message');
    el.textContent = text;
    el.className = `message show ${kind}`;
    clearTimeout(messageTimer);
    messageTimer = setTimeout(() => { el.className = 'message'; }, kind === 'error' ? 7000 : 3000);
  }

  // ---------- Zeitachse ----------

  function go(p) {
    data.cursor = clamp(p);
    render();
  }

  function navigate(cmd) {
    const pos = sim.positions[data.cursor];
    const txs = sim.txs;
    switch (cmd) {
      case 'start': stop(); return go(0);
      case 'end': stop(); return go(lastPos());
      case 'prev': stop(); return go(data.cursor - 1);
      case 'next': stop(); return go(data.cursor + 1);
      case 'prevTx': stop(); return go(pos.tx > 0 ? txs[pos.tx - 1].end : 0);
      case 'nextTx': {
        stop();
        if (pos.tx >= 0 && data.cursor < txs[pos.tx].end) return go(txs[pos.tx].end);
        return go(pos.tx + 1 < txs.length ? txs[pos.tx + 1].end : lastPos());
      }
      case 'play': return timer ? stop() : play();
    }
  }

  function play() {
    stop();
    if (data.cursor >= lastPos()) go(0);
    timer = setInterval(() => {
      if (data.cursor >= lastPos()) return stop();
      go(data.cursor + 1);
    }, settings.speed * 1000);
    updatePlayButton();
  }

  function stop() {
    clearInterval(timer);
    timer = null;
    updatePlayButton();
  }

  function updatePlayButton() {
    const b = $('#play');
    b.textContent = timer ? '⏸' : '▶';
    b.setAttribute('aria-label', timer ? 'Pause' : 'Abspielen');
  }

  // ---------- Darstellung ----------

  function render() {
    const pos = sim.positions[data.cursor];
    const tx = pos.tx >= 0 ? sim.txs[pos.tx] : null;
    const stepMoves = tx && pos.step > 0 ? tx.steps[pos.step - 1].moves : [];
    const involved = new Set(tx ? tx.steps.flatMap((st) => st.moves.filter((m) => m.d !== 0).map(keyOf)) : []);
    ctx = { pos, tx, state: pos.state, stepMoves, involved };
    linkIndex = buildLinkIndex(pos);

    $('#mission').innerHTML = scn.header ? scn.header(baseState()) : '';
    renderBoard();
    renderPlayer();
    renderStory();
    renderHistory();
    refreshControls();
    save();
    drawLinks();
  }

  function renderTabs() {
    $('#tabs').innerHTML = SCENARIOS.map((s, i) =>
      `<button type="button" data-scn="${s.id}" class="${s.id === scn.id ? 'active' : ''}" aria-pressed="${s.id === scn.id}">
        <span class="n">${i + 1}</span>${esc(s.title)}</button>`).join('');
  }

  function renderBoard() {
    const deltas = new Map();
    for (const m of ctx.stepMoves) if (m.d !== 0) deltas.set(keyOf(m), (deltas.get(keyOf(m)) || 0) + m.d);
    board.style.setProperty('--cols', scn.layout[0].length);
    board.innerHTML = scn.layout.flat().map((cell) => {
      if (!cell) return '<div class="cell empty"></div>';
      if (cell.startsWith('#')) return `<div class="cell widget">${scn.widgets[cell.slice(1)](ctx.state)}</div>`;
      return sheetHtml(cell, deltas);
    }).join('');
  }

  function sheetHtml(e, deltas) {
    const b = ctx.state.balances[e];
    const vals = ctx.state.values[e];
    const rows = (s, book) => Object.entries(book).map(([k, v]) => rowHtml(e, s, k, v, deltas)).join('');
    const sum = (book) => Engine.r2(Object.values(book).reduce((a, x) => a + x, 0));
    const sa = sum(b.A);
    const sp = sum(b.P);
    const active = [...ctx.involved].some((k) => k.startsWith(`${e}|`));
    const real = vals && Object.keys(vals).length
      ? `<div class="real"><div class="colhead">📦 Realwerte</div><div class="real-rows">${rows('R', vals)}</div></div>` : '';
    return `<section class="cell sheet${active ? ' active' : ''}" data-entity="${esc(e)}">
      <header><span class="ico" aria-hidden="true">${scn.icons[e] || '•'}</span><h3>${esc(e)}</h3>
        ${scn.roles[e] ? `<span class="role">${esc(scn.roles[e])}</span>` : ''}</header>
      <div class="t">
        <div class="col"><div class="colhead">Aktiva</div>${rows('A', b.A)}</div>
        <div class="col"><div class="colhead">Passiva</div>${rows('P', b.P)}</div>
      </div>
      <div class="sums${sa !== sp ? ' off' : ''}" title="${sa !== sp ? 'Mitten in einer Transaktion ist die Bilanz noch nicht ausgeglichen' : 'Aktiva = Passiva'}">
        <span>Σ ${fmt(sa)}</span><span>${sa !== sp ? '≠' : '='}</span><span>Σ ${fmt(sp)}</span></div>
      ${real}
    </section>`;
  }

  function rowHtml(e, s, k, v, deltas) {
    const id = `${e}|${s}|${k}`;
    const d = deltas.get(id);
    const cls = ['row'];
    if (ctx.involved.has(id)) cls.push('inv');
    if (d > 0) cls.push('up');
    if (d < 0) cls.push('down');
    if (v === 0 && !d) cls.push('zero');
    if (linkIndex.has(id)) cls.push('has-link');
    if (id === hoverKey) cls.push('hovered');
    if (hoverKey && linkIndex.get(hoverKey)?.has(id)) cls.push('linked');
    return `<div class="${cls.join(' ')}" data-key="${esc(id)}">
      <span class="k">${esc(k)}</span><span class="v">${fmt(v)}</span>${d ? `<span class="d">${fmtDelta(d)}</span>` : ''}</div>`;
  }

  function renderPlayer() {
    const { pos, tx } = ctx;
    const n = sim.txs.length;
    $('#posLabel').innerHTML = !tx
      ? `<b>Startzustand</b> · ${n} Transaktion${n === 1 ? '' : 'en'} im Verlauf`
      : `<b>Transaktion ${pos.tx + 1}/${n}</b> · ${pos.step === 0 ? 'Plan' : `Schritt ${pos.step}/${tx.steps.length}`}`;
    const scrub = $('#scrub');
    scrub.max = lastPos();
    scrub.value = data.cursor;
    const dot = (p, cls, title) => `<button type="button" class="dot ${cls}${p === data.cursor ? ' current' : ''}${p < data.cursor ? ' past' : ''}" data-pos="${p}" title="${esc(title)}"></button>`;
    $('#strip').innerHTML = dot(0, 'start', 'Startzustand') + sim.txs.map((t, i) =>
      `<span class="seg${i === pos.tx ? ' current' : ''}"><span class="seg-n">${i + 1}</span>${
        dot(t.start, 'plan', `#${i + 1} ${t.title} – Plan`)}${
        t.steps.map((_, j) => dot(t.start + j + 1, '', `#${i + 1} ${t.title} – Schritt ${j + 1}`)).join('')}</span>`).join('');
    scrollWithin($('#strip'), $('#strip .dot.current'));
    document.querySelectorAll('[data-nav]').forEach((b) => {
      const nav = b.dataset.nav;
      if (nav === 'play') b.disabled = lastPos() === 0;
      else b.disabled = ['start', 'prev', 'prevTx'].includes(nav) ? data.cursor === 0 : data.cursor === lastPos();
    });
    updatePlayButton();
  }

  function journal(st) {
    const rows = st.moves.filter((m) => m.d !== 0).map((m) => `<li class="${m.d > 0 ? 'up' : 'down'}" data-key="${esc(keyOf(m))}">
        <span class="j-e">${esc(m.e)}</span><span class="j-s">${SIDE[m.s]}</span>
        <span class="j-k">${esc(m.k)}</span><span class="j-d">${fmtDelta(m.d)}</span></li>`);
    const ops = st.ops.filter((o) => o.text).map((o) => `<li class="op">${esc(o.text)}</li>`);
    return rows.length || ops.length ? `<ul class="journal">${rows.join('')}${ops.join('')}</ul>` : '';
  }

  function renderStory() {
    const { pos, tx } = ctx;
    const story = $('#story');
    if (!tx) {
      story.innerHTML = `<h2>Startzustand</h2><p class="summary">${esc(scn.intro)}</p>
        <p class="hint">Wähle links eine Aktion. Sie wird als Transaktion Schritt für Schritt gebucht – mit ◁ ▷ oder den Pfeiltasten kannst du jederzeit vor- und zurückspulen.</p>`;
      return;
    }
    const state = (j) => (j < pos.step ? 'done' : j === pos.step ? 'current' : 'todo');
    const items = [`<li class="${state(0)}" data-pos="${tx.start}">
        <div class="st-title">Plan</div><p>Gelb markiert sind alle Konten, die sich in dieser Transaktion ändern.</p></li>`]
      .concat(tx.steps.map((st, j) => `<li class="${state(j + 1)}" data-pos="${tx.start + j + 1}">
        <div class="st-title">Schritt ${j + 1}</div><p>${esc(st.text)}</p>${journal(st)}</li>`));
    story.innerHTML = `<div class="tx-head"><span class="num">#${pos.tx + 1}</span><h2>${esc(tx.title)}</h2>
        ${tx.amount != null ? `<span class="amt">${fmt(tx.amount)} ${scn.currency}</span>` : ''}</div>
      <p class="summary">${esc(tx.summary)}</p><ol class="steps">${items.join('')}</ol>`;
    scrollWithin(story, story.querySelector('.steps .current'));
  }

  function renderHistory() {
    const { pos } = ctx;
    const list = $('#history');
    list.innerHTML = `<li class="${pos.tx === -1 ? 'current' : ''}" data-pos="0"><span class="num">0</span><span class="t">Start</span></li>` +
      sim.txs.map((t, i) => `<li class="${i === pos.tx ? 'current' : ''}${i > pos.tx ? ' future' : ''}" data-pos="${t.end}">
        <span class="num">${i + 1}</span><span class="t">${esc(t.title)}</span>
        ${t.amount != null ? `<span class="amt">${fmt(t.amount)} ${scn.currency}</span>` : ''}</li>`).join('');
    scrollWithin(list, list.querySelector('.current'));
  }

  // Scrollt nur den Container selbst (scrollIntoView würde auch die Seite bewegen)
  function scrollWithin(box, el) {
    if (!box || !el) return;
    const b = box.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    if (r.left < b.left) box.scrollLeft -= b.left - r.left + 8;
    else if (r.right > b.right) box.scrollLeft += r.right - b.right + 8;
    if (r.top < b.top) box.scrollTop -= b.top - r.top + 8;
    else if (r.bottom > b.bottom) box.scrollTop += r.bottom - b.bottom + 8;
  }

  // ---------- Steuerung ----------

  function renderControls() {
    $('#controls').innerHTML = scn.controls.map((g, gi) => `
      <details class="group" ${g.collapsed ? '' : 'open'}>
        <summary>${esc(g.title)}</summary>
        <div class="items">${g.items.map((it, ii) => itemHtml(it, `${gi}-${ii}`)).join('')}</div>
      </details>`).join('');
  }

  function itemHtml(it, id) {
    if (it.button) {
      return `<button type="button" class="action${it.wide ? ' wide' : ''}${it.primary ? ' primary' : ''}" data-item="${id}"></button>`;
    }
    if (it.note) return `<p class="note wide" data-item="${id}"></p>`;
    const val = data.inputs[it.input];
    let field;
    if (it.type === 'select') {
      field = `<select data-input="${it.input}">${it.options.map((o) => `<option${o === val ? ' selected' : ''}>${esc(o)}</option>`).join('')}</select>`;
    } else {
      const range = it.type === 'range' ? ` min="${it.min}" max="${it.max}"` : '';
      field = `<input type="${it.type}" data-input="${it.input}" step="${it.step}"${range} value="${val}">`;
    }
    const out = it.format ? ` <output data-out="${it.input}">${it.format(val)}</output>` : '';
    const wide = it.type === 'select' ? '' : ' wide';
    return `<label class="field${wide}"><span>${esc(it.label)}${out}</span>${field}${it.hint ? `<small>${esc(it.hint)}</small>` : ''}</label>`;
  }

  function itemById(id) {
    const [gi, ii] = id.split('-').map(Number);
    return scn.controls[gi].items[ii];
  }

  // Beschriftungen, Sperren und Hinweise hängen vom Zustand und den Eingaben ab
  function refreshControls() {
    const s = baseState();
    document.querySelectorAll('#controls [data-item]').forEach((el) => {
      const it = itemById(el.dataset.item);
      if (it.button) {
        el.textContent = typeof it.button === 'function' ? it.button(data.inputs) : it.button;
        const off = it.disabled ? it.disabled(s, data.inputs) : false;
        el.disabled = off;
        el.title = off ? 'In dieser Runde bereits erledigt bzw. nicht möglich' : '';
      } else if (it.note) {
        const n = it.note(s, data.inputs);
        el.textContent = n.text;
        el.classList.toggle('warn', n.warn);
      }
    });
  }

  function onInput(e) {
    const el = e.target.closest('[data-input]');
    if (!el) return;
    const it = controlItems().find((i) => i.input === el.dataset.input);
    data.inputs[it.input] = it.type === 'select' ? el.value : Number(el.value) || 0;
    const out = document.querySelector(`[data-out="${it.input}"]`);
    if (out) out.textContent = it.format(data.inputs[it.input]);
    refreshControls();
    save();
  }

  // ---------- Verbindungslinien ----------

  function groups(moves) {
    const g = new Map();
    for (const m of moves) if (m.link && m.d !== 0) (g.get(m.link) || g.set(m.link, []).get(m.link)).push(m);
    return [...g.values()];
  }

  // Paare zusammengehöriger Buchungen in verschiedenen Bilanzen
  function crossPairs(moves) {
    const pairs = [];
    for (const g of groups(moves)) {
      for (let i = 1; i < g.length; i++) if (g[i].e !== g[0].e) pairs.push([g[0], g[i]]);
    }
    return pairs;
  }

  // Welche Konten bisher miteinander gebucht wurden (für den Hover)
  function buildLinkIndex(pos) {
    const idx = new Map();
    const add = (a, b) => (idx.get(a) || idx.set(a, new Set()).get(a)).add(b);
    sim.txs.forEach((t, i) => {
      if (i > pos.tx) return;
      const steps = i === pos.tx ? t.steps.slice(0, pos.step) : t.steps;
      for (const st of steps) for (const [a, b] of crossPairs(st.moves)) { add(keyOf(a), keyOf(b)); add(keyOf(b), keyOf(a)); }
    });
    return idx;
  }

  // Verbindung zwischen zwei Bilanzen a, b (Rechtecke) auf Höhe yA / yB.
  // Liegt nichts dazwischen: geschwungene Kurve. Sonst Umweg durch die Lücken des Rasters,
  // damit die Linie keine fremde Bilanz kreuzt (lane verschiebt parallele Linien).
  function route(a, b, wb, yA, yB, cells, lane = 0) {
    const ca = (a.left + a.right) / 2;
    const cb = (b.left + b.right) / 2;
    const y1 = yA - wb.top;
    const y2 = yB - wb.top;
    const rel = (x) => x - wb.left;
    if (Math.abs(ca - cb) < 30) {
      // übereinander: an der Außenkante entlang (auf schmalen Bildschirmen enger)
      const x1 = rel(a.right), x2 = rel(b.right), bulge = innerWidth < 900 ? 12 : 44;
      const c1 = x1 + bulge, c2 = x2 + bulge;
      return { d: `M${x1},${y1} C${c1},${y1} ${c2},${y2} ${x2},${y2}`, x1, y1, x2, y2, mx: innerWidth < 900 ? null : (x1 + 3 * c1 + 3 * c2 + x2) / 8 + 6, my: (y1 + y2) / 2, anchor: 'start' };
    }
    const right = ca < cb;
    const x1 = rel(right ? a.right : a.left);
    const x2 = rel(right ? b.left : b.right);
    const top = Math.min(yA, yB) - 2, bottom = Math.max(yA, yB) + 2;
    const blocked = cells.some((c) => c !== a && c !== b && c.left < Math.max(x1, x2) + wb.left && c.right > Math.min(x1, x2) + wb.left
      && c.top < bottom && c.bottom > top);
    if (!blocked) {
      const dx = Math.max(30, Math.abs(x2 - x1) / 2) * (right ? 1 : -1);
      const c1 = x1 + dx, c2 = x2 - dx;
      return { d: `M${x1},${y1} C${c1},${y1} ${c2},${y2} ${x2},${y2}`, x1, y1, x2, y2, mx: (x1 + 3 * c1 + 3 * c2 + x2) / 8, my: (y1 + y2) / 2 - 6 };
    }
    // Umweg: seitlich in die Spaltenlücke, waagerecht durch die Zeilenlücke, zurück zum Ziel
    const gapX = (right ? 1 : -1) * (20 + lane);
    const xa = x1 + gapX, xb = x2 - gapX;
    let yc;
    if (Math.abs(a.top - b.top) < 5) {
      const rowBottom = Math.max(...cells.filter((c) => Math.abs(c.top - a.top) < 5).map((c) => c.bottom));
      yc = rowBottom - wb.top + 11 + lane;
    } else {
      yc = (a.top < b.top ? b.top : a.top) - wb.top - 11 + lane;
    }
    const pts = [[x1, y1], [xa, y1], [xa, yc], [xb, yc], [xb, y2], [x2, y2]];
    return { d: roundedPath(pts, 8), x1, y1, x2, y2, mx: (xa + xb) / 2, my: yc - 5 };
  }

  function roundedPath(pts, r) {
    let d = `M${pts[0][0]},${pts[0][1]}`;
    for (let i = 1; i < pts.length - 1; i++) {
      const [px, py] = pts[i - 1], [x, y] = pts[i], [nx, ny] = pts[i + 1];
      const l1 = Math.hypot(x - px, y - py), l2 = Math.hypot(nx - x, ny - y);
      const k = Math.min(r, l1 / 2, l2 / 2);
      if (!k) { d += ` L${x},${y}`; continue; }
      d += ` L${x - ((x - px) / l1) * k},${y - ((y - py) / l1) * k} Q${x},${y} ${x + ((nx - x) / l2) * k},${y + ((ny - y) / l2) * k}`;
    }
    const [lx, ly] = pts[pts.length - 1];
    return `${d} L${lx},${ly}`;
  }

  function drawLinks() {
    const wb = wrap.getBoundingClientRect();
    svg.setAttribute('viewBox', `0 0 ${wb.width} ${wb.height}`);
    const rows = new Map([...board.querySelectorAll('.row')].map((r) => [r.dataset.key, r]));
    const sheets = new Map([...board.querySelectorAll('.sheet')].map((s) => [s.dataset.entity, s]));
    const cells = [...board.querySelectorAll('.cell:not(.empty)')].map((c) => c.getBoundingClientRect());
    const cellOf = (el) => cells[[...board.querySelectorAll('.cell:not(.empty)')].indexOf(el)];
    const mid = (r) => (r.top + r.bottom) / 2;
    const out = [];

    const rowLink = (ka, kb, cls, label) => {
      const ra = rows.get(ka);
      const rb = rows.get(kb);
      if (!ra || !rb) return;
      const c = route(cellOf(ra.closest('.sheet')), cellOf(rb.closest('.sheet')), wb,
        mid(ra.getBoundingClientRect()), mid(rb.getBoundingClientRect()), cells);
      out.push(`<path class="ln ${cls}" d="${c.d}"/><circle class="end ${cls}" cx="${c.x1}" cy="${c.y1}" r="3.5"/><circle class="end ${cls}" cx="${c.x2}" cy="${c.y2}" r="3.5"/>`);
      if (label && c.mx != null) out.push(`<text class="lbl ${cls}" x="${c.mx}" y="${c.my}" text-anchor="${c.anchor || 'middle'}">${esc(label)}</text>`);
    };

    // Plan-Position: Geld- und Güterströme der Transaktion zwischen den Einheiten
    if (ctx.tx && ctx.pos.step === 0) {
      for (const f of ctx.tx.flows || []) {
        const a = sheets.get(f.from);
        const b = sheets.get(f.to);
        if (!a || !b) continue;
        const ra = cellOf(a);
        const rb = cellOf(b);
        const goods = f.kind === 'goods';
        const off = goods ? 18 : -18;
        const c = route(ra, rb, wb, mid(ra) + off, mid(rb) + off, cells, goods ? 6 : -6);
        const cls = goods ? 'goods' : 'flow';
        out.push(`<path class="ln ${cls}" d="${c.d}" marker-end="url(#arrow-${cls})"/>`);
        if (c.mx != null) out.push(`<text class="lbl ${cls}" x="${c.mx}" y="${c.my + (goods ? 16 : 0)}" text-anchor="${c.anchor || 'middle'}">${esc(f.label)}</text>`);
      }
    }

    // Aktueller Schritt: zusammengehörige Buchungen verbinden
    for (const [a, b] of crossPairs(ctx.stepMoves)) {
      rowLink(keyOf(a), keyOf(b), a.d > 0 ? 'up' : 'down', fmtDelta(a.d));
    }

    // Hover: alle bisherigen Gegenstücke des Kontos
    if (hoverKey) for (const other of linkIndex.get(hoverKey) || []) rowLink(hoverKey, other, 'hover');

    svg.innerHTML = `<defs>
      <marker id="arrow-flow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" class="arrow flow"/></marker>
      <marker id="arrow-goods" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" class="arrow goods"/></marker>
    </defs>${out.join('')}`;
  }

  function setHover(key) {
    if (key === hoverKey) return;
    hoverKey = key;
    const linked = key ? linkIndex.get(key) || new Set() : new Set();
    board.querySelectorAll('.row').forEach((r) => {
      r.classList.toggle('hovered', r.dataset.key === key);
      r.classList.toggle('linked', linked.has(r.dataset.key));
    });
    drawLinks();
  }

  // ---------- Ereignisse ----------

  $('#tabs').addEventListener('click', (e) => {
    const b = e.target.closest('[data-scn]');
    if (b) loadScenario(b.dataset.scn);
  });

  $('#controls').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-item]');
    if (b && !b.disabled) doAction(itemById(b.dataset.item));
  });
  $('#controls').addEventListener('input', onInput);
  $('#controls').addEventListener('change', onInput);

  $('#player').addEventListener('click', (e) => {
    const nav = e.target.closest('[data-nav]');
    if (nav) return navigate(nav.dataset.nav);
    const dot = e.target.closest('[data-pos]');
    if (dot) { stop(); go(Number(dot.dataset.pos)); }
  });
  $('#scrub').addEventListener('input', (e) => { stop(); go(Number(e.target.value)); });

  for (const sel of ['#story', '#history']) {
    $(sel).addEventListener('click', (e) => {
      const li = e.target.closest('[data-pos]');
      if (li) { stop(); go(Number(li.dataset.pos)); }
    });
  }

  board.addEventListener('mouseover', (e) => setHover(e.target.closest('.row')?.dataset.key || null));
  board.addEventListener('mouseleave', () => setHover(null));
  // Journal-Einträge heben ihr Konto im Tableau hervor
  $('#story').addEventListener('mouseover', (e) => setHover(e.target.closest('.journal li[data-key]')?.dataset.key || null));
  $('#story').addEventListener('mouseleave', () => setHover(null));

  document.addEventListener('keydown', (e) => {
    if (e.target.closest('input, select, textarea') || e.ctrlKey || e.metaKey || e.altKey) return;
    const map = {
      ArrowLeft: e.shiftKey ? 'prevTx' : 'prev',
      ArrowRight: e.shiftKey ? 'nextTx' : 'next',
      Home: 'start',
      End: 'end',
      ' ': 'play',
    };
    if (!map[e.key]) return;
    if (e.key === ' ' && e.target.closest('button')) return;
    e.preventDefault();
    navigate(map[e.key]);
  });

  $('#animate').checked = settings.animate;
  $('#animate').addEventListener('change', (e) => { settings.animate = e.target.checked; Store.save(PREFIX + 'settings', settings); });
  const speedOut = () => { $('#speedOut').textContent = `${settings.speed.toFixed(1)} s pro Schritt`; };
  $('#speed').value = settings.speed;
  speedOut();
  $('#speed').addEventListener('input', (e) => {
    settings.speed = Number(e.target.value);
    speedOut();
    Store.save(PREFIX + 'settings', settings);
    if (timer) play();
  });
  $('#undo').addEventListener('click', undo);
  $('#reset').addEventListener('click', reset);

  new ResizeObserver(() => requestAnimationFrame(drawLinks)).observe(wrap);

  loadScenario(settings.scenario);
})();
