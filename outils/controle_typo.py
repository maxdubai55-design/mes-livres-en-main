"""Typographie française : corrections mécaniques sûres (--corriger) et contrôles."""
from __future__ import annotations
import re
from commun import Rapport

NBSP, FINE = "\u00a0", "\u202f"
LIGATURES = {"coeur": "cœur", "soeur": "sœur", "oeil": "œil", "oeuvre": "œuvre", "noeud": "nœud", "voeu": "vœu",
             "boeuf": "bœuf", "oeuf": "œuf", "manoeuvre": "manœuvre", "moeurs": "mœurs", "choeur": "chœur",
             "rancoeur": "rancœur", "foetus": "fœtus", "oesophage": "œsophage", "écoeur": "écœur", "ecoeur": "écœur"}
CAPITALES = {"Ca": "Ça", "Etait": "Était", "Etaient": "Étaient", "Etat": "État", "Eglise": "Église", "Ecole": "École",
             "Evidemment": "Évidemment", "Etrange": "Étrange", "Etonnant": "Étonnant", "Ecoute": "Écoute",
             "Ecoutez": "Écoutez", "Eric": "Éric", "Emile": "Émile", "Elise": "Élise", "Etienne": "Étienne",
             "Edouard": "Édouard", "Eté": "Été", "Etre": "Être", "Egalement": "Également", "Epuisé": "Épuisé"}
DOUBLES_ADMIS = {"nous", "vous", "non", "oui", "si", "très", "là", "bon", "ah", "oh", "eh", "ha", "hé", "tu", "que", "en", "plus"}


def corriger(texte: str) -> str:
    """Corrections typographiques mécaniques. N'altère jamais les mots ni la syntaxe."""
    lignes = []
    for ligne in texte.split("\n"):
        if ligne.startswith(("#", "%%")) or ligne.strip() in ("* * *", "***", "---"):
            lignes.append(ligne.rstrip())
            continue
        l = ligne.strip()
        l = l.replace("...", "…")
        l = re.sub(r"(?<=\w)'(?=\w)", "’", l)
        l = re.sub(r"(?<=[ldjmtsnc])'(?=[«\"])", "’", l, flags=re.I)
        # tirets de dialogue et incises
        l = re.sub(r"^(?:--|-|–)\s+", "— ", l)
        l = re.sub(r"\s--\s", " — ", l)
        l = re.sub(r"(?<=\S) – (?=\S)", " — ", l)
        # guillemets droits et anglais -> français, par alternance
        l = l.replace("“", '"').replace("”", '"')
        if l.count('"') and l.count('"') % 2 == 0:
            ouvre = True
            out = []
            for c in l:
                if c == '"':
                    out.append("«" if ouvre else "»")
                    ouvre = not ouvre
                else:
                    out.append(c)
            l = "".join(out)
        # espaces
        l = re.sub(r"[ \t]{2,}", " ", l)
        l = re.sub(r"[ \u00a0\u202f]+([,.])(?!\.)", r"\1", l)
        l = re.sub(r"«[ \u00a0\u202f]*", "«" + NBSP, l)
        l = re.sub(r"[ \u00a0\u202f]*»", NBSP + "»", l)
        l = re.sub(r"[ \u00a0\u202f]*([;!?]+)", lambda m: FINE + m.group(1), l)
        l = re.sub(r"(?<=[^\s\d:/])[ \u00a0\u202f]*:(?=\s|$)", NBSP + ":", l)
        l = re.sub(r"^" + FINE, "", l)
        l = re.sub(r"(?<=[«(])" + FINE + r"(?=[!?])", "", l)
        l = re.sub(r"^—[ \u00a0\u202f]*", "—" + NBSP, l)
        l = re.sub(r"([,;:!?»…])(?=[A-Za-zÀ-ÿ«])", r"\1 ", l)  # espace manquante après ponctuation
        l = re.sub(r"(?<=\d)" + r" (?=\d{3}\b)", FINE, l)  # milliers
        for a, b in LIGATURES.items():
            l = re.sub(a, b, l)
            l = re.sub(a.capitalize(), b.capitalize(), l)
        for a, b in CAPITALES.items():
            l = re.sub(rf"\b{a}\b", b, l)
        l = re.sub(r"\bA (?=(?:la|l’|partir|peine|présent|cet|cette|ce|force|mesure|côté|travers|quoi|qui|chaque|cause|moins|défaut|nouveau|vrai|droite|gauche|vous|toi|moi|lui|elle|eux|bientôt|demain|tout|quelle?s?|midi|minuit|\d)\b)", "À ", l)
        lignes.append(l)
    res = "\n".join(lignes)
    res = re.sub(r"\n{3,}", "\n\n", res)
    return res.rstrip("\n") + "\n"


def controler(p, chaps) -> Rapport:
    r = Rapport("Typographie et langue (contrôles mécaniques)")
    styles = {"tiret": 0, "guillemet": 0}
    titres = {}
    for ch in chaps:
        if not ch.titre:
            r.ajouter("BLOQUANT", ch.ref, "titre de chapitre absent (première ligne attendue : « # Titre »)")
        titres.setdefault(ch.titre.lower(), []).append(ch.ref)
        brut = ch.fichier.read_text(encoding="utf-8")
        if corriger(brut) != brut:
            r.ajouter("IMPORTANT", ch.ref, "typographie non normalisée — lancer : livre.py typo <slug> --corriger")
        ouv = sum(t.count("«") for _, t in ch.paragraphes)
        fer = sum(t.count("»") for _, t in ch.paragraphes)
        if ouv != fer:
            r.ajouter("IMPORTANT", ch.ref, f"guillemets déséquilibrés : {ouv} ouvrants, {fer} fermants")
        for num, t in ch.paragraphes:
            ou = f"{ch.ref}:{num}"
            if t.startswith("—"):
                styles["tiret"] += 1
            elif t.startswith("«"):
                styles["guillemet"] += 1
            if re.search(r"[\"']|\.\.\.", t):
                r.ajouter("IMPORTANT", ou, "guillemet droit, apostrophe droite ou points de suspension non typographiques")
            if t.count("(") != t.count(")"):
                r.ajouter("IMPORTANT", ou, "parenthèses déséquilibrées")
            if t.count("*") % 2:
                r.ajouter("IMPORTANT", ou, "astérisque d'italique non refermé")
            if re.search(r"\*\*|__|^#{1,6} |^>|^\s*[-+] |\]\(|<[a-z/]", t):
                r.ajouter("IMPORTANT", ou, "résidu de balisage (gras, liste, lien, HTML)")
            m = re.search(r"\b([A-Za-zÀ-ÿœ]{2,})\s+\1\b", t, re.I)
            if m and m.group(1).lower() not in DOUBLES_ADMIS:
                r.ajouter("IMPORTANT", ou, f"mot doublé : « {m.group(0)} »")
            nu = t.replace("*", "").rstrip()
            if not re.search(r"[.!?…»:—)]$", nu):
                r.ajouter("IMPORTANT", ou, f"paragraphe sans ponctuation finale : « …{nu[-30:]} »")
            debut = re.sub(r"^[—«\s\u00a0\u202f(]+", "", nu)
            if debut and debut[0].islower():
                r.ajouter("MINEUR", ou, f"paragraphe commençant par une minuscule : « {nu[:30]}… »")
            m = re.search(r"[a-zà-ÿ]\. [a-zà-ÿ]", nu)
            if m:
                r.ajouter("MINEUR", ou, f"minuscule après un point : « {nu[max(0, m.start()-15):m.end()+15]} »")
            if re.search(r"[,;:]\s*[.!?]|[!?]\.|\.\.|,,|;;", nu.replace("…", "")):
                r.ajouter("IMPORTANT", ou, "ponctuation doublée ou incohérente")
            if re.search(r"\b(?:M|Mme|Mlle|Dr|Me)\.? [a-zà-ÿ]", nu):
                r.ajouter("MINEUR", ou, "civilité suivie d'une minuscule")
            if len(t) > 2600:
                r.ajouter("MINEUR", ou, f"paragraphe très long ({len(t)} signes) — vérifier qu'il n'agrège pas plusieurs paragraphes")
    for t, refs in titres.items():
        if t and len(refs) > 1:
            r.ajouter("IMPORTANT", ", ".join(refs), f"titre de chapitre en double : « {t} »")
    nums = [c.numero for c in chaps]
    if nums and nums != list(range(nums[0], nums[0] + len(nums))):
        r.ajouter("BLOQUANT", "chapitres/", f"numérotation discontinue : {nums}")
    if styles["tiret"] and styles["guillemet"]:
        mino = min(styles.values())
        if mino / (styles["tiret"] + styles["guillemet"]) > 0.25:
            r.ajouter("MINEUR", "manuscrit", f"conventions de dialogue mêlées : {styles['tiret']} répliques au tiret, {styles['guillemet']} entre guillemets — vérifier que c'est voulu")
    if chaps:
        tailles = sorted(c.mots for c in chaps)
        med = tailles[len(tailles) // 2]
        for c in chaps:
            if med and (c.mots < 0.4 * med or c.mots > 2.2 * med):
                r.ajouter("INFO", c.ref, f"longueur atypique : {c.mots} mots (médiane {med})")
    r.note("Ce contrôle ne remplace pas la relecture orthographique et grammaticale : il n'attrape que les fautes mécaniques.")
    return r
