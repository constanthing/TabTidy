
console.log("popup js")


class TabManager {
    constructor() {
        this.tabs = [];
        this.searchIndex = new Map();
    }

    addTab(tabInfo) {
        const tab = {
            id: String(tabInfo.id),
            windowId: String(tabInfo.windowId),
            url: tabInfo.url,
            title: tabInfo.title,
            lastVisited: tabInfo.lastVisited 
        };

        this.tabs.push(tab);
        this.clearSearchCache();
        return tab;
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
        for (const tab of this.tabs) {
            const tabElement = document.querySelector(`[data-tab-id="${tab.id}"]`);
            tabElement.classList.remove("show");
            tabElement.classList.add("hidden");
        }

        for (const showTab of results) {
            for (const tab of this.tabs) {
                const tabElement = document.querySelector(`[data-tab-id="${tab.id}"]`);
                if (tab.id === showTab.id) {
                    tabElement.classList.remove("hidden");
                    tabElement.classList.add("show");
                } else {
                    console.log(tabElement.innerText, tabElement.classList);
                    if (!tabElement.classList.contains("show")) {
                        tabElement.classList.add("hidden");
                    }
                }
            }
        }
    }

    clearSearchCache() {
        this.searchIndex.clear();
    }
}


const tabManager = new TabManager();

const tabTablesContainer = document.querySelector("#tab-tables-container");

const tables = {

};

chrome.tabs.query({}, function(tabs) {
    tabs.forEach(function(tab) {
        const windowId = tab.windowId;

        const tableExists = tables[windowId];

        if (!tableExists) {
            const tableContainer = document.createElement("div");
            tableContainer.classList.add("table-container");
            tableContainer.classList.add("active");

            tableContainer.innerHTML = `
                <div class="table-container-header">
                    <input type="text" class="table-window-title" value="Window ${windowId}" readonly/>
                    <button class="table-window-settings-button"><i class="bi bi-sliders2"></i></button>
                </div>
                <table>
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
            <td class="tab-last-visited">${new Date().toLocaleString()}</td>
        `;
        tbody.appendChild(row);

        tabManager.addTab({
            id: tab.id,
            windowId: tab.windowId,
            url: tab.url,
            title: tab.title,
            lastVisited: new Date().toLocaleString()
        });
    });
});

const tabInfo = document.getElementById("tab-info");
const tabInfoTabId = document.getElementById("tab-id");
const tabInfoWindowId = document.getElementById("tab-window-id");
const tabInfoTitle = document.getElementById("tab-title");
const tabInfoUrl = document.getElementById("tab-url");
const tabContentBody = document.getElementById("tab-content-body");
const contentDimmer = document.querySelector(".content-dimmer");

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
        return;

        // bring window to forefront
        chrome.windows.update(windowId, {focused: true});
        // select tab
        chrome.tabs.update(tabId, {active: true});
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

// document.getElementById("tab-content-source-button").addEventListener("click", function(e) {
//     const tabId = parseInt(tabInfo.dataset.tabId);
//     const windowId = parseInt(tabInfo.dataset.windowId);

//     chrome.tabs.sendMessage(tabId, {action: "get-source-page"}, function(response) {
//         if (chrome.runtime.lastError) {
//             console.error(chrome.runtime.lastError);
//             return;
//         }
//         if (response && response.sourcePage) {
//             tabContentBody.innerText = response.sourcePage;
//             // console.log(response.sourcePage);
//         }
//     });
// });


document.getElementById("search-input").addEventListener("input", function(e) {
    const query = e.target.value;
    const results = tabManager.search(query);
    console.log(results);
    tabManager.hideShowTabs(results);
});