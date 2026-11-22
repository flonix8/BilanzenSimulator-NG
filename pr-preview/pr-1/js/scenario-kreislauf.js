'use strict';
// Spiel 3: Geld- und Warenkreislauf – Zentralbank, drei Geschäftsbanken, zwei Unternehmen, zwei Haushalte
const ScenarioKreislauf = (() => {
  const { A, P, R, link, step, fail, r2, fmt } = Engine;

  const ZB = 'Zentralbank';
  const UK = 'UK';
  const UI = 'UI';
  const BES = 'Beschäftigte';
  const EIG = 'Eigentümer';

  // Hausbank je Kunde und Kürzel für "nur einmal pro Runde"
  const HAUSBANK = { [UK]: 'A', [UI]: 'B', [BES]: 'C' };
  const KEY = { [UK]: 'uk', [UI]: 'ui', [BES]: 'a', 'Bank A': 'ba', 'Bank B': 'bb', 'Bank C': 'bc' };
  // Einlage, von der der Eigentümer an Bank X zahlt
  const EIG_EINLAGE = { A: 'Einlage Unternehmer UK', B: 'Einlage Unternehmer UI', C: 'Einlage Bankbesitzer' };

  const MISSIONS = {
    1: { title: 'Runde 1: Ohne Zins', task: 'UI: Stelle Beschäftigte für 1000 € ein. UK: Stelle Beschäftigte für 500 € ein und kaufe Maschinen für 2000 €!' },
    2: { title: 'Runde 2: Mit Zins', task: 'Gleiches Spiel, doch stelle nun den Zins auf 5 %!' },
    3: { title: 'Runde 3: Konsolidierung', task: 'Zahle einen Teil des Kredits von UK zurück (−5.000 €).' },
  };
  const mission = (round) => MISSIONS[round] || { title: 'Freies Spiel', task: 'Handle nach eigenem Ermessen.' };

  const cur = (x) => `${fmt(x)} €`;
  const positive = (b) => { if (!(b > 0)) fail('Bitte einen positiven Betrag eingeben.'); };
  const done = (key) => ({ run: (s) => s.vars.done.push(key) });
  const addVar = (name, d, text) => ({ text, run: (s) => { s.vars[name] = r2(s.vars[name] + d); } });
  // Konsum ohne die Vorleistungen der Produktion (Formel aus dem Original)
  const konsumBereinigt = (b, r, vk) => b * (1 - (1 / (1 + r)) * (1 - vk));

  function initial() {
    return {
      balances: {
        [ZB]: {
          A: { 'Forderung Bank A': 0, 'Forderung Bank B': 0, 'Forderung Bank C': 0 },
          P: { 'Reserve Bank A': 0, 'Reserve Bank B': 0, 'Reserve Bank C': 0, 'Eigenkapital': 0 },
        },
        'Bank A': {
          A: { 'Reserve bei ZB A': 0, 'Kredite UK': 0 },
          P: { 'Kredit bei ZB A': 0, 'Einlage UK': 0, 'Einlage Unternehmer UK': 0, 'Eigenkapital A': 0 },
        },
        'Bank B': {
          A: { 'Reserve bei ZB B': 0, 'Kredite UI': 0 },
          P: { 'Kredit bei ZB B': 0, 'Einlage UI': 0, 'Einlage Unternehmer UI': 0, 'Eigenkapital B': 0 },
        },
        'Bank C': {
          A: { 'Reserve bei ZB C': 0, 'Kredite Beschäftigte': 0 },
          P: { 'Kredit bei ZB C': 0, 'Einlage Beschäftigte': 0, 'Einlage Bankbesitzer': 0, 'Eigenkapital C': 0 },
        },
        [UK]: {
          A: { 'Bankguthaben bei A': 0, 'Warenbestand UK': 0, 'Sachvermögen UK': 0 },
          P: { 'Kredit bei A': 0, 'Eigenkapital UK': 0 },
        },
        [UI]: {
          A: { 'Bankguthaben bei B': 0, 'Sachvermögen UI': 4000 },
          P: { 'Kredit bei B': 0, 'Eigenkapital UI': 4000 },
        },
        [BES]: {
          A: { 'Bankguthaben bei C': 0, 'Gebrauchsvermögen B': 0 },
          P: { 'Kredit bei C': 0, 'Eigenkapital Beschäftigte': 0 },
        },
        [EIG]: {
          A: { 'Guthaben bei A': 0, 'Guthaben bei B': 0, 'Guthaben bei C': 0, 'Gebrauchsvermögen E': 0 },
          P: { 'Eigenk. Eigentümer UK': 0, 'Eigenk. Eigentümer UI': 0, 'Eigenk. Bankenbesitzer': 0 },
        },
      },
      // Realwerte: physische Bestände neben den Bilanzen
      values: {
        [UK]: { 'Arbeitskraft': 0, 'Warenbestand': 0, 'Sachvermögen': 0 },
        [UI]: { 'Arbeitskraft': 0, 'Sachvermögen': 4000 },
        [BES]: { 'Arbeitskraft': 1500, 'Gebrauchsvermögen B': 0 },
        [EIG]: { 'Gebrauchsvermögen A': 0, 'Gebrauchsvermögen B': 0, 'Gebrauchsvermögen C': 0 },
      },
      vars: { round: 1, I: 0, C: 0, bip: [0], rounds: [0], done: [] },
    };
  }

  // Die Zentralbank leiht Bank X Reserven
  function refinanzierung(X, b) {
    const bank = `Bank ${X}`;
    return step(`Die Zentralbank leiht ${bank} ${cur(b)} Reserven (Refinanzierung).`, [
      link(A(ZB, `Forderung ${bank}`, b), P(bank, `Kredit bei ZB ${X}`, b)),
      link(A(bank, `Reserve bei ZB ${X}`, b), P(ZB, `Reserve ${bank}`, b)),
    ]);
  }

  // Die Zentralbank verschiebt Reserven von Bank X zu Bank Y
  function reservenTransfer(X, Y, b) {
    return step(`Die Zentralbank überträgt ${cur(b)} Reserven von Bank ${X} zu Bank ${Y}.`, [
      link(A(`Bank ${X}`, `Reserve bei ZB ${X}`, -b), P(ZB, `Reserve Bank ${X}`, -b)),
      link(A(`Bank ${Y}`, `Reserve bei ZB ${Y}`, b), P(ZB, `Reserve Bank ${Y}`, b)),
    ]);
  }

  // Überweisung: Refinanzierung → Abbuchung → Reserven-Transfer → Gutschrift
  // (bei gleicher Bank entfallen die Zentralbank-Schritte)
  function zahlung({ von, vonBank, vonKonto, vonEinlage, an, anBank, anKonto, anEinlage }, b) {
    const extern = vonBank !== anBank;
    return [
      extern && refinanzierung(vonBank, b),
      step(`Bank ${vonBank} bucht ${cur(b)} beim Konto von ${von} ab.`,
        link(A(von, vonKonto, -b), P(`Bank ${vonBank}`, vonEinlage, -b))),
      extern && reservenTransfer(vonBank, anBank, b),
      step(`Bank ${anBank} schreibt ${an} ${cur(b)} gut.`,
        link(A(an, anKonto, b), P(`Bank ${anBank}`, anEinlage, b))),
    ].filter(Boolean);
  }

  const kunde = (name) => {
    const X = HAUSBANK[name];
    return { bank: X, konto: `Bankguthaben bei ${X}`, einlage: `Einlage ${name}` };
  };

  const actions = {
    // Positiver Betrag: Kreditaufnahme. Negativer Betrag: Tilgung + Zins.
    kredit: {
      build(s, { firma, betrag, zins }) {
        const X = HAUSBANK[firma];
        const bank = `Bank ${X}`;
        const konto = `Bankguthaben bei ${X}`;
        const schuld = `Kredit bei ${X}`;
        const einlage = `Einlage ${firma}`;
        const forderung = `Kredite ${firma}`;
        if (betrag > 0) {
          return {
            title: `Kredit ${firma}`,
            amount: betrag,
            summary: `${bank} schöpft Giralgeld für ${firma}. Neues Geld entsteht, gedeckt durch eine Kreditforderung.`,
            flows: [{ from: bank, to: firma, label: `Kredit ${cur(betrag)}` }],
            steps: [
              step(`${bank} schöpft Giralgeld: ${firma} erhält ein Guthaben, die Bank schuldet die Einlage.`,
                link(A(firma, konto, betrag), P(bank, einlage, betrag)), [done(`kredit_${KEY[firma]}`)]),
              step(`Kreditvertrag über ${cur(betrag)}: Forderung der Bank, Schuld von ${firma}.`,
                link(A(bank, forderung, betrag), P(firma, schuld, betrag))),
            ],
          };
        }
        if (betrag < 0) {
          const k = -betrag;
          const z = r2(k * zins);
          const g = r2(k + z);
          return {
            title: `Tilgung ${firma}`,
            amount: g,
            summary: `${firma} zahlt ${cur(k)} zurück${z > 0 ? ` plus ${cur(z)} Zinsen` : ''}. Die Tilgung vernichtet Giralgeld, der Zins wird Gewinn (Eigenkapital) von ${bank}.`,
            flows: [{ from: firma, to: bank, label: `Tilgung + Zins ${cur(g)}` }],
            steps: [
              step(`${firma} zahlt ${cur(g)}: Guthaben und Einlage sinken, die Kreditbeziehung schrumpft um ${cur(k)}${z > 0 ? `, ${cur(z)} Zins wandern ins Eigenkapital der Bank` : ''}.`, [
                link(A(firma, konto, -g), P(bank, einlage, -g)),
                link(P(firma, schuld, -k), A(bank, forderung, -k)),
                link(P(firma, `Eigenkapital ${firma}`, -z), P(bank, `Eigenkapital ${X}`, z)),
              ]),
            ],
          };
        }
        fail('Betrag darf nicht 0 sein (negativ = Tilgung).');
      },
    },

    lohn: {
      build(s, { firma, betrag }) {
        positive(betrag);
        const k = kunde(firma);
        if (betrag > s.balances[firma].A[k.konto]) fail(`Nicht genügend Guthaben bei ${firma}!`);
        const steps = zahlung({ von: firma, vonBank: k.bank, vonKonto: k.konto, vonEinlage: k.einlage,
          an: BES, anBank: 'C', anKonto: 'Bankguthaben bei C', anEinlage: 'Einlage Beschäftigte' }, betrag);
        steps[0].ops.push(done(`lohn_${KEY[firma]}`));
        steps.push(step(`Gegenleistung: Die Beschäftigten geben ${cur(betrag)} Arbeitskraft an ${firma}. Eigenkapital wandert mit.`, [
          link(P(firma, `Eigenkapital ${firma}`, -betrag), P(BES, 'Eigenkapital Beschäftigte', betrag)),
          link(R(BES, 'Arbeitskraft', -betrag), R(firma, 'Arbeitskraft', betrag)),
        ]));
        return {
          title: `Lohn ${firma}`,
          amount: betrag,
          summary: `${firma} bezahlt die Beschäftigten. Weil diese bei Bank C sind, braucht Bank ${k.bank} Reserven, die über die Zentralbank zu Bank C wandern.`,
          flows: [
            { from: firma, to: BES, label: `Lohn ${cur(betrag)}` },
            { from: BES, to: firma, label: 'Arbeitskraft', kind: 'goods' },
          ],
          steps,
        };
      },
    },

    produktion: {
      build(s, { typ, K, q, r }) {
        if (!(K > 0)) fail('Gesamtkapital K muss positiv sein.');
        const v = r2(K * q);
        const c = r2(K * (1 - q));
        const vorratV = s.values[typ]['Arbeitskraft'];
        const vorratC = s.values[typ]['Sachvermögen'];
        if (v > vorratV || c > vorratC) {
          fail(`${typ}: Ressourcen fehlen! (v: ${fmt(v)}/${fmt(vorratV)}, c: ${fmt(c)}/${fmt(vorratC)})`);
        }
        const p = r2(K * (1 + r));
        const ziel = typ === UK ? { A: 'Warenbestand UK', R: 'Warenbestand' } : { A: 'Sachvermögen UI', R: 'Sachvermögen' };
        return {
          title: `Produktion ${typ}`,
          amount: p,
          summary: `${typ} setzt v = ${cur(v)} Arbeitskraft und c = ${cur(c)} Sachvermögen ein (Arbeitsquote ${Math.round(q * 100)} %) und erzeugt Waren im Wert K·(1+r) = ${cur(p)}.`,
          steps: [
            step(`Verbrauch: Arbeitskraft (v) und Sachvermögen (c) gehen in die Produktion ein.`, [
              R(typ, 'Arbeitskraft', -v), R(typ, 'Sachvermögen', -c),
              A(typ, `Sachvermögen ${typ}`, -c), P(typ, `Eigenkapital ${typ}`, -c),
            ], [done(`prod_${KEY[typ]}`)]),
            step(`Erzeugnis: ${typ === UK ? 'Lebensmittel' : 'Investitionsgüter'} im Wert von ${cur(p)} entstehen – davon ${cur(r2(p - c))} neuer Wert (v + Profit).`, [
              R(typ, ziel.R, p), A(typ, ziel.A, p), P(typ, `Eigenkapital ${typ}`, p),
            ]),
          ],
        };
      },
    },

    kaufInvest: {
      build(s, { betrag }) {
        positive(betrag);
        if (betrag > s.balances[UK].A['Bankguthaben bei A']) fail('UK hat nicht genug Geld für Investitionen!');
        if (betrag > s.values[UI]['Sachvermögen']) fail('UI hat nicht genug Investitionsgüter auf Lager!');
        return {
          title: 'UK kauft Investitionsgüter',
          amount: betrag,
          summary: 'UK kauft Maschinen bei UI. Das Geld wandert von Bank A über die Zentralbank zu Bank B, die Güter von UI zu UK. Zählt als Investition I im BIP.',
          flows: [
            { from: UK, to: UI, label: `Zahlung ${cur(betrag)}` },
            { from: UI, to: UK, label: 'Maschinen', kind: 'goods' },
          ],
          steps: [
            ...zahlung({ von: UK, vonBank: 'A', vonKonto: 'Bankguthaben bei A', vonEinlage: 'Einlage UK',
              an: UI, anBank: 'B', anKonto: 'Bankguthaben bei B', anEinlage: 'Einlage UI' }, betrag),
            step(`Lieferung: Investitionsgüter für ${cur(betrag)} gehen von UI an UK.`, [
              link(A(UI, 'Sachvermögen UI', -betrag), A(UK, 'Sachvermögen UK', betrag)),
              link(R(UI, 'Sachvermögen', -betrag), R(UK, 'Sachvermögen', betrag)),
            ], [addVar('I', betrag, `BIP-Zähler: Investition I +${fmt(betrag)}`)]),
          ],
        };
      },
    },

    kaufKonsum: {
      build(s, { betrag, r, vk }) {
        positive(betrag);
        if (betrag > s.balances[BES].A['Bankguthaben bei C']) fail('Beschäftigte haben nicht genug Geld!');
        if (betrag > s.values[UK]['Warenbestand']) fail('UK hat nicht genug Lebensmittel auf Lager!');
        const cb = konsumBereinigt(betrag, r, vk);
        return {
          title: 'Beschäftigte kaufen Lebensmittel',
          amount: betrag,
          summary: 'Die Beschäftigten geben ihren Lohn bei UK aus. Geld fließt von Bank C zu Bank A zurück, Lebensmittel zu den Beschäftigten. Zählt als Konsum C im BIP.',
          flows: [
            { from: BES, to: UK, label: `Zahlung ${cur(betrag)}` },
            { from: UK, to: BES, label: 'Lebensmittel', kind: 'goods' },
          ],
          steps: [
            ...zahlung({ von: BES, vonBank: 'C', vonKonto: 'Bankguthaben bei C', vonEinlage: 'Einlage Beschäftigte',
              an: UK, anBank: 'A', anKonto: 'Bankguthaben bei A', anEinlage: 'Einlage UK' }, betrag),
            step(`Lieferung: Lebensmittel für ${cur(betrag)} gehen an die Beschäftigten.`, [
              link(A(UK, 'Warenbestand UK', -betrag), A(BES, 'Gebrauchsvermögen B', betrag)),
              link(R(UK, 'Warenbestand', -betrag), R(BES, 'Gebrauchsvermögen B', betrag)),
            ], [addVar('C', r2(betrag + cb), `BIP-Zähler: Konsum C +${fmt(betrag)} (roh) +${fmt(r2(cb))} (bereinigt)`)]),
          ],
        };
      },
    },

    dividende: {
      build(s, { typ, betrag }) {
        positive(betrag);
        if (typ === UK || typ === UI) {
          const k = kunde(typ);
          const bank = `Bank ${k.bank}`;
          if (s.balances[typ].A[k.konto] < betrag) fail(`${typ} hat nicht genug Guthaben!`);
          return {
            title: `Dividende ${typ}`,
            amount: betrag,
            summary: `${typ} schüttet Gewinn an den Eigentümer aus. Beide sind Kunden von ${bank} – das Geld wird dort nur umgebucht.`,
            flows: [{ from: typ, to: EIG, label: `Dividende ${cur(betrag)}` }],
            steps: [
              step(`${typ} zahlt aus: Guthaben und Eigenkapital von ${typ} sinken.`, [
                link(A(typ, k.konto, -betrag), P(bank, k.einlage, -betrag)),
                P(typ, `Eigenkapital ${typ}`, -betrag),
              ], [done(`div_${KEY[typ]}`)]),
              step(`${bank} schreibt dem Eigentümer ${cur(betrag)} gut; sein Eigenkapital steigt.`, [
                link(A(EIG, `Guthaben bei ${k.bank}`, betrag), P(bank, `Einlage Unternehmer ${typ}`, betrag)),
                P(EIG, `Eigenk. Eigentümer ${typ}`, betrag),
              ]),
            ],
          };
        }
        const X = typ.slice(-1);
        const ek = `Eigenkapital ${X}`;
        if (s.balances[typ].P[ek] < betrag) fail(`${typ} hat zu wenig Eigenkapital!`);
        if (X === 'C') {
          return {
            title: 'Dividende Bank C',
            amount: betrag,
            summary: 'Der Bankbesitzer hat sein Konto bei Bank C selbst: Die Bank wandelt Eigenkapital in eine Einlage um.',
            flows: [{ from: typ, to: EIG, label: `Dividende ${cur(betrag)}` }],
            steps: [
              step('Bank C wandelt Eigenkapital in eine Einlage des Bankbesitzers um.', [
                P('Bank C', ek, -betrag),
                link(P('Bank C', 'Einlage Bankbesitzer', betrag), A(EIG, 'Guthaben bei C', betrag)),
              ], [done('div_bc')]),
              step('Der Eigentümer verbucht den Zufluss als Eigenkapital.', [P(EIG, 'Eigenk. Bankenbesitzer', betrag)]),
            ],
          };
        }
        const first = refinanzierung(X, betrag);
        first.ops.push(done(`div_${KEY[typ]}`));
        return {
          title: `Dividende ${typ}`,
          amount: betrag,
          summary: `Der Bankbesitzer hat sein Konto bei Bank C. ${typ} braucht deshalb Reserven, die über die Zentralbank zu Bank C fließen.`,
          flows: [{ from: typ, to: EIG, label: `Dividende ${cur(betrag)}` }],
          steps: [
            first,
            reservenTransfer(X, 'C', betrag),
            step(`Bank C schreibt dem Bankbesitzer ${cur(betrag)} gut.`,
              link(A(EIG, 'Guthaben bei C', betrag), P('Bank C', 'Einlage Bankbesitzer', betrag))),
            step(`Das Eigenkapital wandert von ${typ} zum Eigentümer.`,
              link(P(typ, ek, -betrag), P(EIG, 'Eigenk. Bankenbesitzer', betrag))),
          ],
        };
      },
    },

    kaufEigentuemer: {
      build(s, { konto: X, betrag, r, vk }) {
        positive(betrag);
        if (betrag > s.balances[EIG].A[`Guthaben bei ${X}`]) fail(`Eigentümer hat zu wenig Guthaben bei Bank ${X}!`);
        if (betrag > s.values[UK]['Warenbestand']) fail('UK hat nicht genug Lebensmittel auf Lager!');
        const cb = r2(konsumBereinigt(betrag, r, vk));
        return {
          title: `Eigentümer kauft (Konto ${X})`,
          amount: betrag,
          summary: X === 'A'
            ? 'Eigentümer und UK sind beide bei Bank A: interne Umbuchung ohne Zentralbank.'
            : `Der Eigentümer zahlt von Bank ${X} an UK bei Bank A – Reserven wandern über die Zentralbank.`,
          flows: [
            { from: EIG, to: UK, label: `Zahlung ${cur(betrag)}` },
            { from: UK, to: EIG, label: 'Lebensmittel', kind: 'goods' },
          ],
          steps: [
            ...zahlung({ von: EIG, vonBank: X, vonKonto: `Guthaben bei ${X}`, vonEinlage: EIG_EINLAGE[X],
              an: UK, anBank: 'A', anKonto: 'Bankguthaben bei A', anEinlage: 'Einlage UK' }, betrag),
            step(`Lieferung: Lebensmittel für ${cur(betrag)} gehen an den Eigentümer.`, [
              link(A(UK, 'Warenbestand UK', -betrag), A(EIG, 'Gebrauchsvermögen E', betrag)),
              link(R(UK, 'Warenbestand', -betrag), R(EIG, `Gebrauchsvermögen ${X}`, betrag)),
            ], [addVar('C', cb, `BIP-Zähler: Konsum C +${fmt(cb)} (bereinigt)`)]),
          ],
        };
      },
    },

    // Verrechnet je Bank Reserven mit Zentralbankkrediten; nur der Saldo bleibt
    clearing: {
      build(s) {
        const steps = ['A', 'B', 'C'].flatMap((X) => {
          const bank = `Bank ${X}`;
          const reserven = s.balances[bank].A[`Reserve bei ZB ${X}`];
          const kredite = s.balances[bank].P[`Kredit bei ZB ${X}`];
          if (!(reserven > 0 && kredite > 0)) return [];
          const c = Math.min(reserven, kredite);
          return [step(`Clearing ${bank}: ${cur(c)} Reserven und ZB-Kredit werden gegeneinander verrechnet.`, [
            link(A(bank, `Reserve bei ZB ${X}`, -c), P(ZB, `Reserve ${bank}`, -c)),
            link(P(bank, `Kredit bei ZB ${X}`, -c), A(ZB, `Forderung ${bank}`, -c)),
          ])];
        });
        if (!steps.length) fail('Nichts zu verrechnen: Keine Bank hat gleichzeitig Reserven und ZB-Kredite.');
        return {
          title: 'ZB-Clearing',
          summary: 'Banken, die gleichzeitig Reserven halten und der Zentralbank Kredite schulden, verrechnen beides. Die Bilanzen werden kürzer.',
          steps,
        };
      },
    },

    // Konsum verbraucht Gebrauchsvermögen; bei Beschäftigten entsteht daraus neue Arbeitskraft
    regeneration: {
      build(s) {
        const steps = [];
        const lebensmittel = s.balances[BES].A['Gebrauchsvermögen B'];
        if (lebensmittel > 0) {
          steps.push(step(`Die Beschäftigten verbrauchen ${cur(lebensmittel)} Lebensmittel und regenerieren damit ihre Arbeitskraft.`, [
            A(BES, 'Gebrauchsvermögen B', -lebensmittel), P(BES, 'Eigenkapital Beschäftigte', -lebensmittel),
            R(BES, 'Gebrauchsvermögen B', -lebensmittel), R(BES, 'Arbeitskraft', lebensmittel),
          ]));
        }
        const konsum = s.balances[EIG].A['Gebrauchsvermögen E'];
        if (konsum > 0) {
          const v = s.values[EIG];
          const ga = v['Gebrauchsvermögen A'];
          const gb = v['Gebrauchsvermögen B'];
          const gc = v['Gebrauchsvermögen C'];
          steps.push(step(`Die Eigentümer verbrauchen ${cur(konsum)} Gebrauchsvermögen – daraus entsteht keine Arbeitskraft.`, [
            A(EIG, 'Gebrauchsvermögen E', -konsum),
            P(EIG, 'Eigenk. Eigentümer UK', -ga), P(EIG, 'Eigenk. Eigentümer UI', -gb), P(EIG, 'Eigenk. Bankenbesitzer', -gc),
            R(EIG, 'Gebrauchsvermögen A', -ga), R(EIG, 'Gebrauchsvermögen B', -gb), R(EIG, 'Gebrauchsvermögen C', -gc),
          ]));
        }
        if (!steps.length) fail('Kein Gebrauchsvermögen zum Verbrauchen vorhanden.');
        return {
          title: 'Regenerieren',
          summary: 'Haushalte verbrauchen ihre gekauften Güter. Nur die Beschäftigten gewinnen dadurch Arbeitskraft zurück, die sie wieder verkaufen können.',
          steps,
        };
      },
    },

    rundeAbschliessen: {
      build(s) {
        const { round, I, C } = s.vars;
        const bip = r2(I + C);
        return {
          title: `Runde ${round} abschließen`,
          amount: bip,
          summary: `BIP der Runde = Investition I (${cur(I)}) + Konsum C (${cur(C)}) = ${cur(bip)}. Danach beginnt Runde ${round + 1}; alle einmaligen Aktionen sind wieder frei.`,
          steps: [
            step(`Das BIP von ${cur(bip)} wird festgehalten, die Zähler beginnen bei null.`, [], [{
              text: `BIP Runde ${round}: ${fmt(bip)}`,
              run: (st) => {
                st.vars.bip.push(r2(st.vars.I + st.vars.C));
                st.vars.rounds.push(st.vars.round);
                st.vars.I = 0;
                st.vars.C = 0;
                st.vars.round += 1;
                st.vars.done = [];
              },
            }]),
          ],
        };
      },
    },
  };

  const pct = (v) => `${Math.round(v * 100)} %`;
  const isDone = (key) => (s) => s.vars.done.includes(key);
  const bedarf = (typ) => (s, v) => {
    const t = typ.toLowerCase();
    const vv = r2(v[`k_${t}`] * v[`q_${t}`]);
    const cc = r2(v[`k_${t}`] * (1 - v[`q_${t}`]));
    const ok = vv <= s.values[typ]['Arbeitskraft'] && cc <= s.values[typ]['Sachvermögen'];
    return { text: `Bedarf: v = ${fmt(vv)}, c = ${fmt(cc)} · vorhanden: ${fmt(s.values[typ]['Arbeitskraft'])} / ${fmt(s.values[typ]['Sachvermögen'])}`, warn: !ok };
  };
  const prodControls = (typ, k) => [
    { input: `k_${typ.toLowerCase()}`, label: 'Gesamtkapital K', type: 'number', step: 100, value: k },
    { input: `q_${typ.toLowerCase()}`, label: 'Arbeitsquote v/K', type: 'range', min: 0, max: 1, step: 0.01, value: 0.2, format: pct },
    { input: `r_${typ.toLowerCase()}`, label: 'Profitrate r', type: 'range', min: 0, max: 1, step: 0.01, value: 0.2, format: pct },
    { note: bedarf(typ) },
    { button: `Produzieren ${typ}`, action: 'produktion', wide: true, disabled: isDone(`prod_${typ.toLowerCase()}`),
      params: (v) => ({ typ, K: v[`k_${typ.toLowerCase()}`], q: v[`q_${typ.toLowerCase()}`], r: v[`r_${typ.toLowerCase()}`] }) },
  ];
  // Konsum-Bereinigung nutzt die Produktionsparameter von UK (wie im Original)
  const konsumParams = (v) => ({ betrag: v.betrag, r: v.r_uk, vk: v.q_uk });

  return {
    id: 'kreislauf',
    title: 'Geld- & Warenkreislauf',
    currency: '€',
    intro: 'Ein ganzer Wirtschaftskreislauf: UK stellt Konsumgüter her, UI Investitionsgüter. Kredite finanzieren Löhne, Löhne werden zu Konsum, Gewinne zu Dividenden. Jede Runde endet mit dem Abschluss und dem BIP.',
    layout: [['Bank A', ZB, 'Bank B'], [UK, 'Bank C', UI], [EIG, '#bip', BES]],
    icons: { [ZB]: '🏛️', 'Bank A': '🏦', 'Bank B': '🏦', 'Bank C': '🏦', [UK]: '🏭', [UI]: '🏗️', [BES]: '👷', [EIG]: '🎩' },
    roles: {
      [ZB]: 'Zentralbank', 'Bank A': 'Bank von UK', 'Bank B': 'Bank von UI', 'Bank C': 'Bank der Beschäftigten',
      [UK]: 'Konsumgüter', [UI]: 'Investitionsgüter', [EIG]: 'Unternehmer & Bankbesitzer', [BES]: 'Arbeiter',
    },
    header: (s) => {
      const m = mission(s.vars.round);
      return `<div class="mission"><span class="badge">Runde ${s.vars.round}</span><b>${m.title}</b><p>${m.task}</p></div>`;
    },
    initial,
    actions,
    widgets: { bip: (st) => Widgets.bip(st.vars, '€') },
    controls: [
      { title: 'Eingabe', items: [
        { input: 'betrag', label: 'Betrag (€)', type: 'number', step: 500, value: 1000, hint: 'Negativ bei Kredit = Tilgung' },
        { input: 'zins', label: 'Zinssatz', type: 'range', min: 0, max: 0.2, step: 0.01, value: 0, format: pct },
      ] },
      { title: 'Kredite', items: [UK, UI, BES].map((firma) => ({
        button: `Kredit ${firma}`, action: 'kredit',
        params: (v) => ({ firma, betrag: v.betrag, zins: v.zins }),
        disabled: (s, v) => v.betrag > 0 && s.vars.done.includes(`kredit_${KEY[firma]}`),
      })) },
      { title: 'Löhne', items: [UK, UI].map((firma) => ({
        button: `Lohn ${firma}`, action: 'lohn', params: (v) => ({ firma, betrag: v.betrag }), disabled: isDone(`lohn_${KEY[firma]}`),
      })) },
      { title: 'Produktion UK (Konsumgüter)', collapsed: true, items: prodControls(UK, 2500) },
      { title: 'Produktion UI (Investitionsgüter)', collapsed: true, items: prodControls(UI, 5000) },
      { title: 'Märkte', items: [
        { button: 'UK kauft Investitionsgüter', action: 'kaufInvest', wide: true, params: (v) => ({ betrag: v.betrag }) },
        { button: 'Beschäftigte kaufen Lebensmittel', action: 'kaufKonsum', wide: true, params: konsumParams },
      ] },
      { title: 'Dividenden', items: [UK, UI, 'Bank A', 'Bank B', 'Bank C'].map((typ) => ({
        button: typ, action: 'dividende', params: (v) => ({ typ, betrag: v.betrag }), disabled: isDone(`div_${KEY[typ]}`),
      })) },
      { title: 'Eigentümer-Konsum (zahlt von Konto …)', items: ['A', 'B', 'C'].map((X) => ({
        button: `Konto ${X}`, action: 'kaufEigentuemer', params: (v) => ({ ...konsumParams(v), konto: X }),
      })) },
      { title: 'Periodenabschluss', items: [
        { button: 'ZB-Clearing', action: 'clearing', params: () => ({}) },
        { button: 'Regenerieren', action: 'regeneration', params: () => ({}) },
        { button: 'Runde abschließen', action: 'rundeAbschliessen', wide: true, primary: true, params: () => ({}) },
      ] },
    ],
  };
})();
