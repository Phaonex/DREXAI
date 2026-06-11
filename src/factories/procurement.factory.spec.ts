// --- START OF FILE: src/factories/procurement.factory.spec.ts ---
import * as fc from 'fast-check';
import { describe, it, expect } from '@jest/globals';
import { createProcurementNode } from './procurement.factory';

describe('ProcurementNode Factory (Property-Based Tests)', () => {

  it('Property 1: Never bleeds undefined fields, regardless of input', () => {
    // Generate random partial objects
    const partialNodeArbitrary = fc.record({
      bulletPoint: fc.string(),
      priority: fc.constantFrom('must', 'should', 'optional' as const),
      confidence: fc.constantFrom('high', 'medium', 'low', null as any),
      procurementDocumentChunkIdArray: fc.array(fc.string())
    }, { requiredKeys: [] }); // Simulate completely random missing fields

    fc.assert(
      fc.property(partialNodeArbitrary, (partialData) => {
        const node = createProcurementNode(partialData);

        // INVARIANT A: Complete Object Shape
        expect(node).toHaveProperty('bulletPoint');
        expect(node).toHaveProperty('status');
        expect(node).toHaveProperty('deliverableArray');
        
        // INVARIANT B: Array Safety (Arrays must always exist and be arrays)
        expect(Array.isArray(node.deliverableArray)).toBe(true);
        expect(Array.isArray(node.procurementDocumentChunkIdArray)).toBe(true);
        expect(Array.isArray(node.workspaceDocumentChunkIdArray)).toBe(true);
        expect(Array.isArray(node.citedProductIdArray)).toBe(true);
        expect(Array.isArray(node.citedPersonIdArray)).toBe(true);
        
        // INVARIANT C: Immutability (The returned object and arrays must be frozen)
        expect(Object.isFrozen(node)).toBe(true);
        expect(Object.isFrozen(node.deliverableArray)).toBe(true);
        expect(Object.isFrozen(node.procurementDocumentChunkIdArray)).toBe(true);
      })
    );
  });

  it('Property 2: Strictly preserves explicitly provided data', () => {
    // Generate valid string arrays
    const validStringArray = fc.array(fc.string({ minLength: 1 }));

    fc.assert(
      fc.property(validStringArray, validStringArray, (chunks, products) => {
        const node = createProcurementNode({
          procurementDocumentChunkIdArray: chunks,
          citedProductIdArray: products
        });

        // INVARIANT D: Data Retention
        expect(node.procurementDocumentChunkIdArray).toEqual(chunks);
        expect(node.citedProductIdArray).toEqual(products);
        // The arrays should not be the same reference (deep cloned/frozen)
        if (chunks.length > 0) {
          expect(node.procurementDocumentChunkIdArray).not.toBe(chunks); 
        }
      })
    );
  });
});
// --- END OF FILE ---