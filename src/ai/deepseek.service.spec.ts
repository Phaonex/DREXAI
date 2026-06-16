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
          consolidatedDescription: 'Unified description of ticket system and SLA.',
          consolidatedReasoning: 'Both items relate to support infrastructure.',
          originalNodeIndices: [0, 1]
        }
      ])
    );

    const result = await deepSeekService.clusterSemantically([leaf0, leaf1]);

    expect(callSpy).toHaveBeenCalledTimes(1);
    expect(result).toHaveLength(1);
    expect(result[0].consolidatedBulletPoint).toBe('Provide ticket system with 4 hour SLA');
    expect(result[0].consolidatedDescription).toBe('Unified description of ticket system and SLA.');
    expect(result[0].consolidatedReasoning).toBe('Both items relate to support infrastructure.');
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

  it('BONDIQ COMPLIANCE: extractLeaves must return full deliverable details (description, priority, confidence)', async () => {
    const mockLlmResponse = JSON.stringify([
      {
        bulletPoint: '24/7 Support',
        descriptionEn: 'The supplier must provide round-the-clock technical support.',
        priority: 'must',
        confidence: 'high',
        equivalenceAllowed: false,
        reasoningEn: 'Explicitly stated as a mandatory requirement in the text.'
      }
    ]);

    jest.spyOn(deepSeekService as any, 'callLlm').mockResolvedValue(mockLlmResponse);

    const result = await deepSeekService.extractLeaves('mock-key', 'some text', 'chunk-1');

    expect(result.kind).toBe('Success');
    if (result.kind === 'Success') {
      const leaf = result.data[0];
      expect(leaf.bulletPoint).toBe('24/7 Support');
      expect(leaf.description.en).toBe('The supplier must provide round-the-clock technical support.');
      expect(leaf.priority).toBe('must');
      expect(leaf.confidence).toBe('high');
      expect(leaf.equivalenceAllowed).toBe(false);
    }
  });
});
// --- END OF FILE ---