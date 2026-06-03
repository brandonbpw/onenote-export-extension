// Content script — runs inside the OneNote iframe, accesses the DOM directly

let isExporting = false;

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'startExport') {
    // Only run in the onenoteframe URL to avoid duplicates
    if (!location.href.includes('onenoteframe')) {
      sendResponse({ ok: false });
      return false;
    }
    if (isExporting || getSectionTabs().length === 0) {
      sendResponse({ ok: false });
      return false;
    }
    isExporting = true;
    sendResponse({ ok: true });
    startExport(msg.format, msg.delay);
    return false;
  }
  if (msg.action === 'stopExport') {
    isExporting = false;
    notify('Stop requested.', 'warn');
    sendResponse({ ok: true });
    return false;
  }
  if (msg.action === 'ping') {
    const hasSections = getSectionTabs().length > 0;
    const hasPages = getPageItems().length > 0;
    sendResponse({ hasSections, hasPages, url: location.href });
    return false;
  }
  if (msg.action === 'deepScan') {
    deepScan();
    sendResponse({ ok: true });
    return false;
  }
});

function notify(text, level) {
  try {
    chrome.runtime.sendMessage({ type: 'log', text: text, level: level || 'info' }, () => {
      if (chrome.runtime.lastError) {} // suppress
    });
  } catch(e) {}
}

function progress(pct) {
  try {
    chrome.runtime.sendMessage({ type: 'progress', pct: pct }, () => {
      if (chrome.runtime.lastError) {} // suppress
    });
  } catch(e) {}
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function checkStopped() {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ action: 'checkStop' }, (resp) => {
      resolve(resp && resp.shouldStop);
    });
  });
}

function sanitize(name) {
  return (name || 'untitled').replace(/[<>:"/\\|?*\n\r]/g, '_').trim().substring(0, 100);
}

// ============ DOM HELPERS ============

function deepScan() {
  notify('--- Deep Scan ---', 'info');

  // Find all treeitems
  const allTreeItems = document.querySelectorAll('[role="treeitem"]');
  notify('All treeitems: ' + allTreeItems.length, 'info');
  for (let i = 0; i < Math.min(allTreeItems.length, 20); i++) {
    const el = allTreeItems[i];
    const label = (el.getAttribute('aria-label') || '').substring(0, 60);
    const expanded = el.getAttribute('aria-expanded');
    const level = el.getAttribute('aria-level');
    const cls = (el.className || '').toString().substring(0, 50);
    notify('  [' + i + '] level=' + level + ' expanded=' + expanded + ' cls=' + cls + ' "' + label + '"', 'info');
  }

  // Find section list container
  const secList = document.querySelector('[aria-label="Section List"]');
  if (secList) {
    notify('Section List found, children: ' + secList.children.length, 'success');
    const items = secList.querySelectorAll('[role="treeitem"]');
    notify('  treeitems inside: ' + items.length, 'info');
    for (let i = 0; i < items.length; i++) {
      const el = items[i];
      const label = (el.getAttribute('aria-label') || '').substring(0, 60);
      const expanded = el.getAttribute('aria-expanded');
      notify('  section[' + i + '] expanded=' + expanded + ' "' + label + '"', 'info');
    }
  } else {
    notify('No [aria-label="Section List"] found', 'warn');
  }

  // Look for section groups specifically
  const groups = document.querySelectorAll('[aria-expanded]');
  const groupItems = Array.from(groups).filter(el => {
    const label = (el.getAttribute('aria-label') || '');
    return label.includes('Section Group') || label.includes('section group');
  });
  notify('Section Groups found: ' + groupItems.length, 'info');
  for (const g of groupItems) {
    notify('  Group: "' + (g.getAttribute('aria-label') || '').substring(0, 60) + '" expanded=' + g.getAttribute('aria-expanded'), 'info');
  }

  notify('--- End Deep Scan ---', 'info');
}

function getSectionTabs() {
  const items = document.querySelectorAll('[role="treeitem"]');
  const sections = [];
  for (const el of items) {
    const label = el.getAttribute('aria-label') || '';
    if (label.includes('Section')) sections.push(el);
  }
  if (sections.length > 0) return sections;
  const container = document.querySelector('[aria-label="Section List"]');
  if (container) return Array.from(container.querySelectorAll('[role="treeitem"]'));
  return [];
}

function getPageItems() {
  const container = document.querySelector('[aria-label="Page List"]');
  if (container) {
    const items = container.querySelectorAll('.pageNode');
    if (items.length > 0) return Array.from(items);
  }
  return Array.from(document.querySelectorAll('.pageNode'));
}

function getPageContent() {
  const outlines = document.querySelectorAll('div[class*="OutlineContent"]');
  if (outlines.length > 0) {
    const wrapper = document.createElement('div');
    outlines.forEach(o => wrapper.appendChild(o.cloneNode(true)));
    cleanContent(wrapper);
    return wrapper;
  }
  const canvas = document.querySelector('[class*="Canvas"]');
  if (canvas) {
    const clone = canvas.cloneNode(true);
    clone.querySelectorAll('[role="toolbar"], [role="tablist"], [class*="Ribbon"]').forEach(el => el.remove());
    cleanContent(clone);
    if (clone.innerHTML.length > 50) return clone;
  }
  return null;
}

function cleanContent(el) {
  const removeSelectors = [
    '.DragHandle', '[class*="DragHandle"]',
    '[class*="WACImageResizeHandle"]', '.WACImageResizeHandles',
    '.WACImageOverlay', '[class*="WACImageOverlay"]',
    '.WACAltTextDescribedBy',
    'img[class*="OutlineElementHandle"]', 'img[class*="one_Outline"]',
    'span[unselectable="on"]'
  ];
  removeSelectors.forEach(sel => {
    el.querySelectorAll(sel).forEach(e => e.remove());
  });
  el.querySelectorAll('.WACImageContainer').forEach(container => {
    const img = container.querySelector('img.WACImage');
    if (img) {
      const cleanImg = document.createElement('img');
      cleanImg.src = img.src;
      cleanImg.alt = img.alt || '';
      cleanImg.style.maxWidth = '100%';
      cleanImg.style.height = 'auto';
      container.parentNode.replaceChild(cleanImg, container);
    }
  });
}

function getElementText(el) {
  let text = el.getAttribute('aria-label') || '';
  if (!text) {
    const titleEl = el.querySelector('[aria-label^="Page Title"], [class*="title"], [class*="Title"]');
    text = titleEl ? (titleEl.getAttribute('aria-label') || titleEl.textContent || '') : (el.innerText || el.textContent || '');
  }
  text = text.trim();
  if (text.includes(', Section.')) text = text.split(', Section.')[0].trim();
  if (text.includes('. Selected.')) { text = text.split('. Selected.')[0].trim(); if (text.includes(', Section')) text = text.split(', Section')[0].trim(); }
  if (text.startsWith('Page Title ')) text = text.replace('Page Title ', '').trim();
  return text.split('\n')[0].trim();
}

// ============ EXPORT ============

function buildHTML(title, sectionName, content) {
  const clone = content.cloneNode(true);
  clone.querySelectorAll('img').forEach(img => {
    if (img.src && !img.src.startsWith('data:')) img.setAttribute('src', img.src);
  });

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title} - ${sectionName}</title>
<style>body{font-family:'Segoe UI',Arial,sans-serif;max-width:900px;margin:2em auto;padding:0 1.5em;line-height:1.6;color:#333}img{max-width:100%;height:auto}table{border-collapse:collapse;width:100%;margin:1em 0}td,th{border:1px solid #ddd;padding:8px}h1{color:#0078d4;border-bottom:2px solid #0078d4;padding-bottom:.3em}</style>
</head><body><h1>${title}</h1><p style="color:#666;font-style:italic">Section: ${sectionName}</p>${clone.innerHTML}</body></html>`;
}

async function exportPage(title, sectionName, format) {
  const content = getPageContent();
  if (!content) { notify('  x No content: ' + title, 'error'); return false; }

  const html = buildHTML(title, sectionName, content);
  const baseFilename = sanitize(sectionName) + '_' + sanitize(title);

  return new Promise((resolve) => {
    chrome.runtime.sendMessage({
      action: 'downloadFile',
      content: html,
      mimeType: 'text/html',
      filename: 'OneNote Export/' + baseFilename + '.html',
      format: format
    }, (resp) => {
      if (chrome.runtime.lastError) {
        notify('  x Download error: ' + chrome.runtime.lastError.message, 'error');
        resolve(false);
      } else {
        resolve(resp && resp.success);
      }
    });
  });
}

// ============ MAIN LOOP ============

async function startExport(format, delay) {
  // Clear any previous stop signal
  chrome.runtime.sendMessage({ action: 'clearStop' });

  notify('Starting export (' + format.toUpperCase() + ')...', 'info');
  notify('Frame URL: ' + location.href.substring(0, 80), 'info');

  const sections = getSectionTabs();
  if (sections.length === 0) {
    notify('No sections found in this frame.', 'error');
    notify('Body size: ' + document.body.innerHTML.length + ' chars', 'info');
    chrome.runtime.sendMessage({ type: 'done' });
    isExporting = false;
    return;
  }

  notify('Found ' + sections.length + ' section(s)', 'success');
  let totalExported = 0, totalFailed = 0, totalPages = 0;

  for (let si = 0; si < sections.length; si++) {
    if (await checkStopped()) break;

    const section = sections[si];
    const sectionName = getElementText(section) || 'Section_' + (si + 1);
    notify('Section ' + (si+1) + '/' + sections.length + ': ' + sectionName, 'info');

    section.click();
    await sleep(3000);

    const pages = getPageItems();
    if (pages.length === 0) { notify('   No pages', 'warn'); continue; }
    notify('   ' + pages.length + ' page(s)', 'info');
    totalPages += pages.length;

    for (let pi = 0; pi < pages.length; pi++) {
      if (await checkStopped()) break;

      const page = pages[pi];
      const pageTitle = getElementText(page) || 'Page_' + (pi + 1);

      const clickTarget = page.querySelector('[tabindex], [role="button"], a, button') || page;
      clickTarget.click();
      await sleep(delay);

      let success = false;
      try { success = await exportPage(pageTitle, sectionName, format); }
      catch (err) { notify('  x ' + pageTitle + ': ' + err.message, 'error'); }

      if (success) { totalExported++; notify('  + ' + pageTitle, 'success'); }
      else { totalFailed++; }

      progress(Math.round((totalExported + totalFailed) / totalPages * 100));
      await sleep(2500);
    }

    if (await checkStopped()) break;
  }

  const stopped = await checkStopped();
  notify((stopped ? 'Stopped.' : 'Done!') + ' Exported: ' + totalExported + ', Failed: ' + totalFailed, 'success');
  chrome.runtime.sendMessage({ type: 'done' }, () => { if (chrome.runtime.lastError) {} });
  chrome.runtime.sendMessage({ action: 'releaseExport' }, () => { if (chrome.runtime.lastError) {} });
  isExporting = false;
}
