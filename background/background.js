import { DB_VERSION, openDB, saveTab, getTab, getAllTabs, getLastTab, removeTabFromDB, addTabToClosedTabs, getClosedTab, getAllClosedTabs, removeFromClosedTabs, saveWindow, removeWindowFromDB, getAllWindows, getTabsByWindowId, getTabById } from "./database.js";

class TabManager {
    static NOT_FOUND = -1;

    constructor() { }

    async addTab(tab, data = {}) {
        console.log("addTab called with:", tab);
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
        const tab = await getTabById(tabId);
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
        const removedTab = await removeTabFromDB(tabId);
        console.log("removedTab", removedTab);
        await addTabToClosedTabs(removedTab);
    }

    async getTabsLength() {
        const tabs = await getAllTabs();
        return tabs.length;
    }

    async addWindow(window) {
        console.log("addWindow called with:", window);
        const windowObj = { windowId: window.id, title: null, sessionId: window.sessionId };
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
    console.log("Recently closed tabs:", await chrome.sessions.getRecentlyClosed());

    // just in case
    chrome.storage.local.set({
        "tabs": null,
        "windows": null,
    })

    const db = await openDB();

    const tabs = await getAllTabs();
    const windows = await getAllWindows();
    const closedTabs = await getAllClosedTabs();

    db.transaction(["tabs"], "readwrite").objectStore("tabs").clear();
    db.transaction(["windows"], "readwrite").objectStore("windows").clear();
    db.transaction(["closedTabs"], "readwrite").objectStore("closedTabs").clear();

    if (tabs.length == 0 && windows.length == 0 && closedTabs.length == 0) {
        // go through every tab and add it to IndexedDB
        const tabs = await chrome.tabs.query({});

        for (const tab of tabs) {
            await tabManager.addTab(tab);
        }
        await tabManager.setBadgeLength();

        // go through every window and add it to IndexedDB
        chrome.windows.getAll({}, async function (windows) {
            for (const window of windows) {
                await tabManager.addWindow(window);
            }
        });
    }

    await tabManager.setBadgeLength();
}

chrome.runtime.onStartup.addListener(async () => {
    // Clear all tabs and windows from IndexedDB
    initialize();
});

chrome.runtime.onInstalled.addListener(() => {
    initialize();
});

chrome.tabs.onActivated.addListener(async (activeInfo) => {
    console.log("onActivated", activeInfo);
    const tab = await getTabById(activeInfo.tabId);
    console.log("tab", tab);
    if (tab) {
        tab.lastVisited = new Date().getTime();
        await saveTab(tab);
    }
});

chrome.windows.onFocusChanged.addListener(async (windowId) => {
    console.log("onFocusChanged", windowId);
    chrome.tabs.query({ active: true, windowId: windowId }, async function (tabs) {
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
    await chrome.tabs.query({ active: true }, async function (tabs) {
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
    } else if (changeInfo.url) {
        await tabManager.updateTab(tabId, {
            url: tab.url,
        });
    }
});

chrome.windows.onCreated.addListener(async (window) => {
    await tabManager.addWindow(window);
    chrome.tabs.query({ windowId: window.id }, async function (windowTabs) {
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



// HOTKEY COMMANDS
chrome.commands.onCommand.addListener(async (command) => {
    console.log("onCommand", command);
    if (command == "alternate-tab") {
        console.log("getLastTab");
        let tab = null;
        try {
            tab = await getLastTab();
        } catch (error) {
            console.error("Error getting last tab:", error);
        }
        console.log("tab", tab);
        if (tab) {
            // make window focused
            chrome.windows.update(tab.windowId, { focused: true });
            // make tab active
            chrome.tabs.update(tab.id, { active: true });
        } else {
            console.log("No last tab found.");
        }
    }
});


// messages
chrome.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
    if (message.type == "open-home") {
        chrome.tabs.create({ url: chrome.runtime.getURL("home.html") });
    }
});