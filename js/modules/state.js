/* ---------- Global State ---------- */

export const state = {
    sessionKey: null,
    shortcutsCache: [],

    // Setters to allow modification from other modules
    setSessionKey(key) {
        this.sessionKey = key;
    },

    setShortcutsCache(cache) {
        this.shortcutsCache = cache;
    },

    reset() {
        this.sessionKey = null;
        this.shortcutsCache = [];
    }
};
