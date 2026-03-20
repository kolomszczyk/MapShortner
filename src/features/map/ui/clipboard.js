export async function copyTextToClipboard(value) {
  const text = String(value || '').trim();
  if (!text) {
    return {
      ok: false,
      text: ''
    };
  }

  let didCopy = false;

  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      didCopy = true;
    }
  } catch (_error) {
    // Fallback below.
  }

  if (!didCopy) {
    try {
      const input = document.createElement('textarea');
      input.value = text;
      input.setAttribute('readonly', 'readonly');
      input.style.position = 'fixed';
      input.style.opacity = '0';
      input.style.pointerEvents = 'none';
      document.body.appendChild(input);
      input.focus();
      input.select();
      didCopy = document.execCommand('copy');
      document.body.removeChild(input);
    } catch (_error) {
      didCopy = false;
    }
  }

  return {
    ok: didCopy,
    text
  };
}