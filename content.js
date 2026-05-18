(() => {
  const SEARCH_PATH_RE = /\/maps\/search\//;
  const STORAGE_KEYS = {
    webhook: 'gmaps_extractor_webhook',
    leads: 'gmaps_leads',
  };

  if (!SEARCH_PATH_RE.test(location.href)) return;
  if (window.__gmapsExtractorRunning) return;
  window.__gmapsExtractorRunning = true;

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const log = (...args) => console.log('[GMaps Extractor]', ...args);

  function getFromStorage(key, fallback) {
    return new Promise((resolve) => {
      try {
        chrome.storage?.local?.get(key, (result) => {
          resolve(result?.[key] ?? fallback);
        });
      } catch {
        resolve(fallback);
      }
    });
  }

  function setToStorage(values) {
    return new Promise((resolve) => {
      try {
        chrome.storage?.local?.set(values, () => resolve(true));
      } catch {
        resolve(false);
      }
    });
  }

  const getSavedWebhook = () => getFromStorage(STORAGE_KEYS.webhook, '');
  const saveWebhook = (url) => setToStorage({ [STORAGE_KEYS.webhook]: url });
  const getSavedLeads = async () => {
    const leads = await getFromStorage(STORAGE_KEYS.leads, []);
    return Array.isArray(leads) ? leads : [];
  };
  const saveLeads = (leads) => setToStorage({ [STORAGE_KEYS.leads]: leads });

  function ensureStyles() {
    if (document.getElementById('gmaps-extractor-style')) return;

    const style = document.createElement('style');
    style.id = 'gmaps-extractor-style';
    style.textContent = `
      .gmapsx-toast{position:fixed;right:18px;bottom:18px;z-index:999999;background:#0a0a0a;color:#f8fafc;border:1px solid rgba(255,255,255,.14);border-radius:14px;padding:12px 14px;box-shadow:0 18px 50px rgba(0,0,0,.65);font:600 13px/1.4 Inter,system-ui,-apple-system,Segoe UI,Roboto;opacity:0;transform:translateY(8px);transition:opacity .18s ease,transform .18s ease;pointer-events:none;max-width:min(420px,calc(100vw - 36px));}
      .gmapsx-toast.show{opacity:1;transform:translateY(0)}
      .gmapsx-backdrop{position:fixed;inset:0;background:rgba(0,0,0,.78);display:flex;align-items:center;justify-content:center;z-index:999999;}
      .gmapsx-modal{width:min(520px,94vw);background:#000000;border:1px solid rgba(255,255,255,.16);border-radius:14px;padding:18px;box-shadow:0 30px 80px rgba(0,0,0,.75);color:#e7ecf3;font:500 14px/1.45 Inter,system-ui,-apple-system,Segoe UI,Roboto;}
      .gmapsx-modal header{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px}
      .gmapsx-modal h3{margin:0;font-size:18px}
      .gmapsx-modal .close{border:none;background:transparent;color:#9aa4b2;font-size:22px;cursor:pointer}
      .gmapsx-modal .body{padding:8px 0}
      .gmapsx-modal label{display:block;font-size:12px;color:#9aa4b2;margin:0 0 6px 2px}
      .gmapsx-modal input[type="text"]{box-sizing:border-box;width:100%;max-width:100%;display:block;padding:12px;border-radius:10px;border:1px solid rgba(255,255,255,.08);background:#050505;color:#e7ecf3;outline:none}
      .gmapsx-modal .actions{display:flex;justify-content:flex-end;gap:8px;margin-top:14px;flex-wrap:wrap}
      .gmapsx-btn{cursor:pointer;border:1px solid rgba(255,255,255,.12);background:transparent;color:#fff;padding:10px 14px;border-radius:999px;font-weight:700}
      .gmapsx-btn.primary{background:linear-gradient(90deg,rgba(255,79,0,.95),rgba(255,122,51,.92));border-color:transparent;color:#fff}
      .gmapsx-btn:disabled{opacity:.7;cursor:not-allowed}
      #gmapsx-game-backdrop{position:fixed;inset:0;background:rgba(0,0,0,.72);display:flex;align-items:center;justify-content:center;z-index:999998;color:#e7ecf3;font:500 14px/1.45 Inter,system-ui,-apple-system,Segoe UI,Roboto;}
      .gmapsx-game-modal{width:min(620px,94vw);background:#000;border:1px solid rgba(255,255,255,.16);border-radius:18px;padding:20px;box-shadow:0 30px 80px rgba(0,0,0,.75)}
      .gmapsx-game-modal h3{margin:0 0 6px;font-size:20px}
      .gmapsx-game-subtitle{margin:0 0 14px;color:#9aa4b2}
      .gmapsx-game-stage{position:relative;height:180px;overflow:hidden;border:1px solid rgba(255,255,255,.12);border-radius:14px;background:linear-gradient(180deg,#111 0%,#050505 100%)}
      .gmapsx-game-modal.game-over .gmapsx-game-stage{border-color:rgba(239,68,68,.45)}
      .gmapsx-game-ground{position:absolute;left:0;right:0;bottom:34px;height:2px;background:rgba(255,255,255,.18)}
      .gmapsx-game-runner{position:absolute;left:38px;bottom:36px;width:66px;height:44px}
      .gmapsx-cat-body{position:absolute;left:16px;bottom:9px;width:36px;height:22px;border-radius:18px 16px 12px 12px;background:#ff4f00;box-shadow:inset 0 -7px 0 rgba(0,0,0,.14)}
      .gmapsx-cat-body::after{content:"";position:absolute;left:8px;top:5px;width:4px;height:10px;border-radius:999px;background:rgba(255,255,255,.22);box-shadow:9px 0 0 rgba(255,255,255,.16)}
      .gmapsx-cat-head{position:absolute;right:1px;bottom:21px;width:23px;height:22px;border-radius:13px 13px 11px 11px;background:#ff4f00}
      .gmapsx-cat-head::before,.gmapsx-cat-head::after{content:"";position:absolute;top:-6px;width:10px;height:10px;background:#ff4f00;clip-path:polygon(50% 0,0 100%,100% 100%)}
      .gmapsx-cat-head::before{left:2px}.gmapsx-cat-head::after{right:2px}
      .gmapsx-cat-face{position:absolute;right:6px;bottom:29px;width:4px;height:4px;border-radius:50%;background:#111;box-shadow:8px 0 0 #111}
      .gmapsx-cat-tail{position:absolute;left:2px;bottom:22px;width:20px;height:28px;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 28'%3E%3Cpath d='M 17 25 C 17 15, 3 18, 3 10 C 3 4, 13 4, 13 9' fill='none' stroke='%23ff4f00' stroke-width='6' stroke-linecap='round'/%3E%3C/svg%3E");background-repeat:no-repeat;transform-origin:17px 25px;transform:rotate(-7deg);animation:gmapsxCatTail .44s ease-in-out infinite alternate}
      .gmapsx-cat-leg{position:absolute;bottom:0;width:7px;height:15px;border-radius:0 0 6px 6px;background:#ff4f00;animation:gmapsxCatWalk .24s ease-in-out infinite alternate}
      .gmapsx-cat-leg.back{left:24px}.gmapsx-cat-leg.front{left:43px;animation-delay:.12s}
      .gmapsx-game-runner.jump{animation:gmapsxJump .78s ease-out}
      .gmapsx-game-obstacle{position:absolute;right:-28px;bottom:36px;width:17px;height:30px;border-radius:5px 5px 3px 3px;background:#e7ecf3;z-index:1}
      .gmapsx-game-score{display:flex;justify-content:space-between;gap:10px;margin-top:12px;color:#cbd5e1;font-weight:700}
      .gmapsx-game-hint{color:#9aa4b2;font-size:12px;font-weight:500}
      .gmapsx-game-over{position:absolute;inset:0;z-index:5;display:grid;place-items:center;gap:6px;align-content:center;background:rgba(0,0,0,.72);text-align:center}
      .gmapsx-game-over[hidden]{display:none}
      .gmapsx-game-over strong{font-size:28px;color:#f8fafc}
      .gmapsx-game-over span{font-size:13px;color:#cbd5e1}
      @keyframes gmapsxJump{0%,100%{transform:translateY(0)}45%{transform:translateY(-132px)}}
      @keyframes gmapsxCatWalk{0%{transform:translateY(0) rotate(-8deg)}100%{transform:translateY(3px) rotate(8deg)}}
      @keyframes gmapsxCatTail{0%{transform:rotate(-10deg)}100%{transform:rotate(-4deg)}}
    `;
    document.documentElement.appendChild(style);
  }

  function showToast(message, ok = true) {
    ensureStyles();
    let toast = document.getElementById('gmapsx-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'gmapsx-toast';
      toast.className = 'gmapsx-toast';
      document.body.appendChild(toast);
    }

    toast.style.borderColor = ok ? 'rgba(255,79,0,.5)' : 'rgba(239,68,68,.45)';
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => toast.classList.remove('show'), 2400);
  }

  function openExtractionGame() {
    ensureStyles();
    document.getElementById('gmapsx-game-backdrop')?.remove();

    const backdrop = document.createElement('div');
    backdrop.id = 'gmapsx-game-backdrop';
    backdrop.innerHTML = `
      <div class="gmapsx-game-modal" role="dialog" aria-modal="true" aria-label="Extraindo leads">
        <h3>Extraindo leads...</h3>
        <p class="gmapsx-game-subtitle">Enquanto buscamos os contatos, pule os obstáculos para passar o tempo.</p>
        <div class="gmapsx-game-stage" tabindex="0">
          <div class="gmapsx-game-ground"></div>
          <div class="gmapsx-game-runner" aria-hidden="true">
            <span class="gmapsx-cat-tail"></span>
            <span class="gmapsx-cat-body"></span>
            <span class="gmapsx-cat-head"></span>
            <span class="gmapsx-cat-face"></span>
            <span class="gmapsx-cat-leg back"></span>
            <span class="gmapsx-cat-leg front"></span>
          </div>
          <div class="gmapsx-game-over" hidden>
            <strong>Game over</strong>
            <span>Pressione espaço ou clique para reiniciar</span>
          </div>
        </div>
        <div class="gmapsx-game-score">
          <span>Pontos: <b data-score>0</b></span>
          <span class="gmapsx-game-hint">Espaço, ↑ ou clique para pular</span>
        </div>
      </div>
    `;

    document.body.appendChild(backdrop);

    const stage = backdrop.querySelector('.gmapsx-game-stage');
    const modal = backdrop.querySelector('.gmapsx-game-modal');
    const runner = backdrop.querySelector('.gmapsx-game-runner');
    const score = backdrop.querySelector('[data-score]');
    const gameOverMessage = backdrop.querySelector('.gmapsx-game-over');
    const obstacles = new Set();
    const timers = new Set();
    let points = 0;
    let closed = false;
    let gameOver = false;
    let jumping = false;

    const addTimer = (callback, delay, repeat = false) => {
      const timer = repeat ? setInterval(callback, delay) : setTimeout(callback, delay);
      timers.add({ timer, repeat });
      return timer;
    };

    const stopTimers = () => {
      for (const { timer, repeat } of timers) {
        if (repeat) clearInterval(timer);
        else clearTimeout(timer);
      }
      timers.clear();
    };

    const hasCollision = (obstacle) => {
      const runnerBox = runner.getBoundingClientRect();
      const obstacleBox = obstacle.getBoundingClientRect();
      const runnerHitbox = {
        left: runnerBox.left + 14,
        right: runnerBox.right - 10,
        top: runnerBox.top + 8,
        bottom: runnerBox.bottom,
      };
      const obstacleHitbox = {
        left: obstacleBox.left + 2,
        right: obstacleBox.right - 2,
        top: obstacleBox.top + 3,
        bottom: obstacleBox.bottom,
      };
      return !(
        runnerHitbox.right < obstacleHitbox.left ||
        runnerHitbox.left > obstacleHitbox.right ||
        runnerHitbox.bottom < obstacleHitbox.top ||
        runnerHitbox.top > obstacleHitbox.bottom
      );
    };

    const setGameOver = () => {
      gameOver = true;
      jumping = false;
      runner.classList.remove('jump');
      modal.classList.add('game-over');
      gameOverMessage.hidden = false;
      stopTimers();
    };

    const startSpawning = () => {
      addTimer(spawnObstacle, 1200);
      addTimer(spawnObstacle, 3800, true);
    };

    const restartGame = () => {
      if (closed) return;

      stopTimers();
      for (const obstacle of obstacles) obstacle.remove();
      obstacles.clear();
      points = 0;
      score.textContent = '0';
      gameOver = false;
      jumping = false;
      modal.classList.remove('game-over');
      gameOverMessage.hidden = true;
      runner.classList.remove('jump');
      startSpawning();
    };

    const jump = () => {
      if (jumping || closed || gameOver) return;
      jumping = true;
      runner.classList.add('jump');
      addTimer(() => {
        runner.classList.remove('jump');
        jumping = false;
      }, 780);
    };

    const spawnObstacle = () => {
      if (closed || gameOver) return;

      const obstacle = document.createElement('div');
      obstacle.className = 'gmapsx-game-obstacle';
      stage.appendChild(obstacle);
      obstacles.add(obstacle);

      let x = stage.clientWidth + 28;
      const speed = 4.4 + Math.min(points / 120, 2.8);
      const move = setInterval(() => {
        if (closed || gameOver) {
          clearInterval(move);
          return;
        }

        x -= speed;
        obstacle.style.transform = `translateX(${-stage.clientWidth - 56 + x}px)`;

        if (hasCollision(obstacle)) {
          setGameOver();
          return;
        }

        if (x < -40) {
          clearInterval(move);
          obstacle.remove();
          obstacles.delete(obstacle);
          points += 1;
          score.textContent = String(points);
        }
      }, 24);

      timers.add({ timer: move, repeat: true });
    };

    const handleKeydown = (event) => {
      if (event.code === 'Space' || event.code === 'ArrowUp') {
        event.preventDefault();
        if (gameOver) {
          restartGame();
          return;
        }
        jump();
      }
    };

    const handleClick = () => {
      if (gameOver) restartGame();
      else jump();
    };

    backdrop.addEventListener('click', handleClick);
    window.addEventListener('keydown', handleKeydown);
    stage.focus();

    startSpawning();

    return {
      backdrop,
      close() {
        closed = true;
        for (const { timer, repeat } of timers) {
          if (repeat) clearInterval(timer);
          else clearTimeout(timer);
        }
        window.removeEventListener('keydown', handleKeydown);
        backdrop.removeEventListener('click', handleClick);
        for (const obstacle of obstacles) obstacle.remove();
        backdrop.remove();
      },
    };
  }

  function closeExtractionGame(game) {
    game?.close?.();
  }

  function isValidWebhookUrl(url) {
    try {
      const parsed = new URL(url);
      return ['http:', 'https:'].includes(parsed.protocol);
    } catch {
      return false;
    }
  }

  function normalizeText(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function textFrom(element) {
    return normalizeText(element?.innerText || element?.textContent || '');
  }

  function cleanLabeledText(text, labels) {
    let cleaned = normalizeText(text);
    for (const label of labels) {
      cleaned = cleaned.replace(new RegExp(`^${label}\\s*:?\\s*`, 'i'), '');
    }
    return normalizeText(cleaned);
  }

  function formatBrazilianPhone(value) {
    let digits = String(value || '').replace(/\D/g, '');
    if ((digits.length === 12 || digits.length === 13) && digits.startsWith('55')) {
      digits = digits.slice(2);
    }

    if (digits.length === 11) {
      return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
    }

    if (digits.length === 10) {
      return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
    }

    return normalizeText(value);
  }

  function findScrollableFeed() {
    const direct = document.querySelector('#pane div[role="feed"], div[role="feed"]');
    if (direct) return direct;

    const candidates = [
      ...document.querySelectorAll('#pane .m6QErb, #pane div[aria-label], #pane div'),
    ];

    return candidates.find((element) => {
      const style = getComputedStyle(element);
      const canScroll = element.scrollHeight > element.clientHeight + 10;
      return canScroll && /(auto|scroll)/.test(style.overflowY);
    }) || null;
  }

  async function waitForResultsPanel() {
    for (let attempt = 0; attempt < 80; attempt += 1) {
      const feed = findScrollableFeed();
      if (feed || document.querySelector('#pane a.hfpxzc[href*="/maps/place/"]')) {
        return feed;
      }
      await sleep(250);
    }
    return findScrollableFeed();
  }

  function hasLoadingIndicator() {
    return Boolean(document.querySelector([
      '#pane [role="progressbar"]',
      '#pane [aria-busy="true"]',
      '#pane svg[aria-label*="Carregando" i]',
      '#pane svg[aria-label*="Loading" i]',
    ].join(',')));
  }

  function hasEndOfListMarker() {
    const text = textFrom(document.querySelector('#pane'));
    return /chegou ao final da lista|you.ve reached the end|back to top|voltar ao início/i.test(text);
  }

  async function scrollResultsToEnd(feed) {
    if (!feed) return;

    let stableScrolls = 0;
    let lastHeight = 0;

    for (let attempt = 0; attempt < 90; attempt += 1) {
      feed.scrollBy(0, Math.max(700, Math.floor(feed.clientHeight * 0.85)));
      await sleep(450);

      if (hasLoadingIndicator()) await sleep(700);

      if (feed.scrollHeight === lastHeight) stableScrolls += 1;
      else stableScrolls = 0;

      lastHeight = feed.scrollHeight;
      if (stableScrolls >= 8 || hasEndOfListMarker()) break;
    }
  }

  function isSponsoredResult(anchor) {
    const card = anchor.closest('[role="article"], .Nv2PK, div');
    const text = textFrom(card || anchor);
    return Boolean(
      anchor.closest('[data-result-ad="1"], [jsaction*="ad"]') ||
      /patrocinado|sponsored| anúncio | ad /i.test(` ${text} `)
    );
  }

  function collectResultUrls() {
    const urls = new Set();
    const anchors = document.querySelectorAll('#pane a.hfpxzc[href*="/maps/place/"], a.hfpxzc[href*="/maps/place/"]');

    for (const anchor of anchors) {
      if (!anchor.href || isSponsoredResult(anchor)) continue;
      urls.add(anchor.href.split('&entry=')[0]);
    }

    return [...urls];
  }

  function findResultAnchorByUrl(url) {
    return [...document.querySelectorAll('a.hfpxzc[href*="/maps/place/"]')]
      .find((anchor) => anchor.href && anchor.href.startsWith(url));
  }

  async function waitForPlaceDetails(previousTitle = '') {
    for (let attempt = 0; attempt < 50; attempt += 1) {
      const title = textFrom(document.querySelector('h1.DUwDvf'));
      if (title && title !== previousTitle) return true;
      await sleep(200);
    }
    return Boolean(document.querySelector('h1.DUwDvf'));
  }

  function getDetailButtonText(selectors, labels = []) {
    const element = document.querySelector(selectors);
    const aria = normalizeText(element?.getAttribute('aria-label') || '');
    const text = aria || textFrom(element);
    return cleanLabeledText(text, labels);
  }

  function extractWebsite() {
    const websiteLink = document.querySelector([
      '#pane a[data-item-id="authority"]',
      '#pane a[aria-label*="Website" i]',
      '#pane a[aria-label*="Site" i]',
      '#pane a[href^="http"]:not([href*="google."]):not([href*="gstatic."])',
    ].join(','));

    return websiteLink?.href || '';
  }

  function extractRatingAndReviews() {
    const panelText = textFrom(document.querySelector('#pane'));
    const ratingNode = document.querySelector('#pane div.F7nice span[aria-hidden="true"]');
    const ratingText = textFrom(ratingNode) || panelText.match(/\b\d[,.]\d\b/)?.[0] || '';
    const reviewsText = panelText.match(/([\d.,]+)\s*(avaliações|reviews)/i)?.[1] || '';

    return {
      rating: ratingText.replace(',', '.'),
      reviews: reviewsText.replace(/\D/g, ''),
    };
  }

  function extractSpecialties() {
    const categories = [
      ...document.querySelectorAll('#pane button.DkEaL, #pane button[jsaction*="category"], #pane [data-item-id*="category"]'),
    ]
      .map(textFrom)
      .filter(Boolean);

    return [...new Set(categories)].join(', ');
  }

  function extractCurrentLead(index) {
    const name = textFrom(document.querySelector('h1.DUwDvf'));
    const phoneRaw = getDetailButtonText([
      '#pane button[data-item-id^="phone"]',
      '#pane div[role="button"][data-item-id^="phone"]',
      '#pane a[href^="tel:"]',
    ].join(','), ['Telefone', 'Phone']);
    const address = getDetailButtonText([
      '#pane button[data-item-id="address"]',
      '#pane div[role="button"][data-item-id="address"]',
      '#pane button[aria-label*="Endereço" i]',
      '#pane button[aria-label*="Address" i]',
    ].join(','), ['Endereço', 'Address']);
    const { rating, reviews } = extractRatingAndReviews();

    return {
      idx: index,
      nome_empresa: name,
      telefone: formatBrazilianPhone(phoneRaw),
      endereco: address,
      website: extractWebsite(),
      rating,
      reviews,
      especialidades: extractSpecialties(),
    };
  }

  async function openResult(url) {
    const previousTitle = textFrom(document.querySelector('h1.DUwDvf'));
    const anchor = findResultAnchorByUrl(url);

    if (!anchor) return false;

    anchor.scrollIntoView({ block: 'center' });
    await sleep(180);
    anchor.click();
    await waitForPlaceDetails(previousTitle);
    await sleep(500);
    return true;
  }

  async function returnToResults(searchUrl) {
    if (SEARCH_PATH_RE.test(location.href)) return;

    history.back();
    for (let attempt = 0; attempt < 40; attempt += 1) {
      if (SEARCH_PATH_RE.test(location.href) || document.querySelector('a.hfpxzc[href*="/maps/place/"]')) break;
      await sleep(200);
    }

    if (!SEARCH_PATH_RE.test(location.href) && searchUrl) {
      history.pushState(null, '', searchUrl);
      window.dispatchEvent(new PopStateEvent('popstate'));
      await sleep(600);
    }
  }

  async function extractLeadsFromResults() {
    const searchUrl = location.href;
    const feed = await waitForResultsPanel();

    if (!feed && !document.querySelector('a.hfpxzc[href*="/maps/place/"]')) {
      throw new Error('Painel não encontrado. Abortando.');
    }

    await scrollResultsToEnd(feed);
    const urls = collectResultUrls();
    log('Cards únicos para extrair:', urls.length);

    const leads = [];
    const seenNames = new Set();

    for (let index = 0; index < urls.length; index += 1) {
      try {
        const opened = await openResult(urls[index]);
        if (!opened) continue;

        const lead = extractCurrentLead(leads.length + 1);
        if (lead.nome_empresa && !seenNames.has(lead.nome_empresa)) {
          seenNames.add(lead.nome_empresa);
          leads.push(lead);
        }

        await returnToResults(searchUrl);
        await sleep(350);
      } catch (error) {
        log('Erro ao extrair', index + 1, error?.message || error);
      }
    }

    return leads;
  }

  function closeModal(backdrop) {
    backdrop?.remove();
  }

  async function openSendModal(leadCount) {
    ensureStyles();
    document.getElementById('gmapsx-send-backdrop')?.remove();

    const backdrop = document.createElement('div');
    backdrop.id = 'gmapsx-send-backdrop';
    backdrop.className = 'gmapsx-backdrop';

    const modal = document.createElement('div');
    modal.className = 'gmapsx-modal';
    modal.innerHTML = `
      <header>
        <h3>Enviar para Webhook</h3>
        <button class="close" aria-label="Fechar">×</button>
      </header>
      <div class="body">
        <div style="margin-bottom:8px;color:#9aa4b2">Foram coletados <b>${leadCount}</b> leads. Informe seu webhook para enviar agora.</div>
        <label for="gmapsx-input">URL do webhook</label>
        <input id="gmapsx-input" type="text" placeholder="https://seu-dominio.com/webhook/receber">
      </div>
      <div class="actions">
        <button class="gmapsx-btn" id="gmapsx-cancel">Cancelar</button>
        <button class="gmapsx-btn primary" id="gmapsx-send">Enviar</button>
      </div>
    `;

    backdrop.appendChild(modal);
    document.body.appendChild(backdrop);

    const input = modal.querySelector('#gmapsx-input');
    const closeButton = modal.querySelector('.close');
    const cancelButton = modal.querySelector('#gmapsx-cancel');
    const sendButton = modal.querySelector('#gmapsx-send');
    const savedWebhook = await getSavedWebhook();

    if (savedWebhook) input.value = savedWebhook;
    setTimeout(() => input.focus(), 50);

    const close = () => closeModal(backdrop);
    closeButton.onclick = close;
    cancelButton.onclick = close;
    backdrop.addEventListener('click', (event) => {
      if (event.target === backdrop) close();
    });

    sendButton.onclick = async () => {
      const webhookUrl = input.value.trim();
      if (!webhookUrl) {
        showToast('Informe uma URL de webhook.', false);
        input.focus();
        return;
      }

      if (!isValidWebhookUrl(webhookUrl)) {
        showToast('URL inválida.', false);
        input.focus();
        return;
      }

      const leads = await getSavedLeads();
      if (!leads.length) {
        showToast('Nenhum lead salvo para enviar.', false);
        return;
      }

      sendButton.disabled = true;
      sendButton.textContent = 'Enviando…';

      try {
        const response = await fetch(webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(leads),
        });

        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        await saveWebhook(webhookUrl);
        showToast(`Enviado com sucesso (${leads.length})!`);
        close();
        await saveLeads([]);
      } catch (error) {
        log('Falha ao enviar webhook:', error?.message || error);
        showToast('Falha ao enviar (verifique CORS/URL).', false);
      } finally {
        sendButton.disabled = false;
        sendButton.textContent = 'Enviar';
      }
    };
  }

  async function runExtraction() {
    let game = null;

    try {
      ensureStyles();
      log('content.js iniciado em /maps/search/.');

      game = openExtractionGame();
      const leads = await extractLeadsFromResults();
      closeExtractionGame(game);
      game = null;

      if (!leads.length) {
        showToast('Nenhum lead encontrado.', false);
        return;
      }

      await saveLeads(leads);
      showToast(`Extração concluída (${leads.length})!`);
      await openSendModal(leads.length);
    } catch (error) {
      closeExtractionGame(game);
      log(error?.message || error);
      showToast(error?.message || 'Erro ao extrair leads.', false);
    }
  }

  runExtraction();
})();
