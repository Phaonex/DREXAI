import * as fc from 'fast-check';
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { ConsolidationService } from './consolidation.service';
import { LoggerService } from '../logger/logger.service';
import { DeepSeekService } from '../ai/deepseek.service';
import { createProcurementNode } from '../factories/procurement.factory';
import { ProcurementMatchDeliverable } from '../types/procurement';

describe('ConsolidationService (Property-Based Tests)', () => {
  let service: ConsolidationService;
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
      clusterSemantically: jest.fn(),
    } as any;

    service = new ConsolidationService(logger, deepSeek);
  });

  // Arbitrary: A single Procurement Leaf
  const leafArbitrary = fc.record({
    bulletPoint: fc.string({ minLength: 1 }),
    procurementDocumentChunkIdArray: fc.array(fc.string(), { maxLength: 5 }),
    workspaceDocumentChunkIdArray: fc.array(fc.string(), { maxLength: 5 }),
  }).map(data => createProcurementNode(data));

  // Arbitrary: A semantic cluster
  const clusterArbitrary = fc.record({
    consolidatedBulletPoint: fc.string({ minLength: 1 }),
    originalNodes: fc.array(leafArbitrary, { minLength: 1, maxLength: 10 }),
  });

  // Arbitrary: A set of clusters
  const clustersArbitrary = fc.array(clusterArbitrary, { minLength: 1, maxLength: 20 });

  it('Property 1: Chaos Resilience - Never crashes on arbitrary clusters', async () => {
    await fc.assert(
      fc.asyncProperty(clustersArbitrary, async (clusters) => {
        deepSeek.clusterSemantically.mockResolvedValue(clusters);
        const allLeaves = clusters.flatMap(c => c.originalNodes);
        
        await expect(service.consolidate(allLeaves)).resolves.not.toThrow();
      })
    );
  });

  it('Property 2: Citation Integrity - Consolidated nodes must contain all unique original citation IDs', async () => {
    await fc.assert(
      fc.asyncProperty(clustersArbitrary, async (clusters) => {
        deepSeek.clusterSemantically.mockResolvedValue(clusters);
        const allLeaves = clusters.flatMap(c => c.originalNodes);
        
        const consolidated = await service.consolidate(allLeaves);

        expect(consolidated).toHaveLength(clusters.length);

        clusters.forEach((cluster, index) => {
          const resultNode = consolidated[index];
          
          // Check Procurement Citations
          const expectedProcurementIds = new Set(cluster.originalNodes.flatMap(n => n.procurementDocumentChunkIdArray));
          expectedProcurementIds.forEach(id => {
            expect(resultNode.procurementDocumentChunkIdArray).toContain(id);
          });
          expect(resultNode.procurementDocumentChunkIdArray.length).toBe(expectedProcurementIds.size);

          // Check Workspace Citations
          const expectedWorkspaceIds = new Set(cluster.originalNodes.flatMap(n => n.workspaceDocumentChunkIdArray));
          expectedWorkspaceIds.forEach(id => {
            expect(resultNode.workspaceDocumentChunkIdArray).toContain(id);
          });
          expect(resultNode.workspaceDocumentChunkIdArray.length).toBe(expectedWorkspaceIds.size);
        });
      })
    );
  });

  it('Property 3: Idempotent Uniqueness - No duplicate citation IDs in consolidated nodes', async () => {
    await fc.assert(
      fc.asyncProperty(clustersArbitrary, async (clusters) => {
        deepSeek.clusterSemantically.mockResolvedValue(clusters);
        const allLeaves = clusters.flatMap(c => c.originalNodes);
        
        const consolidated = await service.consolidate(allLeaves);

        consolidated.forEach(node => {
          const procSet = new Set(node.procurementDocumentChunkIdArray);
          const workSet = new Set(node.workspaceDocumentChunkIdArray);
          
          expect(procSet.size).toBe(node.procurementDocumentChunkIdArray.length);
          expect(workSet.size).toBe(node.workspaceDocumentChunkIdArray.length);
        });
      })
    );
  });

  it('Property 4: Empty Handling - Returns empty array if input is empty', async () => {
    const result = await service.consolidate([]);
    expect(result).toEqual([]);
    expect(deepSeek.clusterSemantically).not.toHaveBeenCalled();
  });
});
