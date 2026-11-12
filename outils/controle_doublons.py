"""Doublons internes : phrases répétées à l'identique, formules récurrentes, répétitions rapprochées.
Ce contrôle est interne au manuscrit ; il ne compare pas le texte aux livres publiés."""
from __future__ import annotations
import re, unicodedata
from collections import defaultdict, Counter
from commun import Rapport, MOT, phrases, exceptions, est_excepte

VIDES = set("""le la les un une des de du d l au aux et ou mais donc or ni car que qui quoi dont où ce cet cette ces se sa son ses
leur leurs il elle ils elles on je tu nous vous me te lui y en ne pas plus à dans sur sous par pour avec sans vers chez est
était avait a ont été être avoir fait faire comme si tout tous toute toutes même aussi très bien encore déjà puis alors
quand lorsque parce depuis pendant entre après avant devant derrière jamais toujours rien quelque chose peu trop""".split())


def _norm(s: str) -> str:
    s = "".join(c for c in unicodedata.normalize("NFD", s.lower()) if unicodedata.category(c) != "Mn")
    return " ".join(MOT.findall(s))


def controler(p, chaps, noms_canon=()) -> Rapport:
    r = Rapport("Doublons et répétitions internes")
    exc = exceptions(p, "doublons")
    vues = defaultdict(list)
    grammes = defaultdict(set)
    noms = {n.lower() for n in noms_canon}
    ouvertures = defaultdict(list)
    for ch in chaps:
        paras = ch.paragraphes
        if paras:
            ouvertures[" ".join(_norm(paras[0][1]).split()[:4])].append(ch.ref)
        for num, t in paras:
            ou = f"{ch.ref}:{num}"
            for ph in phrases(t):
                n = _norm(ph)
                k = len(n.split())
                if k >= 6:
                    vues[n].append((ou, ph, ch.ref))
            mots = _norm(t).split()
            for i in range(len(mots) - 5):
                grammes[" ".join(mots[i:i + 6])].add(ou)
            # répétition rapprochée : même mot plein 3 fois dans une fenêtre de 60 mots
            brut = [m.lower() for m in MOT.findall(t)]
            signale = set()
            for i, m in enumerate(brut):
                if len(m) < 6 or m in VIDES or m in noms or m in signale:
                    continue
                if brut[i:i + 60].count(m) >= 3:
                    signale.add(m)
                    if not est_excepte(exc, ch.ref, t):
                        r.ajouter("MINEUR", ou, f"répétition rapprochée : « {m} » ×{brut[i:i + 60].count(m)} en moins de 60 mots")
    for n, occ in vues.items():
        if len(occ) < 2:
            continue
        if all(est_excepte(exc, ref, ph) for _, ph, ref in occ):
            continue
        k = len(n.split())
        niveau = "IMPORTANT" if k >= 9 else "MINEUR"
        r.ajouter(niveau, ", ".join(o for o, _, _ in occ[:5]), f"phrase répétée à l'identique ({len(occ)}×, {k} mots) : « {occ[0][1][:110]} »")
    frequents = [(g, l) for g, l in grammes.items() if len(l) >= 4 and sum(1 for w in g.split() if w not in VIDES) >= 3]
    for g, l in sorted(frequents, key=lambda x: -len(x[1]))[:25]:
        r.ajouter("MINEUR", ", ".join(sorted(l)[:5]), f"formule récurrente ({len(l)}×) : « {g} »")
    for debut, refs in ouvertures.items():
        if debut and len(refs) > 1:
            r.ajouter("MINEUR", ", ".join(refs), f"chapitres ouverts par les mêmes mots : « {debut}… »")
    r.note("Portée : doublons internes uniquement. L'originalité vis-à-vis des œuvres publiées relève du stress-test du concept, des règles de rédaction et, si l'on veut une preuve, d'un service anti-plagiat externe.")
    return r
