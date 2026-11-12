"""Détection des tics d'écriture IA (stop-slop, niveau 2 — standard).

Le détecteur signale ; il ne corrige jamais. Chaque occurrence est soit reprise,
soit arbitrée « à conserver » dans controles/exceptions_slop.txt (chNN: fragment).
"""
from __future__ import annotations
import re, statistics
from commun import Rapport, MOT, phrases, exceptions, est_excepte

I = re.I
# Résidus de génération : aucun n'est tolérable dans un manuscrit.
RESIDUS = [
    r"\[(?:IDÉE|IDEE|N°|X|Y|TODO|À COMPLÉTER|A COMPLETER|NOM|LIEU|DATE)[^\]]*\]",
    r"\bTODO\b", r"\bXXX\b", r"lorem ipsum", r"```",
    r"en tant qu[e’' ]+(?:IA|intelligence artificielle|modèle de langage|assistant)",
    r"\bvoici (?:le|la|une|ton|votre) (?:chapitre|version|scène|réécriture|suite|texte)",
    r"j[’']espère que (?:ce|cela|cette)", r"n[’']hésite[zs]? pas à",
    r"\b(?:ChatGPT|GPT-\d|Claude|Gemini)\b", r"^\s*(?:Note|N\.B\.) de l[’']auteur", r"\(suite\)\s*$",
]

# (catégorie, étiquette, motif)
SIGNAUX = [
    # Formules creuses et chevilles
    ("formule creuse", "cheville", r"\b(?:force est de constater|il (?:convient|est important) de (?:noter|souligner|rappeler)|il va sans dire|en fin de compte|au bout du compte|à vrai dire|en d[’']autres termes|d[’']une certaine manière|en quelque sorte|pour ainsi dire|à bien des égards|quoi qu[’']il en soit)\b"),
    ("formule creuse", "temps suspendu", r"le temps (?:sembla(?:it)?|parut|paraissait|s[’']était|s[’']est) (?:s[’']arrêter|se suspendre|se figer|arrêté|suspendu|figé)"),
    ("formule creuse", "instant précis", r"à cet instant précis|en cet instant|à ce moment précis"),
    ("formule creuse", "quelque chose en lui/elle", r"quelque chose (?:en (?:lui|elle|eux)|au fond d[’'](?:elle|eux)|au fond de lui|dans sa poitrine|dans son regard) (?:se |s[’'])?\w+"),
    ("formule creuse", "sans crier gare / malgré lui", r"\bsans crier gare\b|\bmalgré (?:lui|elle)\b|ne p(?:ut|ouvait|urent) s[’']empêcher de"),
    ("formule creuse", "poids/vague abstraits", r"\ble poids (?:de|des|du) (?:années|silence|passé|monde|secret|culpabilité|souvenirs?|mots)\b|\bune vague d(?:e |[’'])(?:émotion|tristesse|chaleur|panique|nostalgie|soulagement|colère|angoisse)"),
    ("formule creuse", "mélange de X et de Y", r"\bun (?:étrange |curieux |subtil )?mélange d(?:e |[’'])\w+ et d(?:e |[’'])\w+"),
    # Métaphores génériques
    ("métaphore générique", "tapisserie/symphonie/ballet/danse", r"\b(?:tapisserie|symphonie|kaléidoscope|mosaïque|ballet|chorégraphie) (?:de|d[’']|des)\b|\bune danse (?:de|d[’']|entre)\b"),
    ("métaphore générique", "silence qualifié", r"\bsilence (?:pesant|assourdissant|de mort|lourd de sens|de plomb|épais|éloquent|chargé)\b|\bun silence (?:s[’']installa|tomba|s[’']abattit|s[’']étira)"),
    ("métaphore générique", "comparaison usée", r"comme (?:un coup de poing|une évidence|si de rien n[’']était|une gifle|un couperet|une lame|un étau|une chape de plomb|un automate|une ombre)\b"),
    ("métaphore générique", "lueur/éclat dans les yeux", r"\b(?:une |cette )?(?:lueur|étincelle|éclat|ombre) (?:\w+ )?(?:dans|traversa|passa dans|au fond de) (?:ses|son|leurs?|les) (?:yeux|regard|prunelles)"),
    # Réactions corporelles automatiques
    ("réaction corporelle", "cœur", r"\b(?:son|mon|le) cœur (?:se serra|se serrait|battait la chamade|manqua un battement|rata un battement|s[’']emballa|s[’']emballait|cognait|tambourinait|bondit|fit un bond)"),
    ("réaction corporelle", "souffle", r"\bretint (?:son|sa) (?:souffle|respiration)|\ble souffle (?:coupé|court)|\bsouffle (?:se bloqua|se coupa)|(?:laissa|laissait) échapper un (?:soupir|souffle|rire|sanglot|gémissement)|poussa un (?:long |profond )?soupir|\binspira profondément|prit une (?:grande|profonde|longue) inspiration"),
    ("réaction corporelle", "frisson", r"\bun frisson (?:lui |le |la )?(?:parcourut|parcourait|remonta|courut|glacé)|frissonna malgré"),
    ("réaction corporelle", "gorge/estomac/mâchoire", r"\bla gorge (?:nouée|serrée|sèche)|\b(?:sa|une) gorge se (?:noua|serra)|\bune boule (?:dans|au creux de) (?:la gorge|le ventre|l[’']estomac)|\b(?:l[’']|son )estomac (?:noué|se noua|se contracta)|\bmâchoires? (?:crispées?|serrées?|se crispa|se contracta)|\bserra les (?:dents|poings|mâchoires)|\bdéglutit\b"),
    ("réaction corporelle", "yeux", r"\byeux (?:s[’']écarquillèrent|s[’']agrandirent|se plissèrent|s[’']embuèrent|s[’']embuaient)|écarquilla les yeux|leva les yeux au ciel|\bfronça les sourcils|haussa (?:un sourcil|les sourcils|les épaules)"),
    ("réaction corporelle", "sourire", r"\bun (?:léger |petit |mince |faible |triste |pâle )?sourire (?:étira|flotta|se dessina|naquit|effleura|éclaira|fendit)|esquissa un (?:léger |petit |pâle )?sourire|sourire (?:en coin|sans joie|qui n[’']atteignit pas)"),
    ("réaction corporelle", "regard", r"\b(?:leurs|les) regards se (?:croisèrent|trouvèrent|rencontrèrent)|soutint son regard|\bun regard (?:entendu|appuyé|lourd de sens|qui en disait long)|planta (?:son regard|ses yeux) dans"),
    ("réaction corporelle", "hochement", r"\bhocha (?:lentement |doucement |imperceptiblement )?la tête|acquiesça d[’']un (?:signe|hochement)|secoua (?:lentement |doucement )?la tête"),
    # Oppositions artificielles
    ("opposition artificielle", "ce n'était pas X, c'était Y", r"ce n[’']était pas (?:(?!\.).){3,90}?[,;:—–]\s*(?:c[’']était|mais)\b"),
    ("opposition artificielle", "ce n'est pas X, c'est Y", r"ce n[’']est pas (?:(?!\.).){3,90}?[,;:—–]\s*c[’']est\b"),
    ("opposition artificielle", "non pas… mais", r"\bnon (?:pas|plus) (?:(?!\.).){3,70}?,? mais\b"),
    ("opposition artificielle", "pas seulement… mais", r"\bpas (?:seulement|simplement|uniquement) (?:(?!\.).){3,70}?,? mais (?:aussi|également|surtout)?"),
    ("opposition artificielle", "Pas X. Y.", r"(?:^|[.!?…]\s)Pas (?:de |d[’']|un |une |par |pour )?[\wé’' -]{2,25}\. [A-ZÀÉ][\wé’' -]{2,30}\."),
    # Fausses intensifications
    ("intensificateur", "adverbe vague", r"\b(?:véritablement|littéralement|profondément|incroyablement|absolument|terriblement|infiniment|indéniablement|étrangement|presque imperceptiblement|imperceptiblement|indiciblement|inexorablement|inéluctablement|viscéralement)\b"),
    ("intensificateur", "adjectif générique", r"\b(?:palpable|indicible|ineffable|indescriptible|incommensurable|vertigineu(?:x|se)|abyssal(?:e)?|insondable|implacable|inexorable|assourdissant(?:e)?|envoûtant(?:e)?|captivant(?:e)?|fascinant(?:e)?|saisissant(?:e)?|poignant(?:e)?|bouleversant(?:e)?)s?\b"),
    ("intensificateur", "tout/rien totalisant", r"\b(?:tout|rien) (?:avait|venait de|allait) (?:changé|changer|basculé|basculer)\b|plus rien ne serait (?:jamais )?comme avant|rien ne serait plus (?:jamais )?comme avant"),
    # Verbes-valises
    ("verbe-valise", "sembler/paraître + infinitif", r"\b(?:semblait|semblaient|sembla|paraissait|paraissaient|parut) (?:\w+ )?(?:vouloir|dire|porter|contenir|peser|flotter|vibrer|retenir|murmurer|attendre|hésiter)\b"),
    ("verbe-valise", "se mettre à / commencer à en série", r"\bse (?:mit|mirent) à (?:\w+er|\w+ir|\w+re)\b"),
    ("verbe-valise", "réaliser/comprendre soudain", r"\b(?:réalisa|comprit|sut|sentit) (?:alors |soudain |brusquement |enfin )?que\b"),
    # Bilans émotionnels / explication après la scène
    ("bilan émotionnel", "il/elle se sentait + adjectif", r"\b(?:il|elle|je) (?:se sentait|se sentit|me sentais|me sentis) (?:\w+ )?(?:vide|seul|seule|perdu|perdue|soulagé|soulagée|coupable|trahi|trahie|épuisé|épuisée|étrangement \w+|à la fois)"),
    ("bilan émotionnel", "à la fois X et Y", r"\bà la fois (?:\w+ ){1,3}et (?:\w+)"),
    ("bilan émotionnel", "pour la première fois depuis", r"pour la première fois (?:depuis (?:longtemps|des (?:années|mois|semaines)|\w+)|de sa vie)"),
    ("bilan émotionnel", "savait que / comprenait que rien", r"\b(?:il|elle) (?:savait|comprenait|comprit) (?:désormais |maintenant |alors )?qu(?:e |[’'])(?:rien|tout|plus jamais|il était trop tard)"),
]
SIGNAUX = [(c, e, re.compile(m, I)) for c, e, m in SIGNAUX]
RESIDUS = [re.compile(m, I | re.M) for m in RESIDUS]

# Clôtures sentencieuses : examinées sur la dernière phrase de chaque scène et de chaque chapitre.
CLOTURE = re.compile(
    r"plus jamais|pour toujours|à jamais|rien ne serait|tout (?:allait|venait de) changer|ne faisait que commencer|"
    r"pour la première fois|et c[’']était (?:suffisant|assez|bien ainsi|tout ce qui comptait|déjà beaucoup)|il était temps|"
    r"quelque chose (?:avait|venait de) (?:changé|basculé|se briser)|\bdésormais\b|\ble destin\b|\bla vérité\b|"
    r"peut-être (?:était-ce|que c[’']était) (?:cela|ça)|\bau fond\b|parfois,? (?:il suffit|cela suffit)|"
    r"c[’']est (?:cela|ça),? (?:la vie|aimer|vivre|grandir)|le reste (?:pouvait|pourrait) attendre|\bl[’']avenir\b|\bl[’']espoir\b", I)

# Mots de remplissage dont la densité trahit le texte généré (seuil pour 1 000 mots).
DENSITES = {
    "regard(s)": (r"\bregards?\b", 3.0), "sourire(s)": (r"\bsouri(?:re|res|t|ait|aient|ant)\b", 3.0),
    "souffle/soupir": (r"\b(?:souffles?|soupirs?|soupira|soupirait)\b", 2.0), "silence": (r"\bsilences?\b", 2.5),
    "cœur": (r"\bcœurs?\b", 2.5), "murmura/souffla/chuchota": (r"\b(?:murmura|souffla|chuchota|murmurait)\b", 2.0),
    "soudain/brusquement": (r"\b(?:soudain|soudainement|brusquement|tout à coup)\b", 1.5),
    "comme si": (r"\bcomme si\b", 2.0), "sembler/paraître": (r"\b(?:sembl|paraiss)\w+", 3.0),
}
TRIADE = re.compile(r"\b[\wé’'-]{3,}(?: [\wé’'-]+){0,2}, [\wé’'-]{3,}(?: [\wé’'-]+){0,2},? et [\wé’'-]{3,}")
ADVERBE = re.compile(r"\b\w{4,}ment\b", I)
FAUX_ADVERBES = {"moment", "comment", "vêtement", "mouvement", "sentiment", "bâtiment", "appartement", "événement",
                 "logement", "gouvernement", "changement", "argument", "document", "monument", "élément", "instrument",
                 "tourment", "serment", "ciment", "jument", "aliment", "testament", "régiment", "firmament", "froment",
                 "enterrement", "tremblement", "hurlement", "grondement", "battement", "craquement", "claquement",
                 "grincement", "frémissement", "bruissement", "sifflement", "glissement", "ronflement", "traitement",
                 "paiement", "médicament", "compartiment", "département", "jugement", "commencement", "soulagement",
                 "étonnement", "ornement", "froissement", "éclatement", "campement", "isolement", "abattement"}

SEUIL_DENSITE = 3.0      # signaux non arbitrés pour 1 000 mots, par chapitre
SEUIL_TRIADES = 3.0
SEUIL_ADVERBES = 14.0
SEUIL_INCISES = 4.0


def _p1000(n: int, mots: int) -> float:
    return 1000 * n / max(mots, 1)


def controler(p, chaps) -> Rapport:
    r = Rapport("Tics d'écriture IA (stop-slop)")
    exc = exceptions(p, "slop")
    conserves = 0
    for ch in chaps:
        mots = ch.mots
        if mots == 0:
            r.ajouter("BLOQUANT", ch.ref, "chapitre vide")
            continue
        n_signaux = 0
        for num, texte in ch.paragraphes:
            ou = f"{ch.ref}:{num}"
            for rx in RESIDUS:
                for m in rx.finditer(texte):
                    r.ajouter("BLOQUANT", ou, f"résidu de génération : « {m.group(0)} »")
            for cat, etiq, rx in SIGNAUX:
                for m in rx.finditer(texte):
                    occ = m.group(0).strip()
                    if any(a in ("*", ch.ref) and b in texte and (occ in b or b in occ) for a, b in exc):
                        conserves += 1
                        continue
                    n_signaux += 1
                    r.ajouter("MINEUR", ou, f"{cat} — {etiq} : « {m.group(0).strip()} »")
        d = _p1000(n_signaux, mots)
        if d > SEUIL_DENSITE:
            r.ajouter("IMPORTANT", ch.ref, f"densité de tics {d:.1f} pour 1 000 mots (seuil {SEUIL_DENSITE}) — {n_signaux} signaux sur {mots} mots : reprendre ou arbitrer")
        # Densités lexicales
        t = ch.texte
        for nom, (motif, seuil) in DENSITES.items():
            n = len(re.findall(motif, t, I))
            if n >= 4 and _p1000(n, mots) > seuil:
                r.ajouter("IMPORTANT", ch.ref, f"remplissage « {nom} » : {n} occurrences ({_p1000(n, mots):.1f}/1 000, seuil {seuil})")
        n_tri = len(TRIADE.findall(t))
        if n_tri >= 4 and _p1000(n_tri, mots) > SEUIL_TRIADES:
            r.ajouter("IMPORTANT", ch.ref, f"triades (A, B et C) : {n_tri} ({_p1000(n_tri, mots):.1f}/1 000, seuil {SEUIL_TRIADES})")
        adv = [a for a in ADVERBE.findall(t) if a.lower() not in FAUX_ADVERBES]
        if _p1000(len(adv), mots) > SEUIL_ADVERBES:
            r.ajouter("MINEUR", ch.ref, f"adverbes en -ment : {len(adv)} ({_p1000(len(adv), mots):.1f}/1 000, seuil {SEUIL_ADVERBES})")
        incises = sum(len(re.findall(r"(?<=\S)[\s\u00a0\u202f][—–][\s\u00a0\u202f]", tx)) for _, tx in ch.paragraphes)
        if incises >= 4 and _p1000(incises, mots) > SEUIL_INCISES:
            r.ajouter("IMPORTANT", ch.ref, f"incises au tiret : {incises} ({_p1000(incises, mots):.1f}/1 000, seuil {SEUIL_INCISES})")
        # Répétitions syntaxiques : trois phrases consécutives ouvertes par le même mot
        for num, texte in ch.paragraphes:
            if texte.lstrip().startswith(("—", "–", "«")):
                continue
            ph = phrases(texte)
            debuts = [(MOT.findall(s) or [""])[0].lower() for s in ph]
            for i in range(len(debuts) - 2):
                if debuts[i] and debuts[i] == debuts[i + 1] == debuts[i + 2]:
                    if not est_excepte(exc, ch.ref, texte):
                        r.ajouter("MINEUR", f"{ch.ref}:{num}", f"anaphore : trois phrases de suite commencent par « {debuts[i]} »")
                    break
        # Monotonie du rythme
        longueurs = [len(MOT.findall(s)) for _, tx in ch.paragraphes for s in phrases(tx)]
        longueurs = [x for x in longueurs if x > 0]
        if len(longueurs) >= 40:
            ecart = statistics.pstdev(longueurs)
            if ecart < 4.5:
                r.ajouter("IMPORTANT", ch.ref, f"rythme monotone : écart-type des longueurs de phrase {ecart:.1f} mots (attendu ≥ 4,5)")
        # Clôtures de scène et de chapitre
        fins = []
        prec = None
        for num, kind, texte in ch.elements:
            if kind == "sep" and prec:
                fins.append((prec, "fin de scène"))
            if kind == "p":
                prec = (num, texte)
        if prec:
            fins.append((prec, "fin de chapitre"))
        for (num, texte), quoi in fins:
            ph = phrases(texte)
            derniere = ph[-1] if ph else texte
            if CLOTURE.search(derniere) and len(MOT.findall(derniere)) <= 22:
                if est_excepte(exc, ch.ref, texte):
                    conserves += 1
                else:
                    r.ajouter("IMPORTANT", f"{ch.ref}:{num}", f"clôture sentencieuse possible ({quoi}) : « {derniere} »")
    r.note(f"Occurrences arbitrées « à conserver » : {conserves}.")
    return r
