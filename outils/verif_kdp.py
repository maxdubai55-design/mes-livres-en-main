"""Vérifications des fichiers finaux et des métadonnées contre les spécifications KDP."""
from __future__ import annotations
import re, zipfile
from pathlib import Path
import kdp
from commun import Rapport, lire_json

PT_CM = 2.54 / 72


def _polices_non_incorporees(reader) -> set:
    manquantes = set()
    for page in reader.pages:
        polices = (page.get("/Resources") or {}).get("/Font") or {}
        for ref in polices.values():
            f = ref.get_object()
            descs = [f]
            if "/DescendantFonts" in f:
                descs = [x.get_object() for x in f["/DescendantFonts"]]
            for dsc in descs:
                fd = dsc.get("/FontDescriptor")
                if fd is None or not any(k in fd.get_object() for k in ("/FontFile", "/FontFile2", "/FontFile3")):
                    manquantes.add(str(f.get("/BaseFont", "?")))
    return manquantes


def _encre(pdf: Path):
    """Pour chaque page : boîte englobante de l'encre en points (ou None si page blanche)."""
    import pypdfium2 as pdfium
    from PIL import ImageOps
    doc = pdfium.PdfDocument(str(pdf))
    for page in doc:
        im = page.render(scale=2, grayscale=True).to_pil()
        bbox = ImageOps.invert(im.convert("L")).point(lambda v: 255 if v > 40 else 0).getbbox()
        yield (tuple(v / 2 for v in bbox) if bbox else None), im.size[0] / 2, im.size[1] / 2


def interieur(p: Path, pdf: Path) -> tuple[Rapport, int]:
    from pypdf import PdfReader
    r = Rapport("PDF intérieur — conformité KDP")
    cfg = lire_json(p / "livre.json")
    L, H = cfg["format"]["largeur_cm"], cfg["format"]["hauteur_cm"]
    if not pdf.exists():
        r.ajouter("BLOQUANT", pdf.name, "fichier absent")
        return r, 0
    reader = PdfReader(str(pdf))
    n = len(reader.pages)
    if not (kdp.PAGES_MIN <= n <= kdp.PAGES_MAX):
        r.ajouter("BLOQUANT", pdf.name, f"{n} pages : KDP exige entre {kdp.PAGES_MIN} et {kdp.PAGES_MAX}")
    if (L, H) not in kdp.FORMATS.values():
        r.ajouter("IMPORTANT", "livre.json", f"format {L} × {H} cm absent de la liste des tailles de coupe courantes — vérifier sur KDP")
    for i, page in enumerate(reader.pages, 1):
        w, h = float(page.mediabox.width) * PT_CM, float(page.mediabox.height) * PT_CM
        if abs(w - L) > 0.02 or abs(h - H) > 0.02:
            r.ajouter("BLOQUANT", f"p. {i}", f"dimensions {w:.2f} × {h:.2f} cm au lieu de {L} × {H} cm")
            break
    manq = _polices_non_incorporees(reader)
    if manq:
        r.ajouter("BLOQUANT", pdf.name, f"polices non incorporées : {', '.join(sorted(manq))}")
    int_min, ext_min = kdp.marge_interieure_min(min(max(n, 1), kdp.PAGES_MAX)), kdp.MARGE_EXT_MIN
    blanches, pires = [], {"int": 99.0, "ext": 99.0, "haut": 99.0, "bas": 99.0}
    for i, (bbox, w, h) in enumerate(_encre(pdf), 1):
        if bbox is None:
            blanches.append(i)
            continue
        g, haut, d, bas = bbox[0] * PT_CM, bbox[1] * PT_CM, (w - bbox[2]) * PT_CM, (h - bbox[3]) * PT_CM
        inter, ext = (g, d) if i % 2 else (d, g)      # page impaire = recto : reliure à gauche
        for k, v in (("int", inter), ("ext", ext), ("haut", haut), ("bas", bas)):
            pires[k] = min(pires[k], v)
        if inter < int_min - 0.02:
            r.ajouter("BLOQUANT", f"p. {i}", f"marge intérieure {inter:.2f} cm < minimum KDP {int_min:.2f} cm")
        if min(ext, haut, bas) < ext_min - 0.02:
            r.ajouter("BLOQUANT", f"p. {i}", f"marge extérieure/haut/bas {min(ext, haut, bas):.2f} cm < minimum KDP {ext_min:.2f} cm")
    if 1 in blanches:
        r.ajouter("BLOQUANT", "p. 1", "première page blanche")
    consecutives = [b for b in blanches if b + 1 in blanches]
    if consecutives:
        r.ajouter("IMPORTANT", f"p. {consecutives[0]}", "deux pages blanches consécutives (KDP en refuse plus de deux ; ici c'est le signe d'un défaut de mise en page)")
    if n in blanches:
        r.ajouter("MINEUR", f"p. {n}", "dernière page blanche")
    texte1 = (reader.pages[2].extract_text() if n > 2 else "") or ""
    if cfg["titre"].lower()[:12] not in texte1.lower().replace("\n", " "):
        r.ajouter("IMPORTANT", "p. 3", "le titre n'a pas été retrouvé sur la page de titre")
    r.note(f"{n} pages · marges réelles minimales : intérieure {pires['int']:.2f} cm (min. KDP {int_min:.2f}), extérieure {pires['ext']:.2f}, haut {pires['haut']:.2f}, bas {pires['bas']:.2f} (min. {ext_min:.2f}) · pages blanches : {blanches or 'aucune'}")
    return r, n


def couverture(p: Path, info: dict) -> Rapport:
    from pypdf import PdfReader
    from PIL import Image
    r = Rapport("Couverture — conformité KDP")
    pdf = info["fichiers"]["pdf"]
    reader = PdfReader(str(pdf))
    if len(reader.pages) != 1:
        r.ajouter("BLOQUANT", pdf.name, "la couverture doit tenir en une seule page")
    w, h = float(reader.pages[0].mediabox.width) * PT_CM, float(reader.pages[0].mediabox.height) * PT_CM
    if abs(w - info["largeur_cm"]) > 0.03 or abs(h - info["hauteur_cm"]) > 0.03:
        r.ajouter("BLOQUANT", pdf.name, f"dimensions {w:.2f} × {h:.2f} cm au lieu de {info['largeur_cm']:.2f} × {info['hauteur_cm']:.2f} cm")
    manq = _polices_non_incorporees(reader)
    if manq:
        r.ajouter("BLOQUANT", pdf.name, f"polices non incorporées : {', '.join(sorted(manq))}")
    # Zone du code-barres et marge de sécurité : doivent rester vierges
    (bbox_unused, pw, ph) = next(_encre(pdf))
    import pypdfium2 as pdfium
    im = pdfium.PdfDocument(str(pdf))[0].render(scale=2).to_pil().convert("RGB")
    k = 2 / PT_CM
    cb = info["cb"]
    zone = im.crop((int(cb["x"] * k) + 2, int(cb["y"] * k) + 2, int((cb["x"] + cb["l"]) * k) - 2, int((cb["y"] + cb["h"]) * k) - 2))
    if len(zone.getcolors(maxcolors=100000) or []) > 1:
        r.ajouter("BLOQUANT", "4e de couverture", "la zone réservée au code-barres KDP n'est pas vierge")
    cfg = lire_json(p / "livre.json")
    L, H, fp, dos = cfg["format"]["largeur_cm"], cfg["format"]["hauteur_cm"], kdp.FOND_PERDU, info["dos_cm"]
    if not info["image"]:
        fond = im.getpixel((3, 3))
        s = kdp.SECURITE_COUV
        bandes = {"bord gauche (4e)": (0, 0, fp + s, h), "bord droit (1re)": (w - fp - s, 0, w, h), "bord haut": (0, 0, w, fp + s), "bord bas": (0, h - fp - s, w, h)}
        if not info["texte_dos"]:
            bandes["dos"] = (fp + L, 0, fp + L + dos, h)
        for nom, (x0, y0, x1, y1) in bandes.items():
            z = im.crop((int(x0 * k), int(y0 * k), int(x1 * k), int(y1 * k)))
            if any(c != fond for _, c in (z.getcolors(maxcolors=100000) or [(0, None)])):
                r.ajouter("BLOQUANT", nom, "du texte ou un élément déborde dans la marge de sécurité")
    else:
        r.ajouter("INFO", "couverture", "image de fond présente : le contrôle automatique des marges de sécurité est remplacé par l'examen visuel de l'épreuve")
        with Image.open(info["image"]) as src:
            dpi = src.size[0] / ((L + fp) / 2.54)
            if dpi < 300:
                r.ajouter("BLOQUANT", "image", f"résolution insuffisante : {dpi:.0f} ppp à la taille d'impression (300 requis)")
    if not info["texte_dos"]:
        r.ajouter("INFO", "dos", f"pas de texte sur le dos ({info['pages']} pages, dos de {dos:.2f} cm ; KDP exige {kdp.PAGES_MIN_TEXTE_DOS} pages au moins)")
    quat = cfg.get("couverture", {}).get("quatrieme", "")
    if not (350 <= len(quat) <= 1300):
        r.ajouter("IMPORTANT", "livre.json", f"quatrième de couverture : {len(quat)} signes (attendu : 350 à 1 300)")
    with Image.open(info["fichiers"]["ebook"]) as eb:
        if eb.size != kdp.EBOOK_COUV_PX or eb.mode != "RGB":
            r.ajouter("BLOQUANT", "couverture numérique", f"{eb.size} {eb.mode} au lieu de {kdp.EBOOK_COUV_PX} RGB")
    r.note(f"Couverture {info['largeur_cm']:.2f} × {info['hauteur_cm']:.2f} cm, dos {dos:.2f} cm pour {info['pages']} pages. Le PDF est en RVB : KDP l'accepte et convertit ; les couleurs imprimées peuvent différer légèrement de l'écran.")
    return r


def isbn13_valide(isbn: str) -> bool:
    c = re.sub(r"[^0-9]", "", isbn)
    return len(c) == 13 and sum(int(x) * (1 if i % 2 == 0 else 3) for i, x in enumerate(c)) % 10 == 0


SUPERLATIFS = re.compile(r"\b(?:best-?seller|chef-d[’']œuvre|incontournable|inoubliable|haletant|époustouflant|magistral|phénomène|numéro 1|n°1|à couper le souffle|vous ne pourrez plus le lâcher|page-turner)\b", re.I)
MOTS_CLES_INTERDITS = re.compile(r"\b(?:kindle|amazon|gratuit|promo|best-?seller|nouveau|nouveauté|ebook|livre|pas cher|unlimited)\b", re.I)


def metadonnees(p: Path) -> Rapport:
    r = Rapport("Métadonnées KDP")
    cfg = lire_json(p / "livre.json")
    k = cfg.get("kdp", {})
    for champ in ("titre", "auteur", "annee"):
        if not cfg.get(champ):
            r.ajouter("BLOQUANT", "livre.json", f"champ « {champ} » vide")
    if "À DÉFINIR" in str(cfg.get("titre", "")).upper() or "A DEFINIR" in str(cfg.get("titre", "")).upper():
        r.ajouter("BLOQUANT", "livre.json", "titre provisoire")
    if len(cfg.get("titre", "") + cfg.get("sous_titre", "")) > kdp.TITRE_MAX:
        r.ajouter("BLOQUANT", "livre.json", f"titre + sous-titre > {kdp.TITRE_MAX} signes")
    desc = k.get("description", "")
    if not (400 <= len(desc) <= kdp.DESCRIPTION_MAX):
        r.ajouter("BLOQUANT", "kdp.description", f"{len(desc)} signes (attendu : 400 à {kdp.DESCRIPTION_MAX}, balises comprises)")
    interdites = set(re.findall(r"</?([a-zA-Z0-9]+)", desc)) - {"b", "i", "em", "strong", "u", "br", "p", "h4", "h5", "h6", "ul", "ol", "li"}
    if interdites:
        r.ajouter("BLOQUANT", "kdp.description", f"balises HTML non admises par KDP : {sorted(interdites)}")
    for texte, ou in ((desc, "kdp.description"), (cfg.get("couverture", {}).get("quatrieme", ""), "couverture.quatrieme")):
        for m in SUPERLATIFS.finditer(texte):
            r.ajouter("IMPORTANT", ou, f"formule publicitaire générique : « {m.group(0)} »")
    mc = k.get("mots_cles", [])
    if len(mc) != kdp.MOTS_CLES_NB or any(not m.strip() for m in mc):
        r.ajouter("BLOQUANT", "kdp.mots_cles", f"{len([m for m in mc if m.strip()])} mots-clés renseignés sur {kdp.MOTS_CLES_NB}")
    for m in mc:
        if len(m) > kdp.MOT_CLE_MAX:
            r.ajouter("BLOQUANT", "kdp.mots_cles", f"« {m} » dépasse {kdp.MOT_CLE_MAX} signes")
        if MOTS_CLES_INTERDITS.search(m):
            r.ajouter("IMPORTANT", "kdp.mots_cles", f"« {m} » contient un terme proscrit ou inutile")
        if cfg.get("titre") and cfg["titre"].lower() in m.lower():
            r.ajouter("MINEUR", "kdp.mots_cles", f"« {m} » répète le titre (inutile)")
    if len({m.lower().strip() for m in mc}) != len(mc):
        r.ajouter("IMPORTANT", "kdp.mots_cles", "mots-clés en double")
    cats = k.get("categories", [])
    if not (1 <= len(cats) <= kdp.CATEGORIES_MAX):
        r.ajouter("BLOQUANT", "kdp.categories", f"{len(cats)} catégories (attendu : 1 à {kdp.CATEGORIES_MAX})")
    if cfg.get("isbn") and not isbn13_valide(cfg["isbn"]):
        r.ajouter("BLOQUANT", "livre.json", f"ISBN invalide : {cfg['isbn']}")
    if not cfg.get("isbn"):
        r.ajouter("INFO", "livre.json", "pas d'ISBN personnel : KDP en attribuera un gratuit (réservé à Amazon)")
    if not k.get("declaration_ia", "").strip():
        r.ajouter("BLOQUANT", "kdp.declaration_ia", "déclaration de contenu IA non renseignée — KDP la demande au dépôt")
    if not k.get("prix_broche_eur"):
        r.ajouter("MINEUR", "kdp.prix_broche_eur", "prix non renseigné")
    return r


def epub(chemin: Path) -> Rapport:
    import xml.dom.minidom
    r = Rapport("EPUB — contrôle de structure")
    if not chemin.exists():
        r.ajouter("BLOQUANT", chemin.name, "fichier absent")
        return r
    with zipfile.ZipFile(chemin) as z:
        noms = z.namelist()
        if noms[0] != "mimetype" or z.read("mimetype") != b"application/epub+zip":
            r.ajouter("BLOQUANT", chemin.name, "fichier mimetype absent ou mal placé")
        for n in noms:
            if n.endswith((".xhtml", ".opf", ".ncx")):
                try:
                    xml.dom.minidom.parseString(z.read(n))
                except Exception as e:
                    r.ajouter("BLOQUANT", n, f"XML mal formé : {e}")
        if not any("cover" in n.lower() for n in noms):
            r.ajouter("IMPORTANT", chemin.name, "pas d'image de couverture incorporée")
    r.note("Contrôle de structure seulement. L'aperçu Kindle (Kindle Previewer ou l'aperçu KDP au dépôt) reste à faire par l'auteur.")
    return r
