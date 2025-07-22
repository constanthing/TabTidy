import { getAllClosedTabs, getAllWindows, getAllTabs, getSystemSetting } from "../background/database.js";

export { TabManager };

class TabManager {
    tables = {};
    windows = {};
    tabs = {};
    ungroupedTableId = "ungrouped-table";


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
        if (query.length == 0) return {"openTabs": Object.values(this.tabs), "closedTabs": []};

        const cacheKey = `${query}-${fields.join(",")}`;

        // check cache
        if (this.searchIndex.has(cacheKey)) {
            return this.searchIndex.get(cacheKey);
        }

        // no cache, search

        const normalizedQuery = query.toLowerCase().trim();

        // if no query, return all tabs
        if (!normalizedQuery) return this.tabs;

        const openTabs = Object.values(this.tabs).filter(tab => {
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

        let closedTabs = await getAllClosedTabs();
        closedTabs = closedTabs.filter(tab => {
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
        this.searchIndex.set(cacheKey, {"openTabs": openTabs, "closedTabs": closedTabs});
        return {"openTabs": openTabs, "closedTabs": closedTabs};
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

    async hideShowTabs(openTabs, closedTabs) {

        const SYSTEM_GROUP_BY_WINDOW = await getSystemSetting("groupByWindow");

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
                const row = this.createTabRow(closedTab);
                row.classList.add("closed-tab");
                tbody.appendChild(row);
            }
        }
    }

    clearSearchCache() {
        this.searchIndex.clear();
    }


    async loadTabs(sortDescending = true, sortBy = "lastVisited") {
        // clear the tab tables container
        this.tabTablesContainer.innerHTML = "";
        this.tables = {};

        let tabs = this.sort(this.tabs, sortBy, sortDescending);

        const SYSTEM_GROUP_BY_WINDOW = await getSystemSetting("groupByWindow");

        tabs.forEach(async (tab) => {
            if (SYSTEM_GROUP_BY_WINDOW) {
                await this.createWindowTables(tab.id);
            } else {
                await this.createUngroupedTable(tab.id);
            }
        });


        if (SYSTEM_GROUP_BY_WINDOW) {
            this.tabTablesContainer.appendChild(this.recentlyClosedTable);
        }
    }


    createTabRow(tab) {
        const row = document.createElement("tr");
        row.classList.add("tab-row");
        row.dataset.tabId = tab.id;
        row.dataset.windowId = tab.windowId;
        row.dataset.tabIndex = tab.index;

        const duplicate = tab.duplicateIndex && tab.duplicateIndex > -1 ? `<span class="tab-duplicate">${tab.duplicateIndex}</span>` : "";

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
        return row;
    }


    createWindowTables(tabId) {
        return new Promise(async (resolve, reject) => {
            // returns existing tab if it exists, otherwise creates a new tab
            let tab = this.getTab(tabId);

            console.log("createWindowTables() tab", tab);

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

            tbody.appendChild(this.createTabRow(tab));

            resolve();
        })
    }
    createUngroupedTable(tabId) {
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

            tbody.appendChild(this.createTabRow(tab));

            resolve();
        })
    }
}