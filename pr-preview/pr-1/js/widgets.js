'use strict';
// Kleine Diagramme neben den Bilanzen
const Widgets = (() => {
  const { fmt } = Engine;

  // Geldmengen als horizontale Balken (eine Farbe, Beschriftung trägt die Identität)
  function money(items, currency) {
    const max = Math.max(1, ...items.map((i) => Math.abs(i.value)));
    const rows = items.map((i) => `
      <div class="bar-row" title="${i.hint}">
        <div class="bar-label"><span>${i.label}</span><b>${fmt(i.value)} ${currency}</b></div>
        <div class="bar-track"><div class="bar" style="width:${(Math.max(0, i.value) / max) * 100}%"></div></div>
        <div class="bar-hint">${i.hint}</div>
      </div>`).join('');
    return `<div class="widget-card"><h3>Geldmengen</h3>${rows}</div>`;
  }

  // BIP je abgeschlossener Runde als Linie
  function bip(vars, currency) {
    const W = 300, H = 150, pl = 46, pr = 12, pt = 12, pb = 24;
    const xs = vars.rounds, ys = vars.bip;
    const maxX = Math.max(1, xs[xs.length - 1]);
    const maxY = Math.max(100, ...ys) * 1.1;
    const x = (v) => pl + (v / maxX) * (W - pl - pr);
    const y = (v) => H - pb - (v / maxY) * (H - pt - pb);
    const grid = [0, 0.5, 1].map((f) => {
      const v = maxY * f;
      return `<line class="grid" x1="${pl}" x2="${W - pr}" y1="${y(v)}" y2="${y(v)}"/>
        <text class="axis" x="${pl - 6}" y="${y(v) + 4}" text-anchor="end">${fmt(Math.round(v))}</text>`;
    }).join('');
    const every = Math.ceil(xs.length / 8);
    const xlabels = xs.map((r, i) => (i % every === 0 || i === xs.length - 1)
      ? `<text class="axis" x="${x(r)}" y="${H - 6}" text-anchor="middle">${r}</text>` : '').join('');
    const line = xs.map((r, i) => `${i ? 'L' : 'M'}${x(r)},${y(ys[i])}`).join(' ');
    const dots = xs.map((r, i) => `<circle class="dot-hit" cx="${x(r)}" cy="${y(ys[i])}" r="10"><title>Runde ${r}: ${fmt(ys[i])} ${currency}</title></circle>
      <circle class="dot" cx="${x(r)}" cy="${y(ys[i])}" r="4"/>`).join('');
    const last = ys[ys.length - 1];
    return `<div class="widget-card">
      <h3>BIP je Runde</h3>
      <div class="hero">${fmt(last)} ${currency}<small>zuletzt</small></div>
      <svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="BIP je Runde">${grid}${xlabels}
        <path class="series" d="${line}"/>${dots}</svg>
      <p class="bar-hint">Laufende Runde ${vars.round}: I = ${fmt(vars.I)} ${currency}, C = ${fmt(vars.C)} ${currency}</p>
    </div>`;
  }

  return { money, bip };
})();
