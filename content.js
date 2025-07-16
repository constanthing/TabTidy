chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
    if (request.action == "get-source-page") {
        const sourcePage = document.documentElement.innerHTML;
        sendResponse({sourcePage});
        return true;
    }
})

console.log("content.js loaded");