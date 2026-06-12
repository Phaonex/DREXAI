// --- START OF FILE: src/factories/procurement.factory.spec.ts ---
import { describe, it, expect } from '@jest/globals';
import { createProcurementNode } from './procurement.factory';

describe('ProcurementFactory (BONDIQ Strict Schema TDD)', () => {
  
  it('BONDIQ CRITERIA: Enforces strict null/empty defaults for later-stage fields', () => {
    // ACT: Create a basic node with only the minimum required data
    const node = createProcurementNode({
      bulletPoint: 'Supplier must provide ISO 27001 certification',
      procurementDocumentChunkIdArray: ['chunk_1']
    });

    // ASSERT: These must be exactly as BONDIQ specified
    expect(node.status).toBe('waitingForAnalysis');
    expect(node.aiReasoning).toBeNull();
    expect(node.feedback).toBeNull();
    expect(node.feedbackText).toBeNull();
    expect(node.openQuestionId).toBeNull();
    expect(node.citedProductIdArray).toEqual([]);
    expect(node.citedPersonIdArray).toEqual([]);
    
    // ASSERT: Standard defaults
    expect(node.confidence).toBeNull();
    expect(node.priority).toBe('must'); // default
  });

  it('BONDIQ CRITERIA: Physically prevents pollution of restricted fields', () => {
    // ARRANGE: A rogue payload trying to inject forbidden data
    const roguePayload = {
      bulletPoint: 'Provide cloud hosting',
      aiReasoning: { en: 'Because I am an AI and I said so' }, // Forbidden
      status: 'waitingForReview', // Forbidden override
      citedProductIdArray: ['prod_123'] // Forbidden
    } as any; // Cast as any to bypass TS just to test runtime immutability

    // ACT
    const node = createProcurementNode(roguePayload);

    // ASSERT: The factory must ruthlessly strip the rogue data and enforce the spec
    expect(node.aiReasoning).toBeNull();
    expect(node.status).toBe('waitingForAnalysis');
    expect(node.citedProductIdArray).toEqual([]);
  });

  it('Property: Output is deeply frozen', () => {
    const node = createProcurementNode({ bulletPoint: 'Test' });
    expect(Object.isFrozen(node)).toBe(true);
    expect(Object.isFrozen(node.deliverableArray)).toBe(true);
  });
});
// --- END OF FILE ---