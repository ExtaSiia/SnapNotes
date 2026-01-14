# ⚡ SnapNotes (Ex-Raccourcis)

![License](https://img.shields.io/badge/license-MIT-blue.svg) ![Version](https://img.shields.io/badge/version-2.21-purple.svg) ![Status](https://img.shields.io/badge/status-live-success.svg)

**SnapNotes** est une application web (PWA) de prise de notes ultra-rapide, sécurisée et "Zero Knowledge". Elle permet de stocker vos snippets, bouts de code et mémos directement dans votre navigateur, chiffrés avec votre mot de passe.

👉 **Démonstration en ligne :** [https://snapnotes-dev.netlify.app](https://snapnotes-dev.netlify.app)

---

## ✨ Fonctionnalités Clés (V2)

### 🔒 Sécurité & Confidentialité
*   **Chiffrement AES-GCM 256-bit** : Vos données sont chiffrées *avant* d'être stockées.
*   **Protection Brute-Force** : Délai d'attente exponentiel après 3 échecs.
*   **Politique CSP Stricte** : Blindage contre les scripts malveillants.
*   **Architecture "Zero Knowledge"** : Nous ne connaissons pas votre mot de passe, et donc nous ne pouvons pas lire vos notes.
*   **Session Persistante** : Verrouillage automatique après 15 minutes d'inactivité.

### 🚀 Expérience Utilisateur
*   **Progressive Web App (PWA)** : Installez l'app sur votre PC ou Mobile. Fonctionne 100% hors-ligne.
*   **Riche & Rapide** : Support du Markdown (gras, code, listes), détection de liens, et tri intelligent.
*   **Interface Premium** : Design "Glassmorphism", thème sombre soigné, et animations fluides.

### 🛠️ Outils de Productivité
*   **Undo/Redo (Ctrl+Z)** : Système d'historique complet pour ne jamais perdre une modification.
*   **Import/Export** : Sauvegardez tout en JSON ou exportez vos notes en Markdown lisible.
*   **Mode Compact** : Pour afficher un maximum d'informations à l'écran.

---

## 🛠️ Stack Technique

*   **Frontend** : HTML5, CSS3 (Variables, Flexbox/Grid), Vanilla JS (ES6+).
*   **Stockage** : `IndexedDB` (Base de données locale transactionnelle).
*   **Crypto** : `Web Crypto API` (SubtleCrypto) pour les opérations de chiffrement natives et rapides.
*   **Déploiement** : Netlify (CI/CD via GitHub).

---

## 💻 Installation Locale

Si vous souhaitez héberger le projet vous-même ou contribuer :

1.  **Cloner le dépôt**
    ```bash
    git clone https://github.com/ExtaSiia/SnapNotes.git
    cd SnapNotes
    ```

2.  **Lancer le serveur de dev**
    Vous avez besoin de Node.js installé.
    ```bash
    npm install
    npm start
    ```
    Cela ouvrira l'application sur `http://127.0.0.1:8080`.

---

## 🤝 Contribuer

Les contributions sont les bienvenues ! N'hésitez pas à ouvrir une *Issue* ou une *Pull Request*.

1.  Forkez le projet
2.  Créez votre branche (`git checkout -b feature/AmazingFeature`)
3.  Committez vos changements (`git commit -m 'Add some AmazingFeature'`)
4.  Poussez sur la branche (`git push origin feature/AmazingFeature`)
5.  Ouvrez une Pull Request

---

*Développé avec ❤️ par [ExtaSiia](https://github.com/ExtaSiia)*
