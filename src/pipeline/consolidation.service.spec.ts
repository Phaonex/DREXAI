// --- START OF FILE: src/pipeline/consolidation.service.spec.ts ---
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { ConsolidationService } from './consolidation.service';
import { LoggerService } from '../logger/logger.service';
import { DeepSeekService } from '../ai/deepseek.service';
import { createProcurementNode } from '../factories/procurement.factory';

const mockLogger = { log: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() } as unknown as LoggerService;
const mockDeepSeekService = { clusterSemantically: jest.fn() } as unknown as DeepSeekService;

describe('ConsolidationService (BONDIQ Semantic TDD)', () => {
  let consolidationService: ConsolidationService;

  beforeEach(() => {
    consolidationService = new ConsolidationService(mockLogger, mockDeepSeekService);
    jest.clearAllMocks();
  });

  it('BONDIQ CRITERIA: Merges scattered requirements into a single leaf and bubbles chunk IDs', async () => {
    const leafPage60 = createProcurementNode({
      bulletPoint: 'The supplier must provide a 24/7 ticket system',
      procurementDocumentChunkIdArray: ['chunk_page_60']
    });

    const leafPage382 = createProcurementNode({
      bulletPoint: 'Ticket system response time must be under 4 hours',
      procurementDocumentChunkIdArray: ['chunk_page_382']
    });

    (mockDeepSeekService.clusterSemantically as jest.Mock<any>).mockResolvedValueOnce([
      {
        consolidatedBulletPoint: 'The supplier must provide a 24/7 ticket system with a response time under 4 hours',
        consolidatedDescription: 'A single synthesized technical description of the 24/7 ticket system and its 4h SLA.',
        consolidatedReasoning: 'Merged based on system specification synergy.',
        originalNodes: [leafPage60, leafPage382]
      }
    ]);

    const result = await consolidationService.consolidate(Object.freeze([leafPage60, leafPage382]));

    expect(result).toHaveLength(1);
    expect(result[0].procurementDocumentChunkIdArray).toContain('chunk_page_60');
    expect(result[0].procurementDocumentChunkIdArray).toContain('chunk_page_382');
    expect(result[0].procurementDocumentChunkIdArray).toHaveLength(2);
    expect(result[0].bulletPoint).toBe('The supplier must provide a 24/7 ticket system with a response time under 4 hours');
    expect(result[0].description.en).toBe('A single synthesized technical description of the 24/7 ticket system and its 4h SLA.');
    expect(result[0].aiReasoning?.en).toBe('Merged based on system specification synergy.');
  });

  it('BONDIQ COMPLIANCE: should merge technical descriptions from scattered chunks into a single comprehensive description', async () => {
    const leaf1 = createProcurementNode({
      bulletPoint: '24/7 Ticket System',
      description: { en: 'The supplier must provide a ticket system available 24 hours a day, 7 days a week.' },
      procurementDocumentChunkIdArray: ['chunk_page_60']
    });

    const leaf2 = createProcurementNode({
      bulletPoint: 'Ticket Response Time',
      description: { en: 'Response time for the ticket system must be under 4 hours for all requests.' },
      procurementDocumentChunkIdArray: ['chunk_page_382']
    });

    (mockDeepSeekService.clusterSemantically as jest.Mock<any>).mockResolvedValueOnce([
      {
        consolidatedBulletPoint: '24/7 Ticket System with 4h Response Time',
        consolidatedDescription: 'Synthesized description containing 24 hours a day and under 4 hours.',
        consolidatedReasoning: 'Semantic merge of availability and performance specs.',
        originalNodes: [leaf1, leaf2]
      }
    ]);

    const result = await consolidationService.consolidate([leaf1, leaf2]);

    expect(result).toHaveLength(1);
    const consolidatedLeaf = result[0];
    
    // INVARIANT: The merged description must contain information from both source descriptions
    expect(consolidatedLeaf.description.en).toContain('24 hours a day');
    expect(consolidatedLeaf.description.en).toContain('under 4 hours');
  });

  it('BONDIQ COMPLIANCE: should consolidate equivalenceAllowed using a safest-first rule (false > true > null)', async () => {
    const leaf1 = createProcurementNode({
      bulletPoint: 'Pump System',
      equivalenceAllowed: true, // "Or equivalent accepted" found on page 10
    });

    const leaf2 = createProcurementNode({
      bulletPoint: 'Specific Pump Model',
      equivalenceAllowed: false, // "NO equivalents allowed for this specific model" found on page 50
    });

    (mockDeepSeekService.clusterSemantically as jest.Mock<any>).mockResolvedValueOnce([
      {
        consolidatedBulletPoint: 'Pump System Specifications',
        originalNodes: [leaf1, leaf2]
      }
    ]);

    const result = await consolidationService.consolidate([leaf1, leaf2]);

    expect(result).toHaveLength(1);
    // INVARIANT: If any part of the requirement forbids equivalence, the whole leaf should reflect that for safety
    expect(result[0].equivalenceAllowed).toBe(false);
  });

  it('BONDIQ RESILIENCE: should handle massive item counts by processing in batches (Resilience against context overflow)', async () => {
    // 1. Arrange: Create a payload that exceeds the internal batch limit (MAX_BATCH_SIZE = 10)
    const manyLeaves = Array.from({ length: 60 }, (_, i) => createProcurementNode({
      bulletPoint: `Requirement ${i}`,
      description: { en: `Detail ${i}` }
    }));

    // 2. Mock: AI returns clusters that REDUCE the count (merge every 2 items)
    mockDeepSeekService.clusterSemantically.mockImplementation(async (batch: any[]) => {
      const clusters = [];
      for (let i = 0; i < batch.length; i += 2) {
        const nodes = batch.slice(i, i + 2);
        clusters.push({
          consolidatedBulletPoint: nodes[0].bulletPoint,
          consolidatedDescription: nodes[0].description.en,
          consolidatedReasoning: 'Merge test',
          originalNodes: nodes,
          originalNodeIndices: nodes.map((_, idx) => i + idx)
        });
      }
      return clusters;
    });

    // 3. Act
    await consolidationService.consolidate(manyLeaves);

    // 4. Assert: With MAX_BATCH_SIZE = 10:
    // - Pass 1: 60 items / 10 = 6 calls
    // - Recurse Pass: 6 partial results / 10 = 1 call
    // TOTAL: At least 7 calls
    const calls = (mockDeepSeekService.clusterSemantically as jest.Mock).mock.calls.length;
    expect(calls).toBeGreaterThanOrEqual(7);
  });
});
// --- END OF FILE ---