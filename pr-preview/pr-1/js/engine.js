'use strict';
/*
 * Kern der Simulation: Buchungen, Transaktionen und Zeitachse.
 *
 * Eine Aktion (z.B. "Lohn UK") erzeugt eine Transaktion = Liste von Schritten.
 * Jeder Schritt bucht Posten auf Konten:
 *   { e: Einheit, s: 'A' | 'P' | 'R', k: Konto, d: Betrag }
 *   A = Aktiva, P = Passiva, R = Realwert (physischer Bestand, keine Bilanzposition)
 * Posten, die zusammengehören (z.B. Guthaben des Kunden <-> Einlage bei der Bank),
 * bekommen mit link() dieselbe ID und werden im Tableau als Verbindung gezeichnet.
 *
 * Die Historie speichert nur, welche Aktion mit welchen Parametern ausgelöst wurde.
 * Jeder Zustand entsteht durch erneutes Abspielen ab dem Startzustand – dadurch
 * ist Vor- und Zurückspulen trivial und der Spielstand passt in den localStorage.
 */
const Engine = (() => {
  let nextLink = 1;

  const clone = (o) => JSON.parse(JSON.stringify(o));
  const r2 = (x) => Math.round(x * 100) / 100;

  const numFmt = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 2 });
  const fmt = (x) => numFmt.format(x).replace('-', '−');
  const fmtDelta = (x) => (x > 0 ? '+' : '−') + numFmt.format(Math.abs(x));

  const post = (s) => (e, k, d) => ({ e, s, k, d });
  const A = post('A');
  const P = post('P');
  const R = post('R');

  // Markiert Posten als zusammengehörig
  function link(...moves) {
    const id = nextLink++;
    for (const m of moves) m.link = id;
    return moves;
  }

  // ops: zusätzliche Zustandsänderungen außerhalb der Bilanzen, z.B. BIP-Zähler
  function step(text, moves = [], ops = []) {
    return { text, moves: moves.flat(), ops };
  }

  class SimError extends Error {}
  const fail = (msg) => { throw new SimError(msg); };

  function applyStep(state, st) {
    for (const m of st.moves) {
      const book = m.s === 'R' ? state.values[m.e] : state.balances[m.e]?.[m.s];
      if (!book || !(m.k in book)) fail(`Konto "${m.k}" bei ${m.e} nicht gefunden.`);
      book[m.k] = r2(book[m.k] + m.d);
    }
    for (const op of st.ops) op.run(state);
  }

  // Spielt die Historie ab und liefert jede Position der Zeitachse mit ihrem Zustand.
  // Position 0 = Startzustand; je Transaktion folgt eine Plan-Position (Schritt 0)
  // und eine Position pro Schritt.
  function replay(scn, history) {
    const state = scn.initial();
    const positions = [{ tx: -1, step: 0, state: clone(state) }];
    const txs = [];
    for (const h of history) {
      const action = scn.actions[h.type];
      if (!action) fail(`Unbekannte Aktion "${h.type}".`);
      const tx = action.build(clone(state), h.params);
      tx.start = positions.length;
      positions.push({ tx: txs.length, step: 0, state: clone(state) });
      tx.steps.forEach((st, j) => {
        applyStep(state, st);
        positions.push({ tx: txs.length, step: j + 1, state: clone(state) });
      });
      tx.end = positions.length - 1;
      txs.push(tx);
    }
    return { txs, positions, final: state };
  }

  return { clone, r2, fmt, fmtDelta, A, P, R, link, step, fail, SimError, replay };
})();

// localStorage kann fehlen oder gesperrt sein – dann läuft alles ohne Speicherung
const Store = {
  load(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  },
  save(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* ignorieren */ }
  },
};
