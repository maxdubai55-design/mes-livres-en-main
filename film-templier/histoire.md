# Trente à l'appel

Film de 30 secondes, 4K (3840×2160, 24 i/s), image scope 2,39:1 avec bandes noires, son stéréo.
Six images fixes, une caméra virtuelle, un montage, une bande-son.

## L'histoire

Un chevalier du Temple tient le siège d'un château depuis trois mois. Il montre l'attaque sur la carte, mène ses hommes jusqu'à la porte, lance la charge et se bat au pied des remparts. Le soir, son tabard est taché de sang. Il pose le casque sur l'autel et reste à genoux. Puis il rejoint la salle, où l'on trinque. Trente hommes manquent à la table. Il lève la coupe quand même.

## Texte dit et sous-titré

| Temps | Texte |
|---|---|
| 0:01 | Trois mois de siège. Les murs tenaient encore. |
| 0:06 | À l'aube, il mena ses hommes jusqu'à la porte. |
| 0:12 | **À l'assaut !** (cri) |
| 0:21 | Il en manquait trente à l'appel. |
| 0:26 | À table, on leva quand même les coupes. |

Voix off : voix française de synthèse masculine (modèle Piper « tom »), un peu de grave ajouté, réverbération légère.
Le cri est la même voix, saturée, doublée trois fois à des hauteurs différentes pour faire une troupe.

## Découpage

| Plan | Image | Caméra virtuelle | Son | Musique |
|---|---|---|---|---|
| 0–5 s | Conseil de guerre | Départ sur la carte et la dague. La caméra monte le long du bras jusqu'au visage et avance. | Bougies, papier, dague sur la carte, catapulte au loin | Grave tenu en ré mineur, timbale qui bat comme un pouls |
| 5–10 s | À cheval | De l'œil du cheval au visage du cavalier, avec le balancement du pas. | Sabots, harnais, colonne en marche, bannière | Ostinato de violoncelles, cors, caisse claire qui monte |
| 10–15 s | Le cri | L'épée, puis la caméra descend et avance sur le visage. Arrêt net à 11,76 s. Cri à 11,97 s. Coup de caméra à 12,5 s, recul vers le poing et l'épée. | Roulement, coupure totale de 0,7 s, cri, foule, épées dégainées | Montée sur la dominante, silence, tutti sur le cri à 12,5 s |
| 15–20 s | Le combat | De la catapulte au visage, secousses calées sur les impacts, descente vers la lame et le bouclier. | Fer, flèches, catapultes, flammes, foule | Cordes en doubles-croches, motif de cuivres, timbales |
| 20–25 s | La prière | Fondu par le noir. La tête, puis la caméra descend vers le casque posé sur l'autel. | Salle de pierre, bougies, casque posé, maille | Violoncelle seul, chœur |
| 25–30 s | La salle | Recul depuis la coupe jusqu'à la table entière, fondu au noir. | Murmure, coupes qui s'entrechoquent | Ré majeur en cuivres, accord final |

## Ce que le film fait, et ce qu'il ne fait pas

**Le chevalier ne bouge pas lui-même.** Les images sont fixes. Le mouvement vient de la caméra, du montage, de la séparation entre le chevalier et le décor (le décor se déplace un peu moins vite, d'où la profondeur) et du son. Le bras ne s'abat pas, la bouche n'articule pas, les soldats ne courent pas.
Pour voir l'épée tomber et la bouche crier, il faut un générateur d'image vers vidéo (Veo, Runway, Kling, Sora…). Prompts à coller, un par image, 5 s chacun :

1. *Council tent, knight leans over the war map and slowly drags the dagger toward the castle, candle flames flicker, camera pushes in slowly.*
2. *Knight on a white horse walks toward the castle gate, cape and banners moving in the wind, soldiers marching behind, slow tracking shot.*
3. *Knight raises the bloodied sword high, shouts, soldiers behind him roar and surge forward, sunset flames, handheld camera.*
4. *Siege assault, knight swings the sword and lifts the shield, catapult releases a burning stone, men climb ladders, smoke drifting, fast handheld camera.*
5. *Knight kneels in prayer in the chapel, candle flames flicker, dust in the light of the stained glass, almost still.*
6. *Banquet hall, knight lifts the goblet and smiles, guests raise cups and laugh, candle flames flicker, slow pull-back.*

Les clips obtenus se placent à la place des plans fixes dans le même montage.

**Le 4K est reconstruit.** Les images font 1122×1402. Elles ont été agrandies quatre fois par Real-ESRGAN (réseau de neurones), puis la fenêtre scope en prélève 3840 pixels de large. C'est net, avec des détails que le réseau a inventés. Ce n'est pas du 4K natif.

**La musique est synthétisée.** Cordes, cors, chœur, timbales sont fabriqués par calcul. L'ensemble tient le rôle d'une partition symphonique de bande-annonce, il ne vaut pas un orchestre. Pour une vraie partition : `python3 outils/audio.py --musique ma_partition.mp3`.

**Le cri est une voix de synthèse.** Pour mettre le vôtre : `python3 outils/audio.py --cri mon_cri.m4a`.

**Le son n'a pas été écouté.** Il a été vérifié par mesures (niveau intégré −16 LUFS, silence de 0,7 s avant le cri, spectrogramme), pas à l'oreille.

## Refaire le film

```
bash outils/construire.sh
```

Le script télécharge les modèles, prépare les images, génère le son, puis rend `sortie/film_4k.mp4`.
