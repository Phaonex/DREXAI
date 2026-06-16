// --- START OF FILE: src/utils/lv-parser.property.spec.ts ---
import * as fc from 'fast-check';
import { describe, it, expect } from '@jest/globals';
import { parseLvHierarchy, containsLvPositions } from './lv-parser';

// Arbitrary 1: Valid L3 Position Strings
const validFullLvArbitrary = fc.tuple(
  fc.integer({ min: 0, max: 99 }).map(n => n.toString().padStart(2, '0')),
  fc.integer({ min: 0, max: 99 }).map(n => n.toString().padStart(2, '0')),
  fc.integer({ min: 0, max: 9999 }).map(n => n.toString().padStart(4, '0')),
  // 🟢 FIX: Ensure the title contains at least one real, non-whitespace character
  fc.string({ minLength: 1 }).filter(str => 
    str.trim().length > 0 && 
    !str.includes('\n') && 
    !str.includes('\r')
  )
).map(([l1, l2, l3, title]) => {
  const text = `${l1}.${l2}.${l3} ${title}`;
  return {
    text,
    expected: {
      hierarchy: {
        level1: l1,
        level2: `${l1}.${l2}`,
        level3: `${l1}.${l2}.${l3}`
      },
      title: title.trim()
    }
  };
});

describe('LV Parser (Property-Based Tests)', () => {
  
  it('Property 1: Chaos Resilience - Never throws an exception on arbitrary text', () => {
    fc.assert(
      fc.property(fc.string(), (randomText) => {
        const result = parseLvHierarchy(randomText);
        // INVARIANT: Must strictly conform to the Option ADT
        expect(['Some', 'None']).toContain(result.kind);
      })
    );
  });

  it('Property 2: Perfect Decoupling - Always extracts valid L1/L2/L3 structures', () => {
    fc.assert(
      fc.property(validFullLvArbitrary, ({ text, expected }) => {
        const result = parseLvHierarchy(text);
        
        // INVARIANT: A mathematically valid string must result in a 'Some' state
        expect(result.kind).toBe('Some');
        if (result.kind === 'Some') {
          expect(result.value.hierarchy).toEqual(expected.hierarchy);
          expect(result.value.title).toEqual(expected.title);
        }
      })
    );
  });

  it('Property 3: Boolean Evaluation - containsLvPositions detects valid LVs in massive blocks of text', () => {
    fc.assert(
      fc.property(validFullLvArbitrary, fc.string(), fc.string(), ({ text }, prefix, suffix) => {
        // Embed the valid string inside random garbage text
        const massiveText = `${prefix}\n${text}\n${suffix}`;
        
        // INVARIANT: O(1) memory regex must find it
        expect(containsLvPositions(massiveText)).toBe(true);
      })
    );
  });
});
// --- END OF FILE ---