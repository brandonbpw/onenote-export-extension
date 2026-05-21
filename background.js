// Background service worker — handles file downloads

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'downloadFile') {
    const blob = new Blob([msg.content], { type: msg.mimeType || 'text/html' });
    const reader = new FileReader();
    reader.onload = () => {
      chrome.downloads.download({
        url: reader.result,
        filename: msg.filename,
        saveAs: false
      }, (downloadId) => {
        if (chrome.runtime.lastError) {
          sendResponse({ success: false, error: chrome.runtime.lastError.message });
        } else {
          sendResponse({ success: true, downloadId: downloadId });
        }
      });
    };
    reader.readAsDataURL(blob);
    return true; // async
  }

  // Forward messages from content script to popup
  if (msg.type === 'log' || msg.type === 'progress' || msg.type === 'done') {
    chrome.runtime.sendMessage(msg).catch(() => {});
  }
});
