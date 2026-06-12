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
        originalNodes: [leafPage60, leafPage382]
      }
    ]);

    const result = await consolidationService.consolidate(Object.freeze([leafPage60, leafPage382]));

    expect(result).toHaveLength(1);
    expect(result[0].procurementDocumentChunkIdArray).toContain('chunk_page_60');
    expect(result[0].procurementDocumentChunkIdArray).toContain('chunk_page_382');
    expect(result[0].procurementDocumentChunkIdArray).toHaveLength(2);
    expect(result[0].bulletPoint).toBe('The supplier must provide a 24/7 ticket system with a response time under 4 hours');
  });
});
// --- END OF FILE ---