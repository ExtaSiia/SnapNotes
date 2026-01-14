const DB_NAME = 'SnapNotesDB';
const DB_VERSION = 1;
const STORE_SHORTCUTS = 'shortcuts';
const STORE_CONFIG = 'config';

let db;
let sessionKey = null; // CryptoKey
let appSalt = null; // Uint8Array

// State
let shortcutsCache = []; // In-memory cache for search/rendering

/* ---------- Phase 1: IndexedDB ---------- */
function openDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(STORE_SHORTCUTS)) {
                db.createObjectStore(STORE_SHORTCUTS, { keyPath: 'id', autoIncrement: true });
            }
            if (!db.objectStoreNames.contains(STORE_CONFIG)) {
                db.createObjectStore(STORE_CONFIG, { keyPath: 'key' });
            }
        };

        request.onsuccess = (e) => {
            db = e.target.result;
            resolve(db);
        };

        request.onerror = (e) => reject('DB Error: ' + e.target.error);
    });
}

/* ---------- Phase 2: Web Crypto API ---------- */
// 1. Get/Create Global Salt
async function getOrInitSalt() {
    return new Promise((resolve, reject) => {
        const tx = db.transaction([STORE_CONFIG], 'readwrite');
        const store = tx.objectStore(STORE_CONFIG);
        const req = store.get('appSalt');

        req.onsuccess = async () => {
            if (req.result) {
                // Found existing salt
                resolve(req.result.value);
            } else {
                // New install/migration: Create salt
                const newSalt = crypto.getRandomValues(new Uint8Array(16));
                store.put({ key: 'appSalt', value: newSalt });
                resolve(newSalt);
            }
        };
        req.onerror = () => reject('Salt Error');
    });
}

// 2. Derive Key from Password + Salt
async function deriveKey(password, salt) {
    const enc = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
        'raw',
        enc.encode(password),
        { name: 'PBKDF2' },
        false,
        ['deriveKey']
    );

    return crypto.subtle.deriveKey(
        {
            name: 'PBKDF2',
            salt: salt,
            iterations: 100000,
            hash: 'SHA-256'
        },
        keyMaterial,
        { name: 'AES-GCM', length: 256 },
        true, // Change to TRUE to allow export for session persistence
        ['encrypt', 'decrypt']
    );
}

// ...

async function restoreState(jsonString) {
    isRestoringHistory = true;
    const data = JSON.parse(jsonString);

    // Direct Refill (skip decrypt since history is plaintext)
    const container = document.getElementById('customShortcuts');
    const dtCard = document.getElementById('datetime-card');
    container.innerHTML = '';
    if (dtCard) container.appendChild(dtCard);

    data.forEach(s => createCardDOM(s.title, s.content, s.category || 'Autre', s.lastUsed));

    // updateShortcutsGrid(); // REMOVED (Legacy)
    // We already re-rendered above.

    await saveShortcuts(); // Persist the restore to IDB
    isRestoringHistory = false;
    updateUndoRedoUI();
    showToast('État restauré', 'info');
}

// 3. Encrypt Data
async function encryptData(text) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const enc = new TextEncoder();
    const encrypted = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv: iv },
        sessionKey,
        enc.encode(text)
    );
    return { iv: iv, data: encrypted };
}

// 4. Decrypt Data
async function decryptData(encryptedObj) {
    try {
        const decrypted = await crypto.subtle.decrypt(
            { name: 'AES-GCM', iv: encryptedObj.iv },
            sessionKey,
            encryptedObj.data
        );
        const dec = new TextDecoder();
        return dec.decode(decrypted);
    } catch (e) {
        console.error('Decryption failed', e);
        return null; // Wrong password or corrupted
    }
}

/* ---------- App Unlock Flow ---------- */
const SESSION_TIMEOUT_MS = 15 * 60 * 1000; // 15 Minutes

async function initApp() {
    try {
        await openDB();

        // Show Security Overlay by default
        const overlay = document.getElementById('security-overlay');
        const input = document.getElementById('security-input');
        const btn = document.getElementById('security-btn');

        // Check Session
        const hasSession = await restoreSession();
        if (hasSession) {
            overlay.classList.add('hidden');
            await loadAndRenderShortcuts();
            showToast('Session restaurée 🔓', 'info');
            startInactivityTimer();
            return; // Skip login prompt
        }

        // Check if migration needed (LocalStorage exists)
        const hasLegacy = localStorage.getItem('shortcuts');
        if (hasLegacy) {
            document.getElementById('security-message').textContent = "Migration : Créez votre code secret pour sécuriser vos notes existantes.";
        }

        overlay.classList.remove('hidden');
        input.focus();

        btn.onclick = async () => handleUnlock();
        input.onkeydown = (e) => { if (e.key === 'Enter') handleUnlock(); };

    } catch (err) {
        showToast('Erreur Init: ' + err, 'error');
    }
}

async function handleUnlock() {
    const pwd = document.getElementById('security-input').value;
    if (!pwd) return showToast('Code requis', 'error');

    try {
        appSalt = await getOrInitSalt();
        sessionKey = await deriveKey(pwd, appSalt);

        // Load or Migrate
        const overlay = document.getElementById('security-overlay');

        // Check legacy
        if (localStorage.getItem('shortcuts')) {
            await performMigration();
        }

        // Save Session
        await saveSession(sessionKey);

        // Load Data
        await loadAndRenderShortcuts();

        // If successful
        overlay.classList.add('hidden');
        showToast('Notes déverrouillées 🔓', 'success');
        startInactivityTimer();

    } catch (err) {
        showToast('Erreur (Code incorrect ?)', 'error');
        console.error(err);
    }
}

/* ---------- Session Management (SessionStorage) ---------- */
async function saveSession(key) {
    const exported = await crypto.subtle.exportKey('jwk', key);
    sessionStorage.setItem('snapNotesKey', JSON.stringify(exported));
    sessionStorage.setItem('lastActive', Date.now());
}

async function restoreSession() {
    const jsonKey = sessionStorage.getItem('snapNotesKey');
    const lastActive = sessionStorage.getItem('lastActive');

    if (!jsonKey || !lastActive) return false;

    // Check Timeout
    if (Date.now() - parseInt(lastActive) > SESSION_TIMEOUT_MS) {
        sessionStorage.clear();
        return false;
    }

    try {
        appSalt = await getOrInitSalt(); // Salt is needed for new derivations but not for import
        const jwk = JSON.parse(jsonKey);
        sessionKey = await crypto.subtle.importKey(
            'jwk',
            jwk,
            { name: 'AES-GCM', length: 256 },
            false,
            ['encrypt', 'decrypt']
        );
        return true;
    } catch (e) {
        console.error('Session restore failed', e);
        return false;
    }
}

let inactivityTimer;
function startInactivityTimer() {
    // Update lastActive on interactions
    ['mousedown', 'keydown', 'touchstart'].forEach(evt => {
        document.addEventListener(evt, () => {
            sessionStorage.setItem('lastActive', Date.now());
        });
    });

    // Check periodically
    setInterval(() => {
        const last = sessionStorage.getItem('lastActive');
        if (last && (Date.now() - parseInt(last) > SESSION_TIMEOUT_MS)) {
            lockApp();
        }
    }, 60000); // Check every minute
}

function lockApp() {
    sessionStorage.removeItem('snapNotesKey');
    sessionKey = null;
    shortcutsCache = []; // Clear memory
    const container = document.getElementById('customShortcuts');
    container.innerHTML = ''; // Clear UI

    document.getElementById('security-overlay').classList.remove('hidden');
    document.getElementById('security-input').value = '';
    showToast('Session expirée', 'warning');
}


/* ---------- Migration (LS -> IDB) ---------- */
async function performMigration() {
    const raw = localStorage.getItem('shortcuts');
    if (!raw) return;
    const legacyData = JSON.parse(raw); // Array of {title, content, category}

    const tx = db.transaction([STORE_SHORTCUTS], 'readwrite');
    const store = tx.objectStore(STORE_SHORTCUTS);

    // Clear Store first?
    // store.clear(); 

    for (const item of legacyData) {
        // We encrypt title AND content? Or just content?
        // Plan says: "Recherche en temps réel ... sur les titres (non chiffrés) ... OU déchiffrez les données en mémoire une seule fois".
        // To search efficiently without full decryption, maybe keep title clear?
        // User request: "transformer le contenu texte de vos raccourcis en données illisibles."
        // Let's Encrypt CONTENT only for now? Or Encrypt Whole Object JSON?
        // Better: Store { title_enc, content_enc, category } OR { iv, data: encrypted_json_string }.
        // Let's Encrypt CONTENT strings individually to keep object structure for IDB.
        // Actually, user said: "transformer le contenu texte de vos raccourcis".
        // Let's encrypt Title, Content. Category can be clear for filtering?
        // Let's encrypt Title and Content.

        const encTitle = await encryptData(item.title);
        const encContent = await encryptData(item.content);

        store.put({
            title: encTitle,
            content: encContent,
            category: item.category || 'Autre',
            lastUsed: item.lastUsed || Date.now()
        });
    }

    return new Promise((resolve) => {
        tx.oncomplete = () => {
            localStorage.removeItem('shortcuts'); // Nuke legacy
            resolve();
        };
    });
}


/* ---------- Utility Functions ---------- */
function displayDateTime() {
    const options = { timeZone: 'Europe/Paris', hour12: false, year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' };
    const dateTime = new Date().toLocaleString('fr-FR', options);
    const message = ' Appel : pas de réponse > message laissé';
    const el = document.getElementById('datetime');
    if (!el) return;
    el.classList.add('dt-updated');
    el.textContent = 'CC ' + dateTime + message;
    setTimeout(() => el.classList.remove('dt-updated'), 220);
}
setInterval(displayDateTime, 1000);
displayDateTime();

function toggleTheme() {
    document.body.classList.toggle('light');
    const isLight = document.body.classList.contains('light');

    // Update Theme Icon
    const icon = document.querySelector('#themeToggle span');
    if (icon) icon.textContent = isLight ? 'light_mode' : 'dark_mode';

    // Update Logo Image
    const logo = document.getElementById('app-logo');
    if (logo) {
        logo.src = isLight ? 'assets/logo_clair.png' : 'assets/logo_sombre.png';
    }
}

function searchCards() {
    const q = document.getElementById('search').value.toLowerCase();
    const cat = document.getElementById('categoryFilter').value;

    document.querySelectorAll('.card').forEach(card => {
        if (card.id === 'datetime-card') return;
        const text = (card.dataset.title + ' ' + card.dataset.content).toLowerCase();
        const cardCat = card.dataset.category || 'Autre';

        // Match text and category
        const matchText = text.includes(q);
        const matchCat = cat === '' || cardCat === cat;

        card.style.display = matchText && matchCat ? 'flex' : 'none';
    });
}

/* ---------- Async CRUD ---------- */

async function loadAndRenderShortcuts() {
    const container = document.getElementById('customShortcuts');
    const dtCard = document.getElementById('datetime-card');
    const sort = document.getElementById('sortOrder') ? document.getElementById('sortOrder').value : 'default';

    container.innerHTML = '';
    if (dtCard) container.appendChild(dtCard);

    // Fetch from IDB
    const tx = db.transaction([STORE_SHORTCUTS], 'readonly');
    const store = tx.objectStore(STORE_SHORTCUTS);
    const req = store.getAll();

    req.onsuccess = async () => {
        const encryptedItems = req.result;
        shortcutsCache = [];

        for (const item of encryptedItems) {
            const title = await decryptData(item.title);
            const content = await decryptData(item.content);

            if (title === null || content === null) {
                console.error("Failed to decrypt item", item.id);
                continue;
            }

            shortcutsCache.push({
                id: item.id,
                title: title,
                content: content,
                category: item.category,
                lastUsed: item.lastUsed || 0
            });
        }

        // Sort
        if (sort === 'alpha') {
            shortcutsCache.sort((a, b) => a.title.localeCompare(b.title));
        } else if (sort === 'lastUsed') {
            shortcutsCache.sort((a, b) => (b.lastUsed || 0) - (a.lastUsed || 0));
        }

        // Render
        shortcutsCache.forEach(s => createCardDOM(s.title, s.content, s.category || 'Autre', s.lastUsed)); // Update createCardDOM signature

        searchCards(); // Re-apply filter
    };
}

async function saveShortcuts() {
    const data = [];
    // Read state from DOM to respect current order (DnD)
    document.querySelectorAll('#customShortcuts .card').forEach(c => {
        if (c.id === 'datetime-card') return;
        data.push({
            title: c.dataset.title,
            content: c.dataset.content,
            category: c.dataset.category || 'Autre',
            lastUsed: parseInt(c.dataset.lastUsed || 0)
        });
    });

    shortcutsCache = data;

    // Encrypt & Save to IDB
    // Strategy: Clear and Add All (simplest for order sync)
    // Transaction must remain active, so allow await inside but be careful
    // Actually, awaiting inside a loop might close implicit transaction in some old browsers but usually fine in modern.
    // Better: Prepare all encrypted objects first, then one tx.

    const preparedItems = [];
    for (const item of data) {
        const encTitle = await encryptData(item.title);
        const encContent = await encryptData(item.content);
        preparedItems.push({
            title: encTitle,
            content: encContent,
            category: item.category,
            lastUsed: item.lastUsed
        });
    }

    const tx = db.transaction([STORE_SHORTCUTS], 'readwrite');
    const store = tx.objectStore(STORE_SHORTCUTS);
    store.clear(); // Wipe V1 store

    preparedItems.forEach(item => store.put(item));

    // History (Store Plaintext)
    if (!isRestoringHistory) {
        if (historyStep < historyStack.length - 1) {
            historyStack = historyStack.slice(0, historyStep + 1);
        }
        historyStack.push(JSON.stringify(data));
        historyStep++;
        updateUndoRedoUI();
    }
}

function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function formatContent(text) {
    // 1. Sanitize first (Security)
    let safe = escapeHtml(text);

    // 2. Formatting (Markdown-like)
    // Bold: **text**
    safe = safe.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

    // Code: `text`
    safe = safe.replace(/`(.*?)`/g, '<code>$1</code>');

    // URLs: https://...
    // Simple regex for URLs (starts with http/https)
    safe = safe.replace(
        /(https?:\/\/[^\s]+)/g,
        '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>'
    );

    // Lists: - item (must be at start of line or after newline)
    // We treat newlines as <br> for general text, but lists need structure
    // Simple approach: replace "- " with bullet char or styled span, preserving newlines
    safe = safe.replace(/\n- (.*)/g, '<br>• $1');

    // Line breaks to <br> (excluding those we just handled for lists if we want, but simpler to just do all)
    // Note: The previous regex \n- handles specific list items. 
    // Let's replace remaining newlines with <br>
    safe = safe.replace(/\n/g, '<br>');

    return safe;
}

/* ---------- UI Components ---------- */
function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<span>${message}</span>`;
    container.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(-20px)';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// Global modal state
let currentModalConfirmAction = null;

function closeModal() {
    const overlay = document.getElementById('modal-overlay');
    overlay.classList.add('hidden');
    // Clear content after animation
    setTimeout(() => {
        document.getElementById('modal-body').innerHTML = '';
        currentModalConfirmAction = null;
    }, 300);
}

document.getElementById('modal-confirm-btn').addEventListener('click', () => {
    if (currentModalConfirmAction) currentModalConfirmAction();
    closeModal();
});

/* ---------- Core Logic ---------- */

function createCardDOM(title, content, category = 'Autre', lastUsed = 0) {
    const container = document.getElementById('customShortcuts');
    const card = document.createElement('div');
    card.className = 'card new';
    card.setAttribute('draggable', 'true');

    card.dataset.title = title;
    card.dataset.content = content;
    card.dataset.category = category;
    card.dataset.lastUsed = lastUsed || Date.now(); // Init if new

    card.innerHTML = `
    <div class="card-content">
      <div class="tags"><span class="tag ${category}">${category}</span></div>
      <h3>${escapeHtml(title)}</h3>
      <p>${formatContent(content)}</p>
    </div>
    <div class="card-buttons">
      <button class="copyBtn" onclick="copyContent(this)">
        <span class="material-symbols-rounded">content_copy</span> Copier
      </button>
      <button class="editBtn" onclick="openEditModal(this)">
        <span class="material-symbols-rounded">edit</span> Editer
      </button>
      <button class="deleteBtn" onclick="confirmDelete(this)">
        <span class="material-symbols-rounded">delete</span> Supprimer
      </button>
    </div>
  `;
    container.appendChild(card);
    addDnDHandlers(card);
    setTimeout(() => card.classList.remove('new'), 500);
}

// saveShortcuts Replaced above

/* ---------- History (Undo/Redo) ---------- */
let historyStack = [];
let historyStep = -1;
let isRestoringHistory = false;

function initHistory() {
    // History starts empty until first load?
    // Actually we should push initial state after load.
    historyStack = [];
    historyStep = -1;
}

function updateUndoRedoUI() {
    const undoBtn = document.getElementById('undoBtn');
    const redoBtn = document.getElementById('redoBtn');
    if (undoBtn) undoBtn.disabled = historyStep <= 0;
    if (redoBtn) redoBtn.disabled = historyStep >= historyStack.length - 1;
}

function undo() {
    if (historyStep > 0) {
        historyStep--;
        restoreState(historyStack[historyStep]);
    }
}

function redo() {
    if (historyStep < historyStack.length - 1) {
        historyStep++;
        restoreState(historyStack[historyStep]);
    }
}

async function restoreState(jsonString) {
    isRestoringHistory = true;
    const data = JSON.parse(jsonString);

    // Direct Refill (skip decrypt since history is plaintext)
    const container = document.getElementById('customShortcuts');
    const dtCard = document.getElementById('datetime-card');
    container.innerHTML = '';
    if (dtCard) container.appendChild(dtCard);

    data.forEach(s => createCardDOM(s.title, s.content, s.category || 'Autre', s.lastUsed));

    await saveShortcuts(); // Persist the restore to IDB
    isRestoringHistory = false;
    updateUndoRedoUI();
    showToast('État restauré', 'info');
}

// ... Actions ...

window.addEventListener('load', () => {
    initApp(); // New Entry Point
    initHistory();
    document.getElementById('year').textContent = new Date().getFullYear();

    if (localStorage.getItem('compactMode') === 'true') {
        document.getElementById('customShortcuts').classList.add('compact');
    }

    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('./sw.js')
            .then(() => console.log('Service Worker Registered'))
            .catch(err => console.log('SW Registration Failed:', err));
    }
});

// ADD
function openAddModal() {
    const modalTitle = document.getElementById('modal-title');
    const modalBody = document.getElementById('modal-body');
    const modalConfirmBtn = document.getElementById('modal-confirm-btn');

    modalTitle.textContent = 'Ajouter un raccourci';
    modalBody.innerHTML = `
    <div class="form-group">
        <label for="input-title">Titre</label>
        <input type="text" id="input-title" placeholder="Ex: Signature mail..." autocomplete="off">
    </div>
    <div class="form-group">
        <label for="input-category">Catégorie</label>
        <select id="input-category">
            <option value="Travail">Travail</option>
            <option value="Perso">Perso</option>
            <option value="Urgent">Urgent</option>
            <option value="Autre" selected>Autre</option>
        </select>
    </div>
    <div class="form-group">
        <label for="input-content">Contenu</label>
        <textarea id="input-content" rows="6" placeholder="Le texte à sauvegarder..."></textarea>
    </div>
  `;

    modalConfirmBtn.onclick = () => {
        const title = document.getElementById('input-title').value.trim();
        const content = document.getElementById('input-content').value.trim();
        const category = document.getElementById('input-category').value;

        if (!title) {
            document.getElementById('input-title').focus();
            showToast('Titre requis', 'error');
            return;
        }
        if (!content) {
            document.getElementById('input-content').focus();
            showToast('Contenu requis', 'error');
            return;
        }

        createCardDOM(title, content, category);
        saveShortcuts();
        closeModal();
        showToast('Raccourci ajouté !', 'success');
    };

    document.getElementById('modal-overlay').classList.remove('hidden');
    setTimeout(() => document.getElementById('input-title').focus(), 100);
}

// EDIT
function openEditModal(btn) {
    const card = btn.closest('.card');
    const oldTitle = card.dataset.title;
    const oldContent = card.dataset.content;
    const oldCategory = card.dataset.category || 'Autre';

    const modalTitle = document.getElementById('modal-title');
    const modalBody = document.getElementById('modal-body');
    const modalConfirmBtn = document.getElementById('modal-confirm-btn');

    modalTitle.textContent = 'Modifier le raccourci';
    modalBody.innerHTML = `
    <div class="form-group">
        <label for="edit-title">Titre</label>
        <input type="text" id="edit-title" value="${escapeHtml(oldTitle)}">
    </div>
    <div class="form-group">
        <label for="edit-category">Catégorie</label>
        <select id="edit-category">
            <option value="Travail" ${oldCategory === 'Travail' ? 'selected' : ''}>Travail</option>
            <option value="Perso" ${oldCategory === 'Perso' ? 'selected' : ''}>Perso</option>
            <option value="Urgent" ${oldCategory === 'Urgent' ? 'selected' : ''}>Urgent</option>
            <option value="Autre" ${oldCategory === 'Autre' ? 'selected' : ''}>Autre</option>
        </select>
    </div>
    <div class="form-group">
        <label for="edit-content">Contenu</label>
        <textarea id="edit-content" rows="6">${escapeHtml(oldContent)}</textarea>
    </div>
  `;

    modalConfirmBtn.onclick = () => {
        const newTitle = document.getElementById('edit-title').value.trim();
        const newCategory = document.getElementById('edit-category').value;
        const newContent = document.getElementById('edit-content').value.trim();

        if (!newTitle || !newContent) {
            showToast('Champs requis', 'error');
            return;
        }

        card.dataset.title = newTitle;
        card.dataset.content = newContent;
        card.dataset.category = newCategory;

        // Re-render HTML content of the card
        const tagSpan = card.querySelector('.tag');
        tagSpan.className = `tag ${newCategory}`;
        tagSpan.textContent = newCategory;
        card.querySelector('h3').textContent = newTitle;
        card.querySelector('p').innerHTML = formatContent(newContent);

        saveShortcuts();
        closeModal();
        showToast('Modification enregistrée', 'success');
    };

    document.getElementById('modal-overlay').classList.remove('hidden');
}

// DELETE
function confirmDelete(btn) {
    const card = btn.closest('.card');
    const titleEl = document.getElementById('modal-title');
    const bodyEl = document.getElementById('modal-body');

    titleEl.textContent = 'Suppression';
    bodyEl.innerHTML = `<p>Voulez-vous vraiment supprimer "<strong>${escapeHtml(card.dataset.title)}</strong>" ?</p>`;

    currentModalConfirmAction = () => {
        card.classList.add('removing');
        setTimeout(() => {
            card.remove();
            saveShortcuts();
            showToast('Raccourci supprimé', 'success');
        }, 320);
    };

    document.getElementById('modal-overlay').classList.remove('hidden');
}

// COPY
function copy(id, btn) {
    const txt = document.getElementById(id).textContent;
    navigator.clipboard.writeText(txt);
    showToast('Copié dans le presse-papiers !', 'success');
}


// Update copyContent to update IDB
async function copyContent(btn) {
    const card = btn.closest('.card');
    const content = card.dataset.content;
    const title = card.dataset.title;

    navigator.clipboard.writeText(content);
    showToast('Contenu copié !', 'success');

    // Update lastUsed in IDB
    // We can just update memory cache and saveAll? Or be more surgical?
    // Saving all is simpler for consistency with `saveShortcuts` logic.
    // BUT we don't want to encrypt EVERYTHING just for a click.
    // Optimization: Update just the dataset and call saveShortcuts?
    // As per user plan: "Suppression : ... cible l'id unique".
    // For now, let's just update the DOM dataset and call saveShortcuts (which dumps all).
    card.dataset.lastUsed = Date.now();
    await saveShortcuts();
}

// Update Exports to use shortcutsCache (Plaintext)
function exportFile() {
    const data = shortcutsCache; // Decrypted cache
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'shortcuts.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('Export réussi !', 'success');
}

function exportMarkdown() {
    const data = shortcutsCache; // Decrypted cache
    let md = '# Mes Raccourcis\n\n';

    data.forEach(s => {
        md += `## ${s.title} [${s.category || 'Autre'}]\n\n${s.content}\n\n---\n\n`;
    });

    const blob = new Blob([md], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'raccourcis.md';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('Export Markdown réussi !', 'success');
}

function toggleCompactMode() {
    const grid = document.getElementById('customShortcuts');
    grid.classList.toggle('compact');
    const isCompact = grid.classList.contains('compact');
    localStorage.setItem('compactMode', isCompact);
}

function importFile(input) {
    const file = input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function (e) {
        try {
            const data = JSON.parse(e.target.result);
            if (!Array.isArray(data)) throw 'Format invalide';

            // Clear existing except datetime
            const container = document.getElementById('customShortcuts');
            Array.from(container.children).forEach(c => {
                if (c.id !== 'datetime-card') c.remove();
            });

            data.forEach(s => {
                if (s.title && s.content) createCardDOM(s.title, s.content);
            });
            saveShortcuts();
            showToast('Import réussi !', 'success');
        } catch (err) {
            showToast('Erreur : ' + err, 'error');
        }
        input.value = ''; // Reset
    };
    reader.readAsText(file);
}

/* ---------- Drag & Drop ---------- */
let dragSrcEl = null;

function handleDragStart(e) {
    dragSrcEl = this;
    e.dataTransfer.effectAllowed = 'move';
    this.classList.add('dragging');
}

function handleDragOver(e) {
    if (e.preventDefault) e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    return false;
}

function handleDragEnter(e) {
    if (this !== dragSrcEl) this.classList.add('over');
}

function handleDragLeave(e) {
    this.classList.remove('over');
}

function handleDrop(e) {
    if (e.stopPropagation) e.stopPropagation();

    if (dragSrcEl !== this) {
        // Check order
        const container = document.getElementById('customShortcuts');
        const cards = Array.from(container.querySelectorAll('.card:not(#datetime-card)'));
        const srcIndex = cards.indexOf(dragSrcEl);
        const targetIndex = cards.indexOf(this);

        if (srcIndex < targetIndex) {
            this.after(dragSrcEl);
        } else {
            this.before(dragSrcEl);
        }
        saveShortcuts();
    }
    return false;
}

function handleDragEnd(e) {
    this.classList.remove('dragging');
    document.querySelectorAll('.card').forEach(c => c.classList.remove('over'));
}

function addDnDHandlers(card) {
    if (card.id === 'datetime-card') return; // Cannot move datetime ? logic says it's persistent/special. User might want to move it ?? assuming no for now as list saves separate from datetime
    card.addEventListener('dragstart', handleDragStart);
    card.addEventListener('dragenter', handleDragEnter);
    card.addEventListener('dragover', handleDragOver);
    card.addEventListener('dragleave', handleDragLeave);
    card.addEventListener('drop', handleDrop);
    card.addEventListener('dragend', handleDragEnd);
}

/* ---------- Init ---------- */
/* ---------- Keyboard Shortcuts ---------- */
document.addEventListener('keydown', (e) => {
    // Ctrl/Cmd + F : Search
    if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        document.getElementById('search').focus();
    }
    // Ctrl/Cmd + B (Add) - Avoid Ctrl+N (New Window)
    if ((e.ctrlKey || e.metaKey) && e.key === 'b') {
        e.preventDefault();
        openAddModal();
    }
    // Escape : Close Modal
    if (e.key === 'Escape') {
        closeModal();
    }
    // Ctrl+Z (Undo) / Ctrl+Y (Redo)
    if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault();
        undo();
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
        e.preventDefault();
        redo();
    }
});

window.addEventListener('load', () => {
    updateShortcutsGrid();
    initHistory();
    document.getElementById('year').textContent = new Date().getFullYear();

    if (localStorage.getItem('compactMode') === 'true') {
        document.getElementById('customShortcuts').classList.add('compact');
    }

    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('./sw.js')
            .then(() => console.log('Service Worker Registered'))
            .catch(err => console.log('SW Registration Failed:', err));
    }
});
