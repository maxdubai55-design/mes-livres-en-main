---
name: livre
description: Chef d'orchestre de la fabrication d'un livre. « /livre <sujet> » démarre un nouveau livre ; « /livre » ou « /livre <slug> » reprend le livre en cours à sa prochaine étape et enchaîne jusqu'au prochain point de validation.
---

# /livre — du sujet au dépôt KDP

Argument : `$ARGUMENTS` (un sujet pour un nouveau livre, un slug pour reprendre, ou rien).

## Démarrer

1. Sans argument : lister `livres/`. Un seul livre en cours → le reprendre. Plusieurs → demander lequel. Aucun → demander le sujet.
2. Nouveau sujet : choisir un slug court, puis `python3 outils/livre.py init <slug> "<sujet>"`.
3. Demander à l'auteur, une seule fois et sans bloquer la suite : genre visé, longueur visée, et s'il peut déposer
   dans `livres/<slug>/voix/` quelques pages écrites de sa main. Sans ces pages, la voix du livre sera une
   proposition à valider sur le chapitre 1.

## Avancer

À chaque reprise : `python3 outils/livre.py etat <slug>`, puis exécuter l'étape indiquée avec la commande
correspondante, la valider avec `livre.py etape <slug> <id>`, faire un commit, et continuer.

| Étape | Commande | Arrêt pour validation |
|---|---|---|
| concept, stress_test | /livre-concept | oui, après le stress-test |
| bible | /livre-bible | oui |
| architecture | /livre-architecture | oui |
| redaction | /livre-chapitre pour chaque chapitre ; /livre-audit-bloc tous les 4 à 5 chapitres et à mi-parcours | non |
| v1, audit_global, v2, v3, audit_final | /livre-audit-global | non |
| titre_quatrieme, verrouillage | /livre-verrouillage | oui |
| fabrication, controle_final | /livre-fabrication | non |

Un roman complet demande plusieurs séances. À chaque fin de séance, dire où l'on en est : étape, chapitres écrits,
rapports en échec, décisions attendues. Ne jamais annoncer un livre « terminé » ou « sans erreur » : annoncer ce que
`RAPPORT_FINAL.md` établit, et ce qui reste à la charge de l'auteur.
