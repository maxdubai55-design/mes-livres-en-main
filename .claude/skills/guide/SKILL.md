---
name: guide
description: Fabrique un fascicule pratique en gros caractères pour seniors (32 à 40 pages), du plan au dépôt KDP. « /guide <thème> » démarre un fascicule ; « /guide <slug> » reprend. La liste des thèmes est dans livres/SERIE_SENIORS.md.
---

# /guide — fascicule pratique pour seniors

Argument : `$ARGUMENTS`. Les règles de `CLAUDE.md` s'appliquent (stop-slop, originalité, aucun contrôle déclaré sans
rapport). Le modèle de référence est `livres/guide-ia-seniors/`.

## 1. Plan (validation de l'auteur)

`python3 outils/livre.py init <slug> "<thème>" --type guide`, puis écrire `plan.md` : lecteur visé, promesse (ce que
le lecteur sait faire à la fin), parti pris, 9 à 12 chapitres. Chercher en ligne ce qui existe déjà sur le thème et ce
que les gens demandent ; le noter. Renseigner `chapitres_prevus`. Présenter le plan, attendre, `etape <slug> plan`.

## 2. Rédaction

Un fichier par chapitre, `chapitres/chNN.md`, 400 à 600 mots. Syntaxe :

```
# Titre du chapitre
## Intertitre
Paragraphe, avec **gras** et *italique*.
- puce
- [ ] case à cocher
1. étape numérotée
> [ESSAYEZ] phrase exacte à dire ou à écrire
> [ASTUCE] …      > [ATTENTION] …      > [À RETENIR] …
```

Écriture :
- Vouvoiement, phrases courtes, un mot nouveau expliqué une fois puis repris au lexique. Jamais de condescendance.
- Décrire le geste et le dessin du bouton, pas sa position : les écrans changent.
- Des personnages fil rouge et des exemples de la vraie vie ; de l'humour sec, pas de points d'exclamation en série.
- Chaque chapitre contient au moins une chose à faire tout de suite, et se termine par des cases à cocher ou un encadré.
- Un chapitre de jeu (vrai ou faux, défis), un lexique, un aide-mémoire.
- Les risques (erreurs, vie privée, arnaques) ont leur place dans chaque fascicule.
- Aucune promesse commerciale, aucun nom de marque inutile, aucune capture d'écran, aucun logo.
- Santé, argent, droit : le guide renvoie toujours vers un professionnel.

Après chaque chapitre : `livre.py typo <slug> --corriger` puis `livre.py controle <slug>` jusqu'à RÉUSSI. Les noms
de produits et de services vont dans `canon.json` → `autres_noms_propres` : le contrôle vérifie alors leur graphie.
À la fin : `etape <slug> redaction`.

## 3. Vérification des faits (validation de l'auteur)

Écrire `audits/verification_faits.md` : chaque affirmation vérifiable (nom de produit, gratuité, numéro de téléphone,
adresse de site, règle administrative, geste décrit) avec son statut — VÉRIFIÉ (source consultée ce jour),
DE MÉMOIRE, À VÉRIFIER PAR L'AUTEUR. Vérifier en ligne tout ce qui peut l'être, aux sources officielles d'abord.
Un numéro ou une adresse non vérifiés ne s'impriment pas. L'auteur essaie les gestes sur un vrai appareil et lève
les lignes restantes ; alors seulement `etape <slug> verification`.

## 4. Titre, quatrième, fabrication

Remplir `livre.json` (titre, sous-titre, quatrième, description, 7 mots-clés, catégories, prix, déclaration IA,
`mentions_supplementaires` avec la date de vérification). Faire valider, `etape <slug> titre_quatrieme`.
Essai : `livre.py fabriquer <slug> --epreuve`, lire les pages et l'épreuve de couverture en image. Corriger les
« pages presque vides » en ajustant le texte. Puis `livre.py verrouiller <slug>` et `livre.py controle-final <slug>`.
