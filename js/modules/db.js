/* ---------- Database (IndexedDB) ---------- */
const DB_NAME = 'SnapNotesDB';
const DB_VERSION = 1;
const STORE_NAME = 'shortcuts';
let db;

export function openDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = (event) => {
            db = event.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
            }
        };

        request.onsuccess = (event) => {
            db = event.target.result;
            resolve(db);
        };

        request.onerror = (event) => {
            reject('DB Error: ' + event.target.errorCode);
        };
    });
}

function dbParams(mode) {
    const tx = db.transaction(STORE_NAME, mode);
    const store = tx.objectStore(STORE_NAME);
    return { tx, store };
}

export function getAllShortcuts() {
    return new Promise((resolve, reject) => {
        const { store } = dbParams('readonly');
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

export function addShortcut(shortcut) {
    return new Promise((resolve, reject) => {
        const { store } = dbParams('readwrite');
        const request = store.add(shortcut);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

export function updateShortcut(shortcut) {
    return new Promise((resolve, reject) => {
        const { store } = dbParams('readwrite');
        const request = store.put(shortcut);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

export function deleteShortcut(id) {
    return new Promise((resolve, reject) => {
        const { store } = dbParams('readwrite');
        const request = store.delete(id);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

export function clearShortcuts() {
    return new Promise((resolve, reject) => {
        const { store } = dbParams('readwrite');
        const request = store.clear();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}
