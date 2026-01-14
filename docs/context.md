# Contexte du Projet : SnapNotes

## Description
SnapNotes est une application web (PWA) de prise de notes ultra-rapide et sécurisée. Elle permet de stocker, chiffrer et organiser des snippets textuels avec une confidentialité totale ("Zero Knowledge").

## Structure Technique
- **Stack** : HTML5, CSS3, Vanilla JavaScript (Modern ES6+).
- **Stockage** : `IndexedDB` (Base de données transactionnelle structurée "SnapNotesDB").
- **Sécurité** :
    - API `Web Crypto` (SubtleCrypto).
    - Chiffrement **AES-GCM 256-bit** des contenus.
    - Clé dérivée (PBKDF2) depuis un code secret utilisateur + Sel unique.
    - **Sécurité Avancée (v2.21)** :
        - Politique de Sécurité de Contenu (**CSP**) stricte (`default-src 'self'`).
        - Protection contre le **Brute-Force** (Délai exponentiel après 3 échecs).
        - **Sel Cryptographique Hybride** : Aléatoire pour les nouvelles installations, Legacy pour la compatibilité.
    - La clé de session est stockée en `sessionStorage` (jamais sur disque dur) et exportable.
- **PWA** : Support hors ligne "Cache-First" avec mise à jour automatique (v2.21).

## Fonctionnalités Clés

### 1. Sécurité & Confidentialité (V2)
- **Chiffrement "Zero Knowledge"** : Les données sont stockées chiffrées en AES-GCM.
- **Verrouillage Intelligent** :
    - UI Premium pour la saisie du code (Glassmorphism).
    - **Session Persistante** : Maintien de l'accès au rechargement.
    - **Timeout d'inactivité** : Verrouillage automatique à 15mn.
    - **Anti-Duplication** : Correctifs sur l'édition et l'affichage des cartes (Date/Heure).
- **Migration** : Système automatique pour transformer les anciennes données.

### 2. Gestion de Contenu
- **CRUD Asynchrone** : Ajout, Modification et Suppression interagissant avec la base de données chiffrée.
- **Formatage Riche** : Support du Markdown (Gras, Code, Listes) et liens cliquables.
- **Organisation** : Catégories visuelles, Drag & Drop, Tri par récence/alphabétique.
- **Historique** : Undo/Redo complet (Ctrl+Z / Ctrl+Y) pour sécuriser les erreurs de manipulation.

### 3. Interface & UX
- **Design Premium** : Thème sombre par défaut, Glassmorphism, animations fluides.
- **Responsive** : Interface adaptative PC/Mobile (Fab Button, Grid Layout).
- **Mode Compact** : Vue densifiée optionnelle.

### 4. Outils
- **Recherche Temps-réel** : Filtrage ultrarapide (sur cache déchiffré en mémoire).
- **Export/Import** :
    - JSON (Données brutes, pratique pour le backup).
    - Markdown (Pour l'usage externe).
- **Carte "Heure Appel"** : Utilitaire intégré pour logs rapides.

## Environnement
- **Serveur de Dev** : `live-server` intégré via `npm start`.
- **Déploiement** : Prêt pour Netlify/GitHub Pages (PWA validée).
