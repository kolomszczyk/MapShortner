export function formatRomanNumeral(numberValue) {
  const normalizedNumber = Math.trunc(Number(numberValue));
  if (!Number.isFinite(normalizedNumber) || normalizedNumber <= 0) {
    return 'I';
  }

  const numerals = [
    ['M', 1000],
    ['CM', 900],
    ['D', 500],
    ['CD', 400],
    ['C', 100],
    ['XC', 90],
    ['L', 50],
    ['XL', 40],
    ['X', 10],
    ['IX', 9],
    ['V', 5],
    ['IV', 4],
    ['I', 1]
  ];

  let remainingValue = normalizedNumber;
  let result = '';
  for (const [symbol, value] of numerals) {
    while (remainingValue >= value) {
      result += symbol;
      remainingValue -= value;
    }
  }

  return result || 'I';
}

export function parseRomanNumeral(value) {
  const normalizedValue = String(value || '').trim().toUpperCase();
  if (!normalizedValue || !/^[IVXLCDM]+$/.test(normalizedValue)) {
    return null;
  }

  const values = {
    I: 1,
    V: 5,
    X: 10,
    L: 50,
    C: 100,
    D: 500,
    M: 1000
  };

  let total = 0;
  let previousValue = 0;
  for (let index = normalizedValue.length - 1; index >= 0; index -= 1) {
    const currentValue = values[normalizedValue[index]];
    if (!currentValue) {
      return null;
    }

    if (currentValue < previousValue) {
      total -= currentValue;
    } else {
      total += currentValue;
      previousValue = currentValue;
    }
  }

  return total > 0 ? total : null;
}

export function formatMapTimeColorRangeOrdinalLabel(numberValue) {
  const normalizedNumber = Number(numberValue);
  if (!Number.isFinite(normalizedNumber) || normalizedNumber <= 0) {
    return 'Zakres I';
  }

  return `Zakres ${formatRomanNumeral(normalizedNumber)}`;
}

export function extractMapTimeColorRangeLabelNumber(labelValue) {
  const normalizedLabel = String(labelValue || '').trim();
  if (!normalizedLabel) {
    return null;
  }

  const leadingMatch = normalizedLabel.match(/^(\d+)\s+zakres$/i);
  if (leadingMatch) {
    return Number(leadingMatch[1]);
  }

  const trailingMatch = normalizedLabel.match(/^zakres\s+(\d+)$/i);
  if (trailingMatch) {
    return Number(trailingMatch[1]);
  }

  const leadingRomanMatch = normalizedLabel.match(/^([IVXLCDM]+)\s+zakres$/i);
  if (leadingRomanMatch) {
    return parseRomanNumeral(leadingRomanMatch[1]);
  }

  const trailingRomanMatch = normalizedLabel.match(/^zakres\s+([IVXLCDM]+)$/i);
  if (trailingRomanMatch) {
    return parseRomanNumeral(trailingRomanMatch[1]);
  }

  return null;
}

export function getNextMapTimeColorRangeLabel(ranges = [], options = {}) {
  const normalizeRanges =
    typeof options.normalizeRanges === 'function' ? options.normalizeRanges : (value) => value;
  const isSpecialRange =
    typeof options.isSpecialRange === 'function' ? options.isSpecialRange : () => false;

  const highestNumber = normalizeRanges(ranges)
    .filter((range) => !isSpecialRange(range))
    .map((range) => extractMapTimeColorRangeLabelNumber(range.label))
    .filter(Number.isFinite)
    .reduce((maxValue, currentValue) => Math.max(maxValue, currentValue), 0);

  if (highestNumber > 0) {
    return formatMapTimeColorRangeOrdinalLabel(highestNumber + 1);
  }

  return formatMapTimeColorRangeOrdinalLabel(1);
}