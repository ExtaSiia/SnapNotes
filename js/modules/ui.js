/* ---------- UI Module ---------- */
import { escapeHtml, formatContent, copyToClipboard } from './utils.js';

let handlers = {
    onSave: async () => { }, // Default no-op
    onDelete: async () => { }
};

export function setHandlers(h) {
    handlers = { ...handlers, ...h };
}

/* ---------- Toasts ---------- */
export function showToast(message, type = 'info') {
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

/* ---------- Modals ---------- */
let currentModalConfirmAction = null;

export function closeModal() {
    const overlay = document.getElementById('modal-overlay');
    overlay.classList.add('hidden');
    setTimeout(() => {
        const body = document.getElementById('modal-body');
        if (body) body.innerHTML = '';
        currentModalConfirmAction = null;

        // Reset button styles
        const confirmBtn = document.getElementById('modal-confirm-btn');
        if (confirmBtn) {
            confirmBtn.className = 'btn-primary';
            confirmBtn.style = '';
            confirmBtn.innerText = 'Confirmer';
        }
        const cancelBtn = document.querySelector('#modal-footer .btn-secondary');
        if (cancelBtn) cancelBtn.innerText = 'Annuler';

    }, 300);
}

// Bind global close
window.closeModal = closeModal; // For HTML onclick if needed, but we should attach listeners

export function initModalListeners() {
    document.getElementById('modal-confirm-btn').onclick = () => {
        if (currentModalConfirmAction) currentModalConfirmAction();
        // closeModal is called inside confirm action usually or we call it here?
        // Old app.js called it after confirm.
        // Let's rely on specific actions to close or close here if not async?
        // Better: let action decide or close strictly.
        // Old code: if(action) action(); closeModal();
        closeModal();
    };

    // Security modal is separate
    const secBtn = document.getElementById('security-btn');
    if (secBtn) {
        // Handled in app.js via init
    }
}

export function openAddModal() {
    const modalBody = document.getElementById('modal-body');
    document.getElementById('modal-title').innerText = 'Ajouter un raccourci';

    modalBody.innerHTML = `
        <div class="form-group">
            <label>Titre</label>
            <input type="text" id="inputTitle" placeholder="Ex: Signature Mail">
        </div>
        <div class="form-group">
            <label>Catégorie</label>
            <select id="inputCategory">
                <option value="Travail">Travail</option>
                <option value="Perso">Perso</option>
                <option value="Urgent">Urgent</option>
                <option value="Autre" selected>Autre</option>
            </select>
        </div>
        <div class="form-group">
            <label>Contenu</label>
            <textarea id="inputContent" rows="5" placeholder="Votre texte, lien, code..."></textarea>
        </div>
    `;

    document.getElementById('modal-overlay').classList.remove('hidden');

    currentModalConfirmAction = async () => {
        const title = document.getElementById('inputTitle').value;
        const category = document.getElementById('inputCategory').value;
        const content = document.getElementById('inputContent').value;

        if (title && content) {
            // We create DOM directly or ask app to save? 
            // App logic: createDOM then saveShortcuts (which reads DOM).
            // So we just createDOM here?
            // Actually createCardDOM appends to container.
            createCardDOM({ title, content, category, lastUsed: Date.now() }, true); // New card
            await handlers.onSave();
            showToast('Raccourci ajouté avec succès', 'success');
        } else {
            showToast('Champs manquants', 'error');
        }
    };

    setTimeout(() => document.getElementById('inputTitle').focus(), 100);
}

export function openEditModal(cardDOM) {
    const oldTitle = cardDOM.dataset.title;
    const oldContent = cardDOM.dataset.content;
    const oldCategory = cardDOM.dataset.category;

    const modalBody = document.getElementById('modal-body');
    document.getElementById('modal-title').innerText = 'Modifier';

    modalBody.innerHTML = `
        <div class="form-group">
            <label>Titre</label>
            <input type="text" id="editTitle">
        </div>
        <div class="form-group">
            <label>Catégorie</label>
            <select id="editCategory">
                <option value="Travail">Travail</option>
                <option value="Perso">Perso</option>
                <option value="Urgent">Urgent</option>
                <option value="Autre">Autre</option>
            </select>
        </div>
        <div class="form-group">
            <label>Contenu</label>
            <textarea id="editContent" rows="5"></textarea>
        </div>
    `;

    document.getElementById('editTitle').value = oldTitle;
    document.getElementById('editCategory').value = oldCategory;
    document.getElementById('editContent').value = oldContent;

    document.getElementById('modal-overlay').classList.remove('hidden');

    currentModalConfirmAction = async () => {
        const newTitle = document.getElementById('editTitle').value;
        const newCat = document.getElementById('editCategory').value;
        const newContent = document.getElementById('editContent').value;

        if (newTitle && newContent) {
            cardDOM.dataset.title = newTitle;
            cardDOM.dataset.category = newCat;
            cardDOM.dataset.content = newContent;

            cardDOM.querySelector('h3').innerText = newTitle;
            cardDOM.querySelector('.card-body').innerHTML = formatContent(newContent);
            const tag = cardDOM.querySelector('.tag');
            tag.className = `tag ${newCat}`;
            tag.innerText = newCat;

            await handlers.onSave();
            showToast('Modifié avec succès', 'success');
        }
    };
}

/* ---------- DOM & Grid ---------- */
export function getDomShortcuts() {
    const container = document.getElementById('customShortcuts');
    const cards = Array.from(container.querySelectorAll('.card:not(#datetime-card)'));
    return cards.map(card => ({
        title: card.dataset.title,
        content: card.dataset.content,
        category: card.dataset.category,
        lastUsed: parseInt(card.dataset.lastUsed || Date.now())
    }));
}

export function updateShortcutsGrid(shortcuts, filters = {}) {
    const container = document.getElementById('customShortcuts');
    container.innerHTML = '';

    shortcuts.forEach(s => {
        createCardDOM(s);
    });
}

export function createCardDOM(shortcut, isNew = false) {
    const container = document.getElementById('customShortcuts');
    const card = document.createElement('div');
    card.className = 'card' + (isNew ? ' new' : '');
    card.setAttribute('draggable', 'true');

    card.dataset.title = shortcut.title;
    card.dataset.content = shortcut.content;
    card.dataset.category = shortcut.category;
    card.dataset.lastUsed = shortcut.lastUsed;

    card.innerHTML = `
    <div class="card-content">
      <div class="tags"><span class="tag ${shortcut.category}">${shortcut.category}</span></div>
      <h3>${escapeHtml(shortcut.title)}</h3>
      <div class="card-body">${formatContent(shortcut.content)}</div>
    </div>
    <div class="card-buttons"></div>
    `;

    // Buttons (Manual creation to attach listeners properly)
    const btnContainer = card.querySelector('.card-buttons');

    // Copy
    const copyBtn = document.createElement('button');
    copyBtn.className = 'copyBtn';
    copyBtn.innerHTML = '<span class="material-symbols-rounded">content_copy</span> Copier';
    copyBtn.onclick = () => {
        copyToClipboard(shortcut.content, () => {
            showToast('Copié !', 'success');
            card.dataset.lastUsed = Date.now();
            handlers.onSave(); // To update lastUsed
        });
    };

    // Edit
    const editBtn = document.createElement('button');
    editBtn.className = 'editBtn';
    editBtn.innerHTML = '<span class="material-symbols-rounded">edit</span> Editer';
    editBtn.onclick = () => openEditModal(card);

    // Delete
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'deleteBtn';
    deleteBtn.innerHTML = '<span class="material-symbols-rounded">delete</span> Supprimer';
    deleteBtn.onclick = () => {
        showConfirmModal({
            title: 'Supprimer le raccourci ?',
            message: 'Voulez-vous vraiment supprimer ce raccourci ?\nCette action est irréversible.',
            isDanger: true,
            confirmText: 'Supprimer',
            onConfirm: async () => {
                card.style.transform = 'scale(0.8)';
                card.style.opacity = '0';
                setTimeout(async () => {
                    card.remove();
                    await handlers.onSave();
                    showToast('Supprimé', 'info');
                }, 300);
            }
        });
    };

    btnContainer.appendChild(copyBtn);
    btnContainer.appendChild(editBtn);
    btnContainer.appendChild(deleteBtn);

    container.appendChild(card);
    addDnDHandlers(card);

    if (isNew) setTimeout(() => card.classList.remove('new'), 500);
}

export function showConfirmModal({ title, message, onConfirm, isDanger = false, confirmText = 'Confirmer', cancelText = 'Annuler' }) {
    const modalBody = document.getElementById('modal-body');
    document.getElementById('modal-title').innerText = title;

    // Simple text message
    modalBody.innerHTML = `<p style="margin-bottom: 0;">${message.replace(/\n/g, '<br>')}</p>`;

    const confirmBtn = document.getElementById('modal-confirm-btn');
    const cancelBtn = document.querySelector('#modal-footer .btn-secondary');

    // Update Text
    if (confirmBtn) confirmBtn.innerText = confirmText;
    if (cancelBtn) cancelBtn.innerText = cancelText;

    // Style Danger
    if (isDanger) {
        confirmBtn.className = 'btn-primary deleteBtn'; // Re-use delete styling or add specific danger class
        confirmBtn.style.backgroundColor = 'var(--delete-color)';
        confirmBtn.style.color = '#fff';
        confirmBtn.style.boxShadow = '0 4px 14px rgba(231, 76, 60, 0.3)';
    } else {
        // Reset to default primary
        confirmBtn.className = 'btn-primary';
        confirmBtn.style = ''; // Clear inline styles
    }

    document.getElementById('modal-overlay').classList.remove('hidden');

    currentModalConfirmAction = async () => {
        if (onConfirm) await onConfirm();
        // Reset button style after close is handled by closeModal usually, 
        // but we should arguably reset it when opening next time.
        // For safety, let's reset style on next open or close?
        // Let's reset it in closeModal.
    };
}



/* ---------- Drag & Drop ---------- */
let dragSrcEl = null;

function handleDragStart(e) {
    dragSrcEl = this;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/html', this.innerHTML);
    this.classList.add('dragging');
}

function handleDragEnter(e) {
    if (this !== dragSrcEl) this.classList.add('over');
}

function handleDragLeave(e) {
    this.classList.remove('over');
}

function handleDragOver(e) {
    if (e.preventDefault) e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    return false;
}

function handleDrop(e) {
    if (e.stopPropagation) e.stopPropagation();

    if (dragSrcEl !== this) {
        const container = document.getElementById('customShortcuts');
        const cards = Array.from(container.querySelectorAll('.card:not(#datetime-card)'));
        const srcIndex = cards.indexOf(dragSrcEl);
        const targetIndex = cards.indexOf(this);

        if (srcIndex < targetIndex) {
            this.after(dragSrcEl);
        } else {
            this.before(dragSrcEl);
        }
        handlers.onSave();
    }
    return false;
}

function handleDragEnd(e) {
    this.classList.remove('dragging');
    document.querySelectorAll('.card').forEach(c => c.classList.remove('over'));
}

function addDnDHandlers(card) {
    if (card.id === 'datetime-card') return;
    card.addEventListener('dragstart', handleDragStart);
    card.addEventListener('dragenter', handleDragEnter);
    card.addEventListener('dragover', handleDragOver);
    card.addEventListener('dragleave', handleDragLeave);
    card.addEventListener('drop', handleDrop);
    card.addEventListener('dragend', handleDragEnd);
}

/* ---------- Theme ---------- */
export function toggleTheme() {
    if (document.body.classList.contains('light')) {
        document.body.classList.remove('light');
        localStorage.setItem('theme', 'dark');
        document.getElementById('app-logo').src = 'assets/logo_sombre.png';
    } else {
        document.body.classList.add('light');
        localStorage.setItem('theme', 'light');
        document.getElementById('app-logo').src = 'assets/logo_clair.png';
    }
}

export function initTheme() {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'light') {
        document.body.classList.add('light');
        document.getElementById('app-logo').src = 'assets/logo_clair.png';
    }
}

/* ---------- Clock ---------- */

