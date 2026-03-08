import { applySummary, formatDateTime, initShell, setButtonBusy, summarizePath } from './app-shell.js';

initShell('dashboard');

const accessPathEl = document.getElementById('access-path');
const accessPasswordInput = document.getElementById('access-password');
const passwordStatusEl = document.getElementById('password-status');
const importStatusEl = document.getElementById('import-status');
const checkBtn = document.getElementById('check-btn');
const installBtn = document.getElementById('install-btn');
const chooseFileBtn = document.getElementById('choose-file-btn');
const saveAccessPasswordBtn = document.getElementById('save-access-password-btn');
const importBtn = document.getElementById('import-btn');
const geocodeBtn = document.getElementById('geocode-btn');
const saveApiKeyBtn = document.getElementById('save-api-key-btn');
const exportTrasaBtn = document.getElementById('export-trasa-btn');
const importTrasaBtn = document.getElementById('import-trasa-btn');
const apiKeyInput = document.getElementById('google-api-key');
const geocodeLimitInput = document.getElementById('geocode-limit');
const operationLogEl = document.getElementById('operation-log');
const importMetaEl = document.getElementById('import-meta');
let lastUpdaterState = null;

window.appApi.onUpdaterState((state) => {
  syncUpdaterControls(state);
});

window.appApi.onOperationStatus((payload) => {
  if (payload?.summary) {
    renderSummary(payload.summary);
  }
  appendLog(payload?.message || 'Zdarzenie systemowe.');
});

checkBtn.addEventListener('click', async () => {
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

installBtn.addEventListener('click', async () => {
  await window.appApi.installNow();
});

chooseFileBtn.addEventListener('click', async () => {
  const result = await window.appApi.pickAccessFile();
  const pathValue = result?.accessDbPath || result?.summary?.settings?.accessDbPath || '';
  accessPathEl.textContent = summarizePath(pathValue);
  if (result?.summary) {
    renderSummary(result.summary);
  }
});

saveAccessPasswordBtn.addEventListener('click', async () => {
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

saveApiKeyBtn.addEventListener('click', async () => {
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

exportTrasaBtn.addEventListener('click', async () => {
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

importTrasaBtn.addEventListener('click', async () => {
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

importBtn.addEventListener('click', async () => {
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

geocodeBtn.addEventListener('click', async () => {
  setButtonBusy(geocodeBtn, true, 'Geokodowanie...');
  try {
    const payload = {
      apiKey: apiKeyInput.value,
      limit: Number(geocodeLimitInput.value || 50)
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

bootstrap();

async function bootstrap() {
  const bootstrapData = await window.appApi.getBootstrap();
  syncUpdaterControls(bootstrapData.updater);
  setAccessPasswordStatus(Boolean(bootstrapData.passwordConfigured));
  apiKeyInput.value = bootstrapData.summary?.settings?.googleMapsApiKey || '';
  if (!apiKeyInput.value && bootstrapData.googleMapsConfigured) {
    apiKeyInput.placeholder = 'Klucz ladowany automatycznie z ~/secrets/google_maps_api';
  }
  renderSummary(bootstrapData.summary);
  appendLog('Aplikacja gotowa do pracy.');
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
  installBtn.disabled = !lastUpdaterState?.readyToInstall;
  checkBtn.disabled = ['checking', 'downloading', 'installing'].includes(lastUpdaterState?.phase);
}

function renderSummary(summary) {
  applySummary(summary);

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
}

function appendLog(message) {
  const item = document.createElement('li');
  item.textContent = `${new Date().toLocaleTimeString('pl-PL')}: ${message}`;
  operationLogEl.prepend(item);
  while (operationLogEl.children.length > 16) {
    operationLogEl.removeChild(operationLogEl.lastElementChild);
  }
}
