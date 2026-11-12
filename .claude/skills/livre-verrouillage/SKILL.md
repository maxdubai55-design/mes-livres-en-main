---
name: livre-verrouillage
description: Titre définitif, quatrième de couverture, métadonnées KDP, puis contrôle de verrouillage du manuscrit (prompt 11 du guide). Usage /livre-verrouillage <slug>.
---

# Titre, quatrième et verrouillage — `$ARGUMENTS`

## 1. Titre et quatrième (à partir du manuscrit final)

Proposer cinq titres, avec pour chacun ce qu'il promet et son défaut. Vérifier qu'aucun n'est déjà celui d'un livre
connu du même genre ; si la recherche en ligne est impossible, le dire et demander à l'auteur de vérifier sur Amazon
et sur le catalogue de la BnF.

Rédiger la quatrième (600 à 1 100 signes) : personnage, situation, tension, singularité, dans le ton du roman. Aucun
retournement majeur révélé. Pas de superlatif, pas de formule publicitaire, pas de comparaison à un auteur.

Remplir `livre.json` : `titre`, `sous_titre`, `dedicace`, `exergue` (libre de droits uniquement),
`couverture.quatrieme`, `couverture.bio`, `kdp.description` (balises admises : p, br, b, i, em, strong, h4-h6, ul,
ol, li), `kdp.mots_cles` (7, de 50 signes au plus, des expressions qu'un lecteur taperait), `kdp.categories`
(1 à 3), prix, et `kdp.declaration_ia`.

**Déclaration IA.** KDP demande de déclarer tout contenu généré par IA (texte, images, traduction), même fortement
retravaillé ensuite. Écrire dans `kdp.declaration_ia` ce qui s'est réellement passé pour ce livre. Ne jamais
conseiller de ne pas déclarer.

Présenter titres, quatrième et métadonnées à l'auteur. Attendre son choix. `etape <slug> titre_quatrieme`.

## 2. Contrôle de verrouillage → `audits/verrouillage.md`

Ne plus chercher à améliorer : chercher seulement ce qui empêcherait raisonnablement une version définitive.
Erreurs factuelles, contradictions, trous narratifs, raccords, fautes persistantes, répétitions manifestes, résidus de
tics IA réellement gênants. Trois listes : **À CORRIGER AVANT VERROUILLAGE / FACULTATIF / NE PAS TOUCHER**.

Corriger la première liste, puis :
```
python3 outils/livre.py version <slug> VERSION_FINALE
python3 outils/livre.py verrouiller <slug>
```
La commande refuse le verrou tant qu'un contrôle échoue. Dire clairement à l'auteur si le manuscrit peut être
verrouillé, et sinon pourquoi. Une fois verrouillé, on ne rouvre qu'avec
`livre.py deverrouiller <slug> "<défaut précis>"`.
