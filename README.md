# OneNote Export to PDF

A Chrome extension that exports every page from every section of a OneNote notebook to PDF or HTML files. Works with SharePoint-hosted OneNote (enterprise/work accounts).

## Features

- Exports all pages from all sections automatically
- Native PDF generation using Chrome's built-in print engine
- HTML export option with embedded images
- Configurable delay between page navigations
- Stop button to cancel mid-export
- Clean output with no UI artifacts (drag handles, resize handles removed)
- Files organized into `OneNote Export/` folder in Downloads

## Install

1. Download or clone this repository
2. Open Chrome and go to `chrome://extensions`
3. Enable **Developer mode** (toggle in the top right)
4. Click **Load unpacked**
5. Select the `onenote-export-extension` folder
6. The extension icon appears in your toolbar

## Usage

1. Open a OneNote notebook in your browser (SharePoint, onenote.com, or m365.cloud.microsoft)
2. Wait for the notebook to fully load (sections and pages visible)
3. Click the extension icon in the toolbar
4. Select format (PDF or HTML) and delay between pages
5. Click **Start Export**
6. Files download automatically to `~/Downloads/OneNote Export/`

### Tips

- Increase the delay if pages have large images that take time to render
- Use the **Debug** button to verify the extension can see your sections and pages
- Click **Stop** at any time to cancel the export
- PDF mode opens brief background tabs for rendering — this is normal
- If Chrome shows a "debugging" banner, that's expected during PDF generation

## Supported Sites

- `https://*.sharepoint.com/*` (enterprise OneNote)
- `https://*.onenote.com/*`
- `https://*.officeapps.live.com/*`
- `https://m365.cloud.microsoft/*`

## File Structure

```
onenote-export-extension/
├── manifest.json      # Extension configuration
├── background.js      # Service worker: PDF generation & downloads
├── content.js         # Injected into OneNote: DOM navigation & extraction
├── popup.html         # Extension popup UI
├── popup.js           # Popup logic
├── icon.png           # Toolbar icon
├── CHANGELOG.md       # Version history
└── README.md          # This file
```

## How It Works

1. **Content script** (`content.js`) runs inside the OneNote iframe, clicks through sections and pages, extracts the page content, and cleans out UI elements
2. **Background script** (`background.js`) receives the HTML content, opens a hidden tab, uses Chrome's DevTools Protocol (`Page.printToPDF`) to render it as a PDF, then triggers a download
3. **Popup** (`popup.html/js`) provides the user interface and communicates with both scripts

## Permissions

- `activeTab` — access the current tab
- `downloads` — save exported files
- `scripting` — inject content script
- `debugger` — Chrome DevTools Protocol for PDF generation
- `webNavigation` — find the correct iframe containing OneNote

## Troubleshooting

**Nothing happens when clicking Start:**
- Click Debug first to check if sections/pages are detected
- Make sure the notebook is fully loaded (not still showing a spinner)
- Try reloading the OneNote page

**PDF files are blank:**
- Increase the delay to 6000ms or higher
- Some pages with very large images may need more render time

**Extension doesn't appear on the page:**
- Check that the URL matches one of the supported sites
- Reload the extension from `chrome://extensions`
