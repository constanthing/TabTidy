import { Database } from "./Database.js";

export default class TabManager {
    static NOT_FOUND = -1;

    constructor() { return this; }

    async addTab(tab, data = {}) {
        for (const key of Object.keys(data)) {
            tab[key] = data[key];
        }
        await Database.saveTab(tab);
    }

    async updateTab(tabId, data) {
        await Database.updateTab(tabId, data);
    }

    async getTab(tabId) {
        return await Database.getTab(tabId);
    }

    async getLastTab() {
        return await Database.getLastTab();
    }

    async removeTab(tabId) {
        const removedTab = await Database.removeTab(tabId);
        // no need on adding chrome:// tabs to closed tabs
        if (removedTab.url.includes("chrome://")) {
            return;
        }
        await Database.addTabToClosedTabs(removedTab);
    }

    async getAllTabs() {
        return await Database.getAllTabs();
    }

    async getTabsLength() {
        const tabs = await Database.getAllTabs();
        return tabs.length;
    }

    async getTabsByWindowId(windowId) {
        return await Database.getTabsByWindowId(windowId);
    }


    /*
    *
    * BADGE 
    * 
    */
    async setBadgeLength() {
        const tabsLength = await this.getTabsLength();
        await chrome.action.setBadgeText({
            text: tabsLength.toString()
        });
    }


    /*
    *
    * WINDOWS
    * 
    */
    async addWindow(window) {
        const windowObj = { windowId: window.id, title: null, sessionId: window.sessionId };
        await Database.saveWindow(windowObj);
    }

    async updateWindow(windowId, newData) {
        await Database.updateWindow(windowId, newData);
    }

    async getWindow(windowId) {
        const window = await Database.getWindow(windowId);
        return window;
    }

    async getAllWindows() {
        return await Database.getAllWindows();
    }

    async removeWindow(windowId) {
        await Database.removeWindow(windowId);
    }

    async getWindowsLength() {
        const windows = await Database.getAllWindows();
        return windows.length;
    }

    async getWindowsByLength(length) {
        return await Database.getWindowsByLength(length);
    }


    /*
    *
    * CLOSED TABS
    *
    */
   async addTabToClosedTabs(tab, reason = "manual") {
        console.info("addTabToClosedTabs()", tab, reason);
        return await Database.addTabToClosedTabs(tab, reason);
   }

    async getAllClosedTabs() {
        console.info("getAllClosedTabs()");
        return await Database.getAllClosedTabs();
    }

    async getClosedTab(tab) {
        console.info("getClosedTab()", tab);
        return await Database.getClosedTab(tab);
    }

    async removeFromClosedTabs(tabId, url, title) {
        console.info("removeFromClosedTabs()", tabId, url, title);
        return await Database.removeFromClosedTabs(tabId, url, title);
    }


    /*
    *
    * LAST SESSION
    *
    */
    async addLastSession(data) {
        return await Database.addLastSession(data);
    }
    async getAllLastSessions() {
        return await Database.getAllLastSessions();
    }
    async getLastSessionsByTabsLength(tabsLength) {
        return await Database.getLastSessionsByTabsLength(tabsLength);
    }
    async removeLastSession(index) {
        console.log("[LAST SESSION] removeLastSession()", index)
        return await Database.removeLastSession(index);
    }


    /*
    *
    * OLD SESSIONS
    * 
    */
   async addOldSession(data) {
    return await Database.addOldSession(data);
   }
   async getAllOldSessions() {
    return await Database.getAllOldSessions();
   }


    /*
    *
    * SYSTEM
    * 
    */ 
   async clearStorage() {
        await Database.clearStorage();
   }
   async getSystemSetting(key) {
    return await Database.getSystemSetting(key);
   }
   async updateSystemFilterByLLMs(value = null) {
    return await Database.updateSystemFilterByLLMs(value);
   }
   async updateSystemGroupByWindow(value = null) {
    return await Database.updateSystemGroupByWindow(value);
   }
   async updateSystemHistoryView(value = null) {
    return await Database.updateSystemHistoryView(value);
   }

}