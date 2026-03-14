const statusEl = document.querySelector('[data-updater-splash-status]');
const phaseEl = document.querySelector('[data-updater-splash-phase]');
const progressWrapEl = document.querySelector('[data-updater-splash-progress-wrap]');
const progressBarEl = document.querySelector('[data-updater-splash-progress-bar]');
const progressValueEl = document.querySelector('[data-updater-splash-progress-value]');

function render(state = {}) {
  const phase = String(state?.phase || 'checking');
  const message = String(state?.message || 'Sprawdzanie aktualizacji...').trim();
  const percentRaw = Number(state?.progressPercent);
  const hasPercent = Number.isFinite(percentRaw);
  const percent = hasPercent ? Math.max(0, Math.min(100, percentRaw)) : null;

  if (statusEl) {
    statusEl.textContent = message;
  }

  if (phaseEl) {
    phaseEl.textContent = phase === 'downloading'
      ? 'Pobieranie aktualizacji'
      : phase === 'installing'
        ? 'Instalowanie aktualizacji'
        : 'Sprawdzanie aktualizacji';
  }

  const shouldShowProgress = phase === 'downloading' || phase === 'installing' || phase === 'checking';
  if (progressWrapEl) {
    progressWrapEl.hidden = !shouldShowProgress;
  }

  if (progressBarEl) {
    if (phase === 'checking') {
      progressBarEl.style.width = '22%';
      progressBarEl.classList.add('is-indeterminate');
    } else {
      const width = percent == null ? 0 : percent;
      progressBarEl.style.width = `${width}%`;
      progressBarEl.classList.remove('is-indeterminate');
    }
  }

  if (progressValueEl) {
    if (phase === 'downloading' && percent != null) {
      progressValueEl.textContent = `${percent.toFixed(1)}%`;
    } else if (phase === 'installing') {
      progressValueEl.textContent = '100.0%';
    } else {
      progressValueEl.textContent = '...';
    }
  }
}

window.updaterSplashApi.onStatus((message) => {
  if (!statusEl) {
    return;
  }
  statusEl.textContent = String(message || '').trim() || 'Sprawdzanie aktualizacji...';
});

window.updaterSplashApi.onState((state) => {
  render(state);
});

void window.updaterSplashApi
  .getState()
  .then((state) => render(state))
  .catch(() => {
    render({
      phase: 'checking',
      message: 'Sprawdzanie aktualizacji...'
    });
  });
