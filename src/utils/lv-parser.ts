// --- START OF FILE: src/utils/lv-parser.ts ---
import { LvPositionKey } from '../types/procurement';

// 1. The Strict Option ADT (Eradicating 'null')
export type Option<T> = 
  | { readonly kind: 'Some'; readonly value: Readonly<T> }
  | { readonly kind: 'None' };

export interface LvMatch {
  readonly hierarchy: LvPositionKey;
  readonly title: string;
}

/**
 * Pure utility to parse standard DACH LV position numbers and their titles.
 * Note: 100% expression-based, mathematically pure.
 */
export const parseLvHierarchy = (textLine: string): Option<LvMatch> => {
  const trimmed = textLine.trim();

  const lvRegex = /^(\d{2})\.(\d{2})\.(\d{2,4}[A-Z]?)\s+(.*)/;
  const headerRegex = /^(\d{2})(\.\d{2})?\s+(.*)/;

  const fullMatch = trimmed.match(lvRegex);
  const headerMatch = trimmed.match(headerRegex);

  // Pure nested ternary evaluation. No imperative control flow.
  return fullMatch
    ? {
        kind: 'Some',
        value: {
          hierarchy: {
            level1: fullMatch[1],
            level2: `${fullMatch[1]}.${fullMatch[2]}`,
            level3: `${fullMatch[1]}.${fullMatch[2]}.${fullMatch[3]}`,
          },
          title: fullMatch[4].trim(),
        }
      }
    : headerMatch
      ? {
          kind: 'Some',
          value: {
            hierarchy: {
              level1: headerMatch[1],
              level2: headerMatch[2] ? `${headerMatch[1]}${headerMatch[2]}` : `${headerMatch[1]}.00`,
              level3: headerMatch[2] ? `${headerMatch[1]}${headerMatch[2]}.0000` : `${headerMatch[1]}.00.0000`,
            },
            title: headerMatch[3].trim(),
          }
        }
      : { kind: 'None' };
};

/**
 * Higher-order function to identify if a chunk contains LV positions
 * Note: O(1) memory evaluation using multiline regex testing.
 */
export const containsLvPositions = (text: string): boolean => {
  // The 'm' flag allows the regex to test across newlines without array allocations
  return /^(\d{2})\.(\d{2})\.(\d{2,4}[A-Z]?)\s+/m.test(text) || 
         /^(\d{2})(\.\d{2})?\s+/m.test(text);
};
// --- END OF FILE ---