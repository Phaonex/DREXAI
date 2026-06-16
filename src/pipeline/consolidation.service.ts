import { Injectable } from '@nestjs/common';
import { ProcurementMatchDeliverable, SemanticCluster } from '../types/procurement';
import { LoggerService } from '../logger/logger.service';
import { DeepSeekService } from '../ai/deepseek.service';
import { createProcurementNode } from '../factories/procurement.factory';
import { chunkIterator } from '../utils/cli-helpers';

const PRIORITY_MAP: Record<string, number> = { must: 3, should: 2, optional: 1 };
const CONFIDENCE_MAP: Record<string, number> = { high: 3, medium: 2, low: 1 };
const MAX_BATCH_SIZE = 10; // Dropped to 10 to handle extreme density in massive tenders like Salzburg

@Injectable()
export class ConsolidationService {
  constructor(
    private readonly logger: LoggerService,
    private readonly deepSeekService: DeepSeekService 
  ) {}

  async consolidate(
    leaves: readonly ProcurementMatchDeliverable[]
  ): Promise<readonly ProcurementMatchDeliverable[]> {
    if (leaves.length === 0) return [];

    this.logger.log(`[INFO] [CONSOLIDATE] Starting semantic consolidation of ${leaves.length} items...`);

    // Perform recursive batch clustering to handle LLM context limits
    const consolidatedLeaves = await this.recursiveConsolidate(leaves);

    this.logger.log(`[INFO] [CONSOLIDATE] Final count: ${consolidatedLeaves.length} unique semantic leaves.`);
    return Object.freeze(consolidatedLeaves);
  }

  /**
   * Functional recursive reduction: Batches large inputs and merges results.
   * Processes batches SEQUENTIALLY to prevent network/token overflow.
   */
  private async recursiveConsolidate(
    items: readonly ProcurementMatchDeliverable[]
  ): Promise<readonly ProcurementMatchDeliverable[]> {
    // BASE CASE: If we are under the limit, we can do a single pass safely.
    if (items.length <= MAX_BATCH_SIZE) {
      return this.performConsolidationPass(items);
    }

    this.logger.log(`[INFO] [CONSOLIDATE] Input size ${items.length} exceeds batch limit. Partitioning...`);

    const batches = Array.from(chunkIterator(items, MAX_BATCH_SIZE));
    
    // Process batches sequentially to maintain stability
    const partialResults: ProcurementMatchDeliverable[][] = [];
    for (const batch of batches) {
      const result = await this.performConsolidationPass(batch);
      partialResults.push([...result]);
    }

    const mergedPartials = partialResults.flat();
    
    // RECURSIVE STEP: If we reduced the count, recurse to continue merging.
    // If the count didn't change, we've reached a semantic steady state.
    if (mergedPartials.length < items.length) {
      return this.recursiveConsolidate(mergedPartials);
    }

    // FINAL GUARD: If we can't reduce further but are still over batch size,
    // we must return the results as is to avoid infinite loops, 
    // although this is unlikely given the semantic merge prompt.
    return mergedPartials;
  }

  /**
   * Pure single-pass semantic clustering.
   */
  private async performConsolidationPass(
    leaves: readonly ProcurementMatchDeliverable[]
  ): Promise<readonly ProcurementMatchDeliverable[]> {
    if (leaves.length === 0) return [];
    if (leaves.length === 1) return [...leaves];

    // Explicitly type the result from DeepSeekService to prevent TS inference bugs
    const clusters: readonly SemanticCluster[] = await this.deepSeekService.clusterSemantically(leaves);

    return clusters.map(cluster => {
      const mergedProcurementChunks = this.mergeUnique(
        cluster.originalNodes.flatMap(n => n.procurementDocumentChunkIdArray)
      );
      
      const mergedWorkspaceChunks = this.mergeUnique(
        cluster.originalNodes.flatMap(n => n.workspaceDocumentChunkIdArray)
      );

      // Deterministic Priority: Resolve to the strictest (must > should > optional)
      const resolvedPriority = cluster.originalNodes.reduce((strictest, current) => {
        return PRIORITY_MAP[current.priority] > PRIORITY_MAP[strictest] ? current.priority : strictest;
      }, 'optional' as ProcurementMatchDeliverable['priority']);

      // Deterministic Confidence: Resolve to the lowest for safety
      const resolvedConfidence = cluster.originalNodes.reduce((lowest, current) => {
        if (!current.confidence) return lowest;
        if (!lowest) return current.confidence;
        return CONFIDENCE_MAP[current.confidence] < CONFIDENCE_MAP[lowest] ? current.confidence : lowest;
      }, null as ProcurementMatchDeliverable['confidence']);

      // Deterministic Equivalence: Safest-first (false > true > null)
      const resolvedEquivalence = cluster.originalNodes.reduce((acc, current) => {
        if (current.equivalenceAllowed === false || acc === false) return false;
        if (current.equivalenceAllowed === true || acc === true) return true;
        return null;
      }, null as boolean | null);

      return createProcurementNode({
        bulletPoint: cluster.consolidatedBulletPoint,
        description: { en: cluster.consolidatedDescription },
        aiReasoning: { en: cluster.consolidatedReasoning },
        priority: resolvedPriority,
        confidence: resolvedConfidence,
        equivalenceAllowed: resolvedEquivalence,
        procurementDocumentChunkIdArray: mergedProcurementChunks,
        workspaceDocumentChunkIdArray: mergedWorkspaceChunks,
      });
    });
  }

  private mergeUnique(arr: readonly string[]): readonly string[] {
    return Object.freeze(Array.from(new Set(arr)));
  }
}
