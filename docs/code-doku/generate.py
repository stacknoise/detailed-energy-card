#!/usr/bin/env python3
"""Erzeugt die Code-Dokumentation (docs/code-doku/index.html) aus dem Quelltext unter src/.

Aufruf:
    python3 docs/code-doku/generate.py          # schreibt docs/code-doku/index.html
    python3 docs/code-doku/generate.py --check  # Exit-Code 1, wenn die Doku nicht zum Quelltext passt

Der Scanner ist bewusst einfach und braucht nur die Python-Standardbibliothek: ein kleiner Lexer
blendet Kommentare und Zeichenketten aus (Ausdrücke in `${...}` bleiben Code), dann werden
Deklarationen auf oberster Ebene (Spalte 0) und Klassenmitglieder (Einrückung 2) erkannt.
Abhängigkeiten folgen den Imports. Metriken sind Näherungen, keine Compiler-Analyse.
"""

from __future__ import annotations

import json
import math
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "src"
TEST_DIRS = [ROOT / "test", ROOT / "e2e"]
HERE = Path(__file__).resolve().parent
TEMPLATE = HERE / "template.html"
OUTPUT = HERE / "index.html"

# Schicht = erster Ordner unter src/ (Dateien direkt in src/ gehören zur Schicht "Card").
LAYERS = {"editor": "Editor", "view": "View", "model": "Model", "localize": "Localize", "styles": "Styles"}
START = "detailed-energy-card|DetailedEnergyCard"

DECL_RE = re.compile(
    r"^(export\s+)?(?:default\s+)?(?:declare\s+)?(?:abstract\s+)?(?:async\s+)?"
    r"(function\*?|class|interface|type|enum|const|let|var)\s+([A-Za-z_$][\w$]*)"
)
MODS = r"(?:(?:public|private|protected|static|readonly|async|override|abstract|accessor|get|set)\s+)*"
METHOD_RE = re.compile(r"^  (" + MODS + r")(#?[A-Za-z_$][\w$]*)\s*(?:<[^()]*>)?\s*\(")
ARROW_RE = re.compile(
    r"^  (" + MODS + r")(#?[A-Za-z_$][\w$]*)\s*(?::[^=]*)?=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*(?::[^=]*)?=>"
)
NOT_METHODS = {"if", "for", "while", "switch", "return", "catch", "constructor_"}
IDENT_RE = re.compile(r"[A-Za-z_$][\w$]*")
REGEX_PREV = set("(,=:[!&|?{};+-*%<>~^")
REGEX_KW = {"return", "typeof", "case", "do", "else", "in", "of", "void", "yield", "await"}


def mask(src: str) -> tuple[str, str]:
    """Liefert (code, ohne_kommentare): beide so lang wie src, Zeilenumbrüche bleiben.

    code: Kommentare, Zeichenketten und Text von Template-Literalen sind Leerzeichen; `${...}` bleibt Code.
    ohne_kommentare: nur Kommentare sind ausgeblendet (für die Zählung der Codezeilen).
    """
    out = list(src)
    nc = list(src)
    n = len(src)
    i = 0
    stack: list[list] = [["code", 0]]  # Rahmen: ["code", Klammertiefe] oder ["tpl"]

    def blank(a: int, b: int, both: bool) -> None:
        for k in range(a, b):
            if src[k] != "\n":
                out[k] = " "
                if both:
                    nc[k] = " "

    def prev_code_char(k: int) -> str:
        k -= 1
        while k >= 0 and out[k] in " \t\n":
            k -= 1
        return out[k] if k >= 0 else ""

    def prev_word(k: int) -> str:
        k -= 1
        while k >= 0 and out[k] in " \t\n":
            k -= 1
        e = k + 1
        while k >= 0 and (out[k].isalnum() or out[k] in "_$"):
            k -= 1
        return "".join(out[k + 1 : e])

    while i < n:
        top = stack[-1]
        c = src[i]
        if top[0] == "tpl":
            if c == "\\":
                blank(i, min(n, i + 2), False)
                i += 2
            elif c == "`":
                stack.pop()
                i += 1
            elif c == "$" and i + 1 < n and src[i + 1] == "{":
                stack.append(["code", 0])
                i += 2
            else:
                blank(i, i + 1, False)
                i += 1
            continue
        if c == "/" and i + 1 < n and src[i + 1] == "/":
            j = src.find("\n", i)
            j = n if j < 0 else j
            blank(i, j, True)
            i = j
        elif c == "/" and i + 1 < n and src[i + 1] == "*":
            j = src.find("*/", i + 2)
            j = n if j < 0 else j + 2
            blank(i, j, True)
            i = j
        elif c in "\"'":
            j = i + 1
            while j < n and src[j] != c and src[j] != "\n":
                j += 2 if src[j] == "\\" else 1
            blank(i + 1, min(j, n), False)
            i = j + 1
        elif c == "`":
            stack.append(["tpl"])
            i += 1
        elif c == "/" and (prev_code_char(i) in REGEX_PREV or prev_code_char(i) == "" or prev_word(i) in REGEX_KW):
            j, cls = i + 1, False
            while j < n and src[j] != "\n":
                if src[j] == "\\":
                    j += 2
                    continue
                if src[j] == "[":
                    cls = True
                elif src[j] == "]":
                    cls = False
                elif src[j] == "/" and not cls:
                    break
                j += 1
            blank(i + 1, min(j, n), False)
            i = j + 1
        elif c == "{":
            top[1] += 1
            i += 1
        elif c == "}":
            if top[1] == 0 and len(stack) > 1:
                stack.pop()
            else:
                top[1] -= 1
            i += 1
        else:
            i += 1
    return "".join(out), "".join(nc)


def complexity(code: str) -> int:
    """Zyklomatische Komplexität (Näherung): 1 + Verzweigungen und Kurzschluss-Operatoren."""
    return (
        1
        + len(re.findall(r"\b(?:if|for|while|case|catch)\b", code))
        + len(re.findall(r"&&|\|\||\?\?", code))
        + len(re.findall(r"\s\?\s", code))
    )


def maintainability(loc: int, cc: int) -> int:
    """Gleiche Formel wie in der Seite (miOf), auf 0–100 normiert."""
    v = 171 - 5.2 * math.log(max(1, loc * 8)) - 0.23 * cc - 16.2 * math.log(max(1, loc))
    return round(max(0.0, v) * 100 / 171)


def doc_above(raw: list[str], line: int) -> tuple[str, int]:
    """Kommentar direkt über Zeile `line` (1-basiert): Text und erste Zeile des Kommentars."""
    k = line - 2
    while k >= 0 and raw[k].strip().startswith("@"):
        k -= 1
    if k < 0:
        return "", line
    s = raw[k].strip()
    if s.endswith("*/"):
        e = k
        while k >= 0 and "/*" not in raw[k]:
            k -= 1
        if k < 0:
            return "", line
        text = " ".join(raw[k : e + 1])
        text = re.sub(r"^\s*/\*\*?|\*/\s*$", "", text.strip())
        text = re.sub(r"\s*\*\s+", " ", " " + text)
        return re.sub(r"\s+", " ", text).strip(), k + 1
    if s.startswith("//"):
        e = k
        while k - 1 >= 0 and raw[k - 1].strip().startswith("//"):
            k -= 1
        text = " ".join(x.strip()[2:].strip() for x in raw[k : e + 1])
        return text.strip(), k + 1
    return "", line


def signature(raw: list[str], start: int, end: int) -> str:
    """Kopfzeile(n) einer Deklaration bis zum Rumpf, auf eine Zeile gekürzt."""
    text = " ".join(x.strip() for x in raw[start - 1 : min(end, start + 5)])
    for stop in (" {", "=> {", " = {", " = `", " = css`"):
        p = text.find(stop)
        if p > 0:
            text = text[: p + (len(stop) if stop.startswith("=>") else 0)]
            break
    text = re.sub(r"\s+", " ", text).strip()
    return text if len(text) <= 220 else text[:217] + "…"


def block_end(code_lines: list[str], start: int, stop: int, indent: int) -> int:
    """Letzte Zeile (1-basiert) des Blocks ab `start`: bis vor die nächste Zeile mit gleicher
    Einrückung, die nicht mit einer schließenden Klammer beginnt."""
    last = start
    for k in range(start + 1, stop + 1):
        ln = code_lines[k - 1]
        if not ln.strip():
            continue
        ind = len(ln) - len(ln.lstrip(" "))
        if ind < indent:
            break
        if ind == indent and ln.lstrip()[0] not in "})]`":
            break
        last = k
    return last


def code_loc(nc_lines: list[str], a: int, b: int) -> int:
    return sum(1 for k in range(a, b + 1) if nc_lines[k - 1].strip())


def layer_of(rel: str) -> str:
    parts = rel.split("/")
    return LAYERS.get(parts[0], "Card") if len(parts) > 1 else "Card"


def resolve_import(base: Path, spec: str) -> str | None:
    if not spec.startswith("."):
        return None
    p = (base.parent / spec).resolve()
    for cand in (p.with_suffix(".ts"), p / "index.ts", Path(str(p).removesuffix(".js") + ".ts")):
        if cand.is_file() and SRC in cand.parents:
            return cand.relative_to(SRC).as_posix()[:-3]
    return None


def parse_imports(path: Path, src: str) -> dict[str, tuple[str, str]]:
    """Lokaler Name -> (Modul, importierter Name); "*" für Namensraum-Imports."""
    result: dict[str, tuple[str, str]] = {}
    for m in re.finditer(r"\bimport\s+(?:type\s+)?([^;]*?)\s+from\s+\"([^\"]+)\"", src):
        mod = resolve_import(path, m.group(2))
        if not mod:
            continue
        clause = m.group(1)
        braces = re.search(r"\{([^}]*)\}", clause)
        if braces:
            for part in braces.group(1).split(","):
                part = re.sub(r"^\s*type\s+", "", part.strip())
                if not part:
                    continue
                a, _, b = part.partition(" as ")
                result[(b or a).strip()] = (mod, a.strip())
            clause = clause.replace(braces.group(0), "")
        ns = re.search(r"\*\s+as\s+([\w$]+)", clause)
        if ns:
            result[ns.group(1)] = (mod, "*")
        default = re.match(r"\s*([\w$]+)", clause)
        if default and default.group(1) != "type":
            result[default.group(1)] = (mod, "default")
    return result


def scan_module(path: Path) -> dict:
    rel = path.relative_to(SRC).as_posix()
    ns = rel[:-3].removesuffix(".d")
    src = path.read_text(encoding="utf-8")
    raw = src.split("\n")
    code, nc = mask(src)
    code_lines, nc_lines = code.split("\n"), nc.split("\n")
    total = len(raw)

    starts = []  # (Zeile, Art, Name, exportiert)
    tops = []  # alle Zeilen mit Code in Spalte 0
    for k, ln in enumerate(code_lines, start=1):
        if not ln or ln[0] in " \t})]`":
            continue
        tops.append(k)
        m = DECL_RE.match(ln)
        if m:
            kind = m.group(2).rstrip("*")
            if kind in ("let", "var"):
                kind = "const"
            starts.append((k, kind, m.group(3), bool(m.group(1))))

    decls = []
    for idx, (line, kind, name, exported) in enumerate(starts):
        end = block_end(code_lines, line, total, 0)
        doc, dl = doc_above(raw, line)
        body = "\n".join(code_lines[line - 1 : end])
        meths = []
        if kind == "class":
            for k in range(line + 1, end + 1):
                ln = code_lines[k - 1]
                mm = METHOD_RE.match(ln) or ARROW_RE.match(ln)
                if not mm or mm.group(2) in NOT_METHODS:
                    continue
                me = block_end(code_lines, k, end - 1, 2)
                mdoc, _ = doc_above(raw, k)
                mods = mm.group(1)
                mname = mm.group(2)
                vis = "private" if ("private" in mods or mname.startswith(("_", "#"))) else "protected" if "protected" in mods else "public"
                mbody = "\n".join(code_lines[k - 1 : me])
                if re.search(r"\bget\s", mods):
                    mname = "get " + mname
                elif re.search(r"\bset\s", mods):
                    mname = "set " + mname
                meths.append(
                    {"n": mname, "l": k, "e": me, "loc": code_loc(nc_lines, k, me), "cc": complexity(mbody),
                     "sig": signature(raw, k, me), "doc": mdoc, "vis": vis}
                )
        bases = []
        head = signature(raw, line, end)
        hm = re.search(r"\b(?:extends|implements)\s+(.*)$", head)
        if hm and kind in ("class", "interface"):
            bases = [b.strip() for b in re.split(r",|\bimplements\b|\bextends\b", re.sub(r"<[^<>]*>", "", hm.group(1))) if b.strip()]
        loc = code_loc(nc_lines, line, end)
        cc = complexity(body)
        decls.append(
            {"id": f"{ns}|{name}", "name": name, "layer": layer_of(rel), "ns": ns, "kind": kind, "file": "src/" + rel,
             "loc": loc, "cc": cc, "mi": maintainability(loc, cc), "exp": exported, "bases": bases,
             "l": dl, "e": end, "dl": line, "doc": doc, "sig": head, "meths": meths, "_body": body}
        )

    # Code auf oberster Ebene, der zu keiner Deklaration gehört (z. B. customElements.define): eigener Eintrag "Modulcode".
    covered = set()
    for d in decls:
        covered.update(range(d["dl"], d["e"] + 1))
    loose = [k for k in tops if k not in covered and not re.match(r"(import\b|export\s*\{|export\s+\*)", code_lines[k - 1])]
    if loose:
        lines = set()
        for k in loose:
            lines.update(range(k, block_end(code_lines, k, total, 0) + 1))
        a, b = min(lines), max(lines)
        body = "\n".join(code_lines[k - 1] for k in sorted(lines))
        loc = sum(1 for k in lines if nc_lines[k - 1].strip())
        cc = complexity(body)
        decls.append(
            {"id": f"{ns}|(Modulcode)", "name": "(Modulcode)", "layer": layer_of(rel), "ns": ns, "kind": "module",
             "file": "src/" + rel, "loc": loc, "cc": cc, "mi": maintainability(loc, cc), "exp": False, "bases": [],
             "l": a, "e": b, "dl": a, "doc": "Anweisungen auf oberster Ebene des Moduls, die zu keiner Deklaration gehören.",
             "sig": "", "meths": [], "_body": body}
        )
    return {"ns": ns, "path": path, "src": src, "decls": decls, "imports": parse_imports(path, src)}


def build() -> str:
    modules = {m["ns"]: m for m in (scan_module(p) for p in sorted(SRC.rglob("*.ts")))}
    by_id = {d["id"]: d for m in modules.values() for d in m["decls"]}

    def lookup(ns: str, name: str, seen: set | None = None) -> str | None:
        """Findet die Deklaration `name` im Modul `ns`, auch über Re-Exporte."""
        seen = seen or set()
        if (ns, name) in seen or ns not in modules:
            return None
        seen.add((ns, name))
        if f"{ns}|{name}" in by_id:
            return f"{ns}|{name}"
        imp = modules[ns]["imports"].get(name)
        if imp:
            return lookup(imp[0], imp[1], seen)
        m = re.search(r"export\s+\{[^}]*\b" + re.escape(name) + r"\b[^}]*\}\s+from\s+\"([^\"]+)\"", modules[ns]["src"])
        if m:
            target = resolve_import(modules[ns]["path"], m.group(1))
            return lookup(target, name, seen) if target else None
        return None

    for m in modules.values():
        local = {d["name"]: d["id"] for d in m["decls"]}
        for d in m["decls"]:
            deps = set()
            words = IDENT_RE.findall(d["_body"])
            for i, w in enumerate(words):
                if w in local and local[w] != d["id"]:
                    deps.add(local[w])
                elif w in m["imports"] and w not in local:
                    mod, name = m["imports"][w]
                    if name == "*":
                        nxt = words[i + 1] if i + 1 < len(words) else ""
                        t = lookup(mod, nxt)
                    else:
                        t = lookup(mod, name)
                    if t and t != d["id"]:
                        deps.add(t)
            d["deps"] = sorted(deps)

    tests = "\n".join(p.read_text(encoding="utf-8") for d in TEST_DIRS if d.is_dir() for p in sorted(d.rglob("*.ts")))
    test_words = set(IDENT_RE.findall(tests))
    users: dict[str, set] = {}
    for d in by_id.values():
        for t in d["deps"]:
            users.setdefault(t, set()).add(d["id"])
    types = []
    for m in modules.values():
        for d in m["decls"]:
            d.pop("_body")
            d["tested"] = d["name"] in test_words
            d["ca"] = len(users.get(d["id"], ()))
            d["ce"] = len(d["deps"])
            d["instab"] = round(d["ce"] / (d["ca"] + d["ce"]), 2) if d["ca"] + d["ce"] else 0.0
            types.append(d)

    version = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))["version"]
    data = {"version": version, "start": START if START in by_id else types[0]["id"], "types": types}
    files = {"src/" + m["path"].relative_to(SRC).as_posix(): m["src"] for m in modules.values()}

    def js(obj) -> str:
        return json.dumps(obj, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")

    html = TEMPLATE.read_text(encoding="utf-8")
    return html.replace("__DATA__", js(data), 1).replace("__FILES__", js(files), 1)


def main() -> int:
    html = build()
    if "--check" in sys.argv:
        if not OUTPUT.is_file() or OUTPUT.read_text(encoding="utf-8") != html:
            print("docs/code-doku/index.html passt nicht zum Quelltext. Bitte `python3 docs/code-doku/generate.py` ausführen und das Ergebnis mit committen.")
            return 1
        print("Code-Dokumentation ist aktuell.")
        return 0
    OUTPUT.write_text(html, encoding="utf-8")
    print(f"geschrieben: {OUTPUT.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
