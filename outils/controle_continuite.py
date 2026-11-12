"""Continuité : noms propres contre le canon, graphies divergentes, éléments interdits,
registre des âges et des repères temporels (à relire), présence des personnages."""
from __future__ import annotations
import re, unicodedata
from collections import Counter, defaultdict
from commun import Rapport, lire_json, phrases

NOM_PROPRE = re.compile(r"\b[A-ZÀ-ÖØ-ÞŒ][a-zà-öø-ÿœ]+(?:-[A-ZÀ-ÖØ-ÞŒ][a-zà-öø-ÿœ]+)*\b")
COURANTS = {"Dieu", "Monsieur", "Madame", "Mademoiselle", "Messieurs", "Mesdames", "Maman", "Papa", "Noël", "Pâques",
            "Toussaint", "État", "Église", "Bible", "Internet", "Terre", "Lune", "Soleil", "Nord", "Sud", "Est", "Ouest",
            "Mme", "Mlle", "Seigneur", "Père", "Mère", "Docteur", "Maître", "Dr", "Me", "Saint", "Sainte", "Mon", "Ma"}
NOMBRES = r"(?:\d{1,3}|un|deux|trois|quatre|cinq|six|sept|huit|neuf|dix|onze|douze|treize|quatorze|quinze|seize|dix-sept|dix-huit|dix-neuf|vingt(?:[- ]et[- ]un|-\w+)?|trente(?:[- ]et[- ]un|-\w+)?|quarante(?:[- ]et[- ]un|-\w+)?|cinquante(?:[- ]et[- ]un|-\w+)?|soixante(?:[- ]et[- ]onze|-\w+)*|quatre-vingt(?:s|-\w+)*|cent)"
AGE = re.compile(rf"\b{NOMBRES} ans\b", re.I)
TEMPS = re.compile(
    r"\b(?:lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche|janvier|février|mars|avril|mai|juin|juillet|août|septembre|"
    r"octobre|novembre|décembre|printemps|automne|hiver|le lendemain|la veille|l[’']avant-veille|le surlendemain|"
    r"(?:\w+|\d+) (?:jours?|semaines?|mois|ans|années|heures) (?:plus tard|plus tôt|auparavant|après|avant)|"
    r"depuis (?:\w+|\d+) (?:jours?|semaines?|mois|ans|années)|il y a(?:vait)? (?:\w+|\d+) (?:jours?|semaines?|mois|ans|années)|"
    r"\d{1,2} ?h(?:eures?)? ?\d{0,2}|(?:1[0-9]|20)\d{2})\b", re.I)


def _plat(s: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", s.lower()) if unicodedata.category(c) != "Mn").replace("-", "")


def _distance(a: str, b: str) -> int:
    if abs(len(a) - len(b)) > 2:
        return 9
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        cur = [i]
        for j, cb in enumerate(b, 1):
            cur.append(min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (ca != cb)))
        prev = cur
    return prev[-1]


def charger_canon(p):
    canon = lire_json(p / "canon.json", defaut={})
    connus, persos = set(), {}
    for pers in canon.get("personnages", []):
        formes = [pers.get("nom", "")] + pers.get("alias", [])
        persos[pers.get("nom", "?")] = [f for f in formes if f]
        for f in formes:
            connus.update(NOM_PROPRE.findall(f))
    for cle in ("lieux", "autres_noms_propres"):
        for f in canon.get(cle, []):
            connus.update(NOM_PROPRE.findall(f))
    return canon, connus, persos


def controler(p, chaps) -> tuple[Rapport, str]:
    r = Rapport("Continuité et canon")
    canon, connus, persos = charger_canon(p)
    if not canon.get("personnages"):
        r.ajouter("BLOQUANT", "canon.json", "aucun personnage au canon : la continuité ne peut pas être contrôlée")
    inconnus, premiere = Counter(), {}
    divergents = defaultdict(set)
    plats = {_plat(k): k for k in connus}
    ages, temps = [], []
    presence = {nom: Counter() for nom in persos}
    for ch in chaps:
        for num, t in ch.paragraphes:
            ou = f"{ch.ref}:{num}"
            for motif in canon.get("interdits", []):
                if re.search(motif, t, re.I):
                    r.ajouter("BLOQUANT", ou, f"élément interdit par la bible : « {motif} »")
            for nom, formes in persos.items():
                for f in formes:
                    presence[nom][ch.numero] += len(re.findall(rf"\b{re.escape(f.split()[0])}\b", t)) if f == formes[0] else len(re.findall(rf"\b{re.escape(f)}\b", t))
            for ph in phrases(t):
                nu = re.sub(r"^[—«\s  (*]+", "", ph)
                for m in NOM_PROPRE.finditer(nu):
                    mot = m.group(0)
                    if mot in connus or mot in COURANTS:
                        continue
                    pl = _plat(mot)
                    proche = None
                    if pl in plats and plats[pl] != mot:
                        proche = plats[pl]
                    elif len(pl) >= 5:
                        for kp, k in plats.items():
                            if len(kp) >= 5 and 0 < _distance(pl, kp) <= 1:
                                proche = k
                                break
                    if proche:
                        divergents[(mot, proche)].add(ou)
                        continue
                    avant = nu[:m.start()].rstrip(" \u00a0\u202f*")
                    if not avant or avant[-1] in ".!?…«:—–(\"“":      # majuscule de début de phrase ou de réplique : non concluant
                        continue
                    inconnus[mot] += 1
                    premiere.setdefault(mot, ou)
                for m in AGE.finditer(ph):
                    ages.append((ou, m.group(0), ph))
            for m in TEMPS.finditer(t):
                ctx = t[max(0, m.start() - 50):m.end() + 50].strip()
                temps.append((ou, m.group(0), ctx))
    for (mot, proche), lieux in sorted(divergents.items()):
        r.ajouter("BLOQUANT", ", ".join(sorted(lieux)[:4]), f"graphie divergente : « {mot} » alors que le canon écrit « {proche} »")
    for mot, n in inconnus.most_common():
        r.ajouter("IMPORTANT", premiere[mot], f"nom propre absent du canon : « {mot} » ({n} occ.) — l'ajouter à canon.json s'il est validé, sinon corriger")
    nums = [c.numero for c in chaps]
    for nom, c in presence.items():
        if nums and sum(c.values()) == 0:
            r.ajouter("INFO", "canon.json", f"« {nom} » figure au canon mais n'apparaît dans aucun chapitre contrôlé")
    # Registre à relire (la machine liste, l'auteur ou l'IA vérifie contre la bible)
    reg = ["# Registre de continuité", "", "Document de travail produit automatiquement. Chaque ligne doit être confrontée à la bible et à la chronologie.", ""]
    reg += ["## Présence des personnages par chapitre", "", "| Personnage | " + " | ".join(str(n) for n in nums) + " |", "|---|" + "---|" * len(nums)]
    for nom, c in presence.items():
        reg.append(f"| {nom} | " + " | ".join(str(c.get(n, 0) or "·") for n in nums) + " |")
    reg += ["", "## Âges mentionnés", ""] + [f"- `{o}` **{a}** — {ph}" for o, a, ph in ages]
    reg += ["", "## Repères temporels", ""] + [f"- `{o}` **{a}** — …{c}…" for o, a, c in temps]
    chrono = canon.get("chronologie", [])
    if chrono:
        reg += ["", "## Chronologie canonique (rappel)", ""] + [f"- ch. {e.get('chapitre', '?')} : {e.get('date', '?')} — {e.get('note', '')}" for e in chrono]
    r.note(f"Registre : {len(ages)} mentions d'âge et {len(temps)} repères temporels listés dans controles/registre_continuite.md — à relire contre la bible.")
    return r, "\n".join(reg) + "\n"
