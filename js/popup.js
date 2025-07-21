// default false (tabs are not grouped by windows)
let SYSTEM_GROUP_BY_WINDOW = false; 


import { TabManager } from "./TabManager.js";
import { updateSystemGroupByWindow, getSystemSetting, removeFromClosedTabs } from "../background/database.js";



let tabManager = null;


document.addEventListener("DOMContentLoaded", async () => {
    SYSTEM_GROUP_BY_WINDOW = await getSystemSetting("groupByWindow");

    tabManager = await new TabManager();

    // Initial Load of Tabs
    await tabManager.loadTabs();

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

            if (e.target.closest(".closed-tab")) {
                // remove from closed tabs table 
                await removeFromClosedTabs(tabId);

                // open in new tab and same window (if possible)
                const windowExists = await chrome.windows.get(windowId);
                const tabIndex = parseInt(row.dataset.tabIndex);
                const tabUrl = row.querySelector(".tab-url").textContent;

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
    document.getElementById("search-input").addEventListener("input", async function(e) {
        const query = e.target.value;
        const results = await tabManager.search(query);
        await tabManager.hideShowTabs(tabManager.sort(results["openTabs"]), tabManager.sort(results["closedTabs"]));
    });


    /*
    * Group By Window Button Event Listener
    */
    const groupByWindowBtn = document.querySelector("#group-by-window-btn");

    // initial state of the button based on system setting
    if (SYSTEM_GROUP_BY_WINDOW) {
        groupByWindowBtn.classList.add("active");
    }

    groupByWindowBtn.addEventListener("click", async function(e) {
        try {
            SYSTEM_GROUP_BY_WINDOW = await updateSystemGroupByWindow();
            groupByWindowBtn.classList.toggle("active");
            await tabManager.loadTabs();
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

    const settingsBtn = document.querySelector("#settings-btn");
    settingsBtn.addEventListener("click", function(e) {
        chrome.runtime.sendMessage({type: "open-home"});
    });
});