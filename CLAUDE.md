# Hinweise für Arbeiten an diesem Repository

## Code-Dokumentation immer mit aktualisieren

Die Code-Dokumentation liegt in `docs/code-doku/index.html` (Explorer mit Schichten, Modulen, Deklarationen, Methoden, Kennzahlen und Quelltext sowie eine Karte der Abhängigkeiten). Sie wird aus dem Quelltext erzeugt:

```bash
python3 docs/code-doku/generate.py          # Doku neu erzeugen
python3 docs/code-doku/generate.py --check  # prüft, ob die Doku zum Quelltext passt (läuft auch in CI)
```

**Regel: Jede Änderung am Code (`src/`, `test/`, `e2e/`) und jede Versionsänderung in `package.json` muss die Doku im selben Commit bzw. PR aktualisieren.** Dazu nach der Änderung `generate.py` laufen lassen und `docs/code-doku/index.html` mit committen. Der Build-Workflow schlägt fehl, wenn die Doku veraltet ist.

- Neue oder geänderte Funktionen, Klassen und Methoden bekommen einen kurzen Kommentar (`/** … */`) direkt darüber; er erscheint in der Doku als Beschreibung.
- Neuer Ordner unter `src/`: Schicht in `LAYERS` in `generate.py` sowie `LAYERS`, `BANDS` und die Farben `--l-…` in `template.html` ergänzen.
- Aussehen und Verhalten der Seite werden in `docs/code-doku/template.html` geändert, nie in `index.html` (wird überschrieben).
- Fachliche Beschreibung und Architektur stehen weiterhin in `Entwicklungskonzept.md` und werden bei fachlichen Änderungen ebenfalls angepasst.

## Prüfen vor dem Push

```bash
npm run typecheck
npm test
python3 docs/code-doku/generate.py --check
```
