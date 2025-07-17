// default false (tabs are not grouped by windows)
let SYSTEM_GROUP_BY_WINDOW = false; 

class TabManager {
    constructor() {
        return new Promise(async (resolve, reject) => {
            // get tabs from chrome storage
            const result = await chrome.storage.local.get("tabs");
            if (result.hasOwnProperty("tabs")) {
                console.log("Using tabs from chrome storage");
                this.tabs = result["tabs"];
            } else {
                console.log("Creating empty tabs array in chrome storage");
                this.tabs = [];

                await this.saveTabs();
            }

            this.searchIndex = new Map();
            this.windows = [];
            resolve(this);
        })
    }

    addTab(tabInfo) {
        // checking if tab already exists
        let exists = false;
        for (const storedTab of this.tabs) {
            if (tabInfo.id == storedTab.id) {
                tabInfo = storedTab; 
                exists = true;
                break;
            }
        }

        const tab = {
            id: String(tabInfo.id),
            windowId: String(tabInfo.windowId),
            url: tabInfo.url,
            title: tabInfo.title,
            // user has yet to visit the tab, so lastVisited is null
            lastVisited: tabInfo.lastVisited ? tabInfo.lastVisited : null
        };

        if (!this.windows.includes(tabInfo.windowId)) {
            this.windows.push(tabInfo.windowId);
        }

        if (!exists) {
            // doesn't exist, add it to the array
            this.tabs.push(tab);
        }

        this.clearSearchCache();
        return tab;
    }

    saveTabs() {
        return new Promise(async (resolve, reject) => {
            await chrome.storage.local.set({
                "tabs": this.tabs
            });
            resolve();
        })
    }

    search(query, fields = ["title", "url", "windowId"]) {
        const cacheKey = `${query}-${fields.join(",")}`;

        // check cache
        if (this.searchIndex.has(cacheKey)) {
            return this.searchIndex.get(cacheKey);
        }

        // no cache, search

        const normalizedQuery = query.toLowerCase().trim();

        // if no query, return all tabs
        if (!normalizedQuery) return this.tabs;

        const results = this.tabs.filter(tab => {
            return fields.some(field => {
                const value = tab[field].toLowerCase();
                return value.includes(normalizedQuery);
            });
        });

        // cache results
        this.searchIndex.set(cacheKey, results);
        return results;
    }

    hideShowTabs(results) {
        // show all windows (if grouped by windows)
        if (SYSTEM_GROUP_BY_WINDOW) {
            for (const window of this.windows) {
                const windowElement = document.querySelector(`[data-window-id="${window}"]`);
                windowElement.classList.remove("hidden");
            }
        }

        // hide all tabs (so search just show the tabs that match)
        for (const tab of this.tabs) {
            try {
                const tabElement = document.querySelector(`[data-tab-id="${tab.id}"]`);
                console.log("tabElement", tabElement, tab.id);
                tabElement.classList.remove("show");
                tabElement.classList.add("hidden");
            } catch (e) {
                console.log("Row not found", tab.id);
            }
        }

        // show the tabs that match the search
        for (const showTab of results) {
            for (const tab of this.tabs) {
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
            console.log("this ran");
            for (const window of this.windows) {
                const windowElement = document.querySelector(`[data-window-id="${window}"]`);
                if (!windowElement.querySelector(".show")) {
                    windowElement.classList.add("hidden");
                }
            }
        }
    }

    clearSearchCache() {
        this.searchIndex.clear();
    }

    updateTab(tabId, data) {
        console.log(data, tabId);
        const tab = this.tabs.find(tab => tab.id == tabId);
        if (!tab) return;
        for (const key in data) {
            tab[key] = data[key];
        }
    }
}

let tabManager = null;

const tabTablesContainer = document.querySelector("#tab-tables-container");

let tables = {

};

const ungroupedTableId = "ungrouped-table";

function createWindowTables(tab) {
    return new Promise(async (resolve, reject) => {
        // returns existing tab if it exists, otherwise creates a new tab
        tab = await tabManager.addTab(tab);

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
            <td class="tab-title">${tab.title}</td>
            <td class="tab-last-visited">${tab.lastVisited ? new Date(tab.lastVisited).toLocaleString() : "--"}</td>
        `;
        tbody.appendChild(row);

        resolve();
    })
}
function createUngroupedTable(tab) {
    return new Promise(async (resolve, reject) => {
        // returns existing tab if it exists, otherwise creates a new tab
        tab = await tabManager.addTab(tab);

        const tableExists = tables[ungroupedTableId];

        if (!tableExists) {
            console.log("this ran");
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
            console.log(tables[ungroupedTableId]);
        }

        const table = tables[ungroupedTableId];
        const tbody = table.querySelector("tbody");

        const row = document.createElement("tr");
        row.classList.add("tab-row");
        row.dataset.tabId = tab.id;
        row.dataset.windowId = tab.windowId;
        row.innerHTML = `
            <td class="tab-title">${tab.title}</td> 
            <td class="tab-last-visited">${tab.lastVisited ? new Date(tab.lastVisited).toLocaleString() : "--"}</td>
        `;
        tbody.appendChild(row);

        resolve();
    })
}

function loadTabs() {
    chrome.tabs.query({}, async function(tabs) {
        // clear the tab tables container
        tabTablesContainer.innerHTML = "";
        
        tabs.forEach(async function(tab) {
            if (SYSTEM_GROUP_BY_WINDOW) {
                await createWindowTables(tab);
            } else {
                await createUngroupedTable(tab);
            }
        });

        await tabManager.saveTabs();
    });
}

document.addEventListener("DOMContentLoaded", async () => {
    // get system settings from chrome storage
    let result = await chrome.storage.local.get(["SYSTEM_GROUP_BY_WINDOW"]);
    if (result.hasOwnProperty("SYSTEM_GROUP_BY_WINDOW")) {
        SYSTEM_GROUP_BY_WINDOW = result["SYSTEM_GROUP_BY_WINDOW"];
    }

    tabManager = await new TabManager();

    console.log("before", tabManager);
    // Initial Load of Tabs
    loadTabs();

    console.log("after ", tabManager);

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
        console.log(e.target);
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