<div align="center">
  <h1>🦊 Foxy Music Bot 🦊</h1>
  <p><strong>Un bot de musique Discord puissant, performant et avec son propre Dashboard Web !</strong></p>

  <p>
    <img src="https://img.shields.io/badge/Node.js-18.x-green?style=for-the-badge&logo=node.js" alt="Node.js" />
    <img src="https://img.shields.io/badge/Discord.js-v14-blue?style=for-the-badge&logo=discord" alt="Discord.js" />
    <img src="https://img.shields.io/badge/React-Vite-646CFF?style=for-the-badge&logo=react" alt="React" />
    <img src="https://img.shields.io/badge/Lavalink-Shoukaku-red?style=for-the-badge" alt="Lavalink" />
  </p>
</div>

<hr>

## ✨ Fonctionnalités

*   **🎧 Qualité Audio Exceptionnelle** : Propulsé par Lavalink via la librairie Shoukaku, garantissant une lecture fluide et sans latence.
*   **🌐 Dashboard Web en Temps Réel** : Une interface web moderne conçue en React/Vite pour contrôler votre musique depuis votre navigateur (file d'attente, volume, pause/lecture).
*   **⚡ Commandes Slash Intégrées** : Une expérience utilisateur moderne sur Discord grâce aux dernières API (autocomplétion, menus interactifs).
*   **🎛️ Boutons de Contrôle** : Un panneau de contrôle directement dans le salon textuel pour interagir facilement (Lecture/Pause, Passer, Stop, Boucle, Volume, Paroles).
*   **📜 Paroles de Chansons** : Obtenez les paroles du titre en cours de lecture d'un simple clic.

## 🛠️ Technologies Utilisées

### Bot Discord (Backend)
*   [Node.js](https://nodejs.org/)
*   [Discord.js v14](https://discord.js.org/)
*   [Shoukaku](https://github.com/Deivu/Shoukaku) (Client Lavalink)
*   [Express](https://expressjs.com/) & [Socket.io](https://socket.io/) (Pour le Dashboard Web)

### Dashboard Web (Frontend)
*   [React 19](https://react.dev/)
*   [Vite](https://vitejs.dev/)
*   [Lucide React](https://lucide.dev/) (Icônes)

## 🚀 Prérequis

Avant de commencer, assurez-vous de disposer des éléments suivants :

1.  **Node.js** (Version 18 ou supérieure recommandée)
2.  Un **Token de Bot Discord** (Créé depuis le [Discord Developer Portal](https://discord.com/developers/applications))
3.  Des nœuds **Lavalink** (Un ou plusieurs nœuds sont préconfigurés dans le code, mais il est recommandé d'avoir les vôtres pour la production)

## 📥 Installation

1.  **Cloner le dépôt et installer les dépendances du Bot :**
    ```bash
    git clone https://github.com/votre-nom/foxy-music-bot.git
    cd "foxy music bot"
    npm install
    ```

2.  **Installer les dépendances du Dashboard Web :**
    ```bash
    cd dashboard
    npm install
    cd ..
    ```

## ⚙️ Configuration

1. Créez un fichier `.env` à la racine du projet et ajoutez vos identifiants :
    ```env
    DISCORD_TOKEN=votre_token_discord_ici
    CLIENT_ID=votre_client_id_discord
    ```

2. Vous pouvez configurer ou modifier les nœuds Lavalink dans le fichier `src/index.js` (dans le tableau `Nodes`).

## ▶️ Démarrage

1.  **Déployer les commandes Slash sur Discord :**
    ```bash
    npm run deploy
    ```

2.  **Lancer le Bot (et l'API Web) :**
    ```bash
    npm start
    ```

3.  **Lancer le Dashboard Web (en mode développement) :**
    ```bash
    cd dashboard
    npm run dev
    ```

---

<div align="center">
  <i>Développé avec ❤️ pour animer vos serveurs Discord</i>
</div>
