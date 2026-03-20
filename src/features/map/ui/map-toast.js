let mapToastListEl = null;

function formatMapToastExecutionTime(value) {
  const candidateDate = value instanceof Date
    ? value
    : new Date(value ?? Date.now());
  if (!Number.isFinite(candidateDate.getTime())) {
    return '';
  }

  return candidateDate.toLocaleTimeString('pl-PL', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
}

function ensureMapToastListElement(resolveHost) {
  if (mapToastListEl) {
    return mapToastListEl;
  }

  const host = typeof resolveHost === 'function' ? resolveHost() : null;
  if (!host) {
    return null;
  }

  const listElement = document.createElement('div');
  listElement.className = 'map-toast-list';
  listElement.setAttribute('aria-live', 'polite');
  listElement.setAttribute('aria-atomic', 'false');
  host.appendChild(listElement);
  mapToastListEl = listElement;
  return mapToastListEl;
}

export function createMapToastPresenter(options = {}) {
  const resolveHost = options.resolveHost;

  return function showMapToast(toastOptions = {}) {
    const toastListElement = ensureMapToastListElement(resolveHost);
    if (!toastListElement) {
      return;
    }

    const normalizedMessage = String(toastOptions?.message || 'Wykonano akcje');
    const normalizedType = String(toastOptions?.type || 'success').toLowerCase();
    const durationMs = Number.isFinite(toastOptions?.durationMs)
      ? Math.max(800, Math.round(toastOptions.durationMs))
      : 5000;
    const executionMomentLabel = formatMapToastExecutionTime(toastOptions?.executedAt);

    const toastItemEl = document.createElement('div');
    toastItemEl.className = 'map-toast';
    toastItemEl.setAttribute('role', 'status');

    if (normalizedType === 'error') {
      toastItemEl.classList.add('is-error');
    } else if (normalizedType === 'info') {
      toastItemEl.classList.add('is-info');
    } else {
      toastItemEl.classList.add('is-success');
    }

    const toastBodyEl = document.createElement('div');
    toastBodyEl.className = 'map-toast-body';

    const toastMessageEl = document.createElement('div');
    toastMessageEl.className = 'map-toast-message';
    toastMessageEl.textContent = normalizedMessage;

    const toastTimeEl = document.createElement('div');
    toastTimeEl.className = 'map-toast-time';
    toastTimeEl.textContent = executionMomentLabel;

    toastBodyEl.append(toastMessageEl);
    if (executionMomentLabel) {
      toastBodyEl.append(toastTimeEl);
    }

    const closeControlEl = document.createElement('button');
    closeControlEl.type = 'button';
    closeControlEl.className = 'map-toast-close';
    closeControlEl.setAttribute('aria-label', 'Zamknij powiadomienie');
    closeControlEl.innerHTML = '<span class="map-toast-close-icon">×</span>';

    toastItemEl.append(toastBodyEl, closeControlEl);

    toastListElement.append(toastItemEl);
    if (toastListElement.childElementCount > 6) {
      toastListElement.firstElementChild?.remove();
    }

    window.requestAnimationFrame(() => {
      toastItemEl.classList.add('is-visible');
    });

    const startedAt = Date.now();
    const updateToastCountdown = () => {
      const elapsedMs = Date.now() - startedAt;

      const progressRatio = durationMs > 0
        ? Math.min(1, Math.max(0, elapsedMs / durationMs))
        : 1;
      closeControlEl.style.setProperty('--toast-close-progress', String(progressRatio));
    };

    const removeToastWithFade = () => {
      toastItemEl.classList.remove('is-visible');
      window.setTimeout(() => {
        if (toastItemEl.parentElement) {
          toastItemEl.remove();
        }
      }, 220);
    };

    updateToastCountdown();
    const countdownTimer = window.setInterval(updateToastCountdown, 200);

    const hideTimer = window.setTimeout(() => {
      window.clearInterval(countdownTimer);
      removeToastWithFade();
    }, durationMs);

    closeControlEl.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      window.clearTimeout(hideTimer);
      window.clearInterval(countdownTimer);
      removeToastWithFade();
    });
  };
}
