---
name: livre-bible
description: Construit la bible canonique d'un livre (prompt 3 du guide), le fichier canon.json utilisé par les contrôles de continuité, et la fiche de voix. Usage /livre-bible <slug>.
---

# Bible canonique — `$ARGUMENTS`

À partir de `concept.md` et des arbitrages validés.

1. **`bible.md`** — remplir le gabarit : identité du projet ; promesse ; thèmes ; époque et lieux ; règles du monde ;
   personnages (biographie, désir, peur, contradiction, arc, relations, voix dialoguée) ; chronologie ; factions ;
   objets et motifs ; secrets ; ce que le lecteur sait à chaque étape ; règles de narration ; voix et registre ;
   contraintes documentaires ; éléments interdits ; fin prévue. Séparer strictement **CANON VALIDÉ**,
   **HYPOTHÈSES DE TRAVAIL** et **POINTS À ARBITRER**. Ne rien inventer pour combler un manque : le lister.
2. **Documentation.** Pour tout élément historique, géographique, technique ou juridique : attesté / probable /
   plausible / anachronique / faux / indémontrable. Sources primaires ou institutionnelles d'abord. Une hypothèse
   d'historien ne devient pas une certitude. Sans accès à une source, le dire dans la bible.
   En science-fiction ou fantastique : vérifier la cohérence interne des règles, leur coût, leurs conséquences, et
   qu'aucune ne résout l'intrigue trop facilement.
3. **`canon.json`** — la partie de la bible que la machine vérifie :
   - `personnages` : `{"nom": "Prénom Nom", "alias": ["surnom", "Mme Nom"], "naissance": 1948, "notes": "yeux gris, boite"}`
   - `lieux`, `autres_noms_propres` : tout nom propre autorisé dans le texte (lieux, marques, bateaux, journaux…)
   - `chronologie` : `{"chapitre": 1, "date": "1982-03-12", "note": "…"}`
   - `interdits` : expressions régulières des éléments bannis (anachronismes, mots hors registre).
   Vérifier les âges par le calcul : année de naissance contre chaque date de la chronologie.
4. **`voix.md`** — remplir la fiche à partir des pages de l'auteur dans `voix/`. S'il n'y en a pas, proposer une voix
   cohérente avec le projet et l'indiquer comme hypothèse à valider sur le chapitre 1.
5. Présenter à l'auteur : le canon en une page et la liste numérotée des points à arbitrer. Attendre. Intégrer.
   Puis `python3 outils/livre.py etape <slug> bible`.
