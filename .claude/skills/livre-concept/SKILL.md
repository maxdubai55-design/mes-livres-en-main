---
name: livre-concept
description: Développe l'idée brute d'un livre en concept (prompt 1 du guide) puis la soumet au stress-test éditorial (prompt 2). Usage /livre-concept <slug>.
---

# Concept et stress-test — `$ARGUMENTS`

Lire `livres/<slug>/concept.md` (le sujet de l'auteur) et, s'il y en a, les pages déposées dans `voix/`.

## 1. Développer l'idée (sans rédiger le roman)

Agir en romancier professionnel, architecte narratif et directeur éditorial. Écrire dans `concept.md` :
promesse de lecture ; genre et sous-genre ; thème profond (jamais un message à démontrer) ; conflit central ;
protagoniste défini par un désir, un manque, une peur, une contradiction et un prix à payer ; antagonisme capable
d'agir ; enjeu intime et enjeu extérieur ; singularité du projet ; risques de cliché ; potentiel émotionnel ; moteur
narratif sur la durée ; type de fin le plus cohérent et ce qui change de façon irréversible.

Challenger l'idée. Ne pas valider une proposition faible par complaisance. Proposer une amélioration seulement
lorsqu'elle renforce le livre, et dire ce qu'elle coûte.

## 2. Stress-test

Écrire `audits/stress_test_concept.md`. Chercher : contradictions, facilités, coïncidences, enjeux insuffisants,
personnages fonctionnels, règles imprécises, promesses que l'intrigue risque de ne pas tenir.

**Ressemblances.** Nommer les œuvres connues les plus proches (livres, films, séries) et, pour chacune, ce que le
projet partage avec elle et ce qui l'en sépare. Si la proximité tient à l'intrigue, aux personnages ou à l'univers,
c'est une faiblesse BLOQUANTE : modifier le concept. Si une vérification en ligne est possible, la faire ; sinon
écrire que la liste vient de la mémoire du modèle et peut être incomplète.

Pour chaque faiblesse : gravité (BLOQUANT / IMPORTANT / MINEUR) et correction minimale la plus efficace.
Verdict final : concept faible / prometteur / solide / exceptionnel, avec justification concrète.

## 3. Arrêt

`python3 outils/livre.py etape <slug> concept`. Présenter à l'auteur le concept en dix lignes, le verdict, et les
arbitrages qui lui reviennent, numérotés. Attendre ses réponses, les intégrer à `concept.md`, puis
`livre.py etape <slug> stress_test`. Un concept jugé « faible » ne passe pas : on le retravaille.
