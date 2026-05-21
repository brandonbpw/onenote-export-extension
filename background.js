// Background service worker — handles file downloads and PDF conversion

let shouldStop = false;
let exportRunning = false;

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'setStop') {
    shouldStop = true;
    exportRunning = false;
    sendResponse({ ok: true });
    return false;
  }

  if (msg.action === 'clearStop') {
    shouldStop = false;
    sendResponse({ ok: true });
    return false;
  }

  if (msg.action === 'checkStop') {
    sendResponse({ shouldStop: shouldStop });
    return false;
  }

  if (msg.action === 'claimExport') {
    // Only one frame can claim the export
    if (!exportRunning) {
      exportRunning = true;
      sendResponse({ granted: true });
    } else {
      sendResponse({ granted: false });
    }
    return false;
  }

  if (msg.action === 'releaseExport') {
    exportRunning = false;
    sendResponse({ ok: true });
    return false;
  }

  if (msg.action === 'downloadFile') {
    if (msg.format === 'pdf') {
      convertToPDF(msg.content, msg.filename.replace('.html', '.pdf'))
        .then(() => sendResponse({ success: true }))
        .catch(err => {
          console.error('PDF conversion failed:', err.message);
          // Fallback: save as HTML
          downloadAsHTML(msg.content, msg.filename)
            .then(() => sendResponse({ success: true, fallback: 'html' }))
            .catch(() => sendResponse({ success: false, error: err.message }));
        });
    } else {
      downloadAsHTML(msg.content, msg.filename)
        .then(() => sendResponse({ success: true }))
        .catch(err => sendResponse({ success: false, error: err.message }));
    }
    return true; // async response
  }

  // Forward messages from content script to popup
  if (msg.type === 'log' || msg.type === 'progress' || msg.type === 'done') {
    chrome.runtime.sendMessage(msg).catch(() => {});
  }
});

function downloadAsHTML(content, filename) {
  // Convert HTML string to base64 data URL for download
  const base64 = btoa(unescape(encodeURIComponent(content)));
  const dataUrl = 'data:text/html;base64,' + base64;
  return new Promise((resolve, reject) => {
    chrome.downloads.download({
      url: dataUrl,
      filename: filename,
      saveAs: false
    }, (downloadId) => {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
      else resolve(downloadId);
    });
  });
}

async function convertToPDF(htmlContent, filename) {
  // Encode HTML as a data URL (service workers can't use blob URLs)
  const base64Html = btoa(unescape(encodeURIComponent(htmlContent)));
  const dataUrl = 'data:text/html;base64,' + base64Html;

  // Open a hidden tab with the HTML content
  const tab = await chrome.tabs.create({ url: dataUrl, active: false });

  // Wait for tab to finish loading
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Tab load timeout'));
    }, 15000);

    function listener(tabId, info) {
      if (tabId === tab.id && info.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(listener);
        clearTimeout(timeout);
        resolve();
      }
    }
    chrome.tabs.onUpdated.addListener(listener);
  });

  // Wait for rendering
  await new Promise(r => setTimeout(r, 1000));

  // Attach debugger and print to PDF
  try {
    await chrome.debugger.attach({ tabId: tab.id }, '1.3');
  } catch (e) {
    await chrome.tabs.remove(tab.id);
    throw new Error('Debugger attach failed: ' + e.message);
  }

  let result;
  try {
    result = await chrome.debugger.sendCommand({ tabId: tab.id }, 'Page.printToPDF', {
      printBackground: true,
      preferCSSPageSize: false,
      paperWidth: 8.5,
      paperHeight: 11,
      marginTop: 0.4,
      marginBottom: 0.4,
      marginLeft: 0.4,
      marginRight: 0.4
    });
  } catch (e) {
    await chrome.debugger.detach({ tabId: tab.id });
    await chrome.tabs.remove(tab.id);
    throw new Error('PrintToPDF failed: ' + e.message);
  }

  await chrome.debugger.detach({ tabId: tab.id });

  // Download the PDF from base64
  const pdfUrl = 'data:application/pdf;base64,' + result.data;
  await new Promise((resolve, reject) => {
    chrome.downloads.download({
      url: pdfUrl,
      filename: filename,
      saveAs: false
    }, (downloadId) => {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
      else resolve(downloadId);
    });
  });

  // Close the temp tab
  await chrome.tabs.remove(tab.id);
}
