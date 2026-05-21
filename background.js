// Background service worker — handles file downloads and PDF conversion

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'downloadFile') {
    if (msg.format === 'pdf') {
      // Convert HTML to PDF via hidden tab + debugger
      convertToPDF(msg.content, msg.filename.replace('.html', '.pdf'))
        .then(() => sendResponse({ success: true }))
        .catch(err => {
          console.error('PDF error:', err);
          // Fallback: save as HTML
          downloadAsFile(msg.content, 'text/html', msg.filename)
            .then(() => sendResponse({ success: true, fallback: 'html' }))
            .catch(() => sendResponse({ success: false, error: err.message }));
        });
    } else {
      downloadAsFile(msg.content, msg.mimeType || 'text/html', msg.filename)
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

function downloadAsFile(content, mimeType, filename) {
  return new Promise((resolve, reject) => {
    const blob = new Blob([content], { type: mimeType });
    const reader = new FileReader();
    reader.onload = () => {
      chrome.downloads.download({
        url: reader.result,
        filename: filename,
        saveAs: false
      }, (downloadId) => {
        if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
        else resolve(downloadId);
      });
    };
    reader.onerror = () => reject(new Error('FileReader error'));
    reader.readAsDataURL(blob);
  });
}

async function convertToPDF(htmlContent, filename) {
  // Create a blob URL for the HTML
  const blob = new Blob([htmlContent], { type: 'text/html' });
  const url = URL.createObjectURL(blob);

  // Open hidden tab with the HTML
  const tab = await chrome.tabs.create({ url: url, active: false });

  // Wait for tab to finish loading
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Tab load timeout')), 15000);
    chrome.tabs.onUpdated.addListener(function listener(tabId, info) {
      if (tabId === tab.id && info.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(listener);
        clearTimeout(timeout);
        resolve();
      }
    });
  });

  // Give it a moment to render
  await new Promise(r => setTimeout(r, 800));

  // Use debugger to print to PDF
  await chrome.debugger.attach({ tabId: tab.id }, '1.3');
  const result = await chrome.debugger.sendCommand({ tabId: tab.id }, 'Page.printToPDF', {
    printBackground: true,
    preferCSSPageSize: false,
    paperWidth: 8.5,
    paperHeight: 11,
    marginTop: 0.4,
    marginBottom: 0.4,
    marginLeft: 0.4,
    marginRight: 0.4
  });
  await chrome.debugger.detach({ tabId: tab.id });

  // Download the PDF
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

  // Cleanup
  await chrome.tabs.remove(tab.id);
  URL.revokeObjectURL(url);
}
