#!/usr/bin/env python3
"""Chaîne de production d'un livre. Usage : python3 outils/livre.py <commande> <slug> [options]

  init <slug> "<sujet>"        crée livres/<slug>/ à partir des modèles
  etat <slug>                  affiche l'avancement et la prochaine étape
  etape <slug> <id>            marque une étape comme faite (vérifie les préalables)
  typo <slug> [--corriger]     normalise la typographie française des chapitres
  controle <slug> [--chapitres 1-5]   lance tous les contrôles du texte, écrit un rapport
  version <slug> <V1|V2|V3|V3.1|VERSION_FINALE>   fige une version du manuscrit
  verrouiller <slug>           contrôles complets puis VERSION_DEFINITIVE_VERROUILLEE
  deverrouiller <slug> "<défaut précis>"   rouvre le manuscrit (motif consigné)
  fabriquer <slug> [--epreuve] Word, PDF intérieur, couverture, EPUB + vérifications KDP
  controle-final <slug>        tout revérifier et écrire RAPPORT_FINAL.md
"""
from __future__ import annotations
import argparse, datetime, hashlib, re, shutil, sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import commun, controle_slop, controle_typo, controle_continuite, controle_doublons
from commun import LIVRES, RACINE, projet, lire_json, ecrire_json, chapitres

ETAPES = [
    ("concept", "Concept développé (prompt 1)", False),
    ("stress_test", "Stress-test du concept et arbitrages (prompt 2)", True),
    ("bible", "Bible canonique + canon.json (prompt 3)", True),
    ("architecture", "Architecture chapitre par chapitre (prompt 4)", True),
    ("redaction", "Rédaction : préparation, écriture, révision, audits de bloc (prompts 5 à 8)", False),
    ("v1", "V1 — premier manuscrit complet figé", False),
    ("audit_global", "Audit du manuscrit complet (prompt 9)", False),
    ("v2", "V2 — corrections structurelles et continuité (prompt 10)", False),
    ("v3", "V3 — passe stylistique, langue, stop-slop", False),
    ("audit_final", "Audit final et dernières corrections (prompt 12)", False),
    ("titre_quatrieme", "Titre définitif, quatrième, métadonnées KDP", True),
    ("verrouillage", "Contrôle de verrouillage (prompt 11)", True),
    ("fabrication", "Word, PDF, EPUB, couverture", False),
    ("controle_final", "Contrôle final de tous les fichiers", False),
]
ETAPES_GUIDE = [
    ("plan", "Plan du fascicule : lecteur visé, promesse, chapitres", True),
    ("redaction", "Rédaction, révision et contrôles de chaque chapitre", False),
    ("verification", "Vérification des faits, numéros, noms de produits (audits/verification_faits.md)", True),
    ("titre_quatrieme", "Titre, quatrième, métadonnées KDP", True),
    ("verrouillage", "Contrôle de verrouillage", False),
    ("fabrication", "Word, PDF, EPUB, couverture", False),
    ("controle_final", "Contrôle final de tous les fichiers", False),
]


def etapes(p: Path):
    return ETAPES_GUIDE if commun.est_guide(p) else ETAPES


def ids(p: Path):
    return [e[0] for e in etapes(p)]


def aujourdhui() -> str:
    return datetime.date.today().isoformat()


def etat(p: Path) -> dict:
    return lire_json(p / "etat.json")


def empreinte(p: Path) -> tuple[str, int]:
    h, mots = hashlib.sha256(), 0
    for ch in chapitres(p):
        h.update(ch.fichier.read_bytes())
        mots += ch.mots
    return h.hexdigest(), mots


def cmd_init(a):
    slug = a.slug
    if not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", slug):
        raise SystemExit("Slug invalide : minuscules, chiffres et tirets uniquement (ex. le-phare-de-sete).")
    p = LIVRES / slug
    if p.exists():
        raise SystemExit(f"Le projet {slug} existe déjà.")
    shutil.copytree(RACINE / "modeles", p)
    for d in ("chapitres", "preparations", "audits", "versions", "sortie", "annexes", "voix"):
        (p / d).mkdir(exist_ok=True)
        (p / d / ".gitkeep").touch()
    cfg = lire_json(p / "livre.json")
    cfg["slug"], cfg["annee"] = slug, datetime.date.today().year
    if a.type == "guide":
        cfg.update(type="guide", mention_genre="guide pratique", fiction=False, auteur="Lucien Ligerot")
        cfg["couverture"].update(modele="serie", collection="Les Petits Guides de Lucien", numero=1, embleme="?", points=["", "", ""],
                                 accroche="", mention_serie="Gros caractères", fond="#1f5fa8", texte="#16202b", accent="#ffc83d")
        cfg["format"].update(largeur_cm=17.78, hauteur_cm=25.4, papier="blanc", corps=14, interligne=0.78,
                             police_titres="DejaVu Sans", pages_notes=1, marge_ext_cm=1.8, marge_haut_cm=2.0, marge_bas_cm=2.2)
        for f in ("bible.md", "architecture.md", "voix.md"):
            (p / f).unlink()
        (p / "plan.md").write_text("# Plan du fascicule\n\n## Lecteur visé\n\n## Promesse\n\n## Chapitres\n", encoding="utf-8")
    ecrire_json(p / "livre.json", cfg)
    ecrire_json(p / "etat.json", {"sujet": a.sujet, "cree": aujourdhui(), "etapes": {}, "versions": [], "verrou": None, "deverrouillages": []})
    (p / "concept.md").write_text(f"# Concept\n\n## Sujet donné par l'auteur\n\n{a.sujet}\n", encoding="utf-8")
    print(f"Projet créé : {p.relative_to(RACINE)}")


def cmd_etat(a):
    p = projet(a.slug)
    e = etat(p)
    print(f"Livre : {a.slug} — sujet : {e['sujet']}")
    suivante = None
    for ident, lib, valid in etapes(p):
        fait = ident in e["etapes"]
        if not fait and suivante is None:
            suivante = ident
        print(f"  [{'x' if fait else ' '}] {ident:<16} {lib}{'  (validation de l’auteur requise)' if valid else ''}{'  — ' + e['etapes'][ident] if fait else ''}")
    chs = chapitres(p)
    prevus = lire_json(p / "livre.json").get("chapitres_prevus", 0)
    print(f"Chapitres écrits : {len(chs)}/{prevus or '?'} — {sum(c.mots for c in chs)} mots")
    print(f"Versions : {', '.join(v['nom'] for v in e['versions']) or 'aucune'}")
    if e["verrou"]:
        intact = empreinte(p)[0] == e["verrou"]["sha256"]
        print(f"Verrou : posé le {e['verrou']['date']} — {'intact' if intact else 'ROMPU : le texte a changé depuis le verrouillage'}")
    print(f"Prochaine étape : {suivante or 'aucune — livre terminé'}")


def prealables(p: Path, ident: str) -> list[str]:
    manques = []
    e = etat(p)
    for prec in ids(p)[:ids(p).index(ident)]:
        if prec not in e["etapes"]:
            manques.append(f"étape antérieure non faite : {prec}")
    def plein(nom, mini=400):
        f = p / nom
        if not f.exists() or len(f.read_text(encoding="utf-8")) < mini:
            manques.append(f"{nom} absent ou trop court")
    cfg = lire_json(p / "livre.json")
    if ident == "plan":
        plein("plan.md", 800)
        if not cfg.get("chapitres_prevus"):
            manques.append("livre.json : chapitres_prevus non renseigné")
    if ident == "verification":
        plein("audits/verification_faits.md", 600)
    if ident in ("concept", "stress_test"):
        plein("concept.md", 1200)
    if ident == "stress_test":
        plein("audits/stress_test_concept.md")
    if ident == "bible":
        plein("bible.md", 3000)
        plein("voix.md")
        if not lire_json(p / "canon.json", defaut={}).get("personnages"):
            manques.append("canon.json sans personnages")
    if ident == "architecture":
        plein("architecture.md", 3000)
        if not cfg.get("chapitres_prevus"):
            manques.append("livre.json : chapitres_prevus non renseigné")
    if ident == "redaction":
        n = len(chapitres(p))
        if n < cfg.get("chapitres_prevus", 1):
            manques.append(f"{n} chapitres écrits sur {cfg.get('chapitres_prevus')}")
    if ident in ("v1", "v2", "v3"):
        if not any(v["nom"].upper().startswith(ident.upper()) for v in e["versions"]):
            manques.append(f"version {ident.upper()} non figée (commande : version)")
    if ident == "audit_global":
        plein("audits/audit_global.md", 1500)
    if ident == "audit_final":
        plein("audits/audit_final.md", 800)
    if ident == "verrouillage" and not e["verrou"]:
        manques.append("verrou non posé (commande : verrouiller)")
    if ident == "controle_final" and not (p / "RAPPORT_FINAL.md").exists():
        manques.append("RAPPORT_FINAL.md absent (commande : controle-final)")
    return manques


def cmd_etape(a):
    p = projet(a.slug)
    if a.id not in ids(p):
        raise SystemExit(f"Étape inconnue. Étapes : {', '.join(ids(p))}")
    manques = prealables(p, a.id)
    if manques:
        print("Étape refusée :")
        for m in manques:
            print("  -", m)
        raise SystemExit(1)
    e = etat(p)
    e["etapes"][a.id] = aujourdhui()
    ecrire_json(p / "etat.json", e)
    print(f"Étape « {a.id} » validée.")


def cmd_typo(a):
    p = projet(a.slug)
    n = 0
    for ch in chapitres(p):
        brut = ch.fichier.read_text(encoding="utf-8")
        neuf = controle_typo.corriger(brut, ch.guide)
        if neuf != brut:
            n += 1
            if a.corriger:
                ch.fichier.write_text(neuf, encoding="utf-8")
            print(f"{'corrigé' if a.corriger else 'à normaliser'} : {ch.fichier.name}")
    print(f"{n} fichier(s) {'corrigé(s)' if a.corriger else 'à normaliser'}.")


def lancer_controles(p: Path, plage=None):
    chs = chapitres(p, plage)
    if not chs:
        raise SystemExit("Aucun chapitre à contrôler.")
    r_cont, registre = controle_continuite.controler(p, chs)
    _, connus, _ = controle_continuite.charger_canon(p)
    rapports = [controle_typo.controler(p, chs), controle_slop.controler(p, chs), r_cont, controle_doublons.controler(p, chs, connus)]
    (p / "controles").mkdir(exist_ok=True)
    (p / "controles" / "registre_continuite.md").write_text(registre, encoding="utf-8")
    return chs, rapports


def ecrire_rapport(p: Path, nom: str, titre: str, rapports, entete: list[str]) -> bool:
    echec = any(r.echec for r in rapports)
    l = [f"# {titre}", "", f"Date : {aujourdhui()}", ""] + entete + ["", "| Contrôle | Résultat | Bloquant | Important | Mineur |", "|---|---|---|---|---|"]
    for r in rapports:
        l.append(f"| {r.titre} | {'ÉCHEC' if r.echec else 'RÉUSSI'} | {r.compte('BLOQUANT')} | {r.compte('IMPORTANT')} | {r.compte('MINEUR')} |")
    l += ["", f"**Verdict : {'ÉCHEC — corrections requises' if echec else 'RÉUSSI'}**", ""]
    l += [r.markdown() for r in rapports]
    (p / nom).parent.mkdir(exist_ok=True)
    (p / nom).write_text("\n".join(l), encoding="utf-8")
    for r in rapports:
        print(f"  {'ÉCHEC ' if r.echec else 'RÉUSSI'}  {r.titre} — bloquant {r.compte('BLOQUANT')}, important {r.compte('IMPORTANT')}, mineur {r.compte('MINEUR')}")
    print(f"Rapport : {(p / nom).relative_to(RACINE)}")
    return not echec


def cmd_controle(a):
    p = projet(a.slug)
    chs, rapports = lancer_controles(p, a.chapitres)
    suffixe = f"_ch{a.chapitres}" if a.chapitres else ""
    ok = ecrire_rapport(p, f"controles/rapport{suffixe}.md", f"Contrôles du texte{' — chapitres ' + a.chapitres if a.chapitres else ''}",
                        rapports, [f"Chapitres contrôlés : {len(chs)} — {sum(c.mots for c in chs)} mots"])
    sys.exit(0 if ok else 1)


def cmd_version(a):
    p = projet(a.slug)
    e = etat(p)
    if e["verrou"]:
        raise SystemExit("Manuscrit verrouillé : formuler le défaut précis et utiliser « deverrouiller ».")
    if not re.fullmatch(r"V\d+(?:\.\d+)?|VERSION_FINALE", a.nom):
        raise SystemExit("Nom attendu : V1, V2, V3, V3.1… ou VERSION_FINALE")
    import fabrication
    src = fabrication.assembler(p)
    dest = p / "versions" / f"{a.slug}_{a.nom}.md"
    shutil.copy(src, dest)
    h, mots = empreinte(p)
    e["versions"] = [v for v in e["versions"] if v["nom"] != a.nom] + [{"nom": a.nom, "date": aujourdhui(), "sha256": h, "mots": mots}]
    ecrire_json(p / "etat.json", e)
    print(f"Version figée : {dest.relative_to(RACINE)} ({mots} mots)")


def cmd_verrouiller(a):
    p = projet(a.slug)
    e = etat(p)
    for prec in ids(p)[:ids(p).index("verrouillage")]:
        if prec not in e["etapes"]:
            raise SystemExit(f"Verrouillage refusé : étape « {prec} » non faite.")
    chs, rapports = lancer_controles(p)
    if not ecrire_rapport(p, "controles/rapport_verrouillage.md", "Contrôles avant verrouillage", rapports, []):
        raise SystemExit("Verrouillage refusé : des contrôles échouent.")
    import fabrication
    src = fabrication.assembler(p)
    dest = p / "versions" / f"{a.slug}_VERSION_DEFINITIVE_VERROUILLEE.md"
    shutil.copy(src, dest)
    h, mots = empreinte(p)
    e["verrou"] = {"date": aujourdhui(), "sha256": h, "mots": mots}
    e["versions"].append({"nom": "VERSION_DEFINITIVE_VERROUILLEE", "date": aujourdhui(), "sha256": h, "mots": mots})
    e["etapes"]["verrouillage"] = aujourdhui()
    ecrire_json(p / "etat.json", e)
    print(f"Manuscrit verrouillé ({mots} mots). Empreinte : {h[:16]}…")


def cmd_deverrouiller(a):
    p = projet(a.slug)
    e = etat(p)
    if not e["verrou"]:
        raise SystemExit("Aucun verrou posé.")
    if len(a.motif.strip()) < 20:
        raise SystemExit("Motif trop vague : décrire le défaut précis (une préférence ne justifie pas de rouvrir).")
    e["deverrouillages"].append({"date": aujourdhui(), "motif": a.motif})
    e["verrou"] = None
    for ident in ("verrouillage", "fabrication", "controle_final"):
        e["etapes"].pop(ident, None)
    ecrire_json(p / "etat.json", e)
    print("Verrou levé. Motif consigné dans etat.json.")


def fabriquer_tout(p: Path, epreuve: bool):
    try:
        import typst  # noqa: F401
    except ImportError:
        raise SystemExit("Module manquant. Lancer d'abord : pip install -r requirements.txt")
    import fabrication, verif_kdp
    e = etat(p)
    if not epreuve:
        if not e["verrou"]:
            raise SystemExit("Fabrication définitive refusée : manuscrit non verrouillé (utiliser --epreuve pour un essai).")
        if empreinte(p)[0] != e["verrou"]["sha256"]:
            raise SystemExit("Fabrication refusée : le texte a changé depuis le verrouillage.")
    fabrication.assembler(p)
    docx = fabrication.word(p)
    pdf, pages = fabrication.interieur(p)
    r_int, pages = verif_kdp.interieur(p, pdf)
    info = fabrication.couverture(p, pages)
    r_couv = verif_kdp.couverture(p, info)
    ep = fabrication.epub(p, info["fichiers"]["ebook"])
    r_epub = verif_kdp.epub(ep)
    r_meta = verif_kdp.metadonnees(p)
    fichiers = [docx, pdf, ep] + list(info["fichiers"].values())
    return [r_int, r_couv, r_epub, r_meta], fichiers, pages, info


def cmd_fabriquer(a):
    p = projet(a.slug)
    rapports, fichiers, pages, info = fabriquer_tout(p, a.epreuve)
    ok = ecrire_rapport(p, "controles/rapport_fabrication.md", "Fabrication" + (" (ÉPREUVE)" if a.epreuve else ""), rapports,
                        [f"- `{f.relative_to(RACINE)}`" for f in fichiers] + ["", f"{pages} pages — dos {info['dos_cm']:.2f} cm"])
    if ok and not a.epreuve:
        e = etat(p)
        e["etapes"]["fabrication"] = aujourdhui()
        ecrire_json(p / "etat.json", e)
    sys.exit(0 if ok else 1)


def cmd_controle_final(a):
    p = projet(a.slug)
    e = etat(p)
    if not e["verrou"]:
        raise SystemExit("Contrôle final refusé : manuscrit non verrouillé.")
    chs, r_texte = lancer_controles(p)
    r_fab, fichiers, pages, info = fabriquer_tout(p, False)
    h, mots = empreinte(p)
    entete = [f"Livre : **{lire_json(p / 'livre.json')['titre']}** — {len(chs)} chapitres, {mots} mots, {pages} pages",
              f"Empreinte du texte verrouillé : `{h}`", "", "Fichiers à déposer sur KDP :"] + [f"- `{f.relative_to(RACINE)}`" for f in fichiers]
    entete += ["", "## Contrôles que la machine ne fait pas", "",
               "- Relecture humaine intégrale de l'épreuve PDF (ou de l'exemplaire d'épreuve KDP imprimé).",
               "- Examen visuel de l'épreuve de couverture (`*_couverture_EPREUVE.png`).",
               "- Aperçu du livre numérique dans Kindle Previewer ou dans l'aperçu KDP.",
               "- Vérification d'originalité externe (service anti-plagiat) si une preuve est souhaitée.",
               "- Déclaration du contenu généré par IA dans le formulaire KDP, conformément à `kdp.declaration_ia`."]
    ok = ecrire_rapport(p, "RAPPORT_FINAL.md", "Rapport final de contrôle", r_texte + r_fab, entete)
    with open(p / "RAPPORT_FINAL.md", "a", encoding="utf-8") as f:
        f.write(f"\n\n**PRÊT POUR DÉPÔT KDP (contrôles automatiques) : {'OUI' if ok else 'NON'}**\n")
    if ok:
        e = etat(p)
        e["etapes"]["fabrication"] = e["etapes"]["controle_final"] = aujourdhui()
        ecrire_json(p / "etat.json", e)
    print(f"PRÊT POUR DÉPÔT KDP (contrôles automatiques) : {'OUI' if ok else 'NON'}")
    sys.exit(0 if ok else 1)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sp = ap.add_subparsers(dest="cmd", required=True)
    def sous(nom, fn, *args):
        s = sp.add_parser(nom); s.add_argument("slug"); s.set_defaults(fn=fn)
        for nom_arg, kw in args:
            s.add_argument(nom_arg, **kw)
    sous("init", cmd_init, ("sujet", {}), ("--type", {"choices": ["roman", "guide"], "default": "roman"}))
    sous("etat", cmd_etat)
    sous("etape", cmd_etape, ("id", {}))
    sous("typo", cmd_typo, ("--corriger", {"action": "store_true"}))
    sous("controle", cmd_controle, ("--chapitres", {"default": None}))
    sous("version", cmd_version, ("nom", {}))
    sous("verrouiller", cmd_verrouiller)
    sous("deverrouiller", cmd_deverrouiller, ("motif", {}))
    sous("fabriquer", cmd_fabriquer, ("--epreuve", {"action": "store_true"}))
    sous("controle-final", cmd_controle_final)
    a = ap.parse_args()
    a.fn(a)


if __name__ == "__main__":
    main()
