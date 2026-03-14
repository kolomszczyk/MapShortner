const { spawnSync } = require('node:child_process');

const BRIDGE_NAME = 'accessbrigeladkfjlakgj';
const POWERSHELL_TIMEOUT_MS = 9000;

function escapePowerShellSingleQuoted(value) {
  return String(value || '').replaceAll("'", "''");
}

function normalizeBridgeResult(result = {}) {
  const status = String(result?.status || '').trim().toLowerCase();
  const code = String(result?.code || '').trim().toLowerCase();
  const message = String(result?.message || '').trim();

  return {
    ok: status === 'ok',
    status: status || 'error',
    code: code || 'bridge-failure',
    message: message || 'Bridge nie zwrocil poprawnej odpowiedzi.',
    bridgeName: BRIDGE_NAME
  };
}

function parseBridgeStdout(stdout = '') {
  const lines = String(stdout || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .reverse();

  for (const line of lines) {
    if (!line.startsWith('{') || !line.endsWith('}')) {
      continue;
    }

    try {
      const payload = JSON.parse(line);
      return normalizeBridgeResult(payload);
    } catch (_error) {
      continue;
    }
  }

  return null;
}

function runWindowsAccessBridge({ sourceRowId, expectedDbPath } = {}) {
  const normalizedSourceRowId = String(sourceRowId || '').trim();
  const escapedSourceRowId = escapePowerShellSingleQuoted(normalizedSourceRowId);
  const escapedExpectedDbPath = escapePowerShellSingleQuoted(String(expectedDbPath || '').trim());

  const psScript = `
$ErrorActionPreference = 'Stop'

function Emit-BridgeResult([string]$status, [string]$code, [string]$message) {
  $payload = @{
    status = $status
    code = $code
    message = $message
  }
  [Console]::Out.WriteLine(($payload | ConvertTo-Json -Compress))
  exit 0
}

if ([string]::IsNullOrWhiteSpace('${escapedSourceRowId}')) {
  Emit-BridgeResult 'error' 'missing-person' 'Brak identyfikatora osoby do otwarcia.'
}

$accessProcesses = @(Get-Process -Name 'MSACCESS' -ErrorAction SilentlyContinue)
if ($accessProcesses.Count -eq 0) {
  Emit-BridgeResult 'error' 'no-instance' 'Brak uruchomionej instancji Accessa.'
}

$visibleAccessProcesses = @($accessProcesses | Where-Object { $_.MainWindowHandle -ne 0 })
if ($visibleAccessProcesses.Count -gt 1) {
  Emit-BridgeResult 'error' 'multiple-instances' 'Wykryto wiecej niz jedna instancje Accessa.'
}

try {
  $accessApp = [Runtime.InteropServices.Marshal]::GetActiveObject('Access.Application')
} catch {
  Emit-BridgeResult 'error' 'no-instance' 'Nie mozna podlaczyc sie do uruchomionego Accessa.'
}

if ($null -eq $accessApp) {
  Emit-BridgeResult 'error' 'no-instance' 'Nie znaleziono aktywnej instancji Accessa.'
}

$expectedDbPath = '${escapedExpectedDbPath}'
if (-not [string]::IsNullOrWhiteSpace($expectedDbPath)) {
  try {
    $currentDbPath = [string]$accessApp.CurrentDb().Name
  } catch {
    Emit-BridgeResult 'error' 'no-response' 'Access nie udostepnia aktualnej bazy danych.'
  }

  if (-not [string]::IsNullOrWhiteSpace($currentDbPath)) {
    $normalizedCurrent = [System.IO.Path]::GetFullPath($currentDbPath).ToLowerInvariant()
    $normalizedExpected = [System.IO.Path]::GetFullPath($expectedDbPath).ToLowerInvariant()
    if ($normalizedCurrent -ne $normalizedExpected) {
      Emit-BridgeResult 'error' 'database-mismatch' 'Uruchomiony Access jest podlaczony do innej bazy danych.'
    }
  }
}

try {
  $runResult = $accessApp.Run('OpenEntity', 'osoba', '${escapedSourceRowId}')
} catch {
  Emit-BridgeResult 'error' 'no-response' 'Access nie odpowiedzial na wywolanie OpenEntity.'
}

$ack = ''
if ($null -ne $runResult) {
  $ack = [string]$runResult
}
$normalizedAck = $ack.Trim().ToLowerInvariant()

if ([string]::IsNullOrWhiteSpace($normalizedAck)) {
  Emit-BridgeResult 'error' 'no-response' 'Access nie zwrocil potwierdzenia otwarcia.'
}

if ($normalizedAck.StartsWith('ok')) {
  Emit-BridgeResult 'ok' 'ok' 'Rekord zostal otwarty w Accessie.'
}

if ($normalizedAck.StartsWith('not-found')) {
  Emit-BridgeResult 'error' 'not-found' 'Access nie znalazl wskazanego rekordu.'
}

if ($normalizedAck.StartsWith('error:form-not-found')) {
  Emit-BridgeResult 'error' 'form-not-found' 'Access nie znalazl oczekiwanego formularza.'
}

Emit-BridgeResult 'error' 'no-response' ('Nieznana odpowiedz Accessa: ' + $ack)
`;

  const bridgeExec = spawnSync(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', psScript],
    {
      encoding: 'utf8',
      timeout: POWERSHELL_TIMEOUT_MS,
      maxBuffer: 1024 * 1024
    }
  );

  if (bridgeExec.error) {
    if (bridgeExec.error.code === 'ETIMEDOUT') {
      return normalizeBridgeResult({
        status: 'error',
        code: 'no-response',
        message: 'Bridge Accessa przekroczyl limit czasu odpowiedzi.'
      });
    }

    return normalizeBridgeResult({
      status: 'error',
      code: 'bridge-failure',
      message: `Nie udalo sie uruchomic bridge: ${bridgeExec.error.message}`
    });
  }

  const parsedResult = parseBridgeStdout(bridgeExec.stdout);
  if (parsedResult) {
    return parsedResult;
  }

  const stderrMessage = String(bridgeExec.stderr || '').trim();
  return normalizeBridgeResult({
    status: 'error',
    code: 'bridge-failure',
    message: stderrMessage || 'Bridge Accessa nie zwrocil poprawnego JSON.'
  });
}

function openPersonInRunningAccessBridge(payload = {}) {
  if (process.platform !== 'win32') {
    return normalizeBridgeResult({
      status: 'error',
      code: 'unsupported-platform',
      message: 'Integracja z Accessem jest dostepna tylko w systemie Windows.'
    });
  }

  return runWindowsAccessBridge(payload);
}

module.exports = {
  BRIDGE_NAME,
  openPersonInRunningAccessBridge
};
