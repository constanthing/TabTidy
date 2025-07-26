import TabManager from "../../background/TabManager.js";
import PopupManager from "./PopupManager.js";

document.addEventListener("DOMContentLoaded", async e=>{
    const tabManager = await new TabManager();

    const mainContent = document.querySelector("#main-container");
    const startupScreen = document.querySelector("#startup-screen");

    const SYSTEM_STARTUP_COMPLETE = await tabManager.getSystemSetting("startupComplete");

    console.log("SYSTEM_STARTUP_COMPLETE", SYSTEM_STARTUP_COMPLETE);
    
    if (SYSTEM_STARTUP_COMPLETE) {
        mainContent.classList.remove("hidden");
        startupScreen.classList.add("hidden");

        document.dispatchEvent(new Event("startupComplete"));
        return;
    }

    console.log("startup.js loaded");

    const startupNavigationItems = document.querySelectorAll("input[name='startup-navigation']");

    let activeOutput = document.querySelector(".startup-navigation-output.active");
    let activeNavigationItem = document.querySelector("input[name='startup-navigation']:checked");
    let activeSmall = activeNavigationItem.closest(".navigation-list-item").querySelector("small");

    const startupIndex = document.querySelector("#startup-index");


    startupNavigationItems.forEach(item=>{
        item.addEventListener("click", e=>{
            const output = document.querySelector(`#${item.dataset.output}`);
            console.log(output);
            if (output) {
                activeOutput.classList.remove("active");
                output.classList.add("active");
                activeOutput = output;
            }
            activeNavigationItem = item;
            activeSmall = activeNavigationItem.closest(".navigation-list-item").querySelector("small");
            startupIndex.textContent = item.dataset.index;
        });
    })

    const startupCompleteBtn = document.querySelector("#startup-complete-btn");
    startupCompleteBtn.addEventListener("click", async e=>{
        e.target.disabled = true;


        // save settings
        await tabManager.updateSystemSetting("detailedRows", document.querySelector("#table-layout-detailed").checked);
        await tabManager.updateSystemSetting("groupByWindow", document.querySelector("#tab-grouping-by-window").checked);
        await tabManager.updateSystemSetting("alwaysShowClosedTabs", document.querySelector("#closed-tabs-always-show").checked);

        // close startup screen and show main content
        mainContent.classList.remove("hidden");
        startupScreen.classList.add("hidden");

        // save startup complete
        await tabManager.updateSystemSetting("startupComplete", true);

        document.dispatchEvent(new Event("startupComplete"));
    });


    const startupNavigationOutputItems = document.querySelectorAll(".startup-navigation-output-item");
    startupNavigationOutputItems.forEach(item => {
        item.addEventListener("click", e=>{
            activeSmall.textContent = item.querySelector("h4").textContent;
        });
    });
});