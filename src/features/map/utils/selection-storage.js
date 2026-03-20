export function readLastSelectedPersonId(storageKey) {
  try {
    return window.localStorage.getItem(storageKey);
  } catch (_error) {
    return null;
  }
}

export function saveLastSelectedPersonId(storageKey, sourceRowId) {
  if (!sourceRowId) {
    return;
  }

  try {
    window.localStorage.setItem(storageKey, sourceRowId);
  } catch (_error) {
    // Ignore storage failures and keep the current session working.
  }
}

export function readLastSelectedPersonRestoreState(storageKey) {
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw);
    const sourceRowId = String(parsed?.sourceRowId || '').trim();
    if (!sourceRowId) {
      return null;
    }

    return {
      sourceRowId,
      preferPersonDetails: parsed?.preferPersonDetails === true
    };
  } catch (_error) {
    return null;
  }
}

export function saveLastSelectedPersonRestoreState(storageKey, sourceRowId, preferPersonDetails) {
  const normalizedSourceRowId = String(sourceRowId || '').trim();
  if (!normalizedSourceRowId) {
    return;
  }

  try {
    window.localStorage.setItem(
      storageKey,
      JSON.stringify({
        sourceRowId: normalizedSourceRowId,
        preferPersonDetails: preferPersonDetails === true
      })
    );
  } catch (_error) {
    // Ignore storage failures and keep the current session working.
  }
}

export function saveLastSelectedPersonDetails(storageKey, details) {
  if (!details?.person?.sourceRowId) {
    return;
  }

  try {
    window.localStorage.setItem(storageKey, JSON.stringify(details));
  } catch (_error) {
    // Ignore storage failures and keep the current session working.
  }
}