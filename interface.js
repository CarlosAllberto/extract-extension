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
    title: 'Adicionar webhook',
    label: 'Adicionar webhook',
    icon: '<path d="M12 6v12m6-6H6" stroke-width="1.6" />',
  },
  edit: {
    title: 'Alterar webhook',
    label: 'Alterar webhook',
    icon: '<path d="M4 20h4l10.5-10.5a2.8 2.8 0 0 0-4-4L4 16v4Z" stroke-width="1.6" /><path d="M13.5 6.5l4 4" stroke-width="1.6" />',
  },
};

function getWebhook() {
  return localStorage.getItem(WEBHOOK_KEY) || '';
}
function setWebhook(url) {
  localStorage.setItem(WEBHOOK_KEY, url);
  // sincroniza com chrome.storage.local para o content.js também enxergar
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
    txt.textContent = 'Webhook configurado';
    txt.title = url;
  } else {
    dot.classList.remove('ok'); dot.classList.add('err');
    txt.textContent = 'Webhook não definido';
    txt.title = '';
  }
}

// Modal controls (apenas salvar webhook)
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

// Abre o Google Maps pesquisando o termo
function openMapsWithTerm() {
  const termo = $('#termInput').value.trim();
  if (!termo) { toast('Informe um termo para extrair.', false); $('#termInput').focus(); return; }
  const q = encodeURIComponent(termo);
  const url = `https://www.google.com/maps/search/${q}`;
  if (typeof chrome !== 'undefined' && chrome?.tabs?.create) chrome.tabs.create({ url });
  else window.open(url, '_blank');
}

// Salvar webhook (não envia leads por aqui)
function saveWebhookOnly() {
  const input = $('#webhookInput');
  const url = (input?.value || '').trim();
  if (!url) { toast('Informe uma URL de webhook.', false); input?.focus(); return; }
  if (!isValidUrl(url)) { toast('URL inválida. Verifique a URL.', false); input?.focus(); return; }
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

  // “Definir webhook” só abre modal de salvar
  btnEdit?.addEventListener('click', openModal);

  // Modal: apenas salvar webhook
  btnSave?.addEventListener('click', saveWebhookOnly);
  btnCancel?.addEventListener('click', closeModal);
  btnClose?.addEventListener('click', closeModal);
  modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });

  // Abrir maps (extrair)
  btnExtract?.addEventListener('click', openMapsWithTerm);
  termInput?.addEventListener('keydown', (e) => { if (e.key === 'Enter') openMapsWithTerm(); });
});
