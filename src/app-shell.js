let startupUpdateOverlay = null;

async function dismissStartupUpdateOverlay() {
  const overlay = ensureStartupUpdateOverlay();
  overlay.skipButton.disabled = true;
  overlay.closeButton.disabled = true;

  try {
    await window.appApi.skipStartupUpdate();
    overlay.manuallyClosed = false;
  } finally {
    overlay.skipButton.disabled = false;
    overlay.closeButton.disabled = false;
  }
}

export function initShell(pageId) {
  document.body.dataset.page = pageId;
  bindHiddenDashboardShortcut(pageId);

  const navLinks = document.querySelectorAll('[data-page-link]');
  for (const link of navLinks) {
    if (link.dataset.pageLink === pageId) {
      link.classList.add('is-active');
    }
  }

  const updaterStatusEl = document.querySelector('[data-updater-status]');
  const operationStatusEl = document.querySelector('[data-operation-status]');

  if (updaterStatusEl) {
    window.appApi.onUpdateStatus((message) => {
      updaterStatusEl.textContent = message;
    });
  }

  window.appApi.onUpdaterState((state) => {
    if (updaterStatusEl && state?.message) {
      updaterStatusEl.textContent = state.message;
    }
    syncStartupUpdateOverlay(state);
  });

  void window.appApi
    .getUpdaterState()
    .then((state) => {
      if (updaterStatusEl && state?.message) {
        updaterStatusEl.textContent = state.message;
      }
      syncStartupUpdateOverlay(state);
    })
    .catch(() => {});

  if (operationStatusEl) {
    window.appApi.onOperationStatus((payload) => {
      operationStatusEl.textContent = payload?.message || 'Brak aktywnej operacji.';
      if (payload?.summary) {
        applySummary(payload.summary);
      }
    });
  }
}

function ensureStartupUpdateOverlay() {
  if (startupUpdateOverlay) {
    return startupUpdateOverlay;
  }

  const layer = document.createElement('div');
  layer.className = 'startup-update-layer';
  layer.hidden = true;
  layer.innerHTML = `
    <div class="startup-update-card" role="dialog" aria-modal="true" aria-labelledby="startup-update-title">
      <span class="startup-update-kicker">Start aplikacji</span>
      <h2 id="startup-update-title" class="startup-update-title"></h2>
      <p class="startup-update-copy"></p>
      <div class="startup-update-progress" hidden>
        <div class="startup-update-progress-bar"></div>
      </div>
      <div style="display: flex; gap: 10px; margin-top: 18px; justify-content: flex-end;">
        <button type="button" class="startup-update-close" style="background: var(--button-muted, #eee); color: var(--text);">Zamknij</button>
        <button type="button" class="startup-update-skip">Pomiń tym razem</button>
      </div>
    </div>
  `;

  document.body.appendChild(layer);

  const skipButton = layer.querySelector('.startup-update-skip');
  const closeButton = layer.querySelector('.startup-update-close');

  let manuallyClosed = false;

  layer.addEventListener('mousedown', (e) => {
    if (e.target === layer && !skipButton.hidden && !skipButton.disabled) {
      void dismissStartupUpdateOverlay();
    }
  });

  closeButton.addEventListener('click', () => {
    if (closeButton.disabled || closeButton.hidden) {
      return;
    }

    if (!skipButton.hidden) {
      void dismissStartupUpdateOverlay();
      return;
    }

    layer.hidden = true;
    layer.classList.remove('is-visible');
    manuallyClosed = true;
  });

  skipButton.addEventListener('click', async () => {
    if (skipButton.disabled || skipButton.hidden) {
      return;
    }

    await dismissStartupUpdateOverlay();
  });

  startupUpdateOverlay = {
    layer,
    title: layer.querySelector('.startup-update-title'),
    copy: layer.querySelector('.startup-update-copy'),
    progress: layer.querySelector('.startup-update-progress'),
    progressBar: layer.querySelector('.startup-update-progress-bar'),
    skipButton,
    closeButton,
    get manuallyClosed() { return manuallyClosed; },
    set manuallyClosed(val) { manuallyClosed = val; }
  };

  return startupUpdateOverlay;
}

function getStartupUpdateTitle(state) {
  switch (state?.phase) {
    case 'checking':
      return 'Sprawdzanie aktualizacji';
    case 'downloading':
      return state?.version ? `Pobieranie ${state.version}` : 'Pobieranie aktualizacji';
    case 'downloaded':
      return 'Aktualizacja gotowa';
    case 'installing':
      return 'Instalowanie aktualizacji';
    case 'up-to-date':
      return 'Aplikacja jest aktualna';
    case 'error':
      return 'Aktualizacja niedostepna';
    default:
      return 'Aktualizacja aplikacji';
  }
}

function syncStartupUpdateOverlay(state) {
  const overlay = ensureStartupUpdateOverlay();
  let isVisible = Boolean(state?.visible);
  // Jeśli overlay został zamknięty ręcznie, nie pokazuj go ponownie w tej sesji
  if (isVisible && overlay.manuallyClosed) {
    isVisible = false;
  }
  overlay.layer.hidden = !isVisible;
  overlay.layer.classList.toggle('is-visible', isVisible);
  overlay.manuallyClosed = overlay.manuallyClosed || false;
  if (!isVisible) {
    return;
  }

  overlay.title.textContent = getStartupUpdateTitle(state);
  overlay.copy.textContent = state?.message || 'Sprawdzanie statusu aktualizacji.';

  const shouldShowProgress =
    state?.phase === 'checking' ||
    state?.phase === 'downloading' ||
    state?.phase === 'downloaded' ||
    state?.phase === 'installing';

  overlay.progress.hidden = !shouldShowProgress;
  overlay.progress.classList.toggle('is-indeterminate', state?.phase === 'checking');

  let progressWidth = '100%';
  if (state?.phase === 'checking') {
    progressWidth = '36%';
  } else if (state?.phase === 'downloading') {
    const clamped = Math.max(6, Math.min(100, Number(state?.progressPercent || 0)));
    progressWidth = `${clamped}%`;
  }
  overlay.progressBar.style.width = progressWidth;

  overlay.skipButton.hidden = !state?.canSkip;
  overlay.closeButton.hidden = !state?.canSkip;
}

function bindHiddenDashboardShortcut(pageId) {
  window.addEventListener('keydown', (event) => {
    if (!(event.ctrlKey || event.metaKey) || !event.shiftKey) {
      return;
    }

    if (event.key.toLowerCase() !== 'd' || pageId === 'dashboard') {
      return;
    }

    event.preventDefault();
    window.location.href = './index.html';
  });
}

export function formatDate(value) {
  if (!value) {
    return 'Brak';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'Brak';
  }
  return new Intl.DateTimeFormat('pl-PL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  }).format(date);
}

export function formatDateTime(value) {
  if (!value) {
    return 'Brak';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'Brak';
  }
  return new Intl.DateTimeFormat('pl-PL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date);
}

export function formatMoney(value) {
  if (value == null || Number.isNaN(Number(value))) {
    return 'Brak';
  }
  return new Intl.NumberFormat('pl-PL', {
    style: 'currency',
    currency: 'PLN',
    maximumFractionDigits: 2
  }).format(Number(value));
}

export function formatNumber(value) {
  return new Intl.NumberFormat('pl-PL').format(Number(value || 0));
}

export function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function joinPresent(...parts) {
  return parts.filter(Boolean).join(' ');
}

export function summarizePath(value) {
  if (!value) {
    return 'Nie wybrano pliku';
  }
  return value.length > 72 ? `${value.slice(0, 40)} ... ${value.slice(-24)}` : value;
}

export function applySummary(summary) {
  const map = {
    totalTables: summary?.stats?.totalTables,
    totalRows: summary?.stats?.totalRows,
    totalPeople: summary?.stats?.totalPeople,
    geocodedPeople: summary?.stats?.geocodedPeople,
    pendingGeocodes: summary?.stats?.pendingGeocodes,
    totalServiceCards: summary?.stats?.totalServiceCards,
    totalNotes: summary?.stats?.totalNotes,
    totalCustomPoints: summary?.stats?.totalCustomPoints
  };

  Object.entries(map).forEach(([key, value]) => {
    const target = document.querySelector(`[data-stat="${key}"]`);
    if (target) {
      target.textContent = formatNumber(value || 0);
    }
  });

  const importDateEl = document.querySelector('[data-imported-at]');
  if (importDateEl) {
    importDateEl.textContent = summary?.importMeta?.imported_at
      ? formatDateTime(summary.importMeta.imported_at)
      : 'Jeszcze nie importowano';
  }

  const sourcePathEl = document.querySelector('[data-access-path]');
  if (sourcePathEl) {
    sourcePathEl.textContent = summarizePath(
      summary?.settings?.accessDbPath || summary?.importMeta?.source_path
    );
  }
}

export function setButtonBusy(button, busy, busyLabel) {
  if (!button) {
    return;
  }
  if (!button.dataset.defaultLabel) {
    button.dataset.defaultLabel = button.textContent;
  }
  button.disabled = busy;
  button.textContent = busy ? busyLabel : button.dataset.defaultLabel;
}

export function renderKeyValueList(items) {
  return items
    .map(
      (item) => `
        <div class="kv-row">
          <span class="kv-label">${escapeHtml(item.label)}</span>
          <span class="kv-value">${escapeHtml(item.value ?? 'Brak')}</span>
        </div>
      `
    )
    .join('');
}
