---
name: livre-chapitre
description: Prépare, rédige, révise et contrôle un chapitre (prompts 5, 6 et 7 du guide), puis met à jour le suivi de continuité. Usage /livre-chapitre <slug> <numéro>.
---

# Chapitre — `$ARGUMENTS`

Lire avant tout : `voix.md`, l'entrée du chapitre dans `architecture.md`, les parties utiles de `bible.md`,
`suivi/resumes.md`, et les deux dernières pages du chapitre précédent.

## 1. Préparer (sans rédiger) → `preparations/chNN.md`

Canon utile seulement ; fonction du chapitre ; point de vue ; lieu et moment ; état initial ; objectif ; obstacle ;
progression en scènes ; bascule centrale ; sortie du chapitre ; éléments à semer ; éléments à ne pas révéler ;
continuités à respecter (blessures, objets, vêtements, ce que chacun sait) ; risques de répétition avec les chapitres
précédents ; longueur visée. Aucune règle canonique nouvelle sans la signaler à l'auteur.

## 2. Rédiger → `chapitres/chNN.md`

Format : `# Titre`, un paragraphe par ligne, `* * *` entre deux scènes.

Écrire comme l'auteur écrit, selon `voix.md`. Actions, perceptions, choix, dialogues, détails concrets — ceux qu'on ne
trouve que dans ce lieu, ce métier, cette année-là — plutôt qu'explications. Chaque personnage parle à sa façon ;
personne ne dit une chose pour informer le lecteur. Les scènes s'arrêtent sur un fait, un geste ou une réplique,
jamais sur une morale. Longueurs de phrase inégales, parce que la scène le demande. Ne pas compresser.
Si une information manque, s'arrêter et la demander, ou la noter dans la préparation comme POINT À ARBITRER.

## 3. Réviser sans dénaturer

Relire le chapitre entier, ligne à ligne : orthographe, accords, concordance des temps, ponctuation, répétitions
involontaires, doublons, lourdeurs, incohérences. Supprimer les tics IA et les phrases qui expliquent ce que la scène
a montré. Ne pas resserrer mécaniquement. Préserver voix, rythme, détails utiles, aspérités.
Toute modification touchant le canon, la chronologie ou le sens est signalée à part.

## 4. Contrôler

```
python3 outils/livre.py typo <slug> --corriger
python3 outils/livre.py controle <slug> --chapitres N
```
Lire `controles/rapport_chN.md` en entier. Traiter chaque ligne BLOQUANT et IMPORTANT, examiner chaque MINEUR :
reprendre le passage, ou — si l'occurrence sert le texte — l'inscrire dans `controles/exceptions_slop.txt` avec sa
raison en commentaire. Un nom propre nouveau va dans `canon.json` seulement s'il est légitime. Relancer jusqu'à
RÉUSSI. Lire aussi `controles/registre_continuite.md` : chaque âge et chaque repère temporel du chapitre est
confronté à la bible.

## 5. Suivi

Ajouter à `suivi/resumes.md` : faits établis, état de chaque personnage (lieu, blessures, objets, ce qu'il sait),
fils ouverts, promesses faites au lecteur, date et heure de fin. Commit.

Tous les 4 à 5 chapitres et à mi-parcours : `/livre-audit-bloc`. Après le dernier chapitre :
`python3 outils/livre.py etape <slug> redaction`. Ne pas polir le premier jet : passer à `/livre-audit-global`.

Donner à l'auteur un avis franc sur le chapitre : ce qui tient, ce qui reste faible.
