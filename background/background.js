import TabManager from "./TabManager.js";

// Create tabmanager instance
const tabManager = new TabManager();

async function initialize() {
    console.log("Recently closed tabs:", await chrome.sessions.getRecentlyClosed());

    // just in case
    chrome.storage.local.set({
        "tabs": null,
        "windows": null,
    })

    const tabs = await tabManager.getAllTabs();
    const windows = await tabManager.getAllWindows();
    const closedTabs = await tabManager.getAllClosedTabs();

    await tabManager.clearStorage();

    console.log(tabs.length, windows.length, closedTabs.length);

    if (tabs.length == 0 && windows.length == 0) {
        // go through every tab and add it to IndexedDB
        const tabs = await chrome.tabs.query({});

        for (const tab of tabs) {
            await tabManager.addTab(tab, { lastVisited: null });
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



let timeSinceWindowCreated = null;
let tabIndex = 0;
/*
*
* RUNTIME EVENTS
*
*/
chrome.runtime.onStartup.addListener(async () => {
    // Clear all tabs and windows from IndexedDB
    initialize();

    console.log("[INFO] onStartup");

});

chrome.runtime.onInstalled.addListener(() => {
    initialize();
});
/*
* No official event for when the user closes chrome.
*/


/*
*
* TABS EVENTS
*
*/
chrome.tabs.onCreated.addListener(async (tab) => {
    console.log("[INFO] onCreated", tab.url);
    const created = new Date().getTime();
    console.log("[INFO] time since window created", (created - timeSinceWindowCreated) / 1000, "seconds", (created - timeSinceWindowCreated), "ms");
    console.log("[INFO] tabIndex", tabIndex);

    tabIndex++;
    await tabManager.addTab(tab, { lastVisited: null });
    await tabManager.setBadgeLength();
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    /*
    * onUpdate fires multiple times for a tab.
    * each time with diff. properties in the changeInfo object.
    * the sequence is not always linear! AND the 
        * 'status': 'complete' event does not guarantee that all 
        * the properties have already been updated! 
    * changeInfo.status: 'complete' fires when the main document has finished loading!
        * so, it doesn't track subresources like favicon, title, etc. that might be dynamically updated!
        * e.g. chatgpt doesn't update the title immediately, when you send 
            * a chat it intelligently creates a title based on the conversation
    * THIS IS ALL TO SAY
        * do not check for 'status': 'complete' use individual
        * (if/else if) checks on the changeInfo object! 
    */ 

    console.log("[INFO] onUpdated", tabId, changeInfo, tab);

    const storedTab = await tabManager.getTab(tabId);
    
    if (changeInfo.title) {
        await tabManager.updateTab(tabId, {
            title: changeInfo.title
        });
    } else if (changeInfo.favIconUrl) {
        await tabManager.updateTab(tabId, {
            favIconUrl: changeInfo.favIconUrl ? changeInfo.favIconUrl : null
        });
    } else if (changeInfo.url) {
        console.log("[INFO] url changed", changeInfo.url);
        if (storedTab.url && !storedTab.url.includes("chrome://")) {
            storedTab.lastVisited = new Date().getTime();
            await tabManager.addTabToClosedTabs(storedTab, "url-change");
        }

        await tabManager.updateTab(tabId, {
            url: changeInfo.url,
        });
    } else if (changeInfo.status == "complete") {
        const newData = { };
        if (tab.url != storedTab.url) {
            newData.url = tab.url;
        }
        if (tab.title != storedTab.title) {
            newData.title = tab.title;
        }
        if (tab.favIconUrl != storedTab.favIconUrl) {
            newData.favIconUrl = tab.favIconUrl;
        }
        if (Object.keys(newData).length > 0) {
            await tabManager.updateTab(tabId, newData);
        }
    }
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
    console.log("[INFO] onRemoved", tabId, removeInfo);
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

chrome.tabs.onActivated.addListener(async (activeInfo) => {
    console.log("[INFO] onActivated", activeInfo);
    const tab = await tabManager.getTab(activeInfo.tabId);
    console.log("tab", tab);
    if (tab) {
        tab.lastVisited = new Date().getTime();
        await tabManager.updateTab(activeInfo.tabId, {
            lastVisited: new Date().getTime()
        });
    }
});

chrome.tabs.onAttached.addListener(async (tabId, attachInfo) => {
    console.log("[INFO] onAttached", tabId, attachInfo);
    await tabManager.updateTab(tabId, {
        windowId: attachInfo.newWindowId
    })
});



/*
*
* WINDOWS EVENTS
*
*/
chrome.windows.onFocusChanged.addListener(async (windowId) => {
    // console.log("[INFO] onFocusChanged", windowId);
    // chrome.tabs.query({ active: true, windowId: windowId }, async function (tabs) {
    //     if (tabs.length > 0) {
    //         const tab = await getTab(tabs[0].id);
    //         if (tab) {
    //             await saveTab(tab, { lastVisited: new Date().getTime() });
    //         }
    //     }
    // });
});

chrome.windows.onCreated.addListener(async (window) => {
    console.log("[INFO] windows.onCreated", window);

    timeSinceWindowCreated = new Date().getTime();
    console.log("[INFO] first window created", timeSinceWindowCreated, "ms", (new Date(timeSinceWindowCreated)).toISOString());

    await tabManager.addWindow(window);
    chrome.tabs.query({ windowId: window.id }, async function (windowTabs) {
        for (const windowTab of windowTabs) {
            const tab = await tabManager.getTab(windowTab.id);
            if (tab) {
                await tabManager.addTab(tab, { windowId: window.id });
            }
        }
    });
});

chrome.windows.onRemoved.addListener(async (windowId) => {
    /*
    * If window has 1 tab, that is detached from current window and moved to another window, then onRemoved is called AFTER onAttached is called for the tab.
    * As a result, the window will not have any tabs in it. Hence, the if statement check.
    */
    console.log("[INFO] windows.onRemoved", windowId);
    await tabManager.removeWindow(windowId);
    const tabIds = closedWindowTabs[windowId];
    console.log(tabIds)
    if (tabIds) {
        for (const tabId of tabIds) {
            await tabManager.removeTab(tabId);
        }
        delete closedWindowTabs[windowId];
    }
    await tabManager.setBadgeLength();
});



/*
*
* COMMANDS
*
*/
chrome.commands.onCommand.addListener(async (command) => {
    console.log("[INFO] onCommand", command);
    if (command == "alternate-tab") {
        console.log("getLastTab");
        let tab = null;
        try {
            tab = await tabManager.getLastTab();
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



/*
*
* MESSAGES
*
*/
chrome.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
    if (message.type == "open-home") {
        chrome.tabs.create({ url: chrome.runtime.getURL("home.html") });
    }
});