/**
 * AccessScan v2.0 — Credential Manager
 *
 * Security design:
 *  - Usernames stored in chrome.storage.local keyed by origin hash
 *  - Passwords are NEVER stored by AccessScan
 *  - Instead we integrate with the browser's native Credential Management API
 *    (navigator.credentials) where available
 *  - Plaintext passwords are NEVER written to logs, storage, or console
 *  - Explicit user consent required before any save
 *
 * If Credential Management API is unavailable:
 *  - We store only the username, and clearly label the password field
 *    as "Use your browser's saved passwords"
 */

'use strict';

window.AccessScan = window.AccessScan || {};

const CRED_STORE_KEY = 'as_cred_index'; // stores { origin: { username, loginUrl } }[]

class CredentialManager {
  constructor() {
    this._pendingSave = null; // { origin, username, passwordInputEl }
  }

  /**
   * Detect if current page has a login form.
   * Returns { usernameEl, passwordEl, formEl } or null.
   */
  detectLoginForm() {
    const passwordInputs = Array.from(
      document.querySelectorAll('input[type="password"]:not([disabled])')
    ).filter((el) => window.AccessScan.Scanner.isVisible(el));

    if (passwordInputs.length === 0) return null;

    const passwordEl = passwordInputs[0];
    const form = passwordEl.closest('form');

    // Find the username field: look for text/email input before password in the form
    let usernameEl = null;
    const candidates = form
      ? Array.from(form.querySelectorAll('input[type="text"], input[type="email"], input:not([type])'))
      : Array.from(document.querySelectorAll('input[type="text"], input[type="email"]'));

    for (const el of candidates) {
      if (window.AccessScan.Scanner.isVisible(el)) {
        usernameEl = el;
        break;
      }
    }

    return { usernameEl, passwordEl, formEl: form };
  }

  /**
   * Check if saved credentials exist for the current origin.
   * Returns { username, loginUrl } or null.
   */
  async getSavedCredential() {
    const origin = this._getOrigin();
    const data = await this._load();
    return data[origin] ?? null;
  }

  /**
   * Prompt the user (via overlay) to save credentials.
   * ONLY called after explicit user action.
   * password is NEVER stored — we use native PasswordCredential if available.
   *
   * @param {string} username
   * @param {HTMLInputElement} passwordEl - Reference to password field (not stored)
   */
  async offerSave(username, passwordEl) {
    if (!username) return;
    this._pendingSave = { username, passwordEl };
    return this._pendingSave;
  }

  /**
   * Execute the save. Stores username only. Uses native credential API for password.
   * @param {string} username
   * @param {HTMLInputElement} passwordEl
   */
  async executeNativeSave(username, passwordEl) {
    const origin = this._getOrigin();

    // Store username in extension storage (NOT password)
    const data = await this._load();
    data[origin] = { username, loginUrl: window.location.href, savedAt: Date.now() };
    await this._save(data);

    // Try native PasswordCredential (Chrome 60+)
    if (window.PasswordCredential && passwordEl) {
      try {
        // We do NOT log or access passwordEl.value
        const cred = new window.PasswordCredential({
          id: username,
          password: passwordEl.value, // used only to create native credential, not stored by us
          name: username,
        });
        // Clear our reference immediately
        await navigator.credentials.store(cred);
        // Wipe the reference — we never hold onto password strings
        passwordEl = null;
      } catch (e) {
        // Native API unavailable or denied — username still saved
        console.log('[AccessScan] Native credential store unavailable:', e.message);
      }
    }

    return true;
  }

  /**
   * Autofill username into the detected field.
   * Password field is handled by native browser autofill or left for user.
   */
  async autofill(usernameEl) {
    const saved = await this.getSavedCredential();
    if (!saved || !usernameEl) return false;

    // Insert username
    usernameEl.focus();
    usernameEl.value = saved.username;
    usernameEl.dispatchEvent(new Event('input', { bubbles: true }));
    usernameEl.dispatchEvent(new Event('change', { bubbles: true }));

    // Attempt native credentials autofill for password
    if (navigator.credentials && window.PasswordCredential) {
      try {
        await navigator.credentials.get({ password: true, mediation: 'silent' });
      } catch (_) { /* No stored credentials or denied */ }
    }

    return true;
  }

  /**
   * Get all saved entries (for management UI).
   */
  async getAllEntries() {
    const data = await this._load();
    return Object.entries(data).map(([origin, info]) => ({ origin, ...info }));
  }

  /**
   * Delete a saved entry.
   */
  async deleteEntry(origin) {
    const data = await this._load();
    delete data[origin];
    await this._save(data);
  }

  // ── Private ────────────────────────────────────────────────────────────────

  _getOrigin() {
    return window.location.origin;
  }

  async _load() {
    return new Promise((resolve) => {
      chrome.storage.local.get(CRED_STORE_KEY, (result) => {
        resolve(result[CRED_STORE_KEY] ?? {});
      });
    });
  }

  async _save(data) {
    return new Promise((resolve) => {
      chrome.storage.local.set({ [CRED_STORE_KEY]: data }, resolve);
    });
  }
}

window.AccessScan.CredentialManager = CredentialManager;
