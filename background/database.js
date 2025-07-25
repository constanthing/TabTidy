/*
* Structure of file:
* - TABS
* - WINDOWS
* - CLOSED TABS
* - SYSTEM
* 
* Individual operations are exported as functions.
* TabManager uses these functions to interact with the database.
*/

const DB_VERSION = 15;

export const Database = {
    DB_VERSION, 
    openDB, 

    // tabs
    saveTab, 
    updateTab,
    getTab, 
    getAllTabs, 
    getLastTab, 
    removeTab, 

    // closed tabs
    addTabToClosedTabs, 
    getClosedTab, 
    getAllClosedTabs, 
    removeFromClosedTabs, 

    // windows
    saveWindow, 
    updateWindow,
    getWindowsByLength,
    removeWindow, 
    getAllWindows, 
    getTabsByWindowId,

    // system settings
    getSystemSetting, 
    updateSystemGroupByWindow, 
    updateSystemFilterByLLMs,
    updateSystemHistoryView,
    clearStorage,

    // last sesssion
    addLastSession,
    getAllLastSessions,
    getLastSessionsByTabsLength,
    removeLastSession,

    // old sessions
    addOldSession,
    getAllOldSessions,
}


// IndexedDB helper functions
function openDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open("TabSentryDB", DB_VERSION);
        request.onupgradeneeded = function(event) {
            console.log("onupgradeneeded");
            const db = event.target.result;

            // db.deleteObjectStore("tabs");
            // db.deleteObjectStore("windows");
            // db.deleteObjectStore("closedTabs");

            if (!db.objectStoreNames.contains("tabs")) {
                const store = db.createObjectStore("tabs", { keyPath: "id" });
                store.createIndex("id", "id", { unique: false });
                store.createIndex("windowId", "windowId", { unique: false });
                store.createIndex("lastVisited", "lastVisited", { unique: false });
                store.createIndex("index", "index", { unique: false });
                store.createIndex("url", "url", { unique: false });
                store.createIndex("title", "title", { unique: false });
                store.createIndex("favIconUrl", "favIconUrl", { unique: false });
            }
            if (!db.objectStoreNames.contains("windows")) {
                const store = db.createObjectStore("windows", { keyPath: "windowId" });
                store.createIndex("windowId", "windowId", { unique: false });
                store.createIndex("title", "title", { unique: false });
                store.createIndex("tabsLength", "tabsLength", { unique: false });
                store.createIndex("top", "top", { unique: false });
                store.createIndex("left", "left", { unique: false });
                store.createIndex("state", "state", { unique: false });
                store.createIndex("incognito", "incognito", { unique: false });
            }
            if (!db.objectStoreNames.contains("closedTabs")) {
                const store = db.createObjectStore("closedTabs", { keyPath: "index", autoIncrement: true });
                store.createIndex("id", "id", { unique: false });
                store.createIndex("windowId", "windowId", { unique: false });
                store.createIndex("lastVisited", "lastVisited", { unique: false });
                store.createIndex("url", "url", { unique: false });
                store.createIndex("title", "title", { unique: false });
                store.createIndex("reason", "reason", { unique: false });
            }
            if (!db.objectStoreNames.contains("system")) {
                db.createObjectStore("system");
            }


            /*
            * lastSession will contain windows, tabs that were open in the previous session.
            * When chrome starts up again. We check the tabs/windows in lastSession.
            * If there are windows that match. We add the window/tabs to the current session.
            * Removing it from lastSession.
            * Then, at the end, we add the remaining lastSession (with remaining tabs/windows) to oldSessions.
            */
            if (!db.objectStoreNames.contains("lastSession")) {
                const store = db.createObjectStore("lastSession", { keyPath: "index", autoIncrement: true });
                store.createIndex("name", "name", { unique: false });
                store.createIndex("windows", "windows", { unique: false });
                store.createIndex("tabs", "tabs", { unique: false });
                store.createIndex("tabsLength", "tabsLength", { unique: false });
            }
            if (!db.objectStoreNames.contains("oldSessions")) {
                const store = db.createObjectStore("oldSessions", { keyPath: "index", autoIncrement: true });
                store.createIndex("name", "name", { unique: false });
                store.createIndex("windows", "windows", { unique: false });
                store.createIndex("tabs", "tabs", { unique: false });
                store.createIndex("tabsLength", "tabsLength", { unique: false });
            }
        };
    request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}


/*
*
* TABS
*
*/
async function saveTab(tab) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction("tabs", "readwrite");
        const store = tx.objectStore("tabs");
        store.put(tab);
        tx.oncomplete = resolve;
        tx.onerror = reject;
    });
}

async function updateTab(tabId, newData) {
    /*
    * IndexedDB does not support updating a individual fields of a record directly.
    * Records as a whole are updated. 
    * Get the object -> modify the field(s) -> put the object back
    */
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction("tabs", "readwrite");
        const store = tx.objectStore("tabs");
        const req = store.get(tabId);

        req.onsuccess = () => {
            const tab = req.result;
            // tab not found
            if (!tab) {
                reject("Tab not found");
            }

            // tab found, update the tab with new data  
            for (const key of Object.keys(newData)) {
                tab[key] = newData[key];
            }

            store.put(tab);

            tx.oncomplete = resolve;
            tx.onerror = reject;
        }
        req.onerror = reject;
    });
}

async function getTab(tabId) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction("tabs", "readonly");
        const req = tx.objectStore("tabs").get(tabId);
        req.onsuccess = () => resolve(req.result);
        req.onerror = reject;
    });
}

async function getAllTabs() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction("tabs", "readonly");
        const req = tx.objectStore("tabs").getAll();
        req.onsuccess = () => {
            console.log(req.result);
            resolve(req.result);
        };
        req.onerror = reject;
    });
}

async function getTabsByWindowId(windowId) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction("tabs", "readonly");
        const store = tx.objectStore("tabs");
        const index = store.index("windowId");
        const cursor = index.openCursor(windowId);
        const tabs = [];
        cursor.onsuccess = () => {
            if (cursor.result) {
                tabs.push(cursor.result.value);
                cursor.result.continue();
            } else {
                resolve(tabs.sort((a, b) => a.index - b.index));
            }
        };
        cursor.onerror = reject;
    });
}

async function getLastTab() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        /*
        * Get tabs sorted by lastVisited in descending order
        * Return the first two tabs
        */
        const tx = db.transaction("tabs", "readonly");
        const store = tx.objectStore("tabs");
        const index = store.index("lastVisited");
        const req = index.openCursor(null, "prev");
        const tabs = [];
        let count = 0;
        req.onsuccess = () => {
            if (req.result) {
                if (count <= 1) {
                    tabs.push(req.result.value);
                    count++;
                    req.result.continue();
                } else {
                    resolve(tabs[1]);
                }
            } else {
                if (tabs.length != 2) {
                    resolve(null);
                }
                resolve(tabs[1]);
            }
        };
        req.onerror = reject;
    });
}

async function removeTab(tabId) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction("tabs", "readwrite");
        const tab = tx.objectStore("tabs").get(tabId);
        tab.onsuccess = () => {
            tx.objectStore("tabs").delete(tabId);
            tx.oncomplete = () => resolve(tab.result);
            tx.onerror = reject;
        }
        tab.onerror = reject;
    });
}


/*
*
* WINDOWS
*
*/
async function saveWindow(windowObj) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction("windows", "readwrite");

        tx.objectStore("windows").put(windowObj);
        tx.oncomplete = resolve;
        tx.onerror = reject;
    });
}

async function updateWindow(windowId, newData) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction("windows", "readwrite");
        const store = tx.objectStore("windows");
        const req = store.get(windowId);

        req.onsuccess = () => {
            const window = req.result;
            for (const key of Object.keys(newData)) {
                window[key] = newData[key];
            }

            store.put(window);

            tx.oncomplete = resolve;
            tx.onerror = reject;
        }
        req.onerror = reject;
    });
}

async function removeWindow(windowId) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction("windows", "readwrite");
        tx.objectStore("windows").delete(windowId);
        tx.oncomplete = resolve;
        tx.onerror = reject;
    });
}

async function getWindowsByLength(length) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction("windows", "readonly");
        const store = tx.objectStore("windows");
        const index = store.index("tabsLength");
        const cursor = index.openCursor(length);
        const windows = [];
        cursor.onsuccess = () => {
            if (cursor.result) {
                windows.push(cursor.result.value);
                cursor.result.continue();
            } else {
                resolve(windows);
            }
        };
        cursor.onerror = reject;
    });
}

async function getAllWindows() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction("windows", "readonly");
        const req = tx.objectStore("windows").getAll();
        req.onsuccess = () => resolve(req.result);
        req.onerror = reject;
    });
}


/*
* 
* CLOSED TABS
*
*/
async function addTabToClosedTabs(tab, reason = "manual") {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction("closedTabs", "readwrite");
        delete tab.index;
        tab["reason"] = reason;
        tx.objectStore("closedTabs").add(tab);
        tx.oncomplete = resolve;
        tx.onerror = reject;
    });
}

async function getClosedTab(index) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction("closedTabs", "readonly");
        const req = tx.objectStore("closedTabs").get(index);
        req.onsuccess = () => resolve(req.result);
        req.onerror = reject;
    });
}

async function getAllClosedTabs() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction("closedTabs", "readonly");
        const req = tx.objectStore("closedTabs").getAll();
        req.onsuccess = () => resolve(req.result);
        req.onerror = reject;
    });
}

async function removeFromClosedTabs(tabId, url, title) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction("closedTabs", "readwrite");
        // get all the tabs with the same id
        const req = tx.objectStore("closedTabs").get(tabId);
        req.onsucces = () => {
            const tab = req.result;
            if (tab.url === url && tab.title === title) { 
            }
        }
        // tx.objectStore("closedTabs").delete(tabId);
        tx.oncomplete = resolve;
        tx.onerror = reject;
    });
}



/*
*
* SYSTEM SETTINGS
*
*/
async function updateSystemGroupByWindow(value = null) {
    const db = await openDB();

    return new Promise((resolve, reject) => {
        if (value) {
            // update the value to new value
            const tx = db.transaction("system", "readwrite");
            tx.objectStore("system").put(value, "groupByWindow");
            tx.oncomplete = resolve;
            tx.onerror = reject;
        } else {
            // toggle the value
            const tx = db.transaction("system", "readwrite");
            const req = tx.objectStore("system").get("groupByWindow");
            req.onsuccess = () => {
                tx.objectStore("system").put(!req.result, "groupByWindow");
                console.log("Toggled groupByWindow to", !req.result);
                tx.oncomplete = () => resolve(!req.result);
                tx.onerror = reject;
            }
            req.onerror = reject;
        }
    })
}

async function updateSystemFilterByLLMs(value = null) {
    const db = await openDB();

    return new Promise((resolve, reject) => {
        const tx = db.transaction("system", "readwrite");
        tx.onerror = reject;
        if (value) {
            tx.objectStore("system").put(value, "filterByLLMs");
            tx.oncomplete = () => resolve(value);
        } else {
            const req = tx.objectStore("system").get("filterByLLMs");
            req.onsuccess = () => {
                tx.objectStore("system").put(!req.result, "filterByLLMs");
                tx.oncomplete = () => resolve(!req.result);
            }
            req.onerror = reject;
        }
    })
}

async function updateSystemHistoryView(value = null) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction("system", "readwrite");
        tx.onerror = reject;
        if (value) {
            tx.objectStore("system").put(value, "historyView");
            tx.oncomplete = () => resolve(value);
        } else {
            const req = tx.objectStore("system").get("historyView");
            req.onsuccess = () => {
                tx.objectStore("system").put(!req.result, "historyView");
                tx.oncomplete = () => resolve(!req.result);
            }
            req.onerror = reject;
        }
    })
}

async function getSystemSetting(key) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction("system", "readonly");
        const req = tx.objectStore("system").get(key);
        req.onsuccess = () => resolve(req.result);
        req.onerror = reject;
    });
}

async function clearStorage() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(["tabs", "windows"], "readwrite");
        tx.objectStore("tabs").clear();
        tx.objectStore("windows").clear();
        // tx.objectStore("closedTabs").clear();

        tx.oncomplete = resolve;
        tx.onerror = reject;
    });
}



/*
*
* Last Session
*
*/
async function addLastSession(data) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction("lastSession", "readwrite");
        const store = tx.objectStore("lastSession");
        store.add(data);
        tx.oncomplete = resolve;
        tx.onerror = reject;
    });
} 

async function getAllLastSessions() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction("lastSession", "readonly");
        const req = tx.objectStore("lastSession").getAll();
        req.onsuccess = () => resolve(req.result);
        req.onerror = reject;
    });
}

async function getLastSessionsByTabsLength(tabsLength) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction("lastSession", "readonly");
        const store = tx.objectStore("lastSession");
        const index = store.index("tabsLength");
        const req = index.openCursor(tabsLength);
        const sessions = [];
        req.onsuccess = (e) => {
            const cursor = e.target.result;
            if (cursor) {
                sessions.push(cursor.value);
                cursor.continue();
            } else {
                resolve(sessions);
            }
        };
        req.onerror = reject;
    });
}

async function removeLastSession(index) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction("lastSession", "readwrite");
        tx.objectStore("lastSession").delete(index);
        tx.oncomplete = resolve;
        tx.onerror = reject;
    });
}

/*
*
* OLD SESSIONS
*
*/
async function addOldSession(lastSession) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction("oldSessions", "readwrite");
        const store = tx.objectStore("oldSessions");
        lastSession.name = new Date().toLocaleDateString();
        store.put(lastSession);
        tx.oncomplete = resolve;
        tx.onerror = reject;
    });
}
async function getAllOldSessions() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction("oldSessions", "readonly");
        const req = tx.objectStore("oldSessions").getAll();
        req.onsuccess = () => resolve(req.result);
        req.onerror = reject;
    });
}