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
    // const closedTabs = await tabManager.getAllClosedTabs();

    // await tabManager.clearStorage();

    console.log(tabs.length, windows.length);

    // if (tabs.length == 0 && windows.length == 0) {
    //     // go through every tab and add it to IndexedDB
    //     const tabs = await chrome.tabs.query({});

    //     for (const tab of tabs) {
    //         await tabManager.addTab(tab, { lastVisited: null });
    //     }
    //     await tabManager.setBadgeLength();

    //     // go through every window and add it to IndexedDB
    //     chrome.windows.getAll({}, async function (windows) {
    //         for (const window of windows) {
    //             await tabManager.addWindow(window);
    //         }
    //     });
    // }

    await tabManager.setBadgeLength();
}


let timeSinceWindowCreated = null;
let timeSinceTabCreated = null;
let tabIndex = 0;
let newSession = false;
/*
*
* RUNTIME EVENTS
*
*/
chrome.runtime.onStartup.addListener(async () => {
    // Clear all tabs and windows from IndexedDB
    initialize();

    console.log("[INFO] onStartup");

    await tabManager.updateSystemSetting("newSession", true);
    newSession = true;

    // now, tabs, windows should be empty
    // now it's ready to start a new session / restore tabs/windows from lastSession (if any)
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

    if (timeSinceWindowCreated && (created - timeSinceWindowCreated) < 100) {
        console.log("[INFO] tab was created within 100ms of window creation. thus, it was restored.");
    } else {
        // if tab was created 1 second after the windowWasCreated then it was user created 
        console.log("[INFO] user created tab");
        // now all we have to check if the tab was restored via alt-shift-t
        await tabManager.addTab(tab, { lastVisited: null });
        await tabManager.setBadgeLength();
    }

    tabIndex++;
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

    if (!storedTab) {
        return;
    }
    
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
            if (storedTab.url != changeInfo.url) {
                console.log(storedTab.url, changeInfo.url);
                storedTab.lastVisited = new Date().getTime();
                await tabManager.addTabToClosedTabs(storedTab, "url-change");
            }
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
    await tabManager.removeTab(tabId, true);
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

function normalizeUrl(url) {
    url = new URL(url);
    // remove search parameters
    url.search = "";
    // remove hash(s)
    url.hash = "";
    return url.toString();
}

async function identifyWindow(window) {

    // this always runs after the tabs have been created for the specific window!
    const tabs = await chrome.tabs.query({windowId: window.id});

    if (await tabManager.getSystemSetting("newSession") || newSession) {
        // remove all last sessions (these are old that were created before this new session)
        // const lastSessions = await tabManager.getAllLastSessions();
        // console.log("[LAST SESSIONS] old last sessions", lastSessions, lastSessions.length);
        // for (const lastSession of lastSessions) {
        //     await tabManager.removeLastSession(lastSession.index);
        // }

        // check for any existing windows/tabs and move to lastSession
        const windows = await tabManager.getAllWindows();

        console.log("[WINDOWS] windows", windows);

        // going trough any (potential) window and adding it to lastSession
        for (const window of windows) {
            const tabsOfWindow = await tabManager.getTabsByWindowId(window.windowId);
            await tabManager.addLastSession({
                windowId: window.windowId,
                title: window.title,
                tabs: tabsOfWindow,
                tabsLength: tabsOfWindow.length
            });
            await tabManager.removeWindow(window.windowId);
        }

        const tabs = await tabManager.getAllTabs();
        for (const tab of tabs) {
            // we don't want to add these tabs to closed tabs
            // because they are not closed by the user, but by the system
            await tabManager.removeTab(tab.id, false);
        }

        console.log("[LAST SESSIONS] last sessions", await tabManager.getAllLastSessions());

        await tabManager.updateSystemSetting("newSession", false);
    }

    // there should always be at least 1 tab in the window
    // - maybe we filter this ? so that if it's just a bunch of new tabs, we don't compare with lastSession 
    if (tabs) {
        console.log("[IMP] tabs", tabs, tabs.length, new Date().getTime() - timeSinceWindowCreated, "ms");
        // const windows = await tabManager.getAllWindows();
        let lastSessionsWithSameTabsLength = await tabManager.getLastSessionsByTabsLength(tabs.length);

        // sort based on index 
        lastSessionsWithSameTabsLength = lastSessionsWithSameTabsLength.sort((a, b) => a.index - b.index);

        console.log("[LAST SESSIONS] with same tabs length", lastSessionsWithSameTabsLength);

        // if no last sessions with same tabs length, assume window/tabs are new
        // - add window to storage
        // - add tabs to storage
        if (lastSessionsWithSameTabsLength.length == 0) {
            console.log("[INFO] no last sessions with same tabs length found", window, tabs);

            await tabManager.addWindow(window);
            for (const tab of tabs) {
                // @TODO: CHECK THIS ! 
                // why am i setting window.id ? isn't it already set to new window ? 
                await tabManager.addTab(tab, { windowId: window.id, lastVisited: null });
            }
        } else {
            console.log("[INFO] last sessions with same tabs length found", lastSessionsWithSameTabsLength.length);

            let lastSessionFound = false;

            // if last sessions with same tabs length, then we need to compare the tabs
            for (const lastSession of lastSessionsWithSameTabsLength) {
                let sameTabs = lastSession.tabsLength; 
                const newTabs = [];

                for (let i = 0; i < tabs.length; i++) {
                    const lastSessionTab = lastSession.tabs[i];
                    // normalizing urls to remove search parameters and hash(s)
                    if (normalizeUrl(lastSessionTab.url) != normalizeUrl(tabs[i].url)) {
                        // if tab is not the same as one in lastSession, then we add the new tab instead.
                        sameTabs--;
                        tabs[i].windowId = window.id;

                        newTabs.push(tabs[i]);
                    } else {
                        // preserving the data from the tabs in lastSession

                        // updating the old windowId to the new windowId
                        lastSessionTab.windowId = window.id;
                        lastSessionTab.id = tabs[i].id;

                        newTabs.push(lastSessionTab);
                    }
                }

                if (sameTabs / lastSession.tabsLength >= 0.8) {
                    console.log("[SUCCESS] last session with same tabs(>=80%) found", lastSession);
                    lastSessionFound = true;

                    // add the window
                    await tabManager.addWindow(window);

                    // if more than 80% of the tabs are the same, then we can assume this is the same window
                    // add newTabs to storage
                    for (const tab of newTabs) {
                        await tabManager.addTab(tab, { });
                    }
                    // remove lastSession from storage
                    await tabManager.removeLastSession(lastSession.index);
                    await tabManager.addOldSession(lastSession);
                } else {
                    // continue looking 
                    console.log("[FAIL] last session with same tabs(<80%) found", lastSession);
                }
            }

            if (!lastSessionFound) {
                // treat window/tabs of window as new 
                await tabManager.addWindow(window);
                for (const tab of tabs) {
                    await tabManager.addTab(tab, { windowId: window.id, lastVisited: null });
                }
            }
        }
    } else {
        console.log("[IMP] no tabs found", new Date().getTime() - timeSinceWindowCreated, "ms");
    }

}

chrome.windows.onCreated.addListener(async (window) => {
    console.log("[INFO] windows.onCreated", window);

    timeSinceWindowCreated = new Date().getTime();
    console.log("[INFO] first window created", timeSinceWindowCreated, "ms", (new Date(timeSinceWindowCreated)).toISOString());

    await identifyWindow(window);
    await tabManager.setBadgeLength();
});

chrome.windows.onRemoved.addListener(async (windowId) => {
    /*
    * If window has 1 tab, that is detached from current window and moved to another window, then onRemoved is called AFTER onAttached is called for the tab.
    * As a result, the window will not have any tabs in it. Hence, the if statement check.
    */
    console.log("[INFO] windows.onRemoved", windowId);
    // await tabManager.removeWindow(windowId);
    // const tabIds = closedWindowTabs[windowId];
    // console.log(tabIds)
    // if (tabIds) {
    //     for (const tabId of tabIds) {
    //         await tabManager.removeTab(tabId);
    //     }
    //     delete closedWindowTabs[windowId];
    // }
    // await tabManager.setBadgeLength();
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