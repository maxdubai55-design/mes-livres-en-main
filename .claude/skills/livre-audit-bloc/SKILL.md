---
name: livre-audit-bloc
description: Audit éditorial d'un bloc de 4 à 5 chapitres (prompt 8 du guide), avec mise à jour de la bible. Sert aussi d'audit structurel de mi-parcours. Usage /livre-audit-bloc <slug> <X-Y>.
---

# Audit de bloc — `$ARGUMENTS`

1. `python3 outils/livre.py controle <slug> --chapitres X-Y` et lecture du rapport et du registre de continuité.
2. Relire les chapitres X à Y d'une traite, en responsable éditorial exigeant, bible et architecture ouvertes.
   Contrôler : continuité factuelle, chronologie, géographie, âges, blessures, objets, connaissances des personnages,
   arcs, causalité, rythme, répétitions de scènes ou d'informations, promesses narratives, préparations, dialogues,
   focalisation, style, orthographe, tics IA.
3. Écrire `audits/bloc_X-Y.md`. Classer chaque point : **BLOQUANT**, **IMPORTANT**, **MINEUR**, **À CONSERVER**.
   Citer le chapitre et la ligne. Ne pas proposer de réécriture là où le texte fonctionne.
4. Corriger les BLOQUANT et les IMPORTANT, relancer les contrôles jusqu'à RÉUSSI.
5. Mettre à jour `bible.md` (journal du canon), `canon.json` et `suivi/resumes.md`.

**À mi-parcours**, ajouter un audit structurel léger : la promesse est-elle tenue jusqu'ici, la tension monte-t-elle,
l'architecture de la seconde moitié tient-elle encore ? Si elle doit changer, le proposer à l'auteur avant de poursuivre.
