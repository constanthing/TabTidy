## Info
- popup.html runs every time the extension is clicked (its the popup window displayed in browser)
    - popup.js, as a result, called every time the extension is clicked or activated too 
- popup.js:
    - get tabs
    - creates tables for tabs (grouped by windows)
    - applies search functionality for tabs
- background.js runs in (as the name suggests) the background; in this case, only runs once when the extension is "installed" 
    - adds the content.js script to every tab
- content.js listens for any "messages" 
    - if message received, gets the source page of tab and sends it back in a "response"

## Todo
- window title mouse clicks:
    - left click = toggle view of tabs table
        - cache whether it was toggled on/off
    - right click = edit window title
- tab table row mouse clicks:
    - left click = open tab
    - right click = detailed view of tab
- settings page:
    - security checks toggle
- statistics page:
    - show time spent in tabs
    - list of tabs with most time spent (descending default)
- table headings sort functions:
    - descending
    - ascending
    - unsort
MORE ?