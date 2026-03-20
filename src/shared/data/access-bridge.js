export function getAccessBridgeErrorMessage({ personName, code }) {
  const safePersonName = String(personName || 'osobę').trim() || 'osobę';
  const normalizedCode = String(code || '').trim().toLowerCase();

  if (normalizedCode === 'multiple-instances') {
    return 'Jest za dużo Accessów i nie wiadomo, w którym otworzyć.';
  }

  if (normalizedCode === 'not-found') {
    return `Nie udało się otworzyć (${safePersonName})`;
  }

  if (normalizedCode === 'no-response') {
    return `Nie udało się otworzyć (${safePersonName}) — Access nie odpowiedział.`;
  }

  if (normalizedCode === 'no-instance') {
    return `Nie udało się otworzyć (${safePersonName}) — brak otwartej instancji Accessa.`;
  }

  if (normalizedCode === 'unsupported-platform') {
    return `Nie udało się otworzyć (${safePersonName}) — ta funkcja działa tylko w Windows.`;
  }

  if (normalizedCode === 'database-mismatch') {
    return `Nie udało się otworzyć (${safePersonName}) — otwarty jest inny plik Access.`;
  }

  if (normalizedCode === 'form-not-found') {
    return `Nie udało się otworzyć (${safePersonName}) — formularz nie istnieje w Accessie.`;
  }

  return `Nie udało się otworzyć (${safePersonName})`;
}