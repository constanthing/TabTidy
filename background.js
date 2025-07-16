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
                (Example of a tab that shows this error is a page that was attempted to be loaded with not internet connection)
                */
                console.log(tab.id);
                console.error(error);
            }
        }
    })
});