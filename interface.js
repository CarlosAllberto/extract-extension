// Helpers
const $ = (sel) => document.querySelector(sel);
const toast = (msg, ok = true) => {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.toggle('success', ok);
  el.classList.toggle('error', !ok);
  el.classList.add('show');
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('show'), 2600);
};

const WEBHOOK_KEY = 'gmaps_extractor_webhook';
const WEBHOOK_BUTTON_STATES = {
  add: {
    title: 'Add webhook',
    label: 'Add webhook',
    icon: '<path d="M12 6v12m6-6H6" stroke-width="1.6" />',
  },
  edit: {
    title: 'Edit webhook',
    label: 'Edit webhook',
    icon: '<path d="M4 20h4l10.5-10.5a2.8 2.8 0 0 0-4-4L4 16v4Z" stroke-width="1.6" /><path d="M13.5 6.5l4 4" stroke-width="1.6" />',
  },
};

function getWebhook() {
  return localStorage.getItem(WEBHOOK_KEY) || '';
}
function setWebhook(url) {
  localStorage.setItem(WEBHOOK_KEY, url);
  // sync with chrome.storage.local so content.js can read it
  try { chrome?.storage?.local?.set({ gmaps_extractor_webhook: url }); } catch {}
  renderWebhookStatus();
}

function renderWebhookStatus() {
  const url = getWebhook();
  const dot = $('#webhookDot');
  const txt = $('#webhookStatus');
  const btn = $('#editWebhookBtn');
  const buttonState = url ? WEBHOOK_BUTTON_STATES.edit : WEBHOOK_BUTTON_STATES.add;

  if (btn) {
    btn.title = buttonState.title;
    btn.innerHTML = `<span>${buttonState.label}<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">${buttonState.icon}</svg></span>`;
  }

  if (url) {
    dot.classList.add('ok'); dot.classList.remove('err');
    txt.textContent = 'Webhook configured';
    txt.title = url;
  } else {
    dot.classList.remove('ok'); dot.classList.add('err');
    txt.textContent = 'Webhook not set';
    txt.title = '';
  }
}

// Modal controls (save webhook only)
const modal = document.getElementById('modalBackdrop');
let modalTrigger = null;

function openModal() {
  modalTrigger = document.activeElement;
  const input = $('#webhookInput');
  if (input) input.value = getWebhook();
  modal.style.display = 'flex';
  modal.setAttribute('aria-hidden', 'false');
  setTimeout(() => input && input.focus(), 80);
}
function closeModal() {
  if (modal.contains(document.activeElement)) {
    const focusTarget = modalTrigger || document.getElementById('editWebhookBtn');
    focusTarget?.focus();
  }
  modal.style.display = 'none';
  modal.setAttribute('aria-hidden', 'true');
}

// Validate URL
function isValidUrl(u) {
  try {
    const x = new URL(u);
    return ['http:', 'https:'].includes(x.protocol);
  } catch { return false; }
}

// Open Google Maps with the search term
function openMapsWithTerm() {
  const termo = $('#termInput').value.trim();
  if (!termo) { toast('Enter a search term to extract.', false); $('#termInput').focus(); return; }
  const q = encodeURIComponent(termo);
  const url = `https://www.google.com/maps/search/${q}`;
  if (typeof chrome !== 'undefined' && chrome?.tabs?.create) chrome.tabs.create({ url });
  else window.open(url, '_blank');
}

// Save webhook (does not send leads from here)
function saveWebhookOnly() {
  const input = $('#webhookInput');
  const url = (input?.value || '').trim();
  if (!url) { toast('Enter a webhook URL.', false); input?.focus(); return; }
  if (!isValidUrl(url)) { toast('Invalid URL. Please check the URL.', false); input?.focus(); return; }
  setWebhook(url);
  closeModal();
}

// Wire-up
window.addEventListener('DOMContentLoaded', () => {
  renderWebhookStatus();

  const btnEdit    = document.getElementById('editWebhookBtn');
  const btnSave    = document.getElementById('saveWebhookBtn');
  const btnCancel  = document.getElementById('cancelModalBtn');
  const btnClose   = document.getElementById('closeModalBtn');
  const btnExtract = document.getElementById('extractBtn');
  const termInput  = document.getElementById('termInput');

  btnEdit?.addEventListener('click', openModal);

  btnSave?.addEventListener('click', saveWebhookOnly);
  btnCancel?.addEventListener('click', closeModal);
  btnClose?.addEventListener('click', closeModal);
  modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });

  btnExtract?.addEventListener('click', openMapsWithTerm);
  termInput?.addEventListener('keydown', (e) => { if (e.key === 'Enter') openMapsWithTerm(); });
});
