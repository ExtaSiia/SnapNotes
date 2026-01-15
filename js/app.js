/* ---------- Main Controller ---------- */
import { state } from './modules/state.js';
import * as Utils from './modules/utils.js';
import * as Crypto from './modules/crypto.js';
import * as DB from './modules/db.js';
import * as UI from './modules/ui.js';

/* ---------- Initialization ---------- */
window.addEventListener('load', initApp);

async function initApp() {
    try {
        await DB.openDB();

        UI.initTheme();
        UI.initModalListeners();

        // Setup UI Handlers (Bridge between UI and Controller)
        UI.setHandlers({
            onSave: saveShortcuts, // For Add/Edit/DnD
        });

        // Expose functions required for HTML onclicks (if any remain)
        // Ideally we should have removed them, but UI.createCardDOM uses listeners.
        // History buttons might still be in HTML?
        const undoBtn = document.getElementById('undoBtn');
        if (undoBtn) undoBtn.onclick = undo;

        const redoBtn = document.getElementById('redoBtn');
        if (redoBtn) redoBtn.onclick = redo;

        const fab = document.getElementById('fab');
        if (fab) fab.onclick = UI.openAddModal;

        const searchInput = document.getElementById('search');
        if (searchInput) searchInput.oninput = () => UI.updateShortcutsGrid(state.shortcutsCache); // Basic update, filtering logic needs improvements
        // Actually, we need real filtering logic here.

        setupFiltering();

        setupSecurity();

    } catch (e) {
        console.error('Init Error', e);
        UI.showToast('Erreur initialisation', 'error');
    }
}

/* ---------- Security & Session ---------- */
function setupSecurity() {
    const btn = document.getElementById('security-btn');
    const input = document.getElementById('security-input');

    // Unlock Logic
    const handleUnlock = async () => {
        const password = input.value.trim();
        if (!password) {
            UI.showToast('Veuillez entrer un mot de passe', 'error');
            return;
        }

        // Brute Force Protection
        if (failedAttempts > 2) {
            const delay = Math.pow(2, failedAttempts - 2) * 1000;
            const originalText = btn.innerText;
            btn.innerText = `Attente ${delay / 1000}s...`;
            btn.disabled = true;
            input.disabled = true;
            await new Promise(r => setTimeout(r, delay));
            btn.innerText = originalText;
            btn.disabled = false;
            input.disabled = false;
            input.focus();
        }

        // Salt Logic
        let saltStr = localStorage.getItem('snapnotes_salt');
        const STATIC_SALT_V2 = 'SnapNotes_Fixed_Salt_V2';

        if (!saltStr) {
            const stored = await DB.getAllShortcuts();
            if (stored.length === 0) {
                // New User: Generate Dynamic Salt
                const randomValues = new Uint8Array(16);
                crypto.getRandomValues(randomValues);
                saltStr = Array.from(randomValues).map(b => b.toString(16).padStart(2, '0')).join('');
                localStorage.setItem('snapnotes_salt', saltStr);
            } else {
                // Legacy User
                saltStr = STATIC_SALT_V2;
            }
        }

        const salt = new TextEncoder().encode(saltStr);

        try {
            const key = await Crypto.deriveKey(password, salt);

            // Verification (Try decrypt first item)
            const stored = await DB.getAllShortcuts();
            if (stored.length > 0) {
                state.setSessionKey(key); // Temporarily set to test
                const decrypted = await Crypto.decryptData(stored[0]);
                if (!decrypted) {
                    state.setSessionKey(null);
                    failedAttempts++;
                    UI.showToast('Mot de passe incorrect', 'error');
                    input.value = '';
                    return;
                }
            } else {
                state.setSessionKey(key);
            }

            // Success
            failedAttempts = 0;
            await Crypto.saveSession(key);
            unlockApp();

        } catch (e) {
            console.error(e);
            state.setSessionKey(null);
            UI.showToast('Erreur critique', 'error');
        }
    };

    btn.onclick = handleUnlock;
    input.onkeydown = (e) => { if (e.key === 'Enter') handleUnlock(); };

    // Forgot Password
    const forgotBtn = document.getElementById('forgot-password');
    if (forgotBtn) {
        forgotBtn.onclick = () => {
            UI.showConfirmModal({
                title: 'Réinitialisation',
                message: 'ATTENTION : Cela va SUPPRIMER TOUTES VOS NOTES pour réinitialiser l\'application.\n\nÊtes-vous sûr de vouloir tout effacer ?',
                isDanger: true,
                confirmText: 'Tout effacer',
                onConfirm: () => {
                    // Close first modal is handled, need to wait a bit or direct open second?
                    // closeModal has 300ms timeout.
                    // Let's chain it.
                    setTimeout(() => {
                        UI.showConfirmModal({
                            title: 'Irréversible !',
                            message: 'Dernière confirmation : Cette action est IRRÉVERSIBLE.\n\nVos données seront perdues à jamais. Continuer ?',
                            isDanger: true,
                            confirmText: 'OUI, tout supprimer',
                            onConfirm: async () => {
                                try {
                                    await DB.clearShortcuts();
                                    localStorage.removeItem('snapnotes_salt');
                                    sessionStorage.clear();
                                    window.location.reload();
                                } catch (e) {
                                    console.error(e);
                                    UI.showToast('Erreur lors de la réinitialisation', 'error');
                                }
                            }
                        });
                    }, 350); // Wait for close animation
                }
            });
        };
    }

    // Check existing session
    Crypto.restoreSession().then(hasSession => {
        if (hasSession) {
            unlockApp();
        } else {
            document.getElementById('security-overlay').classList.remove('hidden');
        }
    });
}

let failedAttempts = 0;
let inactivityInterval = null;

async function unlockApp() {
    document.getElementById('security-overlay').classList.add('hidden');
    UI.showToast('Session active', 'success');
    await restoreState();
    startInactivityTimer();
}

function startInactivityTimer() {
    if (inactivityInterval) clearInterval(inactivityInterval);

    const updateActivity = () => {
        if (state.sessionKey) {
            sessionStorage.setItem('snapnotes_last_active', Date.now().toString());
        }
    };

    window.onclick = updateActivity;
    window.onkeydown = updateActivity;
    window.ontouchstart = updateActivity;

    inactivityInterval = setInterval(() => {
        const lastActive = sessionStorage.getItem('snapnotes_last_active');
        if (state.sessionKey && lastActive && (Date.now() - parseInt(lastActive) > 15 * 60 * 1000)) {
            lockApp();
        }
    }, 60000);
}

function lockApp() {
    state.reset();
    sessionStorage.clear();
    document.getElementById('security-overlay').classList.remove('hidden');
    document.getElementById('customShortcuts').innerHTML = ''; // Clear UI
    UI.showToast('Session expirée', 'warning');
}


/* ---------- Logic & Persistence ---------- */

async function restoreState(historyData = null) {
    let shortcuts = [];

    if (historyData) {
        shortcuts = historyData;
    } else {
        // Load from DB
        try {
            const result = await DB.getAllShortcuts();
            for (const item of result) {
                const dec = await Crypto.decryptData(item);
                if (dec) shortcuts.push(dec);
            }
        } catch (e) {
            console.error('DB Load Error', e);
        }
    }

    state.setShortcutsCache(shortcuts);
    applyFilters(); // Renders grid
}

async function saveShortcuts() {
    if (!state.sessionKey) {
        UI.showToast('Erreur: Session perdue', 'error');
        lockApp();
        return;
    }

    const currentShortcuts = UI.getDomShortcuts();

    // Encrypt All
    const itemsToSave = [];
    try {
        for (const s of currentShortcuts) {
            const encrypted = await Crypto.encryptData(s);
            itemsToSave.push({ encrypted, original: s });
        }
    } catch (e) {
        UI.showToast('Echec du chiffrement', 'error');
        return;
    }

    // Write DB
    try {
        await DB.clearShortcuts();
        for (const item of itemsToSave) {
            await DB.addShortcut(item.encrypted);
        }

        state.setShortcutsCache(currentShortcuts);
        pushToHistory();

    } catch (e) {
        UI.showToast('Erreur sauvegarde DB', 'error');
    }
}

/* ---------- History ---------- */
let historyStack = [];
let historyStep = -1;
let isRestoringHistory = false;

function pushToHistory() {
    if (isRestoringHistory) return;

    const snapshot = JSON.parse(JSON.stringify(state.shortcutsCache));

    if (historyStep < historyStack.length - 1) {
        historyStack = historyStack.slice(0, historyStep + 1);
    }

    historyStack.push(snapshot);
    historyStep++;

    if (historyStack.length > 50) {
        historyStack.shift();
        historyStep--;
    }
    updateHistoryUI();
}

function undo() {
    if (historyStep > 0) {
        historyStep--;
        isRestoringHistory = true;
        restoreState(historyStack[historyStep]).then(() => {
            isRestoringHistory = false;
        });
        updateHistoryUI();
    }
}

function redo() {
    if (historyStep < historyStack.length - 1) {
        historyStep++;
        isRestoringHistory = true;
        restoreState(historyStack[historyStep]).then(() => {
            isRestoringHistory = false;
        });
        updateHistoryUI();
    }
}

function updateHistoryUI() {
    const undoBtn = document.getElementById('undoBtn');
    const redoBtn = document.getElementById('redoBtn');
    if (undoBtn) undoBtn.disabled = historyStep <= 0;
    if (redoBtn) redoBtn.disabled = historyStep >= historyStack.length - 1;
}

/* ---------- Filtering ---------- */
function setupFiltering() {
    const search = document.getElementById('search');
    const categoryFilter = document.getElementById('categoryFilter');
    const sortOrder = document.getElementById('sortOrder');

    const handler = () => applyFilters();

    if (search) search.oninput = handler;
    if (categoryFilter) categoryFilter.onchange = handler;
    if (sortOrder) sortOrder.onchange = handler;
}

function applyFilters() {
    let list = [...state.shortcutsCache];

    const search = document.getElementById('search').value.toLowerCase();
    const cat = document.getElementById('categoryFilter').value;
    const sort = document.getElementById('sortOrder').value;

    if (cat) {
        list = list.filter(s => s.category === cat);
    }

    if (search) {
        list = list.filter(s =>
            s.title.toLowerCase().includes(search) ||
            s.content.toLowerCase().includes(search)
        );
    }

    if (sort === 'alpha') {
        list.sort((a, b) => a.title.localeCompare(b.title));
    } else if (sort === 'lastUsed') {
        list.sort((a, b) => (b.lastUsed || 0) - (a.lastUsed || 0));
    }

    UI.updateShortcutsGrid(list);
}

// Expose Global Functions for HTML onClick
window.applyFilters = applyFilters; // Assuming applyFilters is the intended searchCards/updateShortcutsGrid equivalent
window.copy = Utils.copyToClipboard;
window.toggleTheme = UI.toggleTheme;
window.undo = undo; // Using the existing undo function
window.redo = redo; // Using the existing redo function

// Logout function
window.logout = () => {
    sessionStorage.removeItem('snapnotes_key');
    // Clear DOM for security
    if (state.shortcutsCache) state.shortcutsCache = [];
    document.getElementById('customShortcuts').innerHTML = '';

    // Show Lock Screen
    UI.showSecurityOverlay();
    document.getElementById('security-input').value = '';
    UI.showToast('Déconnecté', 'info');
};
