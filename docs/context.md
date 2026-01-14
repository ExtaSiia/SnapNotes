# Contexte du Projet : SnapNotes

## Description
Cet outil est une application web (PWA) monopage conçue pour gérer une liste de raccourcis textuels (snippets) afin d'optimiser la productivité quotidienne. Elle permet la copie rapide, l'édition immédiate et fonctionne hors ligne.

## Structure Technique
- **Stack** : HTML5, CSS3, Vanilla JavaScript.
- **Stockage** : `localStorage` du navigateur (Clé : `shortcuts` + préférences).
- **PWA** : Support hors ligne via `ServiceWorker` et installable (`manifest.json`).
- **Assets** : Google Fonts (Inter) & Material Symbols Rounded (Icônes).

## Fonctionnalités

### 1. Gestion Avancée (CRUD & Plus)
- **Création** : Titre, Contenu, Catégorie (Travail, Perso, Urgent, Autre).
- **Formatage** : Support du **Markdown léger** (gras `**`, code `` ` ``, listes) et détection automatique des liens.
- **Organisation** : Drag & Drop (glisser-déposer), Tri (Manuel, Alphabétique, Récence).
- **Undo/Redo** : Système d'historique complet (Ctrl+Z / Ctrl+Y) pour annuler/rétablir les actions.

### 2. Interface & Accessibilité
- **Design** : Interface moderne, "Glassmorphism", icônes Material Design.
- **Thèmes** : Mode Sombre (défaut) / Mode Clair.
- **Mode Compact** : Affichage densifié pour voir plus de raccourcis.
- **Responsive** : Adaptation mobile complète avec FAB (Floating Action Button).

### 3. Utilitaires & Productivité
- **Recherche** : Filtrage instantané par texte et par catégorie.
- **Export/Import** :
    - Export JSON (sauvegarde complète).
    - Export Markdown (pour documentation ou notes).
    - Import JSON (restauration).
- **Carte "Heure Appel"** : Carte persistante affichant l'heure formatée pour la prise de notes rapide.

### 4. PWA (Progressive Web App)
- Fonctionne hors ligne (cache des assets).
- Installable comme une application native sur PC et Mobile.

## Expérience Utilisateur (UX)
- Feedback visuel constant (Toasts, Animations, Shake on error).
- Modales pour les interactions complexes (Ajout/Édition).
- Raccourcis clavier pour l'efficacité.
