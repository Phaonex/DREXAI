// --- START OF FILE: src/pipeline/tree-builder.service.spec.ts ---
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { TreeBuilderService } from './tree-builder.service';
import { LoggerService } from '../logger/logger.service';
import { createProcurementNode } from '../factories/procurement.factory';
import { DeepSeekService } from '../ai/deepseek.service';

const mockLogger = { log: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() } as unknown as LoggerService;
const mockDeepSeekService = { categorizeLeaves: jest.fn() } as unknown as DeepSeekService;

describe('TreeBuilderService (BONDIQ Semantic TDD)', () => {
  let treeBuilder: TreeBuilderService;

  beforeEach(() => {
    treeBuilder = new TreeBuilderService(mockLogger, mockDeepSeekService);
    jest.clearAllMocks();
  });

  it('BONDIQ CRITERIA: Nests leaves under dynamic, semantic L1/L2 groupings and bubbles data', async () => {
    const leaf1 = createProcurementNode({
      bulletPoint: 'Provide 24/7 technical support',
      procurementDocumentChunkIdArray: ['chunk_A']
    });

    const leaf2 = createProcurementNode({
      bulletPoint: 'Configure CI/CD pipelines',
      procurementDocumentChunkIdArray: ['chunk_B']
    });

    (mockDeepSeekService.categorizeLeaves as jest.Mock<any>).mockResolvedValueOnce([
      { l1: 'Operations', l2: 'Support', leaf: leaf1 },
      { l1: 'Software Development', l2: 'DevOps', leaf: leaf2 }
    ]);

    const tree = await treeBuilder.buildTree([leaf1, leaf2]);

    expect(tree).toHaveLength(2);
    const opsNode = tree.find(n => n.bulletPoint === 'Operations [Category]');
    
    expect(opsNode).toBeDefined();
    expect(opsNode!.deliverableArray).toHaveLength(1);
    expect(opsNode!.deliverableArray[0].bulletPoint).toBe('Support [Sub-Category]');
    expect(opsNode!.deliverableArray[0].deliverableArray[0].bulletPoint).toBe('Provide 24/7 technical support');
    
    // Check chunk ID bubbling
    expect(opsNode!.procurementDocumentChunkIdArray).toContain('chunk_A');
    expect(opsNode!.deliverableArray[0].procurementDocumentChunkIdArray).toContain('chunk_A');
  });
});
// --- END OF FILE ---