# MEDIEVAL ARCHITECT 3D — Étape 1 : conception technique

Réponse à la section 27.1 du cahier des charges. Ce document fixe les choix structurants. Le code de `packages/core` en est la traduction exécutable : les schémas cités ici y existent et sont couverts par des tests.

Ce qui n'est **pas** fait à cette étape, conformément à la consigne : aucune géométrie, aucune scène 3D, aucune interface.

> **Mise à jour :** le MVP a depuis été réalisé sur cette base. Voir [`bilan-mvp.md`](bilan-mvp.md) pour l'état réel, fonction par fonction, et [`lot-0-prototype.md`](lot-0-prototype.md) pour les mesures du prototype technique. Écart assumé par rapport au §1.3 : l'interface est écrite sans React (DOM natif), l'application tourne dans le navigateur et n'est pas encore empaquetée avec Electron.

---

## 0. Trois décisions qui commandent tout le reste

1. **Le projet est un document, la géométrie est un calcul.** Le fichier contient des instances de modules paramétrés et leurs raccords, jamais de maillage calculé. Tout maillage, toute texture compressée et tout résultat d'analyse se reconstruit et vit dans un cache.
2. **Toute modification passe par une `Operation` sérialisable.** L'interface, l'assistant, les corrections automatiques et l'IA produisent les mêmes objets. On obtient ainsi d'un seul mécanisme l'annuler/rétablir, l'historique, la prévisualisation en fantôme et la validation avant application.
3. **L'IA écrit une intention, pas un modèle.** Elle produit une `BuildingSpecification`. Un planificateur déterministe la traduit en opérations. L'IA ne touche jamais directement ni à la géométrie ni au projet.

---

## 1. Architecture logicielle

### 1.1 Couches

```
┌──────────────────────────────────────────────────────────────────────┐
│ app/ui          Interface (écran d'accueil, panneaux, modes)           │
├──────────────┬──────────────┬──────────────┬─────────────────────────┤
│ scene        │ assistant    │ render       │ io (import / export)    │
│ caméra,      │ maître       │ interactif + │ GLB, OBJ, STL, PNG,     │
│ sélection,   │ d'œuvre, IA  │ photo        │ plans 2D                │
│ poignées     │ de génération│              │                         │
├──────────────┴──────┬───────┴──────┬───────┴─────────────────────────┤
│ diagnostics         │ structure    │ history-engine                  │
│ règles architecture │ graphe de    │ chronologie, profils,           │
│                     │ charges, N1–3│ base de connaissances           │
├─────────────────────┴──────────────┴─────────────────────────────────┤
│ geometry   générateurs paramétriques + noyau booléen (worker)         │
├──────────────────────────────────────────────────────────────────────┤
│ library    définitions de modules, matériaux, assets (données)        │
├──────────────────────────────────────────────────────────────────────┤
│ core       schémas, Project, Operation, History, certitude, périodes  │
│ persistence  format .medieval3d, autosauvegarde, variantes, migrations │
└──────────────────────────────────────────────────────────────────────┘
```

Règle de dépendance : une couche ne dépend que des couches inférieures. `core` ne connaît ni le DOM, ni Three.js, ni le réseau. Les moteurs historique, architectural et structurel ne connaissent pas la scène : ils lisent le `Project` et les connecteurs résolus, puis rendent des `Diagnostic`.

### 1.2 Flux d'une modification

```
geste utilisateur / assistant / IA
        │
        ▼
   Operation ──► History.do() ──► Project (mutation)
                                      │ ensemble des modules modifiés
                    ┌─────────────────┼─────────────────────┐
                    ▼                 ▼                     ▼
          worker géométrie     diagnostics incrémentaux   autosauvegarde
          (cache par hash       (modules modifiés          (journal ops.jsonl)
          type+version+params)   + voisins raccordés)
                    │                 │
                    ▼                 ▼
                 scène 3D  ◄──── surlignage couleurs
```

Le cache géométrique est indexé par `hash(type, version de définition, paramètres résolus)`. Vingt tours identiques ne se calculent qu'une fois et s'affichent en instanciation (§24).

### 1.3 Choix technologiques proposés

Le cahier des charges (§23.1) demande de trancher après prototype. Voici l'hypothèse de départ, que le lot 0 doit confirmer ou infirmer.

| Besoin | Proposition | Raison | Risque à mesurer au lot 0 |
|---|---|---|---|
| Langage | TypeScript partout, Rust ponctuellement | Un seul langage pour UI, modèle, générateurs et tests | Performances des générateurs complexes (voûtes) |
| Application de bureau | **Electron** | Chromium embarqué = WebGPU identique sur Windows, macOS, Linux | Poids (~150 Mo) |
| Alternative | Tauri 2 | Plus léger | WebKitGTK sous Linux : WebGPU non garanti. Rédhibitoire pour un logiciel 3D si non résolu |
| Moteur 3D interactif | Three.js, `WebGPURenderer` avec repli WebGL 2 | Écosystème, instanciation, LOD, PBR | Coût des vitraux transmissifs en temps réel |
| Opérations booléennes | manifold-3d (WASM) | Sortie garantie étanche : c'est aussi la condition de l'impression 3D (§21.3) | Temps de calcul pour une nef à 20 travées |
| Rendu photoréaliste | three-gpu-pathtracer dans l'application ; export GLB vers Blender/Cycles pour la qualité maximale | Path tracing sans quitter l'outil ; route pro déjà éprouvée | Temps de convergence sur machine moyenne |
| Interface | React + une bibliothèque de composants accessible | Productivité, panneaux repliables | — |
| IA de génération | API Claude en sortie structurée (schéma JSON de `BuildingSpecification`), validée par zod, relance avec les erreurs | Le schéma impose la forme ; la validation rattrape le fond | Qualité des hypothèses implicites |
| Solveur avancé (N3) | Processus externe (CalculiX ou équivalent) piloté par un adaptateur | Isolé, remplaçable, optionnel | Voir §6.4 : l'élasticité linéaire convient mal à la maçonnerie |

Tâches hors du fil principal : génération géométrique, booléens, diagnostics de niveau 2, préparation des exports. Chacune dans un Web Worker, avec annulation si l'utilisateur continue de modifier.

---

## 2. Schéma `BuildingSpecification`

Fichier : `packages/core/src/spec/building-spec.ts`. Exemples complets : `packages/core/examples/`.

La spec décrit **ce qu'on veut**, avec des « intentions de module » partielles :

| Champ | Contenu |
|---|---|
| `building` | type, datation (intervalle d'années), région, style, fonction |
| `overall` | dimensions générales (mm) |
| `terrain` | forme (éperon, colline, plaine…), nature du sol, emprise, relief importé |
| `levels` | niveaux nommés et leurs altitudes |
| `modules[]` | `ref` symbolique (`tower#1`), type, rôle, paramètres **partiels**, nombre, placement qualitatif (`corner`, `perimeter`, `axis`, `apse`…) |
| `relations[]` | `encloses`, `flanks`, `carries`, `buttresses`, `connects`… entre refs |
| `constraints[]` | domaine, force (`strict` / `soft`), énoncé lisible, forme machine facultative |
| `generation` | mode (libre, contraint, variantes, partiel, compléter autour du verrouillé), graine, instances verrouillées |
| `assumptions[]` | ce que l'IA a déduit sans qu'on le lui dise. **Montré à l'utilisateur avant génération** |
| `prompt` | phrase d'origine, pour traçabilité |

Chaîne complète :

```
phrase ──► IA ──► BuildingSpecification ──► validation zod + checkSpecReferences
                          │                         │ erreurs → renvoyées à l'IA (max 2 relances)
                          ▼
             écran « Voici ce que j'ai compris » (hypothèses éditables)
                          │
                          ▼
             Planificateur (déterministe, graine) ──► Operation batch
                          │
                          ▼
             prévisualisation fantôme ──► validation ──► History.do()
```

La spec reste stockée dans le projet. Le mode « Verrouillage » (§9.1) relance le planificateur en excluant `generation.lockedInstances`.

**Le planificateur est la pièce la plus difficile du projet.** Transformer « quatre tours rondes aux angles d'une double enceinte sur un éperon de 120 × 60 m » en positions, rayons et raccords est un problème de placement sous contraintes, pas de langage. Il faut le traiter comme un moteur à part entière (lot 7), avec ses propres tests de propriétés : aucune collision, toutes les relations satisfaites, emprise respectée.

---

## 3. Schéma `ModuleArchitectural`

Fichier : `packages/core/src/module/module.ts`, `parameters.ts`. Exemples : `src/library/castle.ts`.

Deux objets distincts :

- **`ModuleDefinition`** : le type (« tour ronde »), livré par une bibliothèque, versionné (semver).
- **`ModuleInstance`** : une tour posée dans un projet.

### 3.1 Définition

| Champ | Rôle |
|---|---|
| `type`, `version` | `castle.tower.round` @ `0.1.0` |
| `label` | libellé double : courant + technique (§2.5) |
| `category`, `structuralRole` | classement bibliothèque ; `bearing` / `thrusting` / `bracing` / `carried` pour le mode « structure porteuse » et le graphe de charges |
| `generator` | identifiant du générateur géométrique |
| `parameters` | dictionnaire de `ParameterDef` (voir 3.2) |
| `connectors` | déclarations de connecteurs (§4) |
| `slots` | sous-modules acceptés : couronnement, ouvertures, escalier… |
| `history[]` | plages d'usage par région/style, équivalent en cas d'anachronisme |
| `learnMore` | contenu du bouton « En savoir plus » (§22.2) |

### 3.2 Paramètres

Types : `length`, `count`, `angle`, `enum`, `boolean`, `material`, `ratio`. Chaque paramètre porte :

- `tier` : `discovery`, `creation` ou `expert`. C'est ce champ qui réalise les trois modes d'interface sans code conditionnel dans les panneaux ;
- `min`/`max` : au-delà, la géométrie est impossible → **erreur** ;
- `typicalMin`/`typicalMax` : au-delà, c'est inhabituel → **avertissement**, on laisse faire ;
- `handle` : le paramètre suit une poignée dans la scène.

Toutes les longueurs sont en **millimètres entiers**. Pas de dérive flottante, hachage stable pour le cache, égalités exactes dans les tests. Les angles sont en millidegrés entiers. Seule la rotation d'instance (quaternion) reste en flottant.

### 3.3 Instance

`id`, `type`, `definitionVersion`, `transform`, `level`, `parent`/`slot` (sous-module), `params` (valeurs **explicites seulement** ; le reste vient des défauts de la définition), `certainty` et `paramCertainty` (la hauteur d'une tour peut être attestée et son couronnement hypothétique), `weathering`, `state` (verrouillé, masqué, interdit à l'IA), groupe, étiquettes.

Le projet fige la version de chaque définition utilisée (`libraryLock`). Une mise à jour de bibliothèque ne change jamais silencieusement un projet existant.

---

## 4. Schéma des connecteurs

Fichiers : `src/connector/connector.ts`, `compatibility.ts`.

Un connecteur est un repère local exposé par un module. Il est **calculé par le générateur** à partir des paramètres : quand la tour grossit, ses points d'accroche suivent.

| Élément | Contenu |
|---|---|
| `ConnectorDecl` (dans la définition) | nom (éventuellement indexé : `flank[0..3]`), genre, rôle de charge, capacité, paramètre donnant la dimension de raccord |
| `ResolvedConnector` (sortie du générateur) | repère dans l'espace, dimension en mm |
| `Connection` (dans le projet) | deux extrémités (module + connecteur), drapeau `acknowledged` si l'utilisateur a accepté un raccord orange |

**Genres** : 20 genres (`wall.end`, `tower.flank`, `support.top`, `arch.springer`, `flying.head`, `flying.foot`, `buttress.head`, `foundation`, `terrain`…).

**Rôle de charge** : `carries`, `is_carried`, `neutral`. Ce champ fait des connexions le graphe des chemins de charge (§13.1) : on vérifie que chaque élément porteur rejoint `terrain` par une chaîne de `carries`. Aucune structure supplémentaire n'est nécessaire.

**Verdict d'aimantation** (`evaluateSnap`) :

- genres absents de la table → **rouge** ;
- genres compatibles, mais épaisseurs différant de plus de 25 %, ou deux « porteurs » face à face → **orange**, avec la raison en clair ;
- sinon → **vert**.

La table de compatibilité est déclarée une fois par paire et symétrisée automatiquement.

---

## 5. Système de matériaux

Fichier : `src/material/material.ts`. Exemple : `src/library/materials.ts`.

Un matériau a **trois facettes lues par trois moteurs différents** :

| Facette | Lue par | Contenu |
|---|---|---|
| `appearance` | rendu | cartes PBR (albédo, normale, rugosité, AO, hauteur, métal, transmission, opacité, épaisseur, IOR), **taille réelle du motif** (`tileSizeMm`), appareillage procédural (pierre de taille, moellon, galets, brique ; hauteur d'assise, largeur de joint, mortier) |
| `mechanics` | structure | densité, module d'Young, Poisson, résistances en compression / traction / cisaillement, et **l'origine de ces valeurs** (`literature_range`, `user_measured`, `placeholder`), reprise dans le rapport |
| `usage` | histoire | régions et périodes d'usage |

S'y ajoutent `glass` (teinte, irrégularité, bulles, salissure) pour le verre et le vitrail, et `states` (neuf, érodé, rouille avancée…), qui change l'apparence sans changer la mécanique.

L'utilisateur applique « calcaire blond » en un clic. Chaque moteur lit sa facette. Le vieillissement (§7.5) est un curseur global du projet, surchargé par instance, avec des canaux indépendants (`WeatheringChannels`) traités dans le shader. Il ne modifie ni le matériau ni la géométrie, sauf « pierres manquantes », qui relève du générateur.

Les textures sont livrées en KTX2 (compression GPU, mipmaps).

---

## 6. Structure des diagnostics

Fichier : `src/diagnostic/diagnostic.ts`.

### 6.1 Un format pour quatre domaines

```
Diagnostic
  rule       ARC-012        code stable (HIS, ARC, STR, FAB + numéro)
  domain     architecture   history | architecture | structure | fabrication
  severity   warning        ok | notice | warning | critical
  tier       rules          rules (N1) | simplified (N2) | fem (N3)
  subjects   [mod_…]        modules concernés
  focus      [x,y,z]        cible du bouton « Montrer »
  problem / why / risk      format imposé §12.1
  fixes[]                   solutions de la plus légère à la plus lourde,
                            chacune = liste d'opérations → fantôme → validation
  dismissed                 « Continuer ainsi » : conservé dans le rapport
  disclaimer                obligatoire en domaine structure
```

La gravité est une seule échelle à quatre niveaux, projetée sur le vocabulaire de chaque domaine :

| Échelle | Histoire (§11.2) | Structure (§13.5) |
|---|---|---|
| ok | compatible | vert |
| notice | possible mais atypique | jaune |
| warning | anachronique ou géographiquement improbable | orange |
| critical | — | rouge |

Les domaines ne se mélangent jamais : un élément peut être historiquement parfait et structurellement rouge, et le panneau affiche les deux lignes séparément (§1 : « séparer strictement historicité, architecture, structure et rendu »).

### 6.2 Règles

Une règle est une **fonction pure** `(contexte) → diagnostics`, sans accès à la scène. Chaque règle du §12 (supports manquants, murs flottants, escalier débouchant dans un mur, ouverture trop proche d'un angle…) devient une règle codée, testée seule sur des projets minimaux.

### 6.3 Niveaux d'analyse structurelle

- **N1, instantané, à chaque modification** : ratios (hauteur/diamètre d'une tour, portée/épaisseur d'une voûte, part de vide dans un mur percé), continuité du graphe de charges.
- **N2, simplifié, en tâche de fond** : poids propre par module (volume × densité), centre de gravité, réactions d'appui, **ligne de poussée des arcs et voûtes par statique graphique**, vérification qu'elle reste dans le tiers central ou au moins dans l'épaisseur.
- **N3, avancé, à la demande** : export vers solveur externe.

### 6.4 Réserve honnête sur le niveau 3

Un solveur par éléments finis en élasticité linéaire, l'approche la plus répandue, décrit mal une maçonnerie : elle ne résiste pas à la traction et s'effondre par formation de mécanismes (charnières), pas par dépassement de contrainte. Les outils adaptés relèvent de l'analyse limite, des réseaux de poussée (*thrust network analysis*) ou des méthodes à blocs rigides discrets. Le N2 par ligne de poussée est donc **plus pertinent** pour les arcs et voûtes que ne le serait un N3 élastique mal paramétré. Le choix du solveur N3 doit être fait avec un ingénieur spécialiste du bâti ancien, pas par défaut.

---

## 7. Organisation des données historiques

Fichier de logique : `src/history/chronology.ts`. Données : champ `history` des définitions, `usage` des matériaux.

### 7.1 Principe

Les connaissances historiques sont des **données versionnées, séparées du code**, livrées en paquets (`fr-core`, puis `occitanie`, `angleterre`…). Un historien peut corriger une date sans toucher au code, et chaque correction est traçable.

### 7.2 Trois natures d'information, jamais confondues

| Nature | Exemple | Où | Présentation |
|---|---|---|---|
| Fait sourcé | « Château X : tour maîtresse de 15,5 m de diamètre » | `sources` + certitude `attested` | vert, avec référence |
| Règle générale | « tour ronde courante en domaine royal après ~1190 » | `HistoricalUsage` des définitions | verdict chronologique |
| Heuristique de génération | « espacement de tours flanquantes ≈ portée de tir » | profils du planificateur | jamais présentée comme un fait |

### 7.3 Datation et régions

- La datation est un intervalle d'années (`YearRange`), jamais du texte. « XIIIe siècle » = [1201 ; 1300].
- Les régions sont hiérarchiques : `fr.occitania.languedoc` hérite de `fr.occitania`. Le cahier des charges cite « Occitanie » et « Languedoc » côte à côte ; la hiérarchie résout ce recouvrement.
- J'ai ajouté le style `gothic.southern` (gothique méridional : nef unique, contreforts intérieurs, Albi, Toulouse). Sans lui, un profil Languedoc produirait des cathédrales du Nord.

### 7.4 Verdict chronologique

Pour chaque plage d'usage : chevauchement avec la période « courante » → compatible ; avec une période « précoce » ou « survivance » → atypique ; sinon → improbable, avec l'écart en années et l'équivalent d'époque proposé (mâchicoulis de pierre au XIIe siècle → hourd). **Absence de donnée → « inconnu », jamais « compatible » par défaut.**

### 7.5 Validation des contenus

Les dates des quatre modules d'exemple sont des fourchettes indicatives, **non sourcées** (`sources: []`), et marquées comme telles dans le code. Avant toute publication, chaque entrée de la base doit être relue par un castellologue ou un historien de l'architecture, qui renseigne `sources`. Un indicateur de couverture (part des entrées sourcées) fera partie du tableau de bord qualité.

---

## 8. Stratégie de sauvegarde

Fichier : `src/persistence/file-format.ts`, `src/project/operations.ts`.

### 8.1 Format `.medieval3d`

Archive ZIP ouvrable par n'importe quel outil :

```
manifest.json          version de format, version d'application, variantes, bibliothèques requises, empreintes SHA-256
project.json           variante active (Project complet)
variants/<id>.json     autres variantes
history/ops.jsonl      journal d'opérations (une ligne par opération)
assets/                imports : plans, photos, nuages de points, textures personnelles
thumbnails/cover.webp
reports/               rapports générés (facultatif)
```

Aucun maillage calculé n'y figure. Exception : les imports (photogrammétrie, relevé 3D), qui sont des **sources** et non des résultats.

### 8.2 Autosauvegarde et reprise

- Chaque opération est ajoutée au journal `ops.jsonl` d'un fichier de travail local (écriture en ajout, peu coûteuse).
- Un instantané complet est écrit toutes les N opérations ou toutes les 2 minutes.
- Au redémarrage après fermeture brutale : dernier instantané + rejeu du journal.

### 8.3 Annuler / rétablir

`History` conserve 500 opérations par défaut, 100 au minimum (le constructeur refuse moins). Chaque opération appliquée renvoie son inverse exact. Supprimer un module supprime ses raccords et sous-modules ; l'annulation restaure l'ensemble. Un lot d'opérations est **atomique** : s'il échoue au milieu, les étapes déjà appliquées sont défaites.

### 8.4 Variantes

Une variante est un `Project` complet avec un parent. Comparer deux variantes côte à côte revient à charger deux documents dans deux vues. Un stockage différentiel ne se justifiera que si les fichiers deviennent lourds.

### 8.5 Évolution du format

Migrations chaînées, une par saut de version. Un fichier plus récent que l'application s'ouvre en lecture seule, avec un avertissement. Un module dont la bibliothèque manque s'affiche comme « à résoudre » (boîte grise, paramètres conservés), sans erreur bloquante.

---

## 9. Découpage du MVP en lots

Les 27 fonctions du §25 réparties en 8 lots. Chaque lot se termine par une version utilisable, sans régression sur les précédents.

| Lot | Contenu (n° du §25) | Livrable démontrable |
|---|---|---|
| **0 — Prototype technique** | — | Electron + Three.js WebGPU + manifold en worker : 200 tours paramétriques instanciées, un mur percé de 10 ouvertures, mesures de FPS et de temps de régénération sur trois machines. **Décide la pile.** |
| **1 — Noyau et scène** | 1, 2, 3, 4, 22, 23 | Scène, caméra orbitale, cube de navigation, vues ortho, grille, sélection, poignées, saisie numérique, annuler/rétablir, duplication. Modules = boîtes. |
| **2 — Fortification paramétrique** | 5, 6, 7, 8, 9, 10, 24 | Bibliothèque visuelle ; mur, tours ronde et carrée, porte, créneaux ; connecteurs et aimantation vert/orange/rouge. **Un débutant fait une enceinte à quatre tours.** |
| **3 — Édifice religieux** | 11, 12, 13, 14, 15 | Nef à travées, colonne, arc, voûte d'arêtes et d'ogives, contrefort. |
| **4 — Matériaux et affichage** | 16, 17, 18 | Matériaux PBR avec appareillage, transparence, filaire, vieillissement global. |
| **5 — Persistance et export** | 19, 20, 21 | `.medieval3d` avec autosauvegarde et reprise ; PNG ; GLB. |
| **6 — Diagnostic et assistant** | 25, 26 | Règles ARC de base, graphe de charges N1, contrôle chronologique, panneau PROBLÈME/POURQUOI/RISQUE/SOLUTIONS, corrections en fantôme ; assistant répondant sur les diagnostics présents. |
| **7 — Génération contrainte** | 27 | Phrase → spec → écran des hypothèses → planificateur → fantôme → validation, pour un petit édifice (enceinte + tours + porte + donjon). |

Hors MVP, dans cet ordre : mode pédagogique complet, rendu photo, N2 structurel, plans et coupes cotés, terrain éditable, impression 3D, reconstitution de ruines, N3.

---

## 10. Critères de test par lot

Trois familles de tests à chaque lot :

- **unitaires** (vitest) : fonctions pures du noyau, règles, générateurs ;
- **propriétés** (fast-check) : invariants sur des entrées aléatoires ;
- **bout en bout** (Playwright sur l'application Electron) : parcours utilisateur, captures de référence.

| Lot | Critères d'acceptation vérifiables |
|---|---|
| 0 | ≥ 60 i/s avec 200 tours instanciées sur machine de référence ; régénération d'une tour < 50 ms ; mur à 10 ouvertures étanche (manifold) ; même rendu sur les trois OS |
| 1 | `undo`ⁿ puis `redo`ⁿ = état identique (propriété, n ≤ 500) ; sélection au clic exacte au pixel sur 100 positions ; aucune action courante ne demande de saisir une coordonnée |
| 2 | Toute valeur par défaut est valide (déjà testé) ; pour 1 000 jeux de paramètres aléatoires dans les bornes : maillage étanche et connecteurs sur la surface ; table de compatibilité symétrique (déjà testé) ; **test utilisateur : 5 débutants construisent une enceinte à 4 tours sans aide en moins de 15 min** |
| 3 | Naissances des voûtes sur les chapiteaux à ± 1 mm pour toute portée ; nef de 12 travées générée en < 1 s |
| 4 | Taille réelle des motifs constante quelle que soit la taille du module ; captures de référence (écart d'image < seuil) |
| 5 | Sauvegarde → chargement = projet identique (égalité profonde) ; kill du processus pendant l'édition → reprise sans perte au-delà de la dernière opération ; GLB relu par un validateur glTF sans erreur ; fichiers de version antérieure migrés |
| 6 | Chaque règle a un projet minimal qui la déclenche et un qui ne la déclenche pas ; aucun diagnostic structurel sans avertissement ; « Continuer ainsi » conservé au rechargement |
| 7 | 50 phrases de référence → specs valides après ≤ 2 relances dans ≥ 90 % des cas ; planificateur : zéro collision, relations satisfaites, emprise respectée (propriétés) ; aucune certitude `attested` produite par l'IA (déjà imposé par le schéma) ; même graine → même résultat |

---

## 11. Ce que le code de cette étape prouve déjà

`packages/core`, 40 tests, vérification de types stricte :

- les deux exemples de génération du cahier des charges (forteresse royale, cathédrale gothique) s'expriment dans le schéma `BuildingSpecification` et passent la validation ;
- l'IA ne peut pas marquer un élément « attesté », et « attesté » exige une source ;
- le contrôle chronologique donne compatible / atypique / improbable / inconnu, propose un équivalent d'époque et gère la hiérarchie des régions ;
- les paramètres distinguent l'impossible (erreur) de l'inhabituel (avertissement) ;
- l'aimantation rend vert / orange / rouge avec la raison en clair ;
- annuler / rétablir est exact, y compris pour une suppression en cascade ; les lots sont atomiques ; la prévisualisation ne touche pas au projet ; 100 niveaux minimum garantis.

## 12. Points ouverts et risques

1. **Ampleur.** Le cahier des charges décrit un produit de plusieurs années pour une équipe. Le MVP en 8 lots est réaliste ; la reconstitution de ruines par photogrammétrie et le solveur avancé sont des chantiers de recherche à part.
2. **Le planificateur** (spec → positions) conditionne la génération par IA. C'est lui, pas le modèle de langage, qui fera la qualité des édifices générés.
3. **Les générateurs religieux** (voûtes d'ogives sur plan irrégulier, déambulatoire, raccords d'arcs-boutants) sont la partie géométrique la plus dure. Le lot 3 doit commencer par des travées régulières.
4. **La base de connaissances historique** demande un travail d'historien, pas de développeur. Sans relecteur qualifié, le contrôle chronologique restera indicatif, et le logiciel doit l'afficher.
5. **WebGPU dans les webviews** : c'est pour cette raison que je recommande Electron plutôt que Tauri. Le premier passage du lot 0 a confirmé le risque : Three.js r186 et Chromium 141 sont incompatibles en WebGPU (voir [`lot-0-prototype.md`](lot-0-prototype.md)). Les mesures sur machines réelles restent à faire.
6. **Niveau 3 structurel** : voir §6.4. À concevoir avec un spécialiste du bâti ancien.
