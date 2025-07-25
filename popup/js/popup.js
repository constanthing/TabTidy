// default false (tabs are not grouped by windows)
let SYSTEM_GROUP_BY_WINDOW = false; 
let SYSTEM_FILTER_BY_LLMS = false;
let SYSTEM_HISTORY_VIEW = false;

import PopupManager from "./PopupManager.js";
import TabManager from "../../background/TabManager.js";

const tabManager = new TabManager();
let popupManager = null;


document.addEventListener("DOMContentLoaded", async () => {
    SYSTEM_GROUP_BY_WINDOW = await tabManager.getSystemSetting("groupByWindow");
    SYSTEM_FILTER_BY_LLMS = await tabManager.getSystemSetting("filterByLLMs");
    SYSTEM_HISTORY_VIEW = await tabManager.getSystemSetting("historyView");

    popupManager = await new PopupManager();

    // Initial Load of Tabs
    await popupManager.loadTabs();

    const tabInfo = document.getElementById("tab-info");
    const tabInfoTabId = document.getElementById("tab-id");
    const tabInfoWindowId = document.getElementById("tab-window-id");
    const tabInfoTitle = document.getElementById("tab-title");
    const tabInfoUrl = document.getElementById("tab-url");
    const contentDimmer = document.querySelector(".content-dimmer");

    /*
    * Global Click Event Listener
    */
    document.addEventListener("click", async function(e) {
        if (e.target.classList.contains("tab-id")) {
            tabInfo.classList.add("active");
            contentDimmer.classList.add("active");


            const tabId = parseInt(e.target.parentElement.querySelector(".tab-id").textContent);
            const windowId = parseInt(e.target.parentElement.querySelector(".tab-window-id").textContent);

            tabInfo.dataset.tabId = tabId;
            tabInfo.dataset.windowId = windowId;

            tabInfoTabId.textContent = tabId;
            tabInfoWindowId.textContent = windowId;
            tabInfoTitle.textContent = e.target.parentElement.querySelector(".tab-title").textContent;
            tabInfoUrl.textContent = e.target.parentElement.querySelector(".tab-url").textContent;
        } else if (e.target.closest(".tab-row")) {
            const row = e.target.closest(".tab-row");
            const tabId = parseInt(row.dataset.tabId);
            const windowId = parseInt(row.dataset.windowId);
            
            console.log("[INFO] is closed tab", row.closest(".closed-tab"));

            if (e.target.closest(".closed-tab")) {
                console.log("[INFO] closed tab clicked");
                // remove from closed tabs table 
                await tabManager.removeFromClosedTabs(tabId);

                let windowExists = false;
                try {
                    // open in new tab and same window (if possible)
                    windowExists = await chrome.windows.get(windowId);
                } catch (e) {
                    windowExists = false;
                }

                const tabIndex = parseInt(row.dataset.tabIndex);
                const tabUrl = row.querySelector(".tab-url").textContent;

                console.log("[INFO] tabUrl", tabUrl);
                console.log("[INFO] windowExists", windowExists);
                console.log("[INFO] tabIndex", tabIndex);

                if (windowExists) {
                    chrome.tabs.create({url: tabUrl, windowId: windowId, index: tabIndex}, function(tab) {
                        chrome.tabs.update(tab.id, {active: true});
                    });
                } else {
                    // open in new tab in current window 
                    chrome.tabs.create({url: tabUrl, active: true}, function(tab) {
                        chrome.tabs.update(tab.id, {active: true});
                    });
                }
            } else {
                chrome.windows.update(windowId, {focused: true});
                chrome.tabs.update(tabId, {active: true});
            }
        } else if (e.target.classList.contains("table-window-title")) {
            const tableContainer = e.target.parentElement.parentElement;
            tableContainer.classList.toggle("active");
        } else if (e.target.classList.contains("thead-last-visited")) {
            // delete tables[ungroupedTableId];
            // loadTabs(false, "lastVisited");
        }
    });


    /*
    * Search Input Event Listener
    */
    const searchInput = document.getElementById("search-input");
    searchInput.addEventListener("input", async function(e) {
        const query = e.target.value;
        const results = await popupManager.search(query);
        await popupManager.hideShowTabs(popupManager.sort(results["openTabs"]), popupManager.sort(results["closedTabs"]));
    });


    /*
    * Group By Window Button Event Listener
    */
    const groupByWindowBtn = document.querySelector("#group-by-window-btn");
    const filterByLLMsBtn = document.querySelector("#filter-by-llms-btn");
    const historyViewBtn = document.querySelector("#history-view-btn");

    // initial state of the button based on system setting
    if (SYSTEM_GROUP_BY_WINDOW) {
        groupByWindowBtn.classList.add("active");
    }
    if (SYSTEM_FILTER_BY_LLMS) {
        filterByLLMsBtn.classList.add("active");

        const query = searchInput.value;
        const results = await popupManager.search(query);
        await popupManager.hideShowTabs(popupManager.sort(results["openTabs"]), popupManager.sort(results["closedTabs"]));
    }
    if (SYSTEM_HISTORY_VIEW) {
        historyViewBtn.classList.add("active");

        const query = searchInput.value;
        const results = await popupManager.search(query);
        await popupManager.hideShowTabs([], popupManager.sort(results["closedTabs"]));
    }

    groupByWindowBtn.addEventListener("click", async function(e) {
        try {
            SYSTEM_GROUP_BY_WINDOW = await tabManager.updateSystemSetting("groupByWindow");
            groupByWindowBtn.classList.toggle("active");

            await popupManager.loadTabs();

            const query = searchInput.value;
            const results = await popupManager.search(query);
            console.log("[INFO] results", results);
            await popupManager.hideShowTabs(popupManager.sort(results["openTabs"]), popupManager.sort(results["closedTabs"]));
        } catch (e) {
            console.error("Error updating SYSTEM_GROUP_BY_WINDOW: ", e);
        }
    });

    // const rows = document.querySelectorAll(".tab-row");
    // let index = 0;
    // document.addEventListener("keydown", function(e) {
    //     if (e.key === "ArrowUp" && index > 0) {
    //         rows[index].classList.remove("active");
    //         index--;
    //     } else if (e.key === "ArrowDown" && index < rows.length - 1) {
    //         rows[index].classList.remove("active");
    //         index++;
    //     } else if (e.key === "Enter") {
    //         const mouseClick = new MouseEvent("click", {
    //             bubbles: true,
    //             cancelable: true,
    //             view: window,
    //             button: 0
    //         });
    //         if (index != -1) {
    //             rows[index].dispatchEvent(mouseClick);
    //             // index = -1;
    //         }
    //     }

    //     let row = rows[index];
    //     row.scrollIntoView({ behavior: "smooth", block: "center" });
    //     row.classList.add("active");
    // });

    /*
    * HISTORY BUTTON
    */
    historyViewBtn.addEventListener("click", async function(e) {
        console.log("[INFO] history btn clicked");

        SYSTEM_HISTORY_VIEW = await tabManager.updateSystemSetting("historyView");
        popupManager.historyView = SYSTEM_HISTORY_VIEW;
        historyViewBtn.classList.toggle("active");

        const query = searchInput.value;
        const results = await popupManager.search(query);
        console.log("[INFO] results", results);
        await popupManager.hideShowTabs(popupManager.sort(results["openTabs"]), popupManager.sort(results["closedTabs"]));
    });

    /*
    * SETTINGS BUTTON
    */

    const settingsBtn = document.querySelector("#settings-btn");
    settingsBtn.addEventListener("click", function(e) {
        chrome.runtime.sendMessage({type: "open-home"});
    });

    filterByLLMsBtn.addEventListener("click", async function(e) {
        // toggle the filter by LLMs value in storage
        SYSTEM_FILTER_BY_LLMS = await tabManager.updateSystemSetting("filterByLLMs");
        popupManager.filtered = SYSTEM_FILTER_BY_LLMS;
        filterByLLMsBtn.classList.toggle("active");

        const query = searchInput.value;
        const results = await popupManager.search(query);
        console.log("[INFO] results", results);
        await popupManager.hideShowTabs(popupManager.sort(results["openTabs"]), popupManager.sort(results["closedTabs"]));
    });
});