// --- START OF FILE: src/utils/lv-parser.ts ---

// 1. Algebraic Data Type (ADT) for safe absence of values
export type Option<T> =
  | { readonly kind: 'Some'; readonly value: Readonly<T> }
  | { readonly kind: 'None' };

export type LvHierarchy = {
  readonly level1: string;
  readonly level2: string;
  readonly level3: string;
};

export type LvMatch = {
  readonly hierarchy: LvHierarchy;
  readonly title: string;
};

// 2. Strict Deterministic Patterns
// parse pattern: Must start with XX.XX.XXXX and capture the rest of the line
const LV_EXTRACT_PATTERN = /^(\d{2})\.(\d{2})\.(\d{4})\s+(.+)$/;
// search pattern: Looks for the XX.XX.XXXX sequence anywhere in a text block
const LV_CONTAINS_PATTERN = /\b\d{2}\.\d{2}\.\d{4}\b/;

/**
 * Pure function to extract standard Austrian/German LV numbering.
 * Ruthlessly rejects anything that isn't strictly XX.XX.XXXX.
 */
export const parseLvHierarchy = (text: string): Option<LvMatch> => {
  const match = text.trim().match(LV_EXTRACT_PATTERN);
  
  if (!match) {
    return { kind: 'None' };
  }

  const [, l1, l2, l3, title] = match;

  return Object.freeze({
    kind: 'Some',
    value: Object.freeze({
      hierarchy: Object.freeze({
        level1: l1,
        level2: `${l1}.${l2}`,
        level3: `${l1}.${l2}.${l3}`
      }),
      title: title.trim()
    })
  });
};

/**
 * Pure function to detect if an LV block exists within a mixed text chunk.
 * Scans globally across newlines.
 */
export const containsLvPositions = (text: string): boolean => {
  return LV_CONTAINS_PATTERN.test(text);
};

// --- END OF FILE ---