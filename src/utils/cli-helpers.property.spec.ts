import * as fc from 'fast-check';
import { describe, it, expect } from '@jest/globals';
import { chunkIterator, parseRange } from './cli-helpers';

describe('CLI Helpers (Property-Based Tests)', () => {

  describe('parseRange', () => {
    it('Property 1: Chaos Resilience - Never throws on arbitrary strings', () => {
      fc.assert(
        fc.property(fc.string(), (randomString) => {
          expect(() => parseRange(randomString)).not.toThrow();
        })
      );
    });

    it('Property 2: Correctness - Valid number-number strings always return correct objects', () => {
      fc.assert(
        fc.property(fc.integer(), fc.integer(), (start, end) => {
          const rangeString = `${start}-${end}`;
          const result = parseRange(rangeString);
          
          expect(result).toEqual({ start, end });
        })
      );
    });

    it('Property 3: Robustness - Invalid formats always return null', () => {
      // Generate strings that DON'T match the "num-num" pattern
      const invalidArbitrary = fc.string().filter(s => {
        const parts = s.split('-');
        return parts.length !== 2 || isNaN(Number(parts[0])) || isNaN(Number(parts[1]));
      });

      fc.assert(
        fc.property(invalidArbitrary, (invalidString) => {
          expect(parseRange(invalidString)).toBeNull();
        })
      );
    });
  });

  describe('chunkIterator', () => {
    it('Property 1: Data Integrity - All elements are preserved and in order', () => {
      fc.assert(
        fc.property(fc.array(fc.anything()), fc.integer({ min: 1, max: 100 }), (items, size) => {
          const batches = Array.from(chunkIterator(items, size));
          const flattened = batches.flat();

          // INVARIANT: Flattened batches must exactly equal original items
          expect(flattened).toEqual(items);
        })
      );
    });

    it('Property 2: Batch Sizing - All batches except the last one must be of exactly "size"', () => {
      fc.assert(
        fc.property(fc.array(fc.anything(), { minLength: 1 }), fc.integer({ min: 1, max: 100 }), (items, size) => {
          const batches = Array.from(chunkIterator(items, size));
          
          batches.forEach((batch, index) => {
            if (index < batches.length - 1) {
              // Not the last batch
              expect(batch.length).toBe(size);
            } else {
              // The last batch
              expect(batch.length).toBeLessThanOrEqual(size);
              expect(batch.length).toBeGreaterThan(0);
            }
          });
        })
      );
    });

    it('Property 3: Empty Input - Results in zero batches', () => {
      fc.assert(
        fc.property(fc.integer({ min: 1, max: 100 }), (size) => {
          const batches = Array.from(chunkIterator([], size));
          expect(batches).toHaveLength(0);
        })
      );
    });

    it('Property 4: Invalid Size - Returns zero batches for size <= 0', () => {
      fc.assert(
        fc.property(fc.array(fc.anything()), fc.integer({ max: 0 }), (items, size) => {
          const batches = Array.from(chunkIterator(items, size));
          expect(batches).toHaveLength(0);
        })
      );
    });
  });
});
