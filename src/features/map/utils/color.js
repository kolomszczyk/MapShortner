export function normalizeNonNegativeIntegerInputValue(value) {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
    return String(Math.trunc(value));
  }

  if (typeof value !== 'string') {
    return '';
  }

  const trimmed = value.trim();
  return /^\d+$/.test(trimmed) ? String(Number(trimmed)) : '';
}

export function normalizeHexColorInputValue(value) {
  if (typeof value !== 'string') {
    return '#4db06f';
  }

  const trimmed = value.trim();
  return /^#[0-9a-fA-F]{6}$/.test(trimmed) ? trimmed.toLowerCase() : '#4db06f';
}

export function parseHexColorToRgb(colorValue) {
  const normalizedColor = normalizeHexColorInputValue(colorValue);
  const hexValue = normalizedColor.slice(1);
  return {
    red: Number.parseInt(hexValue.slice(0, 2), 16),
    green: Number.parseInt(hexValue.slice(2, 4), 16),
    blue: Number.parseInt(hexValue.slice(4, 6), 16)
  };
}

export function formatRgbChannelToHex(channelValue) {
  const normalizedValue = Math.max(0, Math.min(255, Math.round(Number(channelValue) || 0)));
  return normalizedValue.toString(16).padStart(2, '0');
}

export function getMapTimeColorRelativeLuminance(colorValue) {
  const { red, green, blue } = parseHexColorToRgb(colorValue);
  const normalizeChannel = (channel) => {
    const srgb = channel / 255;
    return srgb <= 0.03928
      ? srgb / 12.92
      : ((srgb + 0.055) / 1.055) ** 2.4;
  };

  return (
    (0.2126 * normalizeChannel(red))
    + (0.7152 * normalizeChannel(green))
    + (0.0722 * normalizeChannel(blue))
  );
}