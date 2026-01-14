/* ---------- Crypto (Web Crypto API) ---------- */
import { state } from './state.js';

export async function deriveKey(password, salt) {
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
        true,
        ['encrypt', 'decrypt']
    );
}

export async function encryptData(data) {
    if (!state.sessionKey) throw new Error('No session key');

    const enc = new TextEncoder();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encoded = enc.encode(JSON.stringify(data));
    const ciphertext = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv: iv },
        state.sessionKey,
        encoded
    );
    return {
        iv: Array.from(iv),
        data: Array.from(new Uint8Array(ciphertext))
    };
}

export async function decryptData(encryptedObj) {
    if (!state.sessionKey) return null;

    const iv = new Uint8Array(encryptedObj.iv);
    const data = new Uint8Array(encryptedObj.data);
    try {
        const decrypted = await crypto.subtle.decrypt(
            { name: 'AES-GCM', iv: iv },
            state.sessionKey,
            data
        );
        const dec = new TextDecoder();
        return JSON.parse(dec.decode(decrypted));
    } catch (e) {
        // console.error("Decryption failed", e);
        return null;
    }
}

/* ---------- Session Management ---------- */
const SESSION_TIMEOUT_MS = 15 * 60 * 1000;

export async function saveSession(key) {
    try {
        const exported = await crypto.subtle.exportKey('jwk', key);
        sessionStorage.setItem('snapnotes_key', JSON.stringify(exported));
        sessionStorage.setItem('snapnotes_last_active', Date.now().toString());
    } catch (e) {
        console.error('Session Save Error:', e);
    }
}

export async function restoreSession() {
    try {
        const jwkStr = sessionStorage.getItem('snapnotes_key');
        const lastActive = sessionStorage.getItem('snapnotes_last_active');

        if (!jwkStr || !lastActive) return false;

        if (Date.now() - parseInt(lastActive) > SESSION_TIMEOUT_MS) {
            sessionStorage.clear(); // Expired
            return false;
        }

        const jwk = JSON.parse(jwkStr);
        const key = await crypto.subtle.importKey(
            'jwk',
            jwk,
            { name: 'AES-GCM', length: 256 },
            true,
            ['encrypt', 'decrypt']
        );
        state.setSessionKey(key);
        return true;
    } catch (e) {
        console.error('Session Restore Error:', e);
        return false;
    }
}
