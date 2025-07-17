/*
On message received, get the source page of the tab and send it back in a response.
*/

chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
    if (request.action == "get-source-page") {
        const sourcePage = document.documentElement.innerHTML;
        sendResponse({sourcePage});
        return true;
    }
})