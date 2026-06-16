import * as fc from 'fast-check';
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { TreeBuilderService } from './tree-builder.service';
import { LoggerService } from '../logger/logger.service';
import { DeepSeekService } from '../ai/deepseek.service';
import { createProcurementNode } from '../factories/procurement.factory';
import { ProcurementMatchDeliverable } from '../types/procurement';

describe('TreeBuilderService (Property-Based Tests)', () => {
  let service: TreeBuilderService;
  let logger: jest.Mocked<LoggerService>;
  let deepSeek: jest.Mocked<DeepSeekService>;

  beforeEach(() => {
    logger = {
      log: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    } as any;

    deepSeek = {
      categorizeLeaves: jest.fn(),
    } as any;

    service = new TreeBuilderService(logger, deepSeek);
  });

  // Arbitrary: A single Procurement Leaf
  const leafArbitrary = fc.record({
    bulletPoint: fc.string({ minLength: 1 }),
    procurementDocumentChunkIdArray: fc.array(fc.string(), { maxLength: 5 }),
    workspaceDocumentChunkIdArray: fc.array(fc.string(), { maxLength: 5 }),
  }).map(data => createProcurementNode(data));

  // Arbitrary: A set of leaves with their L1/L2 categorizations
  const categorizedLeavesArbitrary = fc.array(
    fc.record({
      l1: fc.string({ minLength: 1 }),
      l2: fc.string({ minLength: 1 }),
      leaf: leafArbitrary,
    }),
    { minLength: 1, maxLength: 50 }
  );

  it('Property 1: Chaos Resilience - Never crashes on arbitrary inputs', async () => {
    await fc.assert(
      fc.asyncProperty(categorizedLeavesArbitrary, async (categorized) => {
        deepSeek.categorizeLeaves.mockResolvedValue(categorized);
        const leaves = categorized.map(c => c.leaf);
        
        await expect(service.buildTree(leaves)).resolves.not.toThrow();
      })
    );
  });

  it('Property 2: Completeness - Every leaf must exist in the final tree', async () => {
    await fc.assert(
      fc.asyncProperty(categorizedLeavesArbitrary, async (categorized) => {
        deepSeek.categorizeLeaves.mockResolvedValue(categorized);
        const leaves = categorized.map(c => c.leaf);
        
        const tree = await service.buildTree(leaves);
        
        // Recursive flattener to find all L3 leaves regardless of depth
        const findAllLeaves = (nodes: readonly ProcurementMatchDeliverable[]): ProcurementMatchDeliverable[] => {
          return nodes.flatMap(node => {
            // If it has no children, it's a leaf (L3)
            if (node.deliverableArray.length === 0) return [node];
            // Otherwise, recurse
            return findAllLeaves(node.deliverableArray);
          });
        };

        const extractedLeaves = findAllLeaves(tree);

        expect(extractedLeaves).toHaveLength(leaves.length);
        // Compare bullet points as a proxy for identity
        const originalBullets = leaves.map(l => l.bulletPoint).sort();
        const extractedBullets = extractedLeaves.map(l => l.bulletPoint).sort();
        expect(extractedBullets).toEqual(originalBullets);
      })
    );
  });

  it('Property 3: Structural Integrity - L1 and L2 levels are correctly populated', async () => {
    await fc.assert(
      fc.asyncProperty(categorizedLeavesArbitrary, async (categorized) => {
        deepSeek.categorizeLeaves.mockResolvedValue(categorized);
        const leaves = categorized.map(c => c.leaf);
        
        const tree = await service.buildTree(leaves);
        
        const uniqueL1s = new Set(categorized.map(c => c.l1));
        expect(tree).toHaveLength(uniqueL1s.size);

        tree.forEach(l1Node => {
          const l1Key = l1Node.bulletPoint.replace(' [Category]', '');
          const expectedL2s = new Set(categorized.filter(c => c.l1 === l1Key).map(c => c.l2));
          
          expect(l1Node.deliverableArray).toHaveLength(expectedL2s.size);
          
          l1Node.deliverableArray.forEach(l2Node => {
            const l2Key = l2Node.bulletPoint.replace(' [Sub-Category]', '');
            const expectedLeavesCount = categorized.filter(c => c.l1 === l1Key && c.l2 === l2Key).length;
            
            expect(l2Node.deliverableArray).toHaveLength(expectedLeavesCount);
          });
        });
      })
    );
  });

  it('Property 4: Data Bubbling - Parents must contain all chunk IDs of their children', async () => {
    await fc.assert(
      fc.asyncProperty(categorizedLeavesArbitrary, async (categorized) => {
        deepSeek.categorizeLeaves.mockResolvedValue(categorized);
        const leaves = categorized.map(c => c.leaf);
        
        const tree = await service.buildTree(leaves);

        tree.forEach(l1 => {
          l1.deliverableArray.forEach(l2 => {
            // L2 must contain all IDs of its L3 leaves
            const l3Ids = new Set(l2.deliverableArray.flatMap(l => l.procurementDocumentChunkIdArray));
            l3Ids.forEach(id => expect(l2.procurementDocumentChunkIdArray).toContain(id));

            // L1 must contain all IDs of its L2 children
            const l2Ids = new Set(l1.deliverableArray.flatMap(l => l.procurementDocumentChunkIdArray));
            l2Ids.forEach(id => expect(l1.procurementDocumentChunkIdArray).toContain(id));
          });
        });
      })
    );
  });

  it('Property 5: Idempotent Uniqueness - No duplicate chunk IDs in parents', async () => {
    await fc.assert(
      fc.asyncProperty(categorizedLeavesArbitrary, async (categorized) => {
        deepSeek.categorizeLeaves.mockResolvedValue(categorized);
        const leaves = categorized.map(c => c.leaf);
        
        const tree = await service.buildTree(leaves);

        tree.forEach(l1 => {
          expect(new Set(l1.procurementDocumentChunkIdArray).size).toBe(l1.procurementDocumentChunkIdArray.length);
          l1.deliverableArray.forEach(l2 => {
            expect(new Set(l2.procurementDocumentChunkIdArray).size).toBe(l2.procurementDocumentChunkIdArray.length);
          });
        });
      })
    );
  });
});
