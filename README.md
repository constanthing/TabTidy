## Permissions
- tabs
- scripting
- windows
- storage

## Info
- popup.html runs every time the extension is clicked (its the popup window displayed in browser)
    - popup.js, as a result, called every time the extension is clicked or activated too 
- popup.js:
    - get tabs
    - creates tables for tabs (grouped by windows)
    - applies search functionality for tabs
- background.js runs in (as the name suggests) the background; in this case, only runs once when the extension is "installed" 
    - adds the content.js script to every tab open at the time
- content.js listens for any "messages" 
    - if message received, gets the source page of tab and sends it back in a "response"

## Settings Page
- Modify style
    - theme (dark/bright)
    - font size (for: general and table)
- Table
    - show / hide columns
        - title (always on)
        - last visited
        - time spent
    - group by (window)
- Storage
    - option to clear data stored for this application