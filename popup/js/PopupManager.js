import TabManager from "../../background/TabManager.js";

const tabManager = new TabManager();

export default class PopupManager {
    tables = {};
    windows = {};
    tabs = {};
    ungroupedTableId = "ungrouped-table";

    constructor() {
        return new Promise(async (resolve, reject) => {
            // get tabs from IndexedDB
            const tabsArr = await tabManager.getAllTabs();
            this.tabs = {};
            for (const tab of tabsArr) {
                this.tabs[tab.id] = tab;
            }

            // get windows from IndexedDB
            const windowsArr = await tabManager.getAllWindows();
            this.windows = {};
            for (const win of windowsArr) {
                this.windows[win.windowId] = win;
            }

            const closedTabsArr = await tabManager.getAllClosedTabs();
            this.closedTabs = {};
            for (const tab of closedTabsArr) {
                this.closedTabs[tab.index] = tab;
            }

            this.filtered = await tabManager.getSystemSetting("filterByLLMs");
            this.historyView = await tabManager.getSystemSetting("historyView");

            this.searchIndex = new Map();

            this.recentlyClosedTable = document.createElement("div");
            this.recentlyClosedTable.classList.add("table-container");
            this.recentlyClosedTable.classList.add("active");
            this.recentlyClosedTable.classList.add("hidden");
            this.recentlyClosedTable.dataset.windowId = "recently-closed";
            this.recentlyClosedTable.innerHTML = `
                <div class="table-container-header">
                    <input type="text" class="table-window-title" value="Recently Closed" readonly/>
                </div>
                <table class="tabs-table">
                    <thead>
                        <tr>
                            <th><span class="thead-title">Title <i class="bi bi-sort-alpha-down"></i></span></th>
                            <th><span class="thead-title thead-last-visited">Last Visited <i class="bi bi-sort-alpha-down"></i></span></th>
                        </tr>
                    </thead>
                    <tbody></tbody>
                </table>
            `;


            this.tabTablesContainer = document.querySelector("#tab-tables-container");

            this.tables = {
                /*
                * Format:
                {
                    html: <table>,
                    columns: [
                        {
                            title: "Title",
                            sortBy: "title",
                            sortDescending: true
                        },
                        {
                            title: "Last Visited",
                            sortBy: "lastVisited",
                            sortDescending: true
                        }
                }
                */
            };

            resolve(this);
        })
    }

    getTab(tabId) {
        return this.tabs[tabId];
    }

    async search(query, fields = ["title", "url", "windowId"]) {
        console.log("=========\n[INFO] search()");
        console.log("[INFO] filtered", this.filtered);
        console.log("[INFO] historyView", this.historyView);


        if (query.length == 0) {
            if (!this.historyView) {
                let openTabs = Object.values(this.tabs);
                if (this.filtered) {
                    const results = await this.filter(openTabs, []);
                    openTabs = results.openTabs;
                }

                const SYSTEM_ALWAYS_SHOW_CLOSED_TABS = await tabManager.getSystemSetting("alwaysShowClosedTabs");

                let closedTabs = [];

                if (SYSTEM_ALWAYS_SHOW_CLOSED_TABS) {
                    console.log("[SEARCH] SYSTEM_ALWAYS_SHOW_CLOSED_TABS", SYSTEM_ALWAYS_SHOW_CLOSED_TABS);
                    closedTabs = this.sort(Object.values(this.closedTabs));
                }

                return {"openTabs": openTabs, "closedTabs": closedTabs};
            } else {
                let closedTabs = Object.values(this.closedTabs);
                if (this.filtered) {
                    const results = await this.filter([], closedTabs);
                    closedTabs = results.closedTabs;
                }
                return {"openTabs": [], "closedTabs": closedTabs};
            }
        }

        // const cacheKey = `${query}-${fields.join(",")}-${this.filtered}`;

        // check cache
        // if (this.searchIndex.has(cacheKey)) {
        //     return this.searchIndex.get(cacheKey);
        // }

        // no cache, search

        const normalizedQuery = query.toLowerCase().trim();

        // if no query, return all tabs
        if (!normalizedQuery) return this.tabs;

        let openTabs = [];

        if (!this.historyView) {
            /*
            * No point in searching open tabs if we're in history view!
            */
            openTabs = Object.values(this.tabs).filter(tab => {
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
        }

        let closedTabs = Object.values(this.closedTabs).filter(tab => {
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
        // this.searchIndex.set(cacheKey, {"openTabs": openTabs, "closedTabs": closedTabs});

        if (this.filtered) {
            const results = await this.filter(openTabs, closedTabs);
            console.log("[INFO] filtered results", results);
            openTabs = results.openTabs;
            closedTabs = results.closedTabs;
        }

        return {"openTabs": openTabs, "closedTabs": closedTabs};
    }

    sort(tabs, sortBy = "lastVisited", sortDescending = true) {

        if (typeof(tabs) == "object") {
            tabs = Object.values(tabs);
        }

        if (sortBy == "lastVisited") {
            // Convert object to array
            return tabs.sort((a, b) => {
                // Handle null/undefined lastVisited
                const aTime = a.lastVisited || 0;
                const bTime = b.lastVisited || 0;

                
                return sortDescending ? bTime - aTime : aTime - bTime;
            });
        }

        return tabs;
    }

    async hideShowTabs(openTabs, closedTabs) {

        const SYSTEM_GROUP_BY_WINDOW = await tabManager.getSystemSetting("groupByWindow");

        document.querySelectorAll(".closed-tab").forEach(tab => {
            tab.remove();
        });

        // show all windows (if grouped by windows)
        if (SYSTEM_GROUP_BY_WINDOW) {
            for (const windowId of Object.keys(this.windows)) {
                console.log("windowId", windowId, this.windows);
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
        for (const showTab of openTabs) {
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
                console.log(windowElement);
                if (!windowElement.querySelector(".show")) {
                    windowElement.classList.add("hidden");
                }
            }
        }

        this.recentlyClosedTable.classList.add("hidden");

        if (closedTabs?.length > 0) {
            let tbody = this.tabTablesContainer.querySelector("tbody");
            if (SYSTEM_GROUP_BY_WINDOW) {
                this.recentlyClosedTable.classList.remove("hidden");
                tbody = this.recentlyClosedTable.querySelector("tbody");
            }

            for (const closedTab of closedTabs) {
                const row = this.createRowElement(closedTab);
                row.classList.add("closed-tab");
                row.dataset.closedTabIndex = closedTab.index;
                tbody.appendChild(row);
            }
        }
    }

    clearSearchCache() {
        this.searchIndex.clear();
    }


    async filter(openTabs, closedTabs) {
        console.log("[INFO] filtering open tabs", openTabs);
        let t = [];
        const urls = ["chatgpt.com", "perplexity.ai", "claude.ai", "gemini.google.com/app", "monica.im", "notebooklm.google", "fireflies.ai", "otter.ai", "wave.co", "copilot.microsoft.com", "inference.cerebras.ai"];

        if (!this.historyView) {
            for (const tab of openTabs) {
                if (urls.some(url => tab.url.includes(url))) {
                    t.push(tab);
                }
            }
        }

        openTabs = t;
        let y = [];
        for (const tab of closedTabs) {
            if (urls.some(url => tab.url.includes(url))) {
                y.push(tab);
            }
        }
        closedTabs = y;

        return {
            "openTabs": openTabs,
            "closedTabs": closedTabs
        }
    }


    async loadTabs(sortDescending = true, sortBy = "lastVisited") {
        // clear the tab tables container
        this.tabTablesContainer.innerHTML = "";
        this.tables = {};

        let tabsToShow = [...Object.values(this.tabs)];

        // let SYSTEM_ALWAYS_SHOW_CLOSED_TABS = await tabManager.getSystemSetting("alwaysShowClosedTabs");
        // if (SYSTEM_ALWAYS_SHOW_CLOSED_TABS) {
        //     tabsToShow = [...tabsToShow, ...Object.values(this.closedTabs)];
        // }

        let tabs = this.sort(tabsToShow, sortBy, sortDescending);

        const SYSTEM_GROUP_BY_WINDOW = await tabManager.getSystemSetting("groupByWindow");
        const SYSTEM_ALWAYS_SHOW_CLOSED_TABS = await tabManager.getSystemSetting("alwaysShowClosedTabs");

        tabs.forEach(async (tab) => {
            if (SYSTEM_GROUP_BY_WINDOW) {
                await this.createGroupedRow(tab.id);
            } else {
                await this.createUngroupedRow(tab.id);
            }
        });

        if (SYSTEM_GROUP_BY_WINDOW) {
            this.tabTablesContainer.appendChild(this.recentlyClosedTable);
        }

        if (SYSTEM_ALWAYS_SHOW_CLOSED_TABS) {
            console.log("SYSTEM_ALWAYS_SHOW_CLOSED_TABS", SYSTEM_ALWAYS_SHOW_CLOSED_TABS);

            this.recentlyClosedTable.classList.remove("hidden");
            const closedTabs = this.sort(this.closedTabs);

            if (closedTabs?.length > 0) {
                let tbody = this.tabTablesContainer.querySelector("tbody");
                if (SYSTEM_GROUP_BY_WINDOW) {
                    this.recentlyClosedTable.classList.remove("hidden");
                    tbody = this.recentlyClosedTable.querySelector("tbody");
                }

                for (const closedTab of closedTabs) {
                    const row = this.createRowElement(closedTab);
                    row.classList.add("closed-tab");
                    row.dataset.closedTabIndex = closedTab.index;
                    tbody.appendChild(row);
                }
            }
        }
    }


    createRowElement(tab) {
        const row = document.createElement("tr");
        row.classList.add("tab-row");
        row.dataset.tabId = tab.id;
        row.dataset.windowId = tab.windowId;
        row.dataset.tabIndex = tab.index;

        const duplicate = tab.duplicateIndex && tab.duplicateIndex > -1 ? `<span class="tab-duplicate">${tab.duplicateIndex}</span>` : "";

        // @TODO: make this cleaner... too tired maybe tomorrow
        if (this.detailedRows) {
            row.innerHTML = `
                <td class="tab-title"><span>${ duplicate }<span>${ tab.favIconUrl ? `<img src="${tab.favIconUrl}" class="tab-favicon" />` : "" } ${tab.title}</span></span><span class="tab-url">${tab.url}</span></td> 
                <td class="tab-last-visited">${tab.lastVisited ? new Date(tab.lastVisited).toLocaleString("en-US", { 
                    month: "2-digit",
                    day: "2-digit",
                    hour: "numeric",
                    minute: "2-digit",
                    second: "2-digit",
                    hour12: true
                }) : "--"}</td>
            `;
        } else {
            row.innerHTML = `
                <td class="tab-title"><span>${ duplicate }<span>${ tab.favIconUrl ? `<img src="${tab.favIconUrl}" class="tab-favicon" />` : "" } ${tab.title}</span></span></td> 
                <td class="tab-last-visited">${tab.lastVisited ? new Date(tab.lastVisited).toLocaleString("en-US", { 
                    month: "2-digit",
                    day: "2-digit",
                    hour: "numeric",
                    minute: "2-digit",
                    second: "2-digit",
                    hour12: true
                }) : "--"}</td>
            `;

        }
        return row;
    }


    createGroupedRow(tabId) {
        return new Promise(async (resolve, reject) => {
            // returns existing tab if it exists, otherwise creates a new tab
            let tab = this.getTab(tabId);

            if (!tab) {
                resolve();
            }

            const windowId = tab.windowId;

            const tableExists = this.tables[windowId];

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
                                <th><span class="thead-title thead-last-visited">Last Visited <i class="bi bi-sort-alpha-down"></i></span></th>
                            </tr>
                        </thead>
                        <tbody></tbody>
                    </table>
                `;
                this.tabTablesContainer.appendChild(tableContainer);

                this.tables[windowId] = tableContainer;
                this.tabTablesContainer.appendChild(tableContainer);
            }
            
            const table = this.tables[windowId];
            const tbody = table.querySelector("tbody");

            tbody.appendChild(this.createRowElement(tab));

            resolve();
        })
    }
    createUngroupedRow(tabId) {
        return new Promise(async (resolve, reject) => {
            // returns existing tab if it exists, otherwise creates a new tab
            let tab = this.getTab(tabId);


            const tableExists = this.tables[this.ungroupedTableId];

            if (!tableExists) {
                console.log("createUngroupedTable() creating new table");
                const table = document.createElement("table");
                table.classList.add("ungrouped-table");
                table.classList.add("tabs-table");
                table.innerHTML = `
                    <thead>
                        <tr>
                            <th><span class="thead-title">Title <i class="bi bi-sort-alpha-down"></i></span></th>
                            <th><span class="thead-title thead-last-visited">Last Visited <i class="bi bi-sort-alpha-down"></i></span></th>
                        </tr>
                    </thead>
                    <tbody></tbody>
                `;
                this.tabTablesContainer.appendChild(table);

                this.tables[this.ungroupedTableId] = table;
            } else {
                console.log("createUngroupedTable() table already exists");
            }


            const table = this.tables[this.ungroupedTableId];
            const tbody = table.querySelector("tbody");

            tbody.appendChild(this.createRowElement(tab));

            resolve();
        })
    }
}