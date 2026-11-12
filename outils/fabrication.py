"""Fabrication : manuscrit assemblé, PDF intérieur KDP, Word, EPUB, couverture."""
from __future__ import annotations
import json, re, shutil, subprocess, zipfile
from pathlib import Path
import kdp
from commun import chapitres, lire_json, runs, RACINE

GABARITS = RACINE / "outils" / "gabarits"


def _typst(source: Path, sortie: Path, ppi: float | None = None):
    import typst
    kw = {"ppi": ppi} if ppi else {}
    typst.compile(str(source), output=str(sortie), root="/", **kw)


def _blocs(elements):
    out = []
    for _, kind, t in elements:
        if kind == "sep":
            if out and out[-1]["t"] != "sep":
                out.append({"t": "sep"})
        elif kind.startswith("etape:"):
            out.append({"t": "etape", "n": int(kind[6:]), "runs": runs(t)})
        elif kind.startswith("encadre:"):
            out.append({"t": "encadre", "label": kind[8:], "runs": runs(t)})
        else:
            out.append({"t": kind, "runs": runs(t)})
    while out and out[-1]["t"] == "sep":
        out.pop()
    return out


def _annexes(p: Path):
    res = []
    for nom, titre in (("remerciements.md", "Remerciements"), ("auteur.md", "À propos de l’auteur")):
        f = p / "annexes" / nom
        if f.exists() and f.read_text(encoding="utf-8").strip():
            lignes = [l.strip() for l in f.read_text(encoding="utf-8").splitlines() if l.strip() and not l.startswith("#")]
            res.append({"titre": titre, "blocs": [{"t": "p", "runs": runs(l)} for l in lignes]})
    return res


def mentions(cfg) -> list[str]:
    l = [f"© {cfg['annee']} {cfg['auteur']}", "Tous droits réservés."]
    l.append("Toute reproduction, même partielle, est interdite sans l’autorisation de l’auteur (art. L. 122-4 du Code de la propriété intellectuelle).")
    l += cfg.get("mentions_supplementaires", [])
    if cfg.get("fiction", True):
        l.append("Ce livre est une œuvre de fiction. Toute ressemblance avec des personnes ou des faits réels serait fortuite.")
    if cfg.get("isbn"):
        l.append(f"ISBN : {cfg['isbn']}")
    if cfg.get("depot_legal"):
        l.append(f"Dépôt légal : {cfg['depot_legal']}")
    l.append(cfg.get("editeur") or "Publication indépendante")
    return l


def _md(kind: str, t: str, esc=lambda x: x) -> str:
    """Un élément du manuscrit en Markdown standard."""
    if kind == "sep":
        return "* * *"
    if kind == "h2":
        return "#### " + esc(t)
    if kind == "puce":
        return "- " + esc(t)
    if kind == "case":
        return "- ☐ " + esc(t)
    if kind.startswith("etape:"):
        return f"{kind[6:]}. " + esc(t)
    if kind.startswith("encadre:"):
        return f"> **{kind[8:].capitalize()}** — " + esc(t)
    return esc(t)


def assembler(p: Path) -> Path:
    """Manuscrit complet en Markdown normalisé (un paragraphe par bloc)."""
    cfg = lire_json(p / "livre.json")
    out = [f"# {cfg['titre']}", "", cfg["auteur"], ""]
    for ch in chapitres(p):
        if ch.partie:
            out += [f"## {ch.partie}", ""]
        out += [f"### {ch.titre}", ""]
        for _, kind, t in ch.elements:
            out += [_md(kind, t), ""]
    dest = p / "sortie" / f"{cfg['slug']}.md"
    dest.parent.mkdir(exist_ok=True)
    dest.write_text("\n".join(out), encoding="utf-8")
    return dest


def interieur(p: Path) -> tuple[Path, int]:
    cfg = lire_json(p / "livre.json")
    chs = chapitres(p)
    if not chs:
        raise SystemExit("Aucun chapitre à fabriquer.")
    fmt = cfg["format"]
    build = p / "sortie" / "build"
    build.mkdir(parents=True, exist_ok=True)
    guide = cfg.get("type") == "guide"
    shutil.copy(GABARITS / ("guide.typ" if guide else "interieur.typ"), build / "interieur.typ")
    data = {
        "titre": cfg["titre"], "sous_titre": cfg.get("sous_titre", ""), "auteur": cfg["auteur"],
        "editeur": cfg.get("editeur", ""), "mention_genre": cfg.get("mention_genre", "roman"),
        "dedicace": cfg.get("dedicace", ""), "exergue": {"texte": cfg.get("exergue", {}).get("texte", ""), "source": cfg.get("exergue", {}).get("source", "")},
        "mentions": mentions(cfg), "largeur_cm": fmt["largeur_cm"], "hauteur_cm": fmt["hauteur_cm"],
        "police": fmt.get("police", "Libertinus Serif"), "corps": fmt.get("corps", 11), "interligne": fmt.get("interligne", 0.68),
        "belle_page": fmt.get("chapitres_en_belle_page", False),
        "chapitres": [{"titre": c.titre, "partie": c.partie, "blocs": _blocs(c.elements)} for c in chs],
        "annexes": _annexes(p), "police_titres": fmt.get("police_titres", "DejaVu Sans"),
        "pages_notes": fmt.get("pages_notes", 0), "lignes_notes": fmt.get("lignes_notes", 18),
    }
    dest = p / "sortie" / f"{cfg['slug']}_interieur_KDP.pdf"
    from pypdf import PdfReader
    marge_int = kdp.marge_interieure_min(150) + 0.55
    pages = 0
    for _ in range(4):      # la marge intérieure dépend du nombre de pages : on itère jusqu'à stabilité
        data["marges"] = {"int": round(marge_int, 3), "ext": fmt.get("marge_ext_cm", 1.5),
                          "haut": fmt.get("marge_haut_cm", 1.9), "bas": fmt.get("marge_bas_cm", 2.0)}
        (build / "livre.json").write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
        _typst(build / "interieur.typ", dest)
        pages = len(PdfReader(str(dest)).pages)
        voulu = kdp.marge_interieure_min(min(pages, kdp.PAGES_MAX)) + 0.55
        if abs(voulu - marge_int) < 1e-6:
            break
        marge_int = voulu
    return dest, pages


def word(p: Path) -> Path:
    from docx import Document
    from docx.shared import Cm, Pt
    from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_BREAK
    from docx.oxml.ns import qn
    from docx.oxml import OxmlElement
    cfg = lire_json(p / "livre.json")
    fmt = cfg["format"]
    doc = Document()
    sec = doc.sections[0]
    sec.page_width, sec.page_height = Cm(fmt["largeur_cm"]), Cm(fmt["hauteur_cm"])
    sec.left_margin, sec.right_margin = Cm(1.9), Cm(1.5)
    sec.top_margin, sec.bottom_margin = Cm(1.9), Cm(2.0)
    doc.settings.element.append(OxmlElement("w:mirrorMargins"))
    hyph = OxmlElement("w:autoHyphenation"); hyph.set(qn("w:val"), "true"); doc.settings.element.append(hyph)
    doc.core_properties.title, doc.core_properties.author, doc.core_properties.language = cfg["titre"], cfg["auteur"], "fr-FR"
    normal = doc.styles["Normal"]
    normal.font.name, normal.font.size = "Garamond", Pt(fmt.get("corps", 11) + 1)
    rpr = normal.element.get_or_add_rPr()
    lang = OxmlElement("w:lang"); lang.set(qn("w:val"), "fr-FR"); rpr.append(lang)
    pf = normal.paragraph_format
    pf.alignment, pf.space_after, pf.space_before, pf.line_spacing = WD_ALIGN_PARAGRAPH.JUSTIFY, Pt(0), Pt(0), 1.2
    pf.widow_control = True

    def centre(texte, taille, avant=0, italique=False):
        par = doc.add_paragraph(); par.alignment = WD_ALIGN_PARAGRAPH.CENTER
        par.paragraph_format.space_before = Pt(avant)
        run = par.add_run(texte); run.font.size = Pt(taille); run.italic = italique
        return par

    centre(cfg["auteur"], 14, avant=90)
    centre(cfg["titre"], 26, avant=30)
    if cfg.get("sous_titre"):
        centre(cfg["sous_titre"], 13, avant=10, italique=True)
    doc.add_paragraph().add_run().add_break(WD_BREAK.PAGE)
    for l in mentions(cfg):
        par = doc.add_paragraph(l); par.alignment = WD_ALIGN_PARAGRAPH.LEFT
        for run in par.runs:
            run.font.size = Pt(9)
    for ch in chapitres(p):
        if ch.partie:
            doc.add_page_break(); centre(ch.partie, 18, avant=160)
        doc.add_page_break()
        h = doc.add_heading(ch.titre, level=1)
        h.alignment = WD_ALIGN_PARAGRAPH.CENTER
        h.paragraph_format.space_before, h.paragraph_format.space_after = Pt(70), Pt(40)
        for run in h.runs:
            run.font.name, run.font.size, run.font.bold = "Garamond", Pt(18), False
            run.font.color.rgb = None
        premier = True
        for _, kind, t in ch.elements:
            if kind == "sep":
                centre("* * *", 11, avant=12).paragraph_format.space_after = Pt(12)
                premier = True
                continue
            par = doc.add_paragraph()
            guide = cfg.get("type") == "guide"
            if guide:
                par.alignment = WD_ALIGN_PARAGRAPH.LEFT
                par.paragraph_format.space_after = Pt(8)
            elif not premier:
                par.paragraph_format.first_line_indent = Cm(0.55)
            premier = False
            marque = {"puce": "•  ", "case": "☐  "}.get(kind, "")
            if kind.startswith("etape:"):
                marque = kind[6:] + ".  "
            if kind.startswith("encadre:"):
                par.paragraph_format.left_indent = Cm(0.8)
                par.add_run(kind[8:] + " — ").bold = True
            if kind in ("puce", "case") or kind.startswith("etape:"):
                par.paragraph_format.left_indent = Cm(0.8)
            if marque:
                par.add_run(marque).bold = True
            for r in runs(t):
                run = par.add_run(r["s"])
                run.italic, run.bold = r["i"], r["b"] or kind == "h2"
    dest = p / "sortie" / f"{cfg['slug']}.docx"
    doc.save(str(dest))
    return dest


def epub(p: Path, couverture_jpg: Path | None = None) -> Path:
    cfg = lire_json(p / "livre.json")
    build = p / "sortie" / "build"
    build.mkdir(parents=True, exist_ok=True)
    md = ["---", f"title: {json.dumps(cfg['titre'], ensure_ascii=False)}", f"author: {json.dumps(cfg['auteur'], ensure_ascii=False)}",
          "lang: fr-FR", f"rights: {json.dumps('© ' + str(cfg['annee']) + ' ' + cfg['auteur'], ensure_ascii=False)}"]
    if cfg.get("sous_titre"):
        md.append(f"subtitle: {json.dumps(cfg['sous_titre'], ensure_ascii=False)}")
    if cfg.get("isbn_numerique"):
        md.append(f"identifier: {json.dumps(cfg['isbn_numerique'])}")
    md += ["---", ""]
    esc = lambda t: re.sub(r"([\\`_\[\]<>#~^$|])", r"\\\1", t)
    if cfg.get("type") == "guide":
        css = GABARITS / "epub_guide.css"
    else:
        css = GABARITS / "epub.css"
    for ch in chapitres(p):
        if ch.partie:
            md += [f"# {esc(ch.partie)} {{.partie}}", ""]
        md += [f"# {esc(ch.titre)}", ""]
        for _, kind, t in ch.elements:
            md += ["::: sep\n\\* \\* \\*\n:::" if kind == "sep" else _md(kind, t, esc), ""]
    md += ["# Mentions légales {.unnumbered}", ""] + [esc(l) + "\n" for l in mentions(cfg)]
    src = build / "epub.md"
    src.write_text("\n".join(md), encoding="utf-8")
    dest = p / "sortie" / f"{cfg['slug']}.epub"
    cmd = ["pandoc", str(src), "-o", str(dest), "--from", "markdown-smart", "--toc", "--toc-depth=1",
           "--split-level=1", "--css", str(css), "--metadata", "toc-title=Sommaire"]
    if couverture_jpg and couverture_jpg.exists():
        cmd += ["--epub-cover-image", str(couverture_jpg)]
    subprocess.run(cmd, check=True)
    with zipfile.ZipFile(dest) as z:
        if z.testzip() is not None:
            raise SystemExit("EPUB corrompu")
    return dest


def couverture(p: Path, pages: int) -> dict:
    from PIL import Image
    cfg = lire_json(p / "livre.json")
    fmt, cv = cfg["format"], cfg.get("couverture", {})
    L, H, papier = fmt["largeur_cm"], fmt["hauteur_cm"], fmt.get("papier", "creme")
    W, HT, dos = kdp.dimensions_couverture(L, H, pages, papier)
    corps_dos = min(11.0, (dos - 2 * kdp.MARGE_TEXTE_DOS) / 2.54 * 72 * 0.72)
    texte_dos = pages >= kdp.PAGES_MIN_TEXTE_DOS and corps_dos >= 5.5
    cb_l, cb_h = kdp.CODE_BARRES
    cb = {"x": kdp.FOND_PERDU + L - kdp.CODE_BARRES_RETRAIT - cb_l, "y": kdp.FOND_PERDU + H - kdp.CODE_BARRES_RETRAIT - cb_h, "l": cb_l, "h": cb_h}
    image = cv.get("image") or None
    if image:
        image = str((p / image).resolve())
        if not Path(image).exists():
            raise SystemExit(f"Image de couverture introuvable : {image}")
    build = p / "sortie" / "build"
    build.mkdir(parents=True, exist_ok=True)
    shutil.copy(GABARITS / "couverture.typ", build / "couverture.typ")
    quat = [l.strip() for l in cv.get("quatrieme", "").split("\n") if l.strip()]
    base = {"titre": cfg["titre"], "sous_titre": cfg.get("sous_titre", ""), "auteur": cfg["auteur"],
            "mention_genre": cfg.get("mention_genre", "roman"), "quatrieme": quat, "bio": cv.get("bio", ""),
            "largeur_cm": L, "hauteur_cm": H, "dos_cm": dos, "fond_perdu_cm": kdp.FOND_PERDU,
            "fond": cv.get("fond", "#1c2430"), "texte": cv.get("texte", "#f2ead8"), "accent": cv.get("accent", "#c8a45a"),
            "police": fmt.get("police", "Libertinus Serif"), "image": image, "texte_dos": texte_dos,
            "corps_dos": round(corps_dos, 2), "securite_cm": kdp.SECURITE_COUV, "cb": cb,
            "reserve_code_barres_cm": cb_h + kdp.CODE_BARRES_RETRAIT + 0.6,
            "modele": cv.get("modele", "classique"), "collection": cv.get("collection", ""), "numero": cv.get("numero", 1),
            "embleme": cv.get("embleme", ""), "points": cv.get("points", []), "accroche": cv.get("accroche", ""),
            "mention_serie": cv.get("mention_serie", "Gros caractères"), "police_titres": fmt.get("police_titres", "DejaVu Sans")}
    slug = cfg["slug"]
    sorties = {"pdf": p / "sortie" / f"{slug}_couverture_KDP.pdf", "epreuve": p / "sortie" / f"{slug}_couverture_EPREUVE.png",
               "ebook": p / "sortie" / f"{slug}_couverture_ebook.jpg"}
    for mode, guides, dest, ppi in (("complet", False, sorties["pdf"], None), ("complet", True, sorties["epreuve"], 150),
                                    ("ebook", False, build / "ebook.png", 254)):
        (build / "couverture.json").write_text(json.dumps({**base, "mode": mode, "guides": guides}, ensure_ascii=False), encoding="utf-8")
        _typst(build / "couverture.typ", dest, ppi)
    im = Image.open(build / "ebook.png").convert("RGB").resize(kdp.EBOOK_COUV_PX, Image.LANCZOS)
    im.save(sorties["ebook"], quality=92)
    return {"fichiers": sorties, "largeur_cm": W, "hauteur_cm": HT, "dos_cm": dos, "texte_dos": texte_dos, "cb": cb, "pages": pages,
            "image": image}
