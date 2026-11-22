# Bilanzen-Simulator

Vereinfachte Neufassung von [mo12221/Bilanzen-simulator](https://github.com/mo12221/Bilanzen-simulator)
in reinem HTML, CSS und JavaScript – ohne Server, ohne Build-Schritt. `index.html` im Browser öffnen.

**▶ [Jetzt online spielen: flonix8.github.io/BilanzenSimulator-NG](https://flonix8.github.io/BilanzenSimulator-NG/)**

Drei Spiele (wie im Original):

1. **Geldtransfer** – Kreditschöpfung, BoE-Refinanzierung gegen Staatsanleihen, Überweisungen, Bargeld
2. **Staatsfinanzierung** – Anleihen, Löhne, Steuern, Bargeld, QE
3. **Geld- & Warenkreislauf** – Kredite, Löhne, Produktion, Märkte, Dividenden, Clearing, Runden und BIP

## Bedienung

- Links eine Aktion auslösen. Sie wird als **Transaktion** gebucht, die aus nachvollziehbaren **Schritten** besteht.
- Die Abspielleiste (oder `←` `→`, `Umschalt + ←/→`, `Pos1`, `Ende`, `Leertaste`) springt durch die Zeit.
- Gelb = beteiligte Konten, Grün/Rot = Änderung im aktuellen Schritt. Linien verbinden zusammengehörige
  Buchungen in verschiedenen Bilanzen (z.B. Guthaben des Kunden ↔ Einlage bei der Bank).
  Im Plan-Schritt zeigen Pfeile den Geld- und Güterstrom der Transaktion.
- Maus über einem Konto zeigt alle bisherigen Gegenstücke in anderen Bilanzen.
- Wer in die Vergangenheit springt und eine neue Aktion auslöst, verwirft (nach Rückfrage) die späteren Transaktionen.
- Der Spielstand wird pro Spiel im `localStorage` des Browsers gespeichert.

## Deployment (GitHub Pages)

- Jeder Push auf `main` wird automatisch veröffentlicht unter [flonix8.github.io/BilanzenSimulator-NG](https://flonix8.github.io/BilanzenSimulator-NG/)
  ([.github/workflows/pages.yml](.github/workflows/pages.yml)).
- Jeder Pull Request bekommt eine eigene Vorschau unter `https://flonix8.github.io/BilanzenSimulator-NG/pr-preview/pr-<N>/`;
  der Link wird als Kommentar im PR gepostet, beim Schließen wird die Vorschau wieder entfernt
  ([.github/workflows/pr-preview.yml](.github/workflows/pr-preview.yml)). Für PRs aus Forks gibt es keine Vorschau.
- Der „Build“ ([.github/scripts/build.sh](.github/scripts/build.sh)) prüft nur die Syntax der JS-Dateien und
  kopiert `index.html`, `css/` und `js/` nach `_site/`.
- Einmalig einrichten: Nach dem ersten Lauf auf `main` unter *Settings → Pages* als Quelle
  „Deploy from a branch“ mit `gh-pages` / `(root)` wählen. Falls die Workflows nicht pushen dürfen:
  *Settings → Actions → General → Workflow permissions* auf „Read and write“ stellen.

## Aufbau

| Datei | Inhalt |
|---|---|
| `js/engine.js` | Buchungen, Transaktionen, Wiedergabe der Historie, Speicherung |
| `js/scenario-*.js` | Je Spiel: Startbilanzen, Aktionen (als Schrittlisten), Steuerelemente |
| `js/widgets.js` | Geldmengen-Balken und BIP-Verlauf |
| `js/app.js` | Oberfläche, Verbindungslinien, Zeitachse |

Jede Aktion ist eine Funktion `build(zustand, parameter)`, die entweder mit `fail(...)` abbricht oder
eine Liste von Schritten liefert. Gespeichert wird nur die Liste der ausgelösten Aktionen; jeder Zeitpunkt
wird durch erneutes Abspielen berechnet.
