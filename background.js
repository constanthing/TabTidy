// IndexedDB helper functions
function openDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open("taberDB", 1);
        request.onupgradeneeded = function(event) {
            const db = event.target.result;
            if (!db.objectStoreNames.contains("tabs")) {
                db.createObjectStore("tabs", { keyPath: "id" });
            }
            if (!db.objectStoreNames.contains("windows")) {
                db.createObjectStore("windows", { keyPath: "windowId" });
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function saveTab(tab) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction("tabs", "readwrite");
        tx.objectStore("tabs").put(tab);
        tx.oncomplete = resolve;
        tx.onerror = reject;
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
        req.onsuccess = () => resolve(req.result);
        req.onerror = reject;
    });
}

async function removeTabFromDB(tabId) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction("tabs", "readwrite");
        tx.objectStore("tabs").delete(tabId);
        tx.oncomplete = resolve;
        tx.onerror = reject;
    });
}

async function saveWindow(windowObj) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction("windows", "readwrite");
        tx.objectStore("windows").put(windowObj);
        tx.oncomplete = resolve;
        tx.onerror = reject;
    });
}

async function removeWindowFromDB(windowId) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction("windows", "readwrite");
        tx.objectStore("windows").delete(windowId);
        tx.oncomplete = resolve;
        tx.onerror = reject;
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

class TabManager {
    static NOT_FOUND = -1;

    constructor() {}

    async addTab(tab, data = {}) {
        let newTab = {
            index: tab.index,
            id: tab.id,
            windowId: tab.windowId,
            url: tab.url,
            title: tab.title,
            favIconUrl: tab.favIconUrl,
            lastVisited: null,
            ...data
        };
        await saveTab(newTab);
        console.log("✅ TAB ADDED", newTab);
        console.log("tabsLength", await this.getTabsLength());
        console.log("Tab successfully added to storage");
    }

    async updateTab(tabId, newData) {
        const tab = await getTab(tabId);
        if (!tab) {
            console.log("tab not found", tabId);
            return;
        }
        for (const key of Object.keys(newData)) {
            tab[key] = newData[key];
        }
        await saveTab(tab);
    }

    async removeTab(tabId) {
        console.log("removeTab called with:", tabId);
        await removeTabFromDB(tabId);
    }

    async getTabsLength() {
        const tabs = await getAllTabs();
        return tabs.length;
    }

    async addWindow(windowId) {
        const windowObj = { windowId: windowId, title: null };
        await saveWindow(windowObj);
    }

    async removeWindow(windowId) {
        await removeWindowFromDB(windowId);
    }

    async setBadgeLength() {
        const tabsLength = await this.getTabsLength();
        await chrome.action.setBadgeText({
            text: tabsLength.toString()
        });
    }
}

const tabManager = new TabManager();

async function initialize() {
    // Clear all tabs and windows from IndexedDB
    const db = await openDB();
    db.transaction(["tabs", "windows"], "readwrite").objectStore("tabs").clear();
    db.transaction(["tabs", "windows"], "readwrite").objectStore("windows").clear();

    // go through every tab and add it to IndexedDB
    await chrome.tabs.query({}, async function(tabs) {
        for (const tab of tabs) {
            await tabManager.addTab(tab);
        }
        await tabManager.setBadgeLength();
    });

    // go through every window and add it to IndexedDB
    chrome.windows.getAll({}, async function(windows) {
        for (const window of windows) {
            await tabManager.addWindow(window.id);
        }
    });
}

chrome.runtime.onStartup.addListener(() => {
    initialize();
});

chrome.runtime.onInstalled.addListener(() => {
    initialize();
});

chrome.tabs.onActivated.addListener(async (activeInfo) => {
    console.log("onActivated", activeInfo);
    const tab = await getTab(activeInfo.tabId);
    if (tab) {
        tab.lastVisited = new Date().getTime();
        await saveTab(tab);
    }
});

chrome.windows.onFocusChanged.addListener(async (windowId) => {
    console.log("onFocusChanged", windowId);
    chrome.tabs.query({active: true, windowId: windowId}, async function(tabs) {
        if (tabs.length > 0) {
            const tab = await getTab(tabs[0].id);
            if (tab) {
                tab.lastVisited = new Date().getTime();
                await saveTab(tab);
            }
        }
    });
});

chrome.tabs.onCreated.addListener(async (tab) => {
    console.log("onCreated", tab);
    console.log("tabLength", await tabManager.getTabsLength());
    await tabManager.addTab(tab);
    console.log("Tab added, getting length...");
    await tabManager.setBadgeLength();
});

let closedWindowTabs = {};
chrome.tabs.onRemoved.addListener(async (tabId, removeInfo) => {
    if (removeInfo.isWindowClosing) {
        if (!(removeInfo.windowId in closedWindowTabs)) {
            closedWindowTabs[removeInfo.windowId] = [];
        }
        closedWindowTabs[removeInfo.windowId].push(tabId);
        return;
    }
    console.log("tabs.onRemoved", tabId, removeInfo);
    await tabManager.removeTab(tabId);
    await tabManager.setBadgeLength();
    await chrome.tabs.query({active: true}, async function(tabs) {
        if (tabs.length > 0) {
            await tabManager.updateTab(tabs[0].id, {
                lastVisited: new Date().getTime()
            });
        }
    });
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {   
    console.log("\n\n\nonUpdated", tabId, changeInfo, tab);
    if (changeInfo.status == "complete") {
        await tabManager.updateTab(tabId, {
            url: tab.url,
            title: tab.title,
            favIconUrl: tab.favIconUrl ? tab.favIconUrl : null,
            lastVisited: new Date().getTime()
        });
    } else if (changeInfo.title) {
        await tabManager.updateTab(tabId, {
            title: tab.title
        });
    } else if (changeInfo.favIconUrl) {
        await tabManager.updateTab(tabId, {
            favIconUrl: tab.favIconUrl ? tab.favIconUrl : null
        });
    }
});

chrome.windows.onCreated.addListener(async (window) => {   
    await tabManager.addWindow(window.id);
    chrome.tabs.query({windowId: window.id}, async function(windowTabs) {
        for (const windowTab of windowTabs) {
            const tab = await getTab(windowTab.id);
            if (tab) {
                tab.windowId = window.id;
                await saveTab(tab);
            }
        }
    });
});

chrome.windows.onRemoved.addListener(async (windowId) => {
    console.log("windows.onRemoved", windowId);
    await tabManager.removeWindow(windowId);
    const tabIds = closedWindowTabs[windowId];
    if (tabIds) {
        for (const tabId of tabIds) {
            await tabManager.removeTab(tabId);
        }
        delete closedWindowTabs[windowId];
    }
    await tabManager.setBadgeLength();
});