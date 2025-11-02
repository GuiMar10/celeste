// src/lib/db.js

let db;
const DB_NAME = "ChatDB";
const STORE_NAME = "chats";

/**
 * Opens and initializes the IndexedDB database.
 */
export async function openDB() {
    return new Promise((resolve, reject) => {
        if (db) return resolve(db);

        const request = indexedDB.open(DB_NAME, 1);

        request.onerror = (event) => {
            console.error("Database error:", event.target.error);
            reject("Database error");
        };

        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                // We will store chat objects. The 'id' will be our auto-incrementing key.
                db.createObjectStore(STORE_NAME, { keyPath: "id", autoIncrement: true });
            }
        };

        request.onsuccess = (event) => {
            db = event.target.result;
            resolve(db);
        };
    });
}

/**
 * Adds a new chat to the database.
 * @param {Array} history - The chat history array.
 * @returns {Promise<{id: number, title: string}>} - The ID and title of the new chat.
 */
export async function addChat(history) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        // Generate a title from the first user message
        const firstUserMsg = history.find(msg => msg.role === 'user');
        const title = firstUserMsg ? firstUserMsg.content.substring(0, 30) + "..." : "New Chat";

        const chat = {
            title: title,
            history: history,
            createdAt: new Date()
        };

        const transaction = db.transaction([STORE_NAME], "readwrite");
        const store = transaction.objectStore(STORE_NAME);
        const request = store.add(chat); // 'id' will be auto-incremented

        request.onsuccess = (event) => {
            // event.target.result holds the new ID
            resolve({ id: event.target.result, title: title });
        };

        request.onerror = (event) => {
            console.error("Error adding chat:", event.target.error);
            reject("Error adding chat");
        };
    });
}

/**
 * Updates an existing chat's history.
 * @param {number} id - The ID of the chat to update.
 * @param {Array} history - The new history array.
 */
export async function updateChat(id, history) {
    const db = await openDB();
    return new Promise(async (resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], "readwrite");
        const store = transaction.objectStore(STORE_NAME);

        // Get the existing chat to preserve its title and created_at
        const getRequest = store.get(id);

        getRequest.onsuccess = (event) => {
            const chat = event.target.result;
            if (chat) {
                // Update only the history
                chat.history = history;

                const updateRequest = store.put(chat);
                updateRequest.onsuccess = () => resolve();
                updateRequest.onerror = (e) => reject("Error updating chat", e.target.error);
            } else {
                reject("Chat not found");
            }
        };
        getRequest.onerror = (e) => reject("Error fetching chat for update", e.target.error);
    });
}

/**
 * Retrieves a list of all chat titles and IDs for the sidebar.
 * @returns {Promise<Array<{id: number, title: string}>>}
 */
export async function getAllChatInfo() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], "readonly");
        const store = transaction.objectStore(STORE_NAME);
        const request = store.getAll();

        request.onsuccess = (event) => {
            // Map to only return id and title, not the full (large) history
            const chatInfo = event.target.result.map(chat => ({
                id: chat.id,
                title: chat.title
            })).reverse(); // Show newest first
            resolve(chatInfo);
        };

        request.onerror = (event) => {
            console.error("Error getting all chats:", event.target.error);
            reject("Error getting all chats");
        };
    });
}

/**
 * Retrieves the full history for a single chat.
 * @param {number} id - The ID of the chat to get.
 * @returns {Promise<Array>} - The chat history array.
 */
export async function getChat(id) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], "readonly");
        const store = transaction.objectStore(STORE_NAME);
        const request = store.get(id);

        request.onsuccess = (event) => {
            if (event.target.result) {
                resolve(event.target.result.history); // Only return the history
            } else {
                reject("Chat not found");
            }
        };

        request.onerror = (event) => {
            console.error("Error getting chat:", event.target.error);
            reject("Error getting chat");
        };
    });
}

/**
 * Deletes a chat from the database.
 * @param {number} id - The ID of the chat to delete.
 */
export async function deleteChat(id) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], "readwrite");
        const store = transaction.objectStore(STORE_NAME);
        const request = store.delete(id);

        request.onsuccess = () => resolve();
        request.onerror = (e) => reject("Error deleting chat", e.target.error);
    });
}