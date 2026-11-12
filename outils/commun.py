"""Fonctions partagées : accès au projet, lecture des chapitres, comptages."""
from __future__ import annotations
import json, re, hashlib
from dataclasses import dataclass, field
from pathlib import Path

RACINE = Path(__file__).resolve().parent.parent
LIVRES = RACINE / "livres"
MOT = re.compile(r"[A-Za-zÀ-ÖØ-öø-ÿŒœ]+(?:[’'\-][A-Za-zÀ-ÖØ-öø-ÿŒœ]+)*")
SEPARATEURS = {"* * *", "***", "⁂", "---"}


def projet(slug: str) -> Path:
    p = LIVRES / slug
    if not p.is_dir():
        raise SystemExit(f"Projet introuvable : {p}")
    return p


def lire_json(chemin: Path, defaut=None):
    if not chemin.exists():
        if defaut is not None:
            return defaut
        raise SystemExit(f"Fichier manquant : {chemin}")
    try:
        return json.loads(chemin.read_text(encoding="utf-8"))
    except json.JSONDecodeError as e:
        raise SystemExit(f"JSON invalide dans {chemin} : {e}")


def ecrire_json(chemin: Path, data) -> None:
    chemin.parent.mkdir(parents=True, exist_ok=True)
    chemin.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


@dataclass
class Chapitre:
    numero: int
    fichier: Path
    titre: str = ""
    partie: str | None = None
    # éléments : (numéro de ligne, genre, texte). Genres : p, sep ; en mode guide aussi h2, puce, case, etape:N, encadre:LABEL
    elements: list = field(default_factory=list)
    guide: bool = False

    @property
    def paragraphes(self):
        return [(n, t) for n, k, t in self.elements if k != "sep"]

    @property
    def genres(self):
        return {n: k for n, k, _ in self.elements}

    @property
    def texte(self) -> str:
        return "\n".join(t for _, t in self.paragraphes)

    @property
    def mots(self) -> int:
        return len(MOT.findall(self.texte))

    @property
    def ref(self) -> str:
        return f"ch{self.numero:02d}"


PREFIXE_GUIDE = re.compile(r"^(## |- \[ \] |- |\d+\. |> \[[A-ZÀ-Ü ’'-]+\] )")


def lire_chapitre(fichier: Path, numero: int, guide: bool = False) -> Chapitre:
    ch = Chapitre(numero=numero, fichier=fichier, guide=guide)
    for i, brut in enumerate(fichier.read_text(encoding="utf-8").splitlines(), 1):
        ligne = brut.strip()
        if not ligne:
            continue
        if ligne.startswith("%%"):
            m = re.match(r"%%\s*partie\s*:\s*(.+)", ligne, re.I)
            if m:
                ch.partie = m.group(1).strip()
            continue
        if ligne.startswith("# ") and not ch.titre:
            ch.titre = ligne[2:].strip()
            continue
        if ligne in SEPARATEURS:
            ch.elements.append((i, "sep", ""))
            continue
        m = PREFIXE_GUIDE.match(ligne) if guide else None
        if m:
            pre, reste = m.group(1), ligne[m.end():].strip()
            if pre == "## ":
                genre = "h2"
            elif pre == "- [ ] ":
                genre = "case"
            elif pre == "- ":
                genre = "puce"
            elif pre.startswith(">"):
                genre = "encadre:" + pre[3:-2]
            else:
                genre = "etape:" + pre[:-2]
            ch.elements.append((i, genre, reste))
        else:
            ch.elements.append((i, "p", ligne))
    return ch


def est_guide(p: Path) -> bool:
    return lire_json(p / "livre.json", defaut={}).get("type") == "guide"


def chapitres(p: Path, plage: str | None = None) -> list[Chapitre]:
    """Chapitres du projet, triés. Fichiers attendus : chapitres/chNN.md (un paragraphe par ligne)."""
    fichiers = sorted((p / "chapitres").glob("ch[0-9]*.md"))
    res = []
    guide = est_guide(p)
    for f in fichiers:
        m = re.match(r"ch(\d+)", f.stem)
        res.append(lire_chapitre(f, int(m.group(1)), guide))
    if plage:
        a, _, b = plage.partition("-")
        a, b = int(a), int(b or a)
        res = [c for c in res if a <= c.numero <= b]
    return res


def runs(texte: str) -> list[dict]:
    """Découpe **gras** et *italique* en segments {s, i, b}."""
    out, pos = [], 0
    for m in re.finditer(r"\*\*([^*\n]+)\*\*|\*([^*\n]+)\*", texte):
        if m.start() > pos:
            out.append({"s": texte[pos:m.start()], "i": False, "b": False})
        out.append({"s": m.group(1) or m.group(2), "i": m.group(2) is not None, "b": m.group(1) is not None})
        pos = m.end()
    if pos < len(texte):
        out.append({"s": texte[pos:], "i": False, "b": False})
    return out or [{"s": "", "i": False, "b": False}]


def phrases(texte: str) -> list[str]:
    return [s.strip() for s in re.split(r"(?<=[.!?…])[\s  »]+(?=[«—A-ZÀ-ÖØ-ÞŒ])", texte) if s.strip()]


def sha256_fichier(chemin: Path) -> str:
    return hashlib.sha256(chemin.read_bytes()).hexdigest()


def exceptions(p: Path, nom: str) -> list[tuple[str, str]]:
    """controles/exceptions_<nom>.txt : lignes 'chNN: fragment' (ou '*: fragment'). Occurrences arbitrées « à conserver »."""
    f = p / "controles" / f"exceptions_{nom}.txt"
    res = []
    if f.exists():
        for l in f.read_text(encoding="utf-8").splitlines():
            l = l.strip()
            if l and not l.startswith("#") and ":" in l:
                a, b = l.split(":", 1)
                res.append((a.strip().lower(), b.strip()))
    return res


def est_excepte(exc, ref: str, ligne: str) -> bool:
    return any((a in ("*", ref)) and b and b in ligne for a, b in exc)


class Rapport:
    """Collecte des constats. Niveaux : BLOQUANT (échec), IMPORTANT (échec), MINEUR (signalé), INFO."""
    def __init__(self, titre: str):
        self.titre, self.items, self.notes = titre, [], []

    def ajouter(self, niveau: str, ou: str, message: str):
        self.items.append((niveau, ou, message))

    def note(self, texte: str):
        self.notes.append(texte)

    @property
    def echec(self) -> bool:
        return any(n in ("BLOQUANT", "IMPORTANT") for n, _, _ in self.items)

    def compte(self, niveau: str) -> int:
        return sum(1 for n, _, _ in self.items if n == niveau)

    def markdown(self) -> str:
        etat = "ÉCHEC" if self.echec else "RÉUSSI"
        l = [f"## {self.titre} — {etat}", ""]
        l.append(" · ".join(f"{n} : {self.compte(n)}" for n in ("BLOQUANT", "IMPORTANT", "MINEUR", "INFO")))
        l.append("")
        for n in self.notes:
            l.append(n)
        if self.notes:
            l.append("")
        for niveau in ("BLOQUANT", "IMPORTANT", "MINEUR", "INFO"):
            sel = [(o, m) for n, o, m in self.items if n == niveau]
            if not sel:
                continue
            l.append(f"### {niveau}")
            for o, m in sel:
                l.append(f"- `{o}` {m}")
            l.append("")
        return "\n".join(l)
