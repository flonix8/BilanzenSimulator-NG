'use strict';
// Spiel 2: Staatsfinanzierung und Steuern – Staat, Bank of England, London Bank, Milton
const ScenarioStaat = (() => {
  const { A, P, link, step, fail, r2, fmt } = Engine;

  const STAAT = 'Staat';
  const BOE = 'Bank of England';
  const LB = 'London Bank';
  const MILTON = 'Milton';

  const cur = (x) => `${fmt(x)} £`;
  const positive = (b) => { if (!(b > 0)) fail('Bitte einen positiven Betrag eingeben.'); };

  function initial() {
    return {
      balances: {
        [STAAT]: {
          A: { 'Guthaben bei BoE': 0, 'Anleihen Eigenbestand': 0 },
          P: { 'Staatsanleihen (Gesamt)': 0, 'Eigenkapital Staat': 0 },
        },
        [BOE]: {
          A: { 'Forderung London Bank': 0, 'Bestand Staatsanleihen': 0 },
          P: { 'Bargeldumlauf': 0, 'Reserve London Bank': 0, 'Guthaben Staat': 0 },
        },
        [LB]: {
          A: { 'Reserve bei BoE': 0, 'Staatsanleihen': 0 },
          P: { 'Refinanzierungskredit bei BoE': 0, 'Einlage Milton': 0, 'Eigenkapital Bank': 0 },
        },
        [MILTON]: {
          A: { 'Bankguthaben': 0, 'Bargeld': 0 },
          P: { 'Eigenkapital Milton': 0 },
        },
      },
      values: {},
      vars: {},
    };
  }

  // Reservenbewegung zwischen London Bank und BoE (d > 0: Zufluss bei der Bank)
  const reserve = (d) => link(A(LB, 'Reserve bei BoE', d), P(BOE, 'Reserve London Bank', d));
  const staatskonto = (d) => link(A(STAAT, 'Guthaben bei BoE', d), P(BOE, 'Guthaben Staat', d));
  const miltonkonto = (d) => link(A(MILTON, 'Bankguthaben', d), P(LB, 'Einlage Milton', d));
  const bargeld = (d) => link(A(MILTON, 'Bargeld', d), P(BOE, 'Bargeldumlauf', d));

  const actions = {
    zbKredit: {
      build(s, { betrag }) {
        positive(betrag);
        return {
          title: 'ZB-Kredit an London Bank',
          amount: betrag,
          summary: 'Die London Bank verschuldet sich bei der Zentralbank, um Reserven zu erhalten. Es entsteht neues Zentralbankgeld.',
          flows: [{ from: BOE, to: LB, label: `Reserven ${cur(betrag)}` }],
          steps: [
            step('Kreditvertrag: Die BoE hat eine Forderung, die Bank einen Refinanzierungskredit.',
              link(A(BOE, 'Forderung London Bank', betrag), P(LB, 'Refinanzierungskredit bei BoE', betrag))),
            step('Die BoE schreibt der London Bank Reserven gut.', reserve(betrag)),
          ],
        };
      },
    },

    anleiheErzeugen: {
      build(s, { betrag }) {
        positive(betrag);
        return {
          title: 'Staat erzeugt Anleihen',
          amount: betrag,
          summary: 'Der Staat druckt Anleihen in den Eigenbestand. Noch hat niemand dafür bezahlt – es ist nur ein Versprechen in der eigenen Bilanz.',
          steps: [
            step(`${cur(betrag)} Anleihen im Eigenbestand erzeugt.`,
              [A(STAAT, 'Anleihen Eigenbestand', betrag), P(STAAT, 'Staatsanleihen (Gesamt)', betrag)]),
          ],
        };
      },
    },

    anleiheKaufen: {
      build(s, { betrag }) {
        positive(betrag);
        const bestand = s.balances[STAAT].A['Anleihen Eigenbestand'];
        const reserven = s.balances[LB].A['Reserve bei BoE'];
        if (betrag > bestand) fail(`Der Staat hat nicht genug Anleihen im Eigenbestand (${cur(bestand)} verfügbar).`);
        if (betrag > reserven) fail(`Die Bank hat nicht genug Reserven für den Kauf (${cur(reserven)} verfügbar).`);
        return {
          title: 'London Bank kauft Staatsanleihen',
          amount: betrag,
          summary: 'Die Bank bezahlt die Anleihen mit Reserven. Bei der BoE wandert das Guthaben vom Bankkonto auf das Staatskonto.',
          flows: [
            { from: LB, to: STAAT, label: `Reserven ${cur(betrag)}` },
            { from: STAAT, to: LB, label: 'Anleihen', kind: 'goods' },
          ],
          steps: [
            step('Die Bank zahlt: Ihre Reserven bei der BoE sinken.', reserve(-betrag)),
            step('Die BoE schreibt den Betrag dem Staatskonto gut.', staatskonto(betrag)),
            step('Der Staat übergibt die Anleihen an die Bank.',
              link(A(STAAT, 'Anleihen Eigenbestand', -betrag), A(LB, 'Staatsanleihen', betrag))),
          ],
        };
      },
    },

    lohn: {
      build(s, { betrag }) {
        positive(betrag);
        const guthaben = s.balances[STAAT].A['Guthaben bei BoE'];
        if (betrag > guthaben) fail(`Der Staat ist zahlungsunfähig! Guthaben: ${cur(guthaben)}, benötigt: ${cur(betrag)}. Lohnzahlung abgebrochen.`);
        return {
          title: 'Staat zahlt Lohn an Milton',
          amount: betrag,
          summary: 'Der Staat zahlt von seinem BoE-Konto. Die BoE leitet das Geld als Reserven an Miltons Bank weiter, die es Milton als Giralgeld gutschreibt.',
          flows: [{ from: STAAT, to: MILTON, label: `Lohn ${cur(betrag)}` }],
          steps: [
            step('Der Staat weist die BoE zur Zahlung an: Staatsguthaben sinkt.', staatskonto(-betrag)),
            step('Die BoE schreibt der London Bank Reserven gut.', reserve(betrag)),
            step('Die London Bank schreibt Milton Giralgeld gut.', miltonkonto(betrag)),
            step('Das Eigenkapital wandert vom Staat zu Milton.',
              link(P(STAAT, 'Eigenkapital Staat', -betrag), P(MILTON, 'Eigenkapital Milton', betrag))),
          ],
        };
      },
    },

    steuern: {
      build(s, { betrag }) {
        positive(betrag);
        if (betrag > s.balances[MILTON].A['Bankguthaben']) {
          fail('Du hast nicht genug Guthaben, um deine Steuern zu zahlen. Verdiene Geld oder zahle Bargeld ein!');
        }
        return {
          title: 'Milton zahlt Steuern',
          amount: betrag,
          summary: 'Der umgekehrte Weg des Lohns: Giralgeld wird vernichtet, Reserven fließen zurück auf das Staatskonto bei der BoE.',
          flows: [{ from: MILTON, to: STAAT, label: `Steuern ${cur(betrag)}` }],
          steps: [
            step('Die London Bank bucht die Steuer von Miltons Konto ab.', miltonkonto(-betrag)),
            step('Die Bank gibt dafür Reserven bei der BoE ab.', reserve(-betrag)),
            step('Die BoE schreibt den Betrag dem Staatskonto gut.', staatskonto(betrag)),
            step('Das Eigenkapital wandert von Milton zum Staat.',
              link(P(MILTON, 'Eigenkapital Milton', -betrag), P(STAAT, 'Eigenkapital Staat', betrag))),
          ],
        };
      },
    },

    bargeldAbheben: {
      build(s, { betrag }) {
        positive(betrag);
        if (betrag > s.balances[MILTON].A['Bankguthaben']) fail('Zu wenig Guthaben!');
        if (betrag > s.balances[LB].A['Reserve bei BoE']) {
          fail('BANKRUN! London Bank fehlen Reserven für die Auszahlung. Tipp: Verkaufe erst Anleihen bei der BoE (QE).');
        }
        return {
          title: 'Milton hebt Bargeld ab',
          amount: betrag,
          summary: 'Giralgeld wird zu Bargeld. Die Bank braucht dafür Reserven – Bargeld ist Zentralbankgeld.',
          flows: [{ from: LB, to: MILTON, label: `Bargeld ${cur(betrag)}` }],
          steps: [
            step('Miltons Giralgeld wird ausgebucht.', miltonkonto(-betrag)),
            step('Die London Bank gibt Reserven ab.', reserve(-betrag)),
            step('Milton erhält Bargeld aus dem Umlauf der BoE.', bargeld(betrag)),
          ],
        };
      },
    },

    bargeldEinzahlen: {
      build(s, { betrag }) {
        positive(betrag);
        if (betrag > s.balances[MILTON].A['Bargeld']) fail('Zu wenig Bargeld!');
        return {
          title: 'Milton zahlt Bargeld ein',
          amount: betrag,
          summary: 'Bargeld wird wieder zu Giralgeld; die Bank erhält dafür Reserven.',
          flows: [{ from: MILTON, to: LB, label: `Bargeld ${cur(betrag)}` }],
          steps: [
            step('Die London Bank schreibt Milton Giralgeld gut.', miltonkonto(betrag)),
            step('Die London Bank erhält Reserven bei der BoE.', reserve(betrag)),
            step('Das Bargeld verlässt den Umlauf.', bargeld(-betrag)),
          ],
        };
      },
    },

    qe: {
      build(s, { betrag }) {
        positive(betrag);
        if (s.balances[LB].A['Staatsanleihen'] < betrag) {
          fail('Abbruch: Die London Bank besitzt nicht genügend Staatsanleihen für dieses QE-Volumen!');
        }
        return {
          title: 'QE: BoE kauft Anleihen',
          amount: betrag,
          summary: 'Quantitative Lockerung: Die Zentralbank kauft der Bank Anleihen ab und bezahlt mit neu geschaffenen Reserven. Die London Bank wird liquide.',
          flows: [
            { from: BOE, to: LB, label: `neue Reserven ${cur(betrag)}` },
            { from: LB, to: BOE, label: 'Anleihen', kind: 'goods' },
          ],
          steps: [
            step('Die Anleihen gehen von der London Bank an die BoE.',
              link(A(LB, 'Staatsanleihen', -betrag), A(BOE, 'Bestand Staatsanleihen', betrag))),
            step('Liquiditätsspritze: Die BoE schreibt der Bank neue Reserven gut.', reserve(betrag)),
          ],
        };
      },
    },
  };

  const btn = (button, action) => ({ button, action, params: (v) => ({ betrag: v.betrag }) });

  return {
    id: 'staat',
    title: 'Staatsfinanzierung',
    currency: '£',
    intro: 'Der Staat hat ein Konto bei der Zentralbank, Milton eines bei der London Bank. Damit der Staat Löhne zahlen kann, muss er erst Anleihen verkaufen – und die Bank braucht dafür Reserven.',
    layout: [[STAAT, BOE, LB], ['#money', null, MILTON]],
    icons: { [STAAT]: '🏛️', [BOE]: '🏦', [LB]: '🏦', [MILTON]: '👤' },
    roles: { [BOE]: 'Zentralbank', [LB]: 'Geschäftsbank', [MILTON]: 'Bürger' },
    initial,
    actions,
    widgets: {
      money: (st) => Widgets.money([
        { label: 'M0 · Zentralbankgeld', value: r2(st.balances[BOE].P['Reserve London Bank'] + st.balances[BOE].P['Bargeldumlauf']), hint: 'Reserven der Bank + Bargeld' },
        { label: 'M1 · Giralgeld', value: st.balances[LB].P['Einlage Milton'], hint: 'Einlage von Milton' },
      ], '£'),
    },
    controls: [
      { title: 'Eingabe', items: [
        { input: 'betrag', label: 'Betrag (£)', type: 'number', step: 10, value: 100 },
      ] },
      { title: 'Bank', items: [btn('ZB-Kredit für Bank', 'zbKredit'), btn('Anleihe kaufen', 'anleiheKaufen')] },
      { title: 'Staat', items: [btn('Anleihe erzeugen', 'anleiheErzeugen'), btn('Lohn zahlen', 'lohn')] },
      { title: 'Zentralbank', items: [btn('QE-Ankauf starten', 'qe')] },
      { title: 'Milton', items: [btn('Steuern zahlen', 'steuern'), btn('Bargeld abheben', 'bargeldAbheben'), btn('Bargeld einzahlen', 'bargeldEinzahlen')] },
    ],
  };
})();
