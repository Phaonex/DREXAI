// --- START OF FILE: src/ai/deepseek.service.spec.ts ---
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { DeepSeekService } from './deepseek.service';
import { LoggerService } from '../logger/logger.service';
import { createProcurementNode } from '../factories/procurement.factory';

const mockLogger = { log: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() } as unknown as LoggerService;

describe('DeepSeekService (BONDIQ Prompt Integrity TDD)', () => {
  let deepSeekService: DeepSeekService;

  beforeEach(() => {
    deepSeekService = new DeepSeekService(mockLogger);
    jest.clearAllMocks();
  });

  it('BONDIQ CRITERIA: clusterSemantically maps LLM indices safely back to memory references', async () => {
    const leaf0 = createProcurementNode({ bulletPoint: 'SLA must be 4 hours', procurementDocumentChunkIdArray: ['A'] });
    const leaf1 = createProcurementNode({ bulletPoint: 'Provide ticket system', procurementDocumentChunkIdArray: ['B'] });

    const callSpy = jest.spyOn(deepSeekService as any, 'callLlm').mockResolvedValue(
      JSON.stringify([
        {
          consolidatedBulletPoint: 'Provide ticket system with 4 hour SLA',
          originalNodeIndices: [0, 1]
        }
      ])
    );

    const result = await deepSeekService.clusterSemantically([leaf0, leaf1]);

    expect(callSpy).toHaveBeenCalledTimes(1);
    expect(result).toHaveLength(1);
    expect(result[0].consolidatedBulletPoint).toBe('Provide ticket system with 4 hour SLA');
    expect(result[0].originalNodes).toHaveLength(2);
    expect(result[0].originalNodes[0]).toBe(leaf0);
    expect(result[0].originalNodes[1]).toBe(leaf1);
  });

  it('BONDIQ CRITERIA: categorizeLeaves assigns dynamic L1/L2 tags using index mapping', async () => {
    const leaf0 = createProcurementNode({ bulletPoint: 'Setup cloud infrastructure' });

    const callSpy = jest.spyOn(deepSeekService as any, 'callLlm').mockResolvedValue(
      JSON.stringify([
        { l1: 'IT Services', l2: 'Infrastructure', leafIndex: 0 }
      ])
    );

    const result = await deepSeekService.categorizeLeaves([leaf0]);

    expect(callSpy).toHaveBeenCalledTimes(1);
    expect(result).toHaveLength(1);
    expect(result[0].l1).toBe('IT Services');
    expect(result[0].l2).toBe('Infrastructure');
    expect(result[0].leaf).toBe(leaf0);
  });
});
// --- END OF FILE ---