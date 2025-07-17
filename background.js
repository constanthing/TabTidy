chrome.runtime.onStartup.addListener(() => {
    // clear chrome storage local to reduce memory usage
    chrome.storage.local.set({
        "tabs": [],
    })
});

/*
Adds content.js to all tabs that are open at the time of installation.
NOTICE: this is not dangerous, no data is being collected or sent to any server.
*/

chrome.runtime.onInstalled.addListener(() => {
    chrome.tabs.query({}, async function(tabs) {
        tabs = await chrome.tabs.query({ url: ["http://*/*", "https://*/*"] });

        for (const tab of tabs) {
            // injecting content.js into all tabs
            // before, content.js would inject into tabs that load or navigate to a url
            try {
                // requires manifest.json to have "scripting" permission
                await chrome.scripting.executeScript({
                    target: {tabId: tab.id},
                    files: ["content.js"]
                });
            } catch (error) {
                /*
                Error:
                    Frame with ID 0 is showing error pag
                Happens because a tab is displaying a Chrome error page, not a regular website.
                Content scripts cannot run in these special pages. 
                (Example of a tab that shows this error is a page that was attempted to be loaded without internet connection)
                */
                console.log(tab.id);
                console.error(error);
            }
        }
    })
});

chrome.tabs.onActivated.addListener(async (activeInfo) => {
    console.log("onActivated", activeInfo);
    const result = await chrome.storage.local.get("tabs");
    console.log(result);
    if (result) {
        for (let i = 0; i < result.tabs.length; i++) {
            let tab = result.tabs[i];
            console.log("tab", tab);
            if (tab.id == activeInfo.tabId) {
                console.log("found tab", tab);
                result.tabs[i].lastVisited = new Date().getTime();
                console.log("updated tab", result.tabs[i]);
                break;
            }
        }
        chrome.storage.local.set({
            "tabs": result.tabs
        });
    }
})