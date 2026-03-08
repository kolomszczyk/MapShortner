export function initShell(pageId) {
  document.body.dataset.page = pageId;

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

  if (operationStatusEl) {
    window.appApi.onOperationStatus((payload) => {
      operationStatusEl.textContent = payload?.message || 'Brak aktywnej operacji.';
      if (payload?.summary) {
        applySummary(payload.summary);
      }
    });
  }
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
