# Mise en place — mode d'emploi

Trois façons d'utiliser Medieval Architect 3D, de la plus simple à la plus complète. Aucune ne demande de savoir programmer.

| Je veux… | Solution | Temps |
|---|---|---|
| L'essayer sur mon ordinateur | [A. Installer et lancer](#a-installer-et-lancer-sur-son-ordinateur) | 10 minutes |
| Le mettre en ligne, accessible par un lien | [B. Publier sur GitHub](#b-publier-sur-github-lien-public) | 15 minutes, une seule fois |
| Récupérer le projet rangé dans « mes-livres-en-main » | [C. Déménager le projet](#c-déménager-le-projet-depuis-mes-livres-en-main) | 10 minutes |

Navigateur conseillé : **Chrome ou Edge récents** (Firefox et Safari fonctionnent, avec un rendu un peu moins rapide).

---

## A. Installer et lancer sur son ordinateur

### 1. Installer Node.js (une seule fois)

1. Aller sur **https://nodejs.org**.
2. Télécharger la version marquée **LTS** et l'installer en acceptant les options par défaut.
3. Vérifier : ouvrir un terminal (Windows : touche Windows, taper `cmd`, Entrée ; Mac : application « Terminal ») et taper :
   ```
   node -v
   ```
   Une ligne comme `v22.12.0` doit s'afficher. N'importe quel numéro à partir de 20 convient.

### 2. Récupérer le projet

- **Depuis GitHub** : sur la page du dépôt, bouton vert **Code** → **Download ZIP**, puis décompresser le fichier.
- **Depuis l'archive reçue** (`medieval-architect-3d.zip`) : la décompresser.

On obtient un dossier `medieval-architect-3d`.

### 3. Lancer l'application

Dans le terminal, se placer dans ce dossier. Le plus simple : taper `cd ` (avec l'espace), glisser le dossier dans la fenêtre du terminal, puis Entrée. Ensuite :

```
npm install
npm run dev
```

- `npm install` télécharge les bibliothèques. Il faut 1 à 3 minutes, et une seule fois.
- `npm run dev` démarre l'application et affiche une adresse, `http://localhost:5173/`.

Ouvrir cette adresse dans Chrome. L'écran d'accueil apparaît.

Pour arrêter l'application : dans le terminal, **Ctrl + C**.
Pour la relancer un autre jour : ouvrir un terminal dans le dossier, puis `npm run dev` (pas besoin de refaire `npm install`).

### 4. Premiers pas dans l'application

- **Aide → Visite guidée** : six étapes, moins de dix minutes.
- **✦ Générer** : écrire par exemple *« un château du XIIIe siècle avec quatre tours rondes, un donjon et une porte fortifiée »*, puis **Analyser** → **Générer et montrer** → **Valider**.
- **Enregistrer** produit un fichier `.medieval3d` ; **Ouvrir** le recharge.

Le travail est aussi sauvegardé automatiquement dans le navigateur : après une fermeture accidentelle, l'accueil propose **Reprendre**.

---

## B. Publier sur GitHub (lien public)

Résultat : l'application est accessible à l'adresse `https://VOTRE-COMPTE.github.io/medieval-architect-3d/`, sans rien installer chez les visiteurs. Chaque modification envoyée sur GitHub est republiée automatiquement.

### 1. Créer le dépôt

1. Se connecter à **https://github.com**.
2. En haut à droite **+** → **New repository**.
3. Nom : `medieval-architect-3d`. Laisser **vide** (ne pas cocher « Add a README »). Visibilité : **Public** (obligatoire pour GitHub Pages avec un compte gratuit).
4. **Create repository**.

### 2. Y déposer les fichiers

**Méthode sans ligne de commande** (GitHub Desktop, conseillée si vous n'avez jamais utilisé git) :

1. Installer **GitHub Desktop** : https://desktop.github.com
2. **File → Add local repository** → choisir le dossier `medieval-architect-3d`. S'il propose « create a repository », accepter.
3. **Publish repository** → choisir le nom `medieval-architect-3d`, décocher « Keep this code private ».

**Méthode en ligne de commande** (dans un terminal ouvert dans le dossier) :

```
git init -b main
git add .
git commit -m "Medieval Architect 3D"
git remote add origin https://github.com/VOTRE-COMPTE/medieval-architect-3d.git
git push -u origin main
```

Si le dossier vient de l'archive `.zip` que je vous ai envoyée, il contient déjà un historique git : sauter les deux premières lignes et commencer à `git remote add`.

### 3. Activer la publication

1. Sur la page du dépôt : **Settings** → **Pages** (menu de gauche).
2. Rubrique **Build and deployment** → **Source** : choisir **GitHub Actions**.
3. Onglet **Actions** du dépôt : le travail « Publier sur GitHub Pages » démarre. Il prend 2 à 3 minutes. Une coche verte signifie que c'est en ligne.
4. L'adresse s'affiche dans **Settings → Pages** : `https://VOTRE-COMPTE.github.io/medieval-architect-3d/`.

Le même onglet **Actions** exécute aussi les tests (« Tests ») à chaque envoi. Une croix rouge signale qu'une modification a cassé quelque chose.

### 4. Me donner accès pour la suite

Pour que je puisse travailler directement dans ce dépôt lors d'une prochaine session :

1. Aller sur **https://claude.ai/connect-github** et vérifier que votre compte GitHub est connecté.
2. Autoriser l'application **Claude** sur le dépôt `medieval-architect-3d` (page https://github.com/apps/claude/installations/select_target → votre compte → *Only select repositories* → ajouter `medieval-architect-3d`).
3. Démarrer une nouvelle session Claude Code en sélectionnant ce dépôt.

---

## C. Déménager le projet depuis « mes-livres-en-main »

Faute d'accès à un dépôt dédié, le projet a été rangé dans le dépôt `mes-livres-en-main`, sur la branche `claude/new-session-vsnhwk`, dans le dossier `medieval-architect-3d/`. Le site de vente de livres n'a pas été modifié. Ce rangement est provisoire : GitHub Pages et les tests automatiques ne fonctionnent que si le projet est à la racine de son propre dépôt.

Pour le déménager :

1. Sur GitHub, ouvrir `mes-livres-en-main`, choisir la branche **claude/new-session-vsnhwk** (menu déroulant en haut à gauche), bouton **Code** → **Download ZIP**.
2. Décompresser, puis ne garder que le sous-dossier `medieval-architect-3d`.
3. Suivre la partie **B** avec ce dossier.
4. Une fois le nouveau dépôt en ligne, la branche `claude/new-session-vsnhwk` de `mes-livres-en-main` peut être supprimée (**Branches** → icône corbeille). Elle n'a jamais été fusionnée dans `main`.

---

## Problèmes fréquents

| Symptôme | Solution |
|---|---|
| `node` ou `npm` : « commande introuvable » | Node.js n'est pas installé, ou le terminal était ouvert avant l'installation : fermer et rouvrir le terminal. |
| `npm install` échoue avec une erreur réseau | Réessayer ; derrière un proxy d'entreprise, essayer depuis une autre connexion. |
| La page reste blanche | Utiliser Chrome ou Edge à jour. Ouvrir la console (F12) et me transmettre le message rouge. |
| En bas de l'écran, « Rendu : WebGL 2 (…) » | Normal : le navigateur n'offre pas WebGPU, ou une version incompatible. L'application passe seule sur WebGL 2, tout fonctionne, un peu moins vite. |
| Le port 5173 est déjà utilisé | `npm run dev -- --port 5180`, puis ouvrir `http://localhost:5180/`. |
| GitHub Pages affiche une erreur 404 | Vérifier **Settings → Pages → Source : GitHub Actions**, et que le travail de l'onglet **Actions** est vert. |
| Le travail Actions échoue à « npm test » | Une modification a cassé un test : ouvrir le travail, lire la première ligne rouge. |

## Pour aller plus loin (développeurs)

```
npm test            # 199 tests unitaires et par propriétés (noyau, géométrie, génération)
npm run typecheck   # vérification des types de tous les paquets
npm run e2e         # 18 scénarios dans un vrai navigateur (nécessite Playwright)
npm run build       # version de production dans apps/studio/dist
```

L'architecture est décrite dans [`docs/conception-technique.md`](docs/conception-technique.md), l'état d'avancement dans [`docs/bilan-mvp.md`](docs/bilan-mvp.md).
