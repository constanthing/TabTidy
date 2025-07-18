// default false (tabs are not grouped by windows)
let SYSTEM_GROUP_BY_WINDOW = false; 

// IndexedDB helper functions for popup.js
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

async function getAllTabs() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction("tabs", "readonly");
        const req = tx.objectStore("tabs").getAll();
        req.onsuccess = () => resolve(req.result);
        req.onerror = reject;
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
    tables = {};
    windows = {};
    tabs = {};

    constructor() {
        return new Promise(async (resolve, reject) => {
            // get tabs from IndexedDB
            const tabsArr = await getAllTabs();
            this.tabs = {};
            for (const tab of tabsArr) {
                this.tabs[tab.id] = tab;
            }

            // get windows from IndexedDB
            const windowsArr = await getAllWindows();
            this.windows = {};
            for (const win of windowsArr) {
                this.windows[win.windowId] = win;
            }

            this.searchIndex = new Map();
            resolve(this);
        })
    }

    getTab(tabId) {
        return this.tabs[tabId];
    }

    search(query, fields = ["title", "url", "windowId"]) {
        if (query.length == 0) return Object.values(this.tabs);

        const cacheKey = `${query}-${fields.join(",")}`;

        // check cache
        if (this.searchIndex.has(cacheKey)) {
            return this.searchIndex.get(cacheKey);
        }

        // no cache, search

        const normalizedQuery = query.toLowerCase().trim();

        // if no query, return all tabs
        if (!normalizedQuery) return this.tabs;

        const results = Object.values(this.tabs).filter(tab => {
            return fields.some(field => {
                try {
                    let value = tab[field].toLowerCase();
                    return value.includes(normalizedQuery);
                } catch(e) {
                    console.log("Error searching for", field, "in", tab);
                    return false;
                }
            });
        });


        // cache results
        this.searchIndex.set(cacheKey, results);
        return results;
    }

    sort(tabs, sortBy = "lastVisited", sortDescending = true) {
        if (sortBy == "lastVisited") {
            // Convert object to array
            const tabsArray = Object.values(tabs);
            
            return tabsArray.sort((a, b) => {
                // Handle null/undefined lastVisited
                const aTime = a.lastVisited || 0;
                const bTime = b.lastVisited || 0;

                
                return sortDescending ? bTime - aTime : aTime - bTime;
            });
        }

        return tabs;
    }

    hideShowTabs(results) {

        results = this.sort(results);

        // show all windows (if grouped by windows)
        if (SYSTEM_GROUP_BY_WINDOW) {
            for (const windowId of Object.keys(this.windows)) {
                const windowElement = document.querySelector(`[data-window-id="${windowId}"]`);
                windowElement.classList.remove("hidden");
            }
        }

        // hide all tabs (so search just show the tabs that match)
        for (const tabId of Object.keys(this.tabs)) {
            const tab = this.tabs[tabId];
            try {
                const tabElement = document.querySelector(`[data-tab-id="${tab.id}"]`);
                tabElement.classList.remove("show");
                tabElement.classList.add("hidden");
            } catch (e) {
                console.log("Row not found", tab.id);
            }
        }

        // show the tabs that match the search
        for (const showTab of results) {
            for (const tabId of Object.keys(this.tabs)) {
                const tab = this.tabs[tabId];
                try {
                    const tabElement = document.querySelector(`[data-tab-id="${tab.id}"]`);

                    if (tab.id === showTab.id) {
                        tabElement.classList.remove("hidden");
                        tabElement.classList.add("show");
                    }
                } catch (e) {
                    console.log("Row not found", tab.id);
                }
            }
        }

        // hide all windows (if grouped by windows)
        if (SYSTEM_GROUP_BY_WINDOW) {
            for (const windowId of Object.keys(this.windows)) {
                const windowElement = document.querySelector(`[data-window-id="${windowId}"]`);
                if (!windowElement.querySelector(".show")) {
                    windowElement.classList.add("hidden");
                }
            }
        }
    }

    clearSearchCache() {
        this.searchIndex.clear();
    }
}

let tabManager = null;

const tabTablesContainer = document.querySelector("#tab-tables-container");

let tables = {

};

const ungroupedTableId = "ungrouped-table";

function createWindowTables(tabId) {
    return new Promise(async (resolve, reject) => {
        // returns existing tab if it exists, otherwise creates a new tab
        let tab = tabManager.getTab(tabId);


        if (!tab) {
            resolve();
        }


        const windowId = tab.windowId;

        const tableExists = tables[windowId];

        if (!tableExists) {
            const tableContainer = document.createElement("div");
            tableContainer.dataset.windowId = windowId;
            tableContainer.classList.add("table-container");
            tableContainer.classList.add("active");

            tableContainer.innerHTML = `
                <div class="table-container-header">
                    <input type="text" class="table-window-title" value="Window ${windowId}" readonly/>
                    <button class="table-window-settings-button"><i class="bi bi-sliders2"></i></button>
                </div>
                <table class="tabs-table">
                    <thead>
                        <tr>
                            <th><span class="thead-title">Title <i class="bi bi-sort-alpha-down"></i></span></th>
                            <th><span class="thead-title">Last Visited <i class="bi bi-sort-alpha-down"></i></span></th>
                        </tr>
                    </thead>
                    <tbody></tbody>
                </table>
            `;
            tabTablesContainer.appendChild(tableContainer);

            tables[windowId] = tableContainer;
            tabTablesContainer.appendChild(tableContainer);
        }
        
        const table = tables[windowId];
        const tbody = table.querySelector("tbody");

        const row = document.createElement("tr");
        row.classList.add("tab-row");
        row.dataset.tabId = tab.id;
        row.dataset.windowId = tab.windowId;
        row.innerHTML = `
            <td class="tab-title">${ tab.favIconUrl ? `<img src="${tab.favIconUrl}" class="tab-favicon" />` : "" } ${tab.title}</td>
            <td class="tab-last-visited">${tab.lastVisited ? new Date(tab.lastVisited).toLocaleString() : "--"}</td>
        `;
        tbody.appendChild(row);

        resolve();
    })
}
function createUngroupedTable(tabId) {
    return new Promise(async (resolve, reject) => {
        // returns existing tab if it exists, otherwise creates a new tab
        let tab = tabManager.getTab(tabId);


        const tableExists = tables[ungroupedTableId];

        if (!tableExists) {
            const table = document.createElement("table");
            table.classList.add("ungrouped-table");
            table.classList.add("tabs-table");
            table.innerHTML = `
                <thead>
                    <tr>
                        <th><span class="thead-title">Title <i class="bi bi-sort-alpha-down"></i></span></th>
                        <th><span class="thead-title">Last Visited <i class="bi bi-sort-alpha-down"></i></span></th>
                    </tr>
                </thead>
                <tbody></tbody>
            `;
            tabTablesContainer.appendChild(table);

            tables[ungroupedTableId] = table;
        }

        const table = tables[ungroupedTableId];
        const tbody = table.querySelector("tbody");

        const row = document.createElement("tr");
        row.classList.add("tab-row");
        row.dataset.tabId = tab.id;
        row.dataset.windowId = tab.windowId;
        row.innerHTML = `
            <td class="tab-title">${ tab.favIconUrl ? `<img src="${tab.favIconUrl}" class="tab-favicon" />` : "" } ${tab.title}</td> 
            <td class="tab-last-visited">${tab.lastVisited ? new Date(tab.lastVisited).toLocaleString() : "--"}</td>
        `;
        tbody.appendChild(row);

        resolve();
    })
}

function loadTabs() {
    // clear the tab tables container
    tabTablesContainer.innerHTML = "";

    tabs = tabManager.sort(tabManager.tabs);
    
    tabs.forEach(async function(tab) {
        if (SYSTEM_GROUP_BY_WINDOW) {
            await createWindowTables(tab.id);
        } else {
            await createUngroupedTable(tab.id);
        }
    });
}

document.addEventListener("DOMContentLoaded", async () => {
    // get system settings from chrome storage
    let result = await chrome.storage.local.get(["SYSTEM_GROUP_BY_WINDOW"]);
    if (result.hasOwnProperty("SYSTEM_GROUP_BY_WINDOW")) {
        SYSTEM_GROUP_BY_WINDOW = result["SYSTEM_GROUP_BY_WINDOW"];
    }

    tabManager = await new TabManager();

    // Initial Load of Tabs
    loadTabs();


    const tabInfo = document.getElementById("tab-info");
    const tabInfoTabId = document.getElementById("tab-id");
    const tabInfoWindowId = document.getElementById("tab-window-id");
    const tabInfoTitle = document.getElementById("tab-title");
    const tabInfoUrl = document.getElementById("tab-url");
    const tabContentBody = document.getElementById("tab-content-body");
    const contentDimmer = document.querySelector(".content-dimmer");


    /*
    * Global Click Event Listener
    */
    document.addEventListener("click", function(e) {
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
        } else if (e.target.parentElement.classList.contains("tab-row") || e.target.classList.contains("tab-row")) {
            // if row in table is clicked, focus on the tab
            let target = e.target.parentElement.classList.contains("tab-row") ? e.target.parentElement : e.target;
            const tabId = parseInt(target.dataset.tabId);
            const windowId = parseInt(target.dataset.windowId);

            chrome.windows.update(windowId, {focused: true});
            chrome.tabs.update(tabId, {active: true});
        } else if (e.target.classList.contains("table-window-title")) {
            const tableContainer = e.target.parentElement.parentElement;
            tableContainer.classList.toggle("active");
        }
    });


    /*
    * Search Input Event Listener
    */
    document.getElementById("search-input").addEventListener("input", function(e) {
        const query = e.target.value;
        const results = tabManager.search(query);
        tabManager.hideShowTabs(results);
    });


    /*
    * Group By Window Button Event Listener
    */
    const groupByWindowBtn = document.querySelector("#group-by-window-btn");

    // initial state of the button based on system setting
    if (SYSTEM_GROUP_BY_WINDOW) {
        groupByWindowBtn.classList.add("active");
    }

    groupByWindowBtn.addEventListener("click", function(e) {
        SYSTEM_GROUP_BY_WINDOW = !SYSTEM_GROUP_BY_WINDOW;

        chrome.storage.local.set({
            "SYSTEM_GROUP_BY_WINDOW": SYSTEM_GROUP_BY_WINDOW
        }, () => {
            if (chrome.runtime.lastError) {
                SYSTEM_GROUP_BY_WINDOW = !SYSTEM_GROUP_BY_WINDOW;
                console.error("Error updating SYSTEM_GROUP_BY_WINDOW: ", chrome.runtime.lastError);
                return;
            }
            tables = {};

            groupByWindowBtn.classList.toggle("active");

            loadTabs();
        });
    });

});