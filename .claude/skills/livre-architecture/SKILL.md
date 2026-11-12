---
name: livre-architecture
description: Construit l'architecture complète du livre, partie par partie et chapitre par chapitre (prompt 4 du guide). Usage /livre-architecture <slug>.
---

# Architecture — `$ARGUMENTS`

À partir de `bible.md`. Écrire `architecture.md`.

Pour chaque partie et chaque chapitre : situation de départ ; objectif du personnage ; conflit ; événement concret ;
information nouvelle ; évolution émotionnelle ; conséquence ; élément futur préparé ; raison pour laquelle le lecteur
tourne la page ; point de vue ; date et lieu ; longueur visée.

Contrôles à faire et à écrire en fin de fichier :
- **Causalité** : chaque chapitre découle du précédent et modifie le suivant. Tableau « parce que / donc ».
- **Chapitres transitifs** : les repérer, les renforcer ou les fusionner — sans réduire artificiellement le roman.
- **Semis et récoltes** : chaque élément préparé a son chapitre de paiement, et l'inverse.
- **Arcs** : où chaque personnage principal change, et par quel acte.
- **Chronologie** : dates de chaque chapitre reportées dans `canon.json`.
- **Fin** : elle découle des choix et des règles posées ; rien n'y arrive de l'extérieur.

Renseigner `chapitres_prevus` dans `livre.json`. Donner un avis sans complaisance sur le point le plus fragile de la
structure. Présenter à l'auteur le plan en une ligne par chapitre, attendre sa validation, puis
`python3 outils/livre.py etape <slug> architecture`.
