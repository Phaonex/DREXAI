import { LvPositionKey } from '../types/procurement';

export interface LvMatch {
  readonly hierarchy: LvPositionKey;
  readonly title: string;
}

/**
 * Pure utility to parse standard DACH LV position numbers and their titles.
 */
export const parseLvHierarchy = (textLine: string): LvMatch | null => {
  const lvRegex = /^(\d{2})\.(\d{2})\.(\d{2,4}[A-Z]?)\s+(.*)/;
  const match = textLine.trim().match(lvRegex);

  if (!match) {
    // Also match L1/L2 headers which might only have 2 or 4 digits
    const headerRegex = /^(\d{2})(\.\d{2})?\s+(.*)/;
    const hMatch = textLine.trim().match(headerRegex);
    if (!hMatch) return null;

    const l1 = hMatch[1];
    const l2 = hMatch[2] ? `${l1}${hMatch[2]}` : null;

    return {
      hierarchy: {
        level1: l1,
        level2: l2 || `${l1}.00`,
        level3: l2 ? `${l2}.0000` : `${l1}.00.0000`,
      },
      title: hMatch[3].trim(),
    };
  }

  return {
    hierarchy: {
      level1: match[1],
      level2: `${match[1]}.${match[2]}`,
      level3: match[0].split(' ')[0].replace(/\s/g, ''),
    },
    title: match[4].trim(),
  };
};

/**
 * Higher-order function to identify if a chunk contains LV positions
 */
export const containsLvPositions = (text: string): boolean => {
  return text.split('\n').some(line => parseLvHierarchy(line) !== null);
}
