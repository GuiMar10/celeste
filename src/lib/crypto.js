// Utility functions for encrypting and decrypting the API key using Web Crypto API

const PASSWORD = "celeste-openrouter-api-key"; // Fixed password for derivation
const SALT = "fixed-salt-for-celeste"; // Fixed salt

/**
 * Derives a key from the password using PBKDF2
 */
async function deriveKey(password, salt) {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveBits", "deriveKey"],
  );
  return await crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: encoder.encode(salt),
      iterations: 100000,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"],
  );
}

/**
 * Encrypts the given text
 * @param {string} text - The text to encrypt
 * @returns {Promise<string>} - Base64 encoded encrypted data
 */
export async function encrypt(text) {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const key = await deriveKey(PASSWORD, SALT);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv: iv,
    },
    key,
    data,
  );
  const encryptedArray = new Uint8Array(encrypted);
  const result = new Uint8Array(iv.length + encryptedArray.length);
  result.set(iv);
  result.set(encryptedArray, iv.length);
  return btoa(String.fromCharCode(...result));
}

/**
 * Decrypts the given base64 encoded encrypted data
 * @param {string} encryptedText - Base64 encoded encrypted data
 * @returns {Promise<string>} - The decrypted text
 */
export async function decrypt(encryptedText) {
  try {
    const encryptedData = Uint8Array.from(atob(encryptedText), (c) =>
      c.charCodeAt(0),
    );
    const iv = encryptedData.slice(0, 12);
    const data = encryptedData.slice(12);
    const key = await deriveKey(PASSWORD, SALT);
    const decrypted = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: iv,
      },
      key,
      data,
    );
    const decoder = new TextDecoder();
    return decoder.decode(decrypted);
  } catch (error) {
    console.error("Decryption failed:", error);
    return null; // Return null if decryption fails
  }
}
