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
  const tileZ12RadiusKmInput = root.querySelector('#tile-z12-radius-km');
  const tileZ14RadiusKmInput = root.querySelector('#tile-z14-radius-km');
  const tileZ16RadiusMetersInput = root.querySelector('#tile-z16-radius-meters');
  const tileZ18RadiusMetersInput = root.querySelector('#tile-z18-radius-meters');
  const tileIncludePolandBaseInput = root.querySelector('#tile-include-poland-base');
  const tileIncludeWorldBaseInput = root.querySelector('#tile-include-world-base');
  const tileAutoDownloadInput = root.querySelector('#tile-auto-download');
  const tileSimulateNoInternetInput = root.querySelector('#tile-simulate-no-internet');
  const tileDownloadConcurrencyInput = root.querySelector('#tile-download-concurrency');
  const tileDownloadSaveBtn = root.querySelector('#tile-download-save-btn');
  const tileDownloadResetBtn = root.querySelector('#tile-download-reset-btn');
  const tileDownloadRefreshBtn = root.querySelector('#tile-download-refresh-btn');
  const tileDownloadStartBtn = root.querySelector('#tile-download-start-btn');
  const tileRefreshDownloadBtn = root.querySelector('#tile-refresh-download-btn');
  const tileDownloadPauseBtn = root.querySelector('#tile-download-pause-btn');
  const tileDeletePackageBtn = root.querySelector('#tile-delete-package-btn');
  const tileDeleteExtraBtn = root.querySelector('#tile-delete-extra-btn');
  const tileDownloadPhaseEls = root.querySelectorAll('[data-tile-download-phase]');
  const tileDownloadProgressEls = root.querySelectorAll('[data-tile-download-progress]');
  const tileDownloadSpeedEls = root.querySelectorAll('[data-tile-download-speed]');
  const tileDownloadCountsEls = root.querySelectorAll('[data-tile-download-counts]');
  const tileDownloadPointsEls = root.querySelectorAll('[data-tile-download-points]');
  const tileDownloadEstimateEls = root.querySelectorAll('[data-tile-download-estimate]');
  const tileDownloadPackageEls = root.querySelectorAll('[data-tile-download-package]');
  const tileDownloadExtraEls = root.querySelectorAll('[data-tile-download-extra]');
  const tileDownloadTotalDiskEls = root.querySelectorAll('[data-tile-download-total-disk]');
  const tileDownloadPlanEls = root.querySelectorAll('[data-tile-download-plan]');
  const tileDownloadErrorEls = root.querySelectorAll('[data-tile-download-error]');
  const tilePackageUpdatedAtEls = root.querySelectorAll('[data-tile-package-updated-at]');
  const tilePackageNextRefreshEls = root.querySelectorAll('[data-tile-package-next-refresh]');
  const tileRefreshStatusEls = root.querySelectorAll('[data-tile-refresh-status]');
  const tileRefreshProgressEls = root.querySelectorAll('[data-tile-refresh-progress]');
  let lastUpdaterState = null;
  let lastUpdaterLogKey = null;
  let lastTileDownloadPayload = null;
  let operationLogEntries = [];
  let operationLogEntryIds = new Set();
  let localOperationLogEntrySequence = 0;
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
  });

  window.appApi.onOperationLogEntry((entry) => {
    appendOperationLogEntry(entry);
  });

  if (hasTileDownloadSection()) {
    window.appApi.onTileDownloadState((payload) => {
      renderTileDownloadSection(payload);
    });
  }

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
      if (button.dataset.updaterTitle) {
        payload.title = button.dataset.updaterTitle;
      }
      if (button.dataset.updaterMessage) {
        payload.announcementMessage = button.dataset.updaterMessage;
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

  tileDownloadSaveBtn?.addEventListener('click', async () => {
    await persistTileDownloadSettings({
      button: tileDownloadSaveBtn,
      successMessage: 'Zapisano ustawienia pobierania map offline.'
    });
  });

  tileDownloadResetBtn?.addEventListener('click', async () => {
    const confirmed = await showStyledConfirmDialog({
      title: 'Przywrocic domyslne?',
      message: 'Czy na pewno chcesz przywrocic domyslne ustawienia pobierania offline?',
      confirmLabel: 'Przywroc'
    });
    if (!confirmed) {
      return;
    }

    setButtonBusy(tileDownloadResetBtn, true, 'Przywracanie...');
    try {
      const result = await window.appApi.resetTileDownloadSettings();
      renderTileDownloadSection(result);
      appendLog('Przywrocono domyslne ustawienia pobierania map offline.');
    } catch (error) {
      appendLog(`Nie udalo sie przywrocic domyslnych ustawien offline: ${error.message}`);
    } finally {
      setButtonBusy(tileDownloadResetBtn, false);
      syncTileDownloadControls();
    }
  });

  tileDownloadRefreshBtn?.addEventListener('click', async () => {
    await persistTileDownloadSettings({
      button: tileDownloadRefreshBtn,
      successMessage: 'Przeliczono stan pobierania map offline.'
    });
  });

  tileDownloadStartBtn?.addEventListener('click', async () => {
    await persistTileDownloadSettings({
      button: tileDownloadStartBtn,
      successMessage: null,
      skipAutoStart: true
    });
    setButtonBusy(tileDownloadStartBtn, true, 'Pobieranie...');
    try {
      const result = await window.appApi.startTileDownload();
      renderTileDownloadSection(result);
      appendLog('Uruchomiono pobieranie kafelkow offline.');
    } catch (error) {
      appendLog(`Nie udalo sie uruchomic pobierania kafelkow: ${error.message}`);
    } finally {
      setButtonBusy(tileDownloadStartBtn, false);
      syncTileDownloadControls();
    }
  });

  tileRefreshDownloadBtn?.addEventListener('click', async () => {
    await persistTileDownloadSettings({
      button: tileRefreshDownloadBtn,
      successMessage: null,
      skipAutoStart: true
    });
    setButtonBusy(tileRefreshDownloadBtn, true, 'Nowa wersja...');
    try {
      const result = await window.appApi.startTileRefreshDownload();
      renderTileDownloadSection(result);
      appendLog('Uruchomiono pobieranie nowej wersji mapy offline.');
    } catch (error) {
      appendLog(`Nie udalo sie uruchomic pobierania nowej wersji mapy: ${error.message}`);
    } finally {
      setButtonBusy(tileRefreshDownloadBtn, false);
      syncTileDownloadControls();
    }
  });

  tileDownloadPauseBtn?.addEventListener('click', async () => {
    setButtonBusy(tileDownloadPauseBtn, true, 'Zatrzymywanie...');
    try {
      const result = await window.appApi.pauseTileDownload();
      renderTileDownloadSection(result);
      appendLog('Wyslano zadanie zatrzymania pobierania kafelkow.');
    } catch (error) {
      appendLog(`Nie udalo sie zatrzymac pobierania kafelkow: ${error.message}`);
    } finally {
      setButtonBusy(tileDownloadPauseBtn, false);
      syncTileDownloadControls();
    }
  });

  tileDeletePackageBtn?.addEventListener('click', async () => {
    const confirmed = await showStyledConfirmDialog({
      title: 'Usunac paczke?',
      message: 'Czy na pewno chcesz usunac aktualna paczke offline?',
      confirmLabel: 'Usun'
    });
    if (!confirmed) {
      return;
    }

    setButtonBusy(tileDeletePackageBtn, true, 'Usuwanie...');
    try {
      const result = await window.appApi.deleteOfflinePackageTiles();
      renderTileDownloadSection(result);
      appendLog(
        result?.removedTiles > 0
          ? `Usunieto paczke offline: ${formatNumber(result.removedTiles)} kafelkow.`
          : 'Aktualna paczka offline nie miala zapisanych kafelkow.'
      );
    } catch (error) {
      appendLog(`Nie udalo sie usunac paczki offline: ${error.message}`);
    } finally {
      setButtonBusy(tileDeletePackageBtn, false);
      syncTileDownloadControls();
    }
  });

  tileDeleteExtraBtn?.addEventListener('click', async () => {
    const confirmed = await showStyledConfirmDialog({
      title: 'Usunac dodatkowe?',
      message: 'Czy na pewno chcesz usunac dodatkowe kafelki poza aktualnym planem offline?',
      confirmLabel: 'Usun'
    });
    if (!confirmed) {
      return;
    }

    setButtonBusy(tileDeleteExtraBtn, true, 'Usuwanie...');
    try {
      const result = await window.appApi.deleteExtraCachedTiles();
      renderTileDownloadSection(result);
      appendLog(
        result?.removedTiles > 0
          ? `Usunieto dodatkowe kafelki: ${formatNumber(result.removedTiles)}.`
          : 'Brak dodatkowych kafelkow do usuniecia.'
      );
    } catch (error) {
      appendLog(`Nie udalo sie usunac dodatkowych kafelkow: ${error.message}`);
    } finally {
      setButtonBusy(tileDeleteExtraBtn, false);
      syncTileDownloadControls();
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
    renderOperationLogHistory(data.operationLogHistory);
    setAccessPasswordStatus(Boolean(data.passwordConfigured));
    apiKeyInput.value = data.summary?.settings?.googleMapsApiKey || '';
    if (!apiKeyInput.value && data.googleMapsConfigured) {
      apiKeyInput.placeholder = 'Klucz ladowany automatycznie z ~/secrets/google_maps_api';
    }
    renderSummary(data.summary);
    if (hasTileDownloadSection()) {
      try {
        renderTileDownloadSection(await window.appApi.getTileDownloadState());
      } catch (_error) {
        renderTileDownloadSection(data.summary?.offlineTiles);
      }
    }
    if (readyMessage) {
      appendLog(readyMessage, { persist: false });
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

  async function persistTileDownloadSettings({ button = null, successMessage = null, skipAutoStart = false } = {}) {
    if (!hasTileDownloadSection()) {
      return null;
    }

    if (button) {
      setButtonBusy(button, true, 'Zapisywanie...');
    }

    try {
      const result = await window.appApi.saveTileDownloadSettings({
        ...readTileDownloadSettingsForm(),
        skipAutoStart
      });
      renderTileDownloadSection(result);
      if (successMessage) {
        appendLog(successMessage);
      }
      return result;
    } finally {
      if (button) {
        setButtonBusy(button, false);
      }
      syncTileDownloadControls();
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
    renderTileDownloadSection(summary?.offlineTiles);

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

  function hasTileDownloadSection() {
    return Boolean(
      tileZ12RadiusKmInput &&
      tileZ14RadiusKmInput &&
      tileZ16RadiusMetersInput &&
      tileZ18RadiusMetersInput &&
      tileDownloadConcurrencyInput
    );
  }

  function readTileDownloadSettingsForm() {
    return {
      z12RadiusKm: Number(tileZ12RadiusKmInput?.value || 0),
      z14RadiusKm: Number(tileZ14RadiusKmInput?.value || 0),
      z16RadiusMeters: Number(tileZ16RadiusMetersInput?.value || 0) * 1000,
      z18RadiusMeters: Number(tileZ18RadiusMetersInput?.value || 0) * 1000,
      includePolandBase: tileIncludePolandBaseInput?.checked === true,
      includeWorldBase: tileIncludeWorldBaseInput?.checked === true,
      autoDownload: tileAutoDownloadInput?.checked === true,
      simulateNoInternet: tileSimulateNoInternetInput?.checked === true,
      concurrency: Number(tileDownloadConcurrencyInput?.value || 4)
    };
  }

  function renderTileDownloadSection(payload = null) {
    if (!hasTileDownloadSection() || !payload) {
      return;
    }

    lastTileDownloadPayload = payload;
    const settings = payload?.settings || {};
    const state = payload?.state || payload?.download || {};
    const packageState = payload?.packageState || {};
    const refreshState = packageState.refresh || {};
    const totalTiles = Number(state.totalTiles || 0);
    const downloadedTiles = Number(state.downloadedTiles || 0);
    const failedTiles = Number(state.failedTiles || 0);
    const progressPercent = totalTiles > 0 ? Math.min(100, (downloadedTiles / totalTiles) * 100) : 0;
    const refreshTotalTiles = Number(refreshState.totalTiles || 0);
    const refreshDownloadedTiles = Number(refreshState.downloadedTiles || 0);
    const refreshProgressPercent = refreshTotalTiles > 0
      ? Math.min(100, (refreshDownloadedTiles / refreshTotalTiles) * 100)
      : 0;
    const planSummary = state.planSummary || null;
    const countsByZoom = planSummary?.countsByZoom || {};
    const planName = String(planSummary?.planName || '').trim();
    const estimatedTotalBytes = Number(planSummary?.estimatedTotalBytes || 0);
    const actualPackageBytes = Number(planSummary?.actualPackageBytes || 0);
    const extraCachedBytes = Number(planSummary?.extraCachedBytes || 0);
    const totalCachedBytes = Number(planSummary?.totalCachedBytes || 0);
    const planLabel = totalTiles > 0
      ? [
          planName || null,
          countsByZoom[12] ? `z12: ${formatNumber(countsByZoom[12])}` : null,
          countsByZoom[14] ? `z14: ${formatNumber(countsByZoom[14])}` : null,
          countsByZoom[16] ? `z16: ${formatNumber(countsByZoom[16])}` : null,
          countsByZoom[18] ? `z18: ${formatNumber(countsByZoom[18])}` : null,
          ...Object.keys(countsByZoom)
            .map((zoomKey) => Number.parseInt(zoomKey, 10))
            .filter((zoom) => ![12, 14, 16, 18].includes(zoom))
            .sort((left, right) => left - right)
            .map((zoom) => `z${zoom}: ${formatNumber(countsByZoom[zoom])}`)
        ].filter(Boolean).join(' | ')
      : 'Brak wyliczen';
    const estimateLabel = formatBytes(estimatedTotalBytes);
    const packageLabel = formatBytes(actualPackageBytes);
    const extraLabel = formatBytes(extraCachedBytes);
    const totalDiskLabel = formatBytes(totalCachedBytes);

    tileZ12RadiusKmInput.value = stringifySettingValue(settings.z12RadiusKm, 1);
    tileZ14RadiusKmInput.value = stringifySettingValue(settings.z14RadiusKm, 1);
    tileZ16RadiusMetersInput.value = stringifySettingValue((settings.z16RadiusMeters || 0) / 1000, 2);
    tileZ18RadiusMetersInput.value = stringifySettingValue((settings.z18RadiusMeters || 0) / 1000, 2);
    if (tileIncludePolandBaseInput) {
      tileIncludePolandBaseInput.checked = settings.includePolandBase === true;
    }
    if (tileIncludeWorldBaseInput) {
      tileIncludeWorldBaseInput.checked = settings.includeWorldBase === true;
    }
    if (tileAutoDownloadInput) {
      tileAutoDownloadInput.checked = settings.autoDownload !== false;
    }
    if (tileSimulateNoInternetInput) {
      tileSimulateNoInternetInput.checked = settings.simulateNoInternet === true;
    }
    tileDownloadConcurrencyInput.value = stringifySettingValue(settings.concurrency, 0);

    tileDownloadPhaseEls.forEach((target) => {
      target.textContent = formatTileDownloadPhaseLabel(state.phase);
    });
    tileDownloadProgressEls.forEach((target) => {
      target.textContent = `${formatDecimal(progressPercent, 1)}%`;
    });
    tileDownloadSpeedEls.forEach((target) => {
      target.textContent = formatTileDownloadSpeedLabel(state, {
        totalTiles,
        downloadedTiles
      });
    });
    tileDownloadCountsEls.forEach((target) => {
      target.textContent = `${formatNumber(downloadedTiles)} / ${formatNumber(totalTiles)}`;
    });
    tileDownloadPointsEls.forEach((target) => {
      target.textContent = formatNumber(planSummary?.pointsCount || 0);
    });
    tileDownloadEstimateEls.forEach((target) => {
      target.textContent = estimateLabel;
    });
    tileDownloadPackageEls.forEach((target) => {
      target.textContent = packageLabel;
    });
    tileDownloadExtraEls.forEach((target) => {
      target.textContent = extraLabel;
    });
    tileDownloadTotalDiskEls.forEach((target) => {
      target.textContent = totalDiskLabel;
    });
    tileDownloadPlanEls.forEach((target) => {
      target.textContent = planLabel;
    });
    tileDownloadErrorEls.forEach((target) => {
      target.textContent = state.lastError
        ? `${state.lastError}${failedTiles > 0 ? ` (${formatNumber(failedTiles)} bledow)` : ''}`
        : (failedTiles > 0 ? `${formatNumber(failedTiles)} bledow bez aktywnego komunikatu` : 'Brak');
    });
    tilePackageUpdatedAtEls.forEach((target) => {
      target.textContent = packageState.activePackageUpdatedAt
        ? `Rev ${formatNumber(packageState.activeRevision || 1)} | ${formatDateTime(packageState.activePackageUpdatedAt)}`
        : 'Brak aktywnej paczki';
    });
    tilePackageNextRefreshEls.forEach((target) => {
      target.textContent = formatTilePackageNextRefreshLabel(packageState);
    });
    tileRefreshStatusEls.forEach((target) => {
      target.textContent = formatTileRefreshPhaseLabel(refreshState.phase, packageState);
    });
    tileRefreshProgressEls.forEach((target) => {
      target.textContent = `${formatDecimal(refreshProgressPercent, 1)}% | ${formatNumber(refreshDownloadedTiles)} / ${formatNumber(refreshTotalTiles)}`;
    });

    syncTileDownloadControls(state, refreshState);
  }

  function syncTileDownloadControls(
    state = lastTileDownloadPayload?.state || null,
    refreshState = lastTileDownloadPayload?.packageState?.refresh || null
  ) {
    if (!hasTileDownloadSection()) {
      return;
    }

    const phase = state?.phase || 'idle';
    const refreshPhase = refreshState?.phase || 'idle';
    const isDownloading = phase === 'downloading' || phase === 'pausing';
    const isRefreshing = refreshPhase === 'downloading' || refreshPhase === 'switching';
    if (tileDownloadStartBtn) {
      tileDownloadStartBtn.disabled = isDownloading || isRefreshing;
    }
    if (tileRefreshDownloadBtn) {
      tileRefreshDownloadBtn.disabled = isDownloading || isRefreshing;
    }
    if (tileDownloadPauseBtn) {
      tileDownloadPauseBtn.disabled = !(isDownloading || isRefreshing);
    }
    if (tileDownloadResetBtn) {
      tileDownloadResetBtn.disabled = isDownloading || isRefreshing;
    }
    if (tileDeletePackageBtn) {
      tileDeletePackageBtn.disabled = isDownloading || isRefreshing;
    }
    if (tileDeleteExtraBtn) {
      tileDeleteExtraBtn.disabled = isDownloading || isRefreshing;
    }
  }

  function formatTileDownloadSpeedLabel(state = {}, metrics = {}) {
    const speedBps = Number(state.speedBps || 0);
    if (speedBps > 0) {
      return `${formatBytes(speedBps)}/s`;
    }
    return '0 B/s';
  }

  function formatTilePackageNextRefreshLabel(packageState = {}) {
    if (!packageState?.activePackageUpdatedAt || !packageState?.nextRefreshDueAt) {
      return 'Brak harmonogramu';
    }

    if (packageState.isRefreshDue) {
      return `Do odswiezenia od ${formatDateTime(packageState.nextRefreshDueAt)}`;
    }

    return formatDateTime(packageState.nextRefreshDueAt);
  }

  function formatTileRefreshPhaseLabel(phase, packageState = {}) {
    switch (phase) {
      case 'downloading':
        return 'Pobieranie nowej wersji';
      case 'switching':
        return 'Automatyczne przelaczanie';
      case 'paused':
        return 'Pobieranie wstrzymane';
      case 'failed':
        return packageState?.refresh?.lastError || 'Blad odswiezania';
      case 'completed':
        return packageState?.lastRefreshCompletedAt
          ? `Aktywna od ${formatDateTime(packageState.lastRefreshCompletedAt)}`
          : 'Nowa wersja gotowa';
      default:
        return packageState?.isRefreshDue ? 'Nowa wersja czeka na pobranie' : 'Brak aktywnego odswiezania';
    }
  }

  function renderOperationLogHistory(entries = []) {
    const historyEntries = Array.isArray(entries) ? entries : [];
    const mergedEntries = dedupeOperationLogEntries([
      ...operationLogEntries,
      ...historyEntries
    ]);

    operationLogEntries = [];
    operationLogEntryIds = new Set();

    if (operationLogEl) {
      operationLogEl.replaceChildren();
    }

    for (const entry of mergedEntries) {
      appendOperationLogEntry(entry, { prepend: false });
    }
  }

  function appendOperationLogEntry(entry, options = {}) {
    const normalizedEntry = normalizeOperationLogEntry(entry);
    if (!normalizedEntry || operationLogEntryIds.has(normalizedEntry.id)) {
      return;
    }

    operationLogEntryIds.add(normalizedEntry.id);
    if (options.prepend === false) {
      operationLogEntries.push(normalizedEntry);
    } else {
      operationLogEntries.unshift(normalizedEntry);
    }
    if (operationLogEntries.length > 300) {
      const removedEntries = operationLogEntries.splice(300);
      for (const removedEntry of removedEntries) {
        operationLogEntryIds.delete(removedEntry.id);
      }
    }

    if (!operationLogEl) {
      return;
    }

    const item = document.createElement('li');
    item.textContent = `${formatDateTime(normalizedEntry.createdAt)}: ${normalizedEntry.message}`;
    if (options.prepend === false) {
      operationLogEl.append(item);
    } else {
      operationLogEl.prepend(item);
    }
    while (operationLogEl.children.length > 300) {
      operationLogEl.removeChild(operationLogEl.lastElementChild);
    }
  }

  function appendLog(message, options = {}) {
    const normalizedMessage = String(message || '').trim();
    if (!normalizedMessage) {
      return;
    }

    if (options.persist === false) {
      appendOperationLogEntry({
        id: buildLocalOperationLogEntryId(),
        createdAt: new Date().toISOString(),
        message: normalizedMessage
      });
      return;
    }

    void window.appApi.addOperationLogEntry({
      message: normalizedMessage
    }).catch((error) => {
      console.error('Failed to persist operation log entry', error);
      appendOperationLogEntry({
        id: buildLocalOperationLogEntryId(),
        createdAt: new Date().toISOString(),
        message: normalizedMessage
      });
    });
  }

  function buildLocalOperationLogEntryId() {
    localOperationLogEntrySequence += 1;
    return `local-${Date.now().toString(36)}-${localOperationLogEntrySequence.toString(36)}`;
  }

  function normalizeOperationLogEntry(entry) {
    const message = String(entry?.message || '').trim();
    if (!message) {
      return null;
    }

    return {
      id: String(entry?.id || buildLocalOperationLogEntryId()),
      createdAt: String(entry?.createdAt || '').trim() || new Date().toISOString(),
      message
    };
  }

  function dedupeOperationLogEntries(entries) {
    const uniqueEntries = [];
    const seenEntryIds = new Set();

    for (const entry of entries) {
      const normalizedEntry = normalizeOperationLogEntry(entry);
      if (!normalizedEntry || seenEntryIds.has(normalizedEntry.id)) {
        continue;
      }

      seenEntryIds.add(normalizedEntry.id);
      uniqueEntries.push(normalizedEntry);

      if (uniqueEntries.length >= 300) {
        break;
      }
    }

    return uniqueEntries;
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

  function showStyledConfirmDialog({ title = 'Potwierdzenie', message = '', confirmLabel = 'Potwierdz' } = {}) {
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.className = 'time-color-confirm-overlay';
      overlay.style.inset = '0';
      overlay.innerHTML = `
        <div class="time-color-confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="dashboard-confirm-title">
          <strong id="dashboard-confirm-title">${escapeHtml(title)}</strong>
          <p>${escapeHtml(message)}</p>
          <div class="time-color-confirm-actions">
            <button type="button" class="button-muted" data-dashboard-confirm-cancel>Anuluj</button>
            <button type="button" class="button-strong" data-dashboard-confirm-accept>${escapeHtml(confirmLabel)}</button>
          </div>
        </div>
      `;

      const confirmButton = overlay.querySelector('[data-dashboard-confirm-accept]');
      const cancelButton = overlay.querySelector('[data-dashboard-confirm-cancel]');

      const cleanup = (result) => {
        document.removeEventListener('keydown', handleKeydown);
        overlay.remove();
        resolve(result);
      };

      const handleKeydown = (event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          cleanup(false);
        }
      };

      overlay.addEventListener('click', (event) => {
        if (event.target === overlay) {
          cleanup(false);
        }
      });

      cancelButton?.addEventListener('click', () => cleanup(false));
      confirmButton?.addEventListener('click', () => cleanup(true));
      document.addEventListener('keydown', handleKeydown);
      document.body.appendChild(overlay);
      confirmButton?.focus();
    });
  }
}

function stringifySettingValue(value, fractionDigits = 0) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return '';
  }
  return fractionDigits > 0 ? numericValue.toFixed(fractionDigits) : String(Math.round(numericValue));
}

function formatTileDownloadPhaseLabel(phase) {
  switch (phase) {
    case 'downloading':
      return 'Pobieranie';
    case 'pausing':
      return 'Zatrzymywanie';
    case 'paused':
      return 'Wstrzymane';
    case 'completed':
      return 'Kompletne';
    case 'error':
      return 'Blad';
    default:
      return 'Gotowe';
  }
}

function formatBytes(bytes) {
  const numericValue = Number(bytes || 0);
  if (!Number.isFinite(numericValue) || numericValue <= 0) {
    return '0 B';
  }

  const units = ['B', 'KB', 'MB', 'GB'];
  let unitIndex = 0;
  let value = numericValue;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  const precision = value >= 100 || unitIndex === 0 ? 0 : 1;
  return `${value.toFixed(precision)} ${units[unitIndex]}`;
}

function formatDecimal(value, fractionDigits = 1) {
  const numericValue = Number(value || 0);
  if (!Number.isFinite(numericValue)) {
    return '0';
  }

  return new Intl.NumberFormat('pl-PL', {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits
  }).format(numericValue);
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
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
