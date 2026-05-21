const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const debugBtn = document.getElementById('debugBtn');
const statusDiv = document.getElementById('status');
const progressBar = document.getElementById('progressBar');

// Show version from manifest
document.getElementById('version').textContent = 'v' + chrome.runtime.getManifest().version;

function log(msg, type) {
  const entry = document.createElement('div');
  entry.className = 'log-entry ' + (type || 'info');
  entry.textContent = msg;
  statusDiv.insertBefore(entry, statusDiv.firstChild);
}

// Listen for messages from content script
chrome.runtime.onMessage.addListener((msg) => {
  if (msg && msg.type === 'log') log(msg.text, msg.level);
  if (msg && msg.type === 'progress') progressBar.style.width = msg.pct + '%';
  if (msg && msg.type === 'done') {
    startBtn.disabled = false;
  }
});

async function sendToAllFrames(tabId, message) {
  // Try sending to all frames in the tab
  const frames = await chrome.webNavigation.getAllFrames({ tabId: tabId });
  if (!frames) {
    log('No frames found in tab', 'error');
    return;
  }
  log('Found ' + frames.length + ' frame(s) in tab', 'info');
  for (const frame of frames) {
    try {
      chrome.tabs.sendMessage(tabId, message, { frameId: frame.frameId });
    } catch(e) {}
  }
}

// START EXPORT
startBtn.addEventListener('click', async () => {
  const format = document.getElementById('format').value;
  const delay = parseInt(document.getElementById('delay').value) || 4000;

  startBtn.disabled = true;
  statusDiv.textContent = '';
  progressBar.style.width = '0%';

  // Clear stop flag
  chrome.runtime.sendMessage({ action: 'clearStop' });

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const frames = await chrome.webNavigation.getAllFrames({ tabId: tab.id });

  if (!frames) {
    log('No frames found', 'error');
    startBtn.disabled = false;
    return;
  }

  log('Sending to ' + frames.length + ' frames...', 'info');

  let sent = false;
  for (const frame of frames) {
    try {
      chrome.tabs.sendMessage(tab.id, {
        action: 'startExport',
        format: format,
        delay: delay
      }, { frameId: frame.frameId }, (resp) => {
        if (resp && resp.ok && !sent) {
          sent = true;
          log('Export started in frame ' + frame.frameId, 'success');
        }
      });
    } catch(e) {}
  }

  // If nothing responded after 2s, report
  setTimeout(() => {
    if (!sent) log('No frame responded. Try reloading the OneNote page.', 'error');
  }, 2000);
});

// STOP EXPORT
stopBtn.addEventListener('click', async () => {
  chrome.runtime.sendMessage({ action: 'setStop' });
  startBtn.disabled = false;
  log('Stop signal sent.', 'warn');
});

// DEBUG - scan all frames for OneNote content
debugBtn.addEventListener('click', async () => {
  statusDiv.textContent = '';
  log('--- Debug Scan ---', 'info');

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const frames = await chrome.webNavigation.getAllFrames({ tabId: tab.id });

  if (!frames) {
    log('No frames accessible', 'error');
    return;
  }

  log('Tab URL: ' + tab.url, 'info');
  log('Total frames: ' + frames.length, 'info');

  for (const frame of frames) {
    log('Frame ' + frame.frameId + ': ' + (frame.url || '').substring(0, 80), 'info');
    try {
      chrome.tabs.sendMessage(tab.id, { action: 'ping' }, { frameId: frame.frameId }, (resp) => {
        if (chrome.runtime.lastError) {
          log('  → No content script in frame ' + frame.frameId, 'warn');
        } else if (resp) {
          log('  → Sections: ' + resp.hasSections + ', Pages: ' + resp.hasPages, resp.hasSections ? 'success' : 'warn');
        }
      });
    } catch(e) {
      log('  → Error: ' + e.message, 'error');
    }
  }

  log('--- End Debug ---', 'info');
});
