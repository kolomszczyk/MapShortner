import { formatDateTime, formatNumber, setButtonBusy, summarizePath } from './app-shell.js';

export function initDashboardPanel({
  root = document,
  bootstrapData = null,
  onSummaryUpdated = null,
  readyMessage = 'Aplikacja gotowa do pracy.'
} = {}) {
  const accessPathEl = root.querySelector('#access-path');
  const accessPasswordInput = root.querySelector('#access-password');
  const passwordStatusEl = root.querySelector('#password-status');
  const importStatusEl = root.querySelector('#import-status');
  const checkBtn = root.querySelector('#check-btn');
  const showUpdateMessageBtn = root.querySelector('#show-update-message-btn');
  const installBtn = root.querySelector('#install-btn');
  const chooseFileBtn = root.querySelector('#choose-file-btn');
  const saveAccessPasswordBtn = root.querySelector('#save-access-password-btn');
  const importBtn = root.querySelector('#import-btn');
  const geocodeBtn = root.querySelector('#geocode-btn');
  const saveApiKeyBtn = root.querySelector('#save-api-key-btn');
  const exportTrasaBtn = root.querySelector('#export-trasa-btn');
  const importTrasaBtn = root.querySelector('#import-trasa-btn');
  const apiKeyInput = root.querySelector('#google-api-key');
  const geocodeLimitInput = root.querySelector('#geocode-limit');
  const operationLogEl = root.querySelector('#operation-log');
  const importMetaEl = root.querySelector('#import-meta');
  const updaterDetailEl = root.querySelector('[data-updater-detail]');
  const updaterTestControlsEl = root.querySelector('[data-updater-test-controls]');
  const updaterTestNoteEl = root.querySelector('[data-updater-test-note]');
  let lastUpdaterState = null;
  let lastUpdaterLogKey = null;
  let runtimeMeta = {
    version: null,
    isDevMode: false
  };

  if (
    !accessPathEl ||
    !accessPasswordInput ||
    !passwordStatusEl ||
    !importStatusEl ||
    !apiKeyInput ||
    !importMetaEl
  ) {
    return null;
  }

  window.appApi.onUpdaterState((state) => {
    syncUpdaterControls(state);
    renderUpdaterDetails(state);
    appendUpdaterLog(state);
  });

  window.appApi.onOperationStatus((payload) => {
    if (payload?.summary) {
      renderSummary(payload.summary);
    }
    appendLog(payload?.message || 'Zdarzenie systemowe.');
  });

  checkBtn?.addEventListener('click', async () => {
    setButtonBusy(checkBtn, true, 'Sprawdzanie...');
    try {
      await window.appApi.checkNow();
    } catch (error) {
      appendLog(`Nie udalo sie sprawdzic aktualizacji: ${error.message}`);
    } finally {
      setButtonBusy(checkBtn, false);
      syncUpdaterControls();
    }
  });

  installBtn?.addEventListener('click', async () => {
    await window.appApi.installNow();
  });

  showUpdateMessageBtn?.addEventListener('click', async () => {
    try {
      await window.appApi.showUpdateAnnouncement();
    } catch (error) {
      appendLog(`Nie udalo sie otworzyc wiadomosci wersji: ${error.message}`);
    }
  });

  root.querySelectorAll('[data-updater-sim]').forEach((button) => {
    button.addEventListener('click', async () => {
      if (!runtimeMeta.isDevMode) {
        return;
      }

      const payload = {
        phase: button.dataset.updaterSim
      };
      const progressPercent = Number(button.dataset.updaterProgress);
      if (Number.isFinite(progressPercent)) {
        payload.progressPercent = progressPercent;
      }

      setButtonBusy(button, true, 'Symulacja...');
      try {
        await window.appApi.simulateUpdater(payload);
      } catch (error) {
        appendLog(`Nie udalo sie zasymulowac aktualizacji: ${error.message}`);
      } finally {
        setButtonBusy(button, false);
      }
    });
  });

  chooseFileBtn?.addEventListener('click', async () => {
    try {
      const result = await window.appApi.pickAccessFile();
      const pathValue = result?.accessDbPath || result?.summary?.settings?.accessDbPath || '';
      accessPathEl.textContent = summarizePath(pathValue);
      if (result?.summary) {
        renderSummary(result.summary);
      }
    } catch (error) {
      appendLog(`Nie udalo sie wybrac pliku Access: ${error.message}`);
    }
  });

  saveAccessPasswordBtn?.addEventListener('click', async () => {
    try {
      await persistAccessPassword({
        requireValue: true,
        button: saveAccessPasswordBtn,
        successMessage: 'Zapisano haslo Accessa.'
      });
    } catch (error) {
      appendLog(`Nie udalo sie zapisac hasla Accessa: ${error.message}`);
    }
  });

  saveApiKeyBtn?.addEventListener('click', async () => {
    setButtonBusy(saveApiKeyBtn, true, 'Zapisywanie...');
    try {
      const summary = await window.appApi.saveGoogleMapsApiKey(apiKeyInput.value);
      renderSummary(summary);
      appendLog('Zapisano klucz Google Maps API.');
    } catch (error) {
      appendLog(`Nie udalo sie zapisac klucza API: ${error.message}`);
    } finally {
      setButtonBusy(saveApiKeyBtn, false);
    }
  });

  exportTrasaBtn?.addEventListener('click', async () => {
    setButtonBusy(exportTrasaBtn, true, 'Eksport...');
    try {
      const result = await window.appApi.exportTrasaArchive({});
      if (!result) {
        appendLog('Eksport .trasa anulowany.');
        return;
      }
      renderSummary(result.summary);
      appendLog(`Wyeksportowano pakiet .trasa: ${result.outputPath}`);
    } catch (error) {
      appendLog(`Eksport .trasa nie powiodl sie: ${error.message}`);
    } finally {
      setButtonBusy(exportTrasaBtn, false);
    }
  });

  importTrasaBtn?.addEventListener('click', async () => {
    setButtonBusy(importTrasaBtn, true, 'Import...');
    try {
      const result = await window.appApi.importTrasaArchive();
      if (!result) {
        appendLog('Import .trasa anulowany.');
        return;
      }
      renderSummary(result.summary);
      setAccessPasswordStatus(Boolean(result.passwordConfigured));
      accessPasswordInput.value = '';
      apiKeyInput.value = result.summary?.settings?.googleMapsApiKey || '';
      appendLog('Pakiet .trasa zostal wczytany do aplikacji.');
    } catch (error) {
      appendLog(`Import .trasa nie powiodl sie: ${error.message}`);
    } finally {
      setButtonBusy(importTrasaBtn, false);
    }
  });

  importBtn?.addEventListener('click', async () => {
    setButtonBusy(importBtn, true, 'Import trwa...');
    try {
      await persistAccessPassword();
      const summary = await window.appApi.importAccessDatabase({});
      renderSummary(summary);
      appendLog('Import Access -> SQLite zakonczony.');
    } catch (error) {
      appendLog(`Import nie powiodl sie: ${error.message}`);
    } finally {
      setButtonBusy(importBtn, false);
    }
  });

  geocodeBtn?.addEventListener('click', async () => {
    setButtonBusy(geocodeBtn, true, 'Geokodowanie...');
    try {
      const payload = {
        apiKey: apiKeyInput.value,
        limit: Number(geocodeLimitInput?.value || 50)
      };
      const result = await window.appApi.runGeocoding(payload);
      renderSummary(result.summary);
      appendLog(
        `Geokodowanie zakonczone. Sukces: ${result.result.resolved}, bledy: ${result.result.failed}.`
      );
    } catch (error) {
      appendLog(`Geokodowanie nie powiodlo sie: ${error.message}`);
    } finally {
      setButtonBusy(geocodeBtn, false);
    }
  });

  void bootstrap();

  return {
    renderSummary,
    appendLog
  };

  async function bootstrap() {
    const data = bootstrapData || await window.appApi.getBootstrap();
    runtimeMeta = {
      version: data.version || null,
      isDevMode: data.isDevMode === true
    };
    if (updaterTestControlsEl) {
      updaterTestControlsEl.hidden = !runtimeMeta.isDevMode;
    }
    if (updaterTestNoteEl) {
      updaterTestNoteEl.hidden = !runtimeMeta.isDevMode;
    }
    syncUpdaterControls(data.updater);
    renderUpdaterDetails(data.updater);
    lastUpdaterLogKey = getUpdaterLogKey(data.updater);
    setAccessPasswordStatus(Boolean(data.passwordConfigured));
    apiKeyInput.value = data.summary?.settings?.googleMapsApiKey || '';
    if (!apiKeyInput.value && data.googleMapsConfigured) {
      apiKeyInput.placeholder = 'Klucz ladowany automatycznie z ~/secrets/google_maps_api';
    }
    renderSummary(data.summary);
    if (readyMessage) {
      appendLog(readyMessage);
    }
  }

  async function persistAccessPassword({ requireValue = false, button = null, successMessage = null } = {}) {
    const password = accessPasswordInput.value;
    if (!password.trim()) {
      if (requireValue) {
        throw new Error('Wpisz haslo Accessa przed zapisem.');
      }
      return null;
    }

    if (button) {
      setButtonBusy(button, true, 'Zapisywanie...');
    }

    try {
      const result = await window.appApi.saveAccessPassword(password);
      if (result?.summary) {
        renderSummary(result.summary);
      }
      setAccessPasswordStatus(Boolean(result?.passwordConfigured));
      accessPasswordInput.value = '';
      if (successMessage) {
        appendLog(successMessage);
      }
      return result;
    } finally {
      if (button) {
        setButtonBusy(button, false);
      }
    }
  }

  function setAccessPasswordStatus(isConfigured) {
    passwordStatusEl.textContent = isConfigured
      ? 'Haslo Accessa jest skonfigurowane.'
      : 'Brak hasla Accessa. Wpisz je ponizej.';

    accessPasswordInput.placeholder = isConfigured
      ? 'Haslo zapisane lokalnie. Wpisz nowe, aby nadpisac'
      : 'Wpisz haslo do pliku .accdb';
  }

  function syncUpdaterControls(state = lastUpdaterState) {
    lastUpdaterState = state || null;
    if (installBtn) {
      installBtn.disabled = !lastUpdaterState?.readyToInstall;
    }
    if (checkBtn) {
      checkBtn.disabled = ['checking', 'downloading', 'installing'].includes(lastUpdaterState?.phase);
    }
    if (showUpdateMessageBtn) {
      showUpdateMessageBtn.disabled = !lastUpdaterState?.announcementAvailable;
    }
  }

  function renderUpdaterDetails(state = lastUpdaterState) {
    if (!updaterDetailEl) {
      return;
    }

    const currentVersion = runtimeMeta.version ? `Aktualna wersja: ${runtimeMeta.version}.` : '';
    const devSuffix = runtimeMeta.isDevMode
      ? 'W npm run dev prawdziwy auto-update jest wylaczony, ale mozesz przetestowac ekran przyciskami powyzej.'
      : '';

    let details = 'Po wykryciu nowej wersji aplikacja pobierze ja automatycznie, a po zakonczeniu uruchomi instalacje i restart.';

    switch (state?.phase) {
      case 'checking':
        details = 'Trwa sprawdzanie GitHub Releases pod katem nowej wersji.';
        break;
      case 'downloading':
        details = state?.version
          ? `Wykryto nowa wersje ${state.version} i trwa jej pobieranie. Po zakonczeniu aplikacja sama uruchomi instalacje oraz restart.`
          : 'Trwa pobieranie nowej wersji aplikacji.';
        break;
      case 'downloaded':
        details = state?.version
          ? `Nowa wersja ${state.version} jest juz pobrana. Za chwile ruszy instalacja i restart, a lokalny import SQLite pozostanie zachowany.`
          : 'Aktualizacja jest juz pobrana i czeka na instalacje.';
        break;
      case 'installing':
        details = 'Instalacja aktualizacji jest w toku. Aplikacja za chwile uruchomi sie ponownie.';
        break;
      case 'up-to-date':
        details = 'Ta instalacja jest aktualna. Nic nie trzeba pobierac.';
        break;
      case 'error':
        details = state?.message || 'Nie udalo sie sprawdzic lub pobrac aktualizacji.';
        break;
      default:
        if (state?.announcementAvailable && state?.announcementVersion) {
          details = state.announcementHasSpecialMessage
            ? `Dostepna jest nowa wersja ${state.announcementVersion}. Popup pokazuje tez specjalna wiadomosc z opisu release.`
            : `Dostepna jest nowa wersja ${state.announcementVersion}. Popup pokaze zwykly komunikat bez dodatkowej wiadomosci.`;
        }
        break;
    }

    updaterDetailEl.textContent = [currentVersion, details, devSuffix].filter(Boolean).join(' ');
  }

  function appendUpdaterLog(state = lastUpdaterState) {
    const nextKey = getUpdaterLogKey(state);
    if (!nextKey || nextKey === lastUpdaterLogKey) {
      return;
    }

    lastUpdaterLogKey = nextKey;
    const message = getUpdaterLogMessage(state);
    if (message) {
      appendLog(message);
    }
  }

  function renderSummary(summary) {
    renderScopedSummary(root, summary);

    accessPathEl.textContent = summarizePath(summary?.settings?.accessDbPath || '');
    importStatusEl.textContent = summary?.importMeta?.imported_at
      ? `Ostatni import: ${formatDateTime(summary.importMeta.imported_at)}`
      : 'SQLite jest gotowe, ale baza Access nie zostala jeszcze zaimportowana.';

    importMetaEl.innerHTML = `
      <li><strong>Zrodlo:</strong> ${summarizePath(summary?.importMeta?.source_path || '')}</li>
      <li><strong>Tabele:</strong> ${summary?.stats?.totalTables || 0}</li>
      <li><strong>Wiersze:</strong> ${summary?.stats?.totalRows || 0}</li>
      <li><strong>Osoby:</strong> ${summary?.stats?.totalPeople || 0}</li>
      <li><strong>Karty serwisowe:</strong> ${summary?.stats?.totalServiceCards || 0}</li>
    `;

    onSummaryUpdated?.(summary);
  }

  function appendLog(message) {
    if (!operationLogEl) {
      return;
    }

    const item = document.createElement('li');
    item.textContent = `${new Date().toLocaleTimeString('pl-PL')}: ${message}`;
    operationLogEl.prepend(item);
    while (operationLogEl.children.length > 16) {
      operationLogEl.removeChild(operationLogEl.lastElementChild);
    }
  }

  function getUpdaterLogKey(state) {
    switch (state?.phase) {
      case 'checking':
      case 'up-to-date':
      case 'installing':
      case 'dismissed':
        return state.phase;
      case 'downloading':
      case 'downloaded':
        return `${state.phase}:${state.version || ''}`;
      case 'error':
        return `${state.phase}:${state.message || ''}`;
      default:
        return null;
    }
  }

  function getUpdaterLogMessage(state) {
    switch (state?.phase) {
      case 'checking':
        return 'Rozpoczeto sprawdzanie aktualizacji aplikacji.';
      case 'downloading':
        return state?.version
          ? `Znaleziono nowa wersje ${state.version}. Trwa pobieranie.`
          : 'Rozpoczeto pobieranie aktualizacji aplikacji.';
      case 'downloaded':
        return state?.version
          ? `Nowa wersja ${state.version} zostala pobrana. Za chwile rozpocznie sie instalacja.`
          : 'Aktualizacja zostala pobrana.';
      case 'installing':
        return 'Trwa instalacja aktualizacji i restart aplikacji.';
      case 'up-to-date':
        return 'Brak nowych aktualizacji aplikacji.';
      case 'dismissed':
      case 'error':
        return state?.message || 'Aktualizacja aplikacji zakonczona komunikatem systemowym.';
      default:
        return null;
    }
  }
}

function renderScopedSummary(root, summary) {
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
    root.querySelectorAll(`[data-stat="${key}"]`).forEach((target) => {
      target.textContent = formatNumber(value || 0);
    });
  });

  root.querySelectorAll('[data-imported-at]').forEach((target) => {
    target.textContent = summary?.importMeta?.imported_at
      ? formatDateTime(summary.importMeta.imported_at)
      : 'Jeszcze nie importowano';
  });

  root.querySelectorAll('[data-access-path]').forEach((target) => {
    target.textContent = summarizePath(summary?.settings?.accessDbPath || summary?.importMeta?.source_path);
  });
}
