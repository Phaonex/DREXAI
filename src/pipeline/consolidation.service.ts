// --- START OF FILE: src/pipeline/consolidation.service.ts ---
import { Injectable } from '@nestjs/common';
import { ProcurementMatchDeliverable } from '../types/procurement';
import { LoggerService } from '../logger/logger.service';
import { DeepSeekService } from '../ai/deepseek.service';
import { createProcurementNode } from '../factories/procurement.factory';

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

    this.logger.log(`[INFO] [CONSOLIDATE] Starting semantic consolidation of ${leaves.length} raw leaves...`);

    const clusters = await this.deepSeekService.clusterSemantically(leaves);

    const consolidatedLeaves = clusters.map(cluster => {
      const mergedProcurementChunks = this.mergeUnique(
        cluster.originalNodes.flatMap(n => n.procurementDocumentChunkIdArray)
      );
      
      const mergedWorkspaceChunks = this.mergeUnique(
        cluster.originalNodes.flatMap(n => n.workspaceDocumentChunkIdArray)
      );

      return createProcurementNode({
        bulletPoint: cluster.consolidatedBulletPoint,
        procurementDocumentChunkIdArray: mergedProcurementChunks,
        workspaceDocumentChunkIdArray: mergedWorkspaceChunks,
      });
    });

    this.logger.log(`[INFO] [CONSOLIDATE] Consolidated down to ${consolidatedLeaves.length} unique semantic leaves.`);
    return Object.freeze(consolidatedLeaves);
  }

  private mergeUnique(arr: readonly string[]): readonly string[] {
    return Object.freeze(Array.from(new Set(arr)));
  }
}
// --- END OF FILE ---