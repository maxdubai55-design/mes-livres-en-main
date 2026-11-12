---
name: livre-audit-global
description: Du premier jet à la version finale — fige V1, audite le manuscrit entier (prompt 9), applique les corrections (prompt 10), passe style et stop-slop, audit final (prompt 12). Usage /livre-audit-global <slug>.
---

# Audit global et corrections — `$ARGUMENTS`

Suivre l'ordre. Chaque version est figée avant de toucher au texte.

## V1
`python3 outils/livre.py version <slug> V1` puis `etape <slug> v1`.

## Audit du manuscrit complet → `audits/audit_global.md`
Lire le roman en entier, dans l'ordre, comme un livre et non comme une suite de chapitres. Sur un long manuscrit,
tenir un relevé au fil de la lecture (faits, dates, objets, promesses) pour repérer les contradictions éloignées de
plusieurs dizaines de chapitres. Contrôler : structure, intrigue, causalité, arcs, personnages, chronologie,
cohérence documentaire, point de vue, rythme, répétitions, scènes redondantes, exposition, dialogues, fins de
chapitres, début et fin, promesses tenues, émotion, singularité, orthographe, typographie, tics IA.

Audits spécialisés, chacun dans sa section :
- **Ouverture** (10 à 20 premières pages) : question narrative, présence du protagoniste, monde installé sans
  surcharge, pas de faux mystère, genre correctement promis ; où l'attention monte et retombe.
- **Fin** (trois derniers chapitres, épilogue) : la résolution découle des choix et des règles établies ; pas de
  sur-explication après le climax ; la dernière image prolonge le roman sans lui ajouter une morale.
- **Personnages** principaux : ce qu'ils font contre ce que le narrateur en dit ; changements non préparés ; scènes
  où ils deviennent un outil de l'intrigue.
- **Dialogues** : voix interchangeables, répliques d'information, sous-texte absent, noms répétés, gestes mécaniques.
- **Documentation** : chaque affirmation sensible classée attesté / probable / plausible / anachronique / faux.
- **Originalité** : passages, scènes ou noms trop proches d'une œuvre existante ; citations sous droits.

Distinguer défauts réels et préférences. Verdict sans complaisance, interventions classées par priorité.
Puis `etape <slug> audit_global`.

## V2 — structure et continuité
Appliquer uniquement les corrections utiles et nécessaires. Ne pas réécrire le roman pour une petite correction de
canon. Après intervention, second contrôle : aucune correction n'a créé de contradiction ni de raccord défectueux.
`livre.py controle <slug>` → RÉUSSI, `version <slug> V2`, `etape <slug> v2`.

## V3 — style, langue, stop-slop
Chapitre par chapitre : orthographe, grammaire, ponctuation, puis passe anti-tics IA (voir CLAUDE.md, règle 6). Ne
rien supprimer mécaniquement. Ne pas remplacer une formulation personnelle par une plus lisse.
`livre.py typo <slug> --corriger`, `controle <slug>` → RÉUSSI, `version <slug> V3`, `etape <slug> v3`.

## Audit final → `audits/audit_final.md`
Relecture intégrale de la V3, à froid. Lister ce qui reste, corriger ce qui est objectif (V3.1, V3.2… documentées
dans le fichier), contrôles → RÉUSSI. Compte rendu des corrections. `etape <slug> audit_final`.
Ensuite : `/livre-verrouillage`.
