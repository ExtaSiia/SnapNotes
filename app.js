const storageKey = 'shortcuts';

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

function updateShortcutsGrid() {
    const container = document.getElementById('customShortcuts');
    const dtCard = document.getElementById('datetime-card');
    const sort = document.getElementById('sortOrder') ? document.getElementById('sortOrder').value : 'default';

    container.innerHTML = '';
    if (dtCard) container.appendChild(dtCard);

    let saved = JSON.parse(localStorage.getItem(storageKey) || '[]');

    // Sort
    if (sort === 'alpha') {
        saved.sort((a, b) => a.title.localeCompare(b.title));
    } else if (sort === 'lastUsed') {
        saved.sort((a, b) => (b.lastUsed || 0) - (a.lastUsed || 0));
    }
    // 'default' uses array order (manual DnD)

    saved.forEach(s => createCardDOM(s.title, s.content, s.category || 'Autre'));

    searchCards(); // Re-apply filter if any
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

function createCardDOM(title, content, category = 'Autre') {
    const container = document.getElementById('customShortcuts');
    const card = document.createElement('div');
    card.className = 'card new';
    card.setAttribute('draggable', 'true');

    card.dataset.title = title;
    card.dataset.content = content;
    card.dataset.category = category;

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

function saveShortcuts() {
    const data = [];
    document.querySelectorAll('#customShortcuts .card').forEach(c => {
        if (c.id === 'datetime-card') return;
        data.push({
            title: c.dataset.title,
            content: c.dataset.content,
            category: c.dataset.category || 'Autre'
        });
    });

    // Save to LocalStorage
    localStorage.setItem(storageKey, JSON.stringify(data));

    // History Management
    if (!isRestoringHistory) {
        // If we serve a new change (not an undo/redo), cut off future history
        if (historyStep < historyStack.length - 1) {
            historyStack = historyStack.slice(0, historyStep + 1);
        }
        historyStack.push(JSON.stringify(data));
        historyStep++;
        updateUndoRedoUI();
    }
}

/* ---------- History (Undo/Redo) ---------- */
let historyStack = [];
let historyStep = -1;
let isRestoringHistory = false;

function initHistory() {
    const data = localStorage.getItem(storageKey) || '[]';
    historyStack.push(data);
    historyStep = 0;
    updateUndoRedoUI();
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

function restoreState(jsonString) {
    isRestoringHistory = true;
    localStorage.setItem(storageKey, jsonString);
    updateShortcutsGrid(); // Reloads from LS
    isRestoringHistory = false;
    updateUndoRedoUI();
    showToast('État restauré', 'info');
}

/* ---------- Actions ---------- */

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


function copyContent(btn) {
    const card = btn.closest('.card');
    const content = card.dataset.content;
    const title = card.dataset.title;

    navigator.clipboard.writeText(content);
    showToast('Contenu copié !', 'success');

    // Update lastUsed
    const saved = JSON.parse(localStorage.getItem(storageKey) || '[]');
    const idx = saved.findIndex(s => s.title === title && s.content === content);
    if (idx > -1) {
        saved[idx].lastUsed = Date.now();
        localStorage.setItem(storageKey, JSON.stringify(saved));
        // Do not re-render immediately to avoid jumping UI if sorted by last used
    }
}

// IMPORT / EXPORT
function exportFile() {
    const data = JSON.parse(localStorage.getItem(storageKey) || '[]');
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'shortcuts.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    URL.revokeObjectURL(url);
    showToast('Export réussi !', 'success');
}

function exportMarkdown() {
    const data = JSON.parse(localStorage.getItem(storageKey) || '[]');
    let md = '# Mes Raccourcis\n\n';

    // Group by category ?
    // Let's just list them
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
