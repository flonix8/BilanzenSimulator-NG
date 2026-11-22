'use strict';
// Spiel 1: Transfer von Geld – Kreditschöpfung, Zahlungsverkehr, Bargeld (London / Edinburgh)
const ScenarioTransfer = (() => {
  const { A, P, link, step, fail, r2, fmt } = Engine;

  const BOE = 'Bank of England (BoE)';
  const LB = 'London Bank (LB)';
  const EB = 'Edinburgh Bank (EB)';
  const BANKS = {
    [LB]: { id: 'LB', name: 'London Bank' },
    [EB]: { id: 'EB', name: 'Edinburgh Bank' },
  };
  const PEOPLE = {
    Karl: { bank: LB, short: 'K.', darlehen: 'Darlehen bei LB' },
    Friedrich: { bank: LB, short: 'F.', darlehen: 'Darlehen Friedrich bei LB' },
    Adam: { bank: EB, short: 'A.', darlehen: 'Darlehen Adam bei EB' },
  };
  const NAMES = Object.keys(PEOPLE);

  const cur = (x) => `${fmt(x)} £`;
  const guthaben = (name) => `Bankguthaben ${name} bei ${BANKS[PEOPLE[name].bank].id}`;
  const positive = (b) => { if (!(b > 0)) fail('Bitte einen positiven Betrag eingeben.'); };

  function initial() {
    return {
      balances: {
        [BOE]: {
          A: { 'Forderung London Bank': 0, 'Forderung Edinburgh Bank': 0 },
          P: { 'Reserve London Bank': 0, 'Reserve Edinburgh Bank': 0, 'Bargeldumlauf': 0 },
        },
        [LB]: {
          A: { 'Reserve bei BoE LB': 0, 'Kredite Karl': 0, 'Kredite Friedrich': 0, 'Staatsanleihen LB': 200, 'Staatsanleihen (verpfändet) LB': 0 },
          P: { 'Refinanzierungskredit bei BoE LB': 0, 'Einlage Karl': 0, 'Einlage Friedrich': 0, 'Eigenkapital LB': 200 },
        },
        [EB]: {
          A: { 'Reserve bei BoE EB': 0, 'Kredite Adam': 0, 'Staatsanleihen EB': 100, 'Staatsanleihen (verpfändet) EB': 0 },
          P: { 'Refinanzierungskredit bei BoE EB': 0, 'Einlage Adam': 0, 'Eigenkapital EB': 100 },
        },
        Karl: {
          A: { 'Bankguthaben Karl bei LB': 0, 'Bargeld K.': 0, 'Sachvermögen K.': 100 },
          P: { 'Darlehen bei LB': 0, 'Eigenkapital K.': 100 },
        },
        Friedrich: {
          A: { 'Bankguthaben Friedrich bei LB': 0, 'Bargeld F.': 0, 'Sachvermögen F.': 100 },
          P: { 'Darlehen Friedrich bei LB': 0, 'Eigenkapital F.': 100 },
        },
        Adam: {
          A: { 'Bankguthaben Adam bei EB': 0, 'Bargeld A.': 0, 'Sachvermögen A.': 100 },
          P: { 'Darlehen Adam bei EB': 0, 'Eigenkapital A.': 100 },
        },
      },
      values: {},
      vars: {},
    };
  }

  const actions = {
    // Positiver Betrag: Kreditaufnahme (Geldschöpfung). Negativer Betrag: Tilgung + Zins.
    kredit: {
      build(s, { person, betrag, zins }) {
        const { bank, short, darlehen } = PEOPLE[person];
        const { id, name } = BANKS[bank];
        const g = guthaben(person);
        const einlage = `Einlage ${person}`;
        const forderung = `Kredite ${person}`;
        if (betrag > 0) {
          return {
            title: `Kredit für ${person}`,
            amount: betrag,
            summary: `${name} vergibt einen Kredit, indem sie ${person} Giralgeld gutschreibt. Es entsteht neues Geld (M1 steigt) – gedeckt durch eine Kreditforderung. Beide Bilanzen werden länger.`,
            flows: [{ from: bank, to: person, label: `Kredit ${cur(betrag)}` }],
            steps: [
              step(`Geldschöpfung: ${person} erhält ein Bankguthaben. Für ${name} ist es eine Verbindlichkeit (Einlage).`,
                link(A(person, g, betrag), P(bank, einlage, betrag))),
              step(`Kreditvertrag: ${name} hat eine Forderung gegen ${person}, ${person} eine Darlehensschuld.`,
                link(A(bank, forderung, betrag), P(person, darlehen, betrag))),
            ],
          };
        }
        if (betrag < 0) {
          const k = -betrag;
          const z = r2(k * zins);
          const steps = [
            step(`Tilgung: ${cur(k)} Giralgeld werden vernichtet – Guthaben und Einlage verschwinden.`,
              link(A(person, g, -k), P(bank, einlage, -k))),
            step('Die Kreditforderung erlischt im gleichen Umfang wie die Schuld.',
              link(A(bank, forderung, -k), P(person, darlehen, -k))),
          ];
          if (z > 0) {
            steps.push(step(`Zinszahlung: ${person} zahlt ${cur(z)} Zinsen. Sein Eigenkapital sinkt, das der Bank steigt (Zinsgewinn).`, [
              link(A(person, g, -z), P(bank, einlage, -z)),
              link(P(person, `Eigenkapital ${short}`, -z), P(bank, `Eigenkapital ${id}`, z)),
            ]));
          }
          return {
            title: `Tilgung ${person}`,
            amount: r2(k + z),
            summary: `${person} zahlt ${cur(k)} Kredit zurück${z > 0 ? ` und ${cur(z)} Zinsen` : ''}. Bei der Tilgung wird Giralgeld vernichtet – die Bilanzen werden kürzer.`,
            flows: [{ from: person, to: bank, label: `Tilgung ${cur(k + z)}` }],
            steps,
          };
        }
        fail('Betrag darf nicht 0 sein (negativ = Tilgung).');
      },
    },

    // Geschäftsbank holt sich Reserven bei der BoE gegen verpfändete Staatsanleihen
    zbKredit: {
      build(s, { bank, betrag }) {
        positive(betrag);
        const { id, name } = BANKS[bank];
        const anleihen = s.balances[bank].A[`Staatsanleihen ${id}`];
        if (betrag > anleihen) fail(`${name} hat nicht genug Sicherheiten! Anleihen: ${cur(anleihen)} | Benötigt: ${cur(betrag)}`);
        return {
          title: `BoE-Kredit ${name}`,
          amount: betrag,
          summary: `${name} beantragt Liquidität bei der BoE und verpfändet dafür Staatsanleihen (Repo). Es entsteht neues Zentralbankgeld (M0 steigt).`,
          flows: [{ from: BOE, to: bank, label: `Reserven ${cur(betrag)}` }],
          steps: [
            step(`Die BoE gewährt ${name} einen Refinanzierungskredit – die Schulden der Bank steigen.`,
              link(A(BOE, `Forderung ${name}`, betrag), P(bank, `Refinanzierungskredit bei BoE ${id}`, betrag))),
            step(`Die BoE schreibt ${name} Reserven auf ihrem BoE-Konto gut.`,
              link(A(bank, `Reserve bei BoE ${id}`, betrag), P(BOE, `Reserve ${name}`, betrag))),
            step(`Als Sicherheit werden Staatsanleihen verpfändet (Aktivtausch).`, [
              A(bank, `Staatsanleihen ${id}`, -betrag), A(bank, `Staatsanleihen (verpfändet) ${id}`, betrag),
            ]),
          ],
        };
      },
    },

    // Bargeld abheben: Giralgeld und Reserven werden zu Bargeld
    bargeld: {
      build(s, { person, betrag }) {
        positive(betrag);
        const { bank, short } = PEOPLE[person];
        const { id, name } = BANKS[bank];
        const g = guthaben(person);
        if (betrag > s.balances[person].A[g]) fail(`${person} hat nicht genug Guthaben bei der ${id}!`);
        if (betrag > s.balances[bank].A[`Reserve bei BoE ${id}`]) {
          fail(`BANKRUN! ${name} fehlen Reserven für die Auszahlung. Tipp: Verpfände erst Anleihen bei der BoE.`);
        }
        return {
          title: `Bargeld für ${person}`,
          amount: betrag,
          summary: `${person} hebt ${cur(betrag)} ab. Die Bank braucht dafür Reserven: Sie tauscht Zentralbankguthaben gegen Bargeld der BoE.`,
          flows: [{ from: bank, to: person, label: `Bargeld ${cur(betrag)}` }],
          steps: [
            step(`Das Giralgeld von ${person} wird ausgebucht.`,
              link(A(person, g, -betrag), P(bank, `Einlage ${person}`, -betrag))),
            step(`${name} gibt dafür Reserven bei der BoE ab.`,
              link(A(bank, `Reserve bei BoE ${id}`, -betrag), P(BOE, `Reserve ${name}`, -betrag))),
            step(`${person} hält jetzt Bargeld – eine Forderung gegen die BoE.`,
              link(A(person, `Bargeld ${short}`, betrag), P(BOE, 'Bargeldumlauf', betrag))),
          ],
        };
      },
    },

    // Überweisung zwischen zwei Personen; zwischen zwei Banken laufen Reserven über die BoE
    transfer: {
      build(s, { from, to, betrag }) {
        positive(betrag);
        if (from === to) fail('Sender und Empfänger müssen verschieden sein.');
        const bankS = PEOPLE[from].bank;
        const bankE = PEOPLE[to].bank;
        const bs = BANKS[bankS];
        const be = BANKS[bankE];
        const internal = bankS === bankE;
        if (betrag > s.balances[from].A[guthaben(from)]) fail(`${from} hat nicht genug Guthaben!`);
        if (!internal && betrag > s.balances[bankS].A[`Reserve bei BoE ${bs.id}`]) {
          fail(`${bs.name} hat nicht genug Reserven für den Transfer zu einer anderen Bank!`);
        }
        const steps = [
          step(`${bs.name} belastet das Konto von ${from}.`,
            link(A(from, guthaben(from), -betrag), P(bankS, `Einlage ${from}`, -betrag))),
        ];
        if (!internal) {
          steps.push(step(`Die BoE schichtet Reserven von ${bs.name} zu ${be.name} um.`, [
            link(A(bankS, `Reserve bei BoE ${bs.id}`, -betrag), P(BOE, `Reserve ${bs.name}`, -betrag)),
            link(A(bankE, `Reserve bei BoE ${be.id}`, betrag), P(BOE, `Reserve ${be.name}`, betrag)),
          ]));
        }
        steps.push(
          step(`${be.name} schreibt ${to} den Betrag gut.`,
            link(A(to, guthaben(to), betrag), P(bankE, `Einlage ${to}`, betrag))),
          step(`Im Gegenzug liefert ${to} Sachwerte an ${from}.`,
            link(A(to, `Sachvermögen ${PEOPLE[to].short}`, -betrag), A(from, `Sachvermögen ${PEOPLE[from].short}`, betrag))),
        );
        return {
          title: `Zahlung ${from} → ${to}`,
          amount: betrag,
          summary: internal
            ? `Beide sind Kunden der ${bs.name}: Die Bank bucht nur intern um, BoE-Reserven sind nicht nötig.`
            : `${from} und ${to} haben verschiedene Banken. Neben dem Giralgeld müssen Reserven über die BoE von ${bs.name} zu ${be.name} wandern.`,
          flows: [
            { from, to, label: `Geld ${cur(betrag)}` },
            { from: to, to: from, label: 'Sachwerte', kind: 'goods' },
          ],
          steps,
        };
      },
    },
  };

  const pct = (v) => `${Math.round(v * 100)} %`;

  return {
    id: 'transfer',
    title: 'Geldtransfer',
    currency: '£',
    intro: 'Drei Personen, zwei Geschäftsbanken und die Bank of England. Banken schöpfen Giralgeld per Kredit; für Zahlungen an andere Banken und für Bargeld brauchen sie Zentralbankgeld (Reserven), das sie sich gegen Staatsanleihen bei der BoE leihen.',
    layout: [[LB, BOE, EB], ['Karl', 'Friedrich', 'Adam'], [null, '#money', null]],
    icons: { [BOE]: '🏛️', [LB]: '🏦', [EB]: '🏦', Karl: '👤', Friedrich: '👤', Adam: '👤' },
    roles: { [BOE]: 'Zentralbank', [LB]: 'Bank von Karl & Friedrich', [EB]: 'Bank von Adam' },
    initial,
    actions,
    widgets: {
      money: (st) => Widgets.money([
        { label: 'M0 · Zentralbankgeld', value: r2(Object.values(st.balances[BOE].P).reduce((a, b) => a + b, 0)), hint: 'Reserven + Bargeld (Passiva der BoE)' },
        { label: 'M1 · Giralgeld', value: r2(st.balances[LB].P['Einlage Karl'] + st.balances[LB].P['Einlage Friedrich'] + st.balances[EB].P['Einlage Adam']), hint: 'Einlagen der Kunden bei LB und EB' },
      ], '£'),
    },
    controls: [
      { title: 'Eingabe', items: [
        { input: 'betrag', label: 'Betrag (£)', type: 'number', step: 100, value: 100, hint: 'Negativ bei Kredit = Tilgung' },
        { input: 'zins', label: 'Zinssatz', type: 'range', min: 0, max: 0.2, step: 0.01, value: 0, format: pct },
      ] },
      { title: 'Kreditschöpfung', items: NAMES.map((p) => (
        { button: `Kredit ${p}`, action: 'kredit', params: (v) => ({ person: p, betrag: v.betrag, zins: v.zins }) })) },
      { title: 'BoE-Liquidität gegen Staatsanleihen', items: [LB, EB].map((bank) => (
        { button: `BoE-Kredit ${BANKS[bank].name}`, action: 'zbKredit', params: (v) => ({ bank, betrag: v.betrag }) })) },
      { title: 'Zahlungsverkehr', items: [
        { input: 'from', label: 'Sender', type: 'select', options: NAMES, value: 'Karl' },
        { input: 'to', label: 'Empfänger', type: 'select', options: NAMES, value: 'Adam' },
        { button: (v) => `Zahlung ${v.from} → ${v.to}`, action: 'transfer', wide: true,
          params: (v) => ({ from: v.from, to: v.to, betrag: v.betrag }), disabled: (s, v) => v.from === v.to },
      ] },
      { title: 'Bargeld abheben', items: NAMES.map((p) => (
        { button: `Bargeld ${p}`, action: 'bargeld', params: (v) => ({ person: p, betrag: v.betrag }) })) },
    ],
  };
})();
