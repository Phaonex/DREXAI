// --- START OF FILE: src/pipeline/tree-builder.service.ts ---
import { Injectable } from '@nestjs/common';
import { ProcurementMatchDeliverable } from '../types/procurement';
import { createProcurementNode } from '../factories/procurement.factory';
import { LoggerService } from '../logger/logger.service';
import { DeepSeekService } from '../ai/deepseek.service';

@Injectable()
export class TreeBuilderService {
  constructor(
    private readonly logger: LoggerService,
    private readonly deepSeekService: DeepSeekService
  ) {}

  async buildTree(
    leaves: readonly ProcurementMatchDeliverable[]
  ): Promise<readonly ProcurementMatchDeliverable[]> {
    if (leaves.length === 0) return [];

    this.logger.log(`[INFO] [TREE_BUILDER] Starting dynamic semantic nesting of ${leaves.length} leaves...`);

    const categorizedLeaves = await this.deepSeekService.categorizeLeaves(leaves);
    const uniqueL1Keys = Array.from(new Set(categorizedLeaves.map(c => c.l1)));

    const finalTree = uniqueL1Keys.map(l1Key => {
      const l1Items = categorizedLeaves.filter(c => c.l1 === l1Key);
      const uniqueL2Keys = Array.from(new Set(l1Items.map(c => c.l2)));

      const l2Children = uniqueL2Keys.map(l2Key => {
        const l3Leaves = l1Items.filter(c => c.l2 === l2Key).map(c => c.leaf);

        return createProcurementNode({
          bulletPoint: `${l2Key} [Sub-Category]`,
          deliverableArray: l3Leaves,
          procurementDocumentChunkIdArray: this.mergeUnique(l3Leaves.flatMap(c => c.procurementDocumentChunkIdArray)),
          workspaceDocumentChunkIdArray: this.mergeUnique(l3Leaves.flatMap(c => c.workspaceDocumentChunkIdArray)),
        });
      });

      return createProcurementNode({
        bulletPoint: `${l1Key} [Category]`,
        deliverableArray: l2Children,
        procurementDocumentChunkIdArray: this.mergeUnique(l2Children.flatMap(c => c.procurementDocumentChunkIdArray)),
        workspaceDocumentChunkIdArray: this.mergeUnique(l2Children.flatMap(c => c.workspaceDocumentChunkIdArray)),
      });
    });

    this.logger.log(`[INFO] [TREE_BUILDER] Hierarchy built with ${finalTree.length} semantic root nodes.`);
    return Object.freeze(finalTree);
  }

  private mergeUnique(arr: readonly string[]): readonly string[] {
    return Object.freeze(Array.from(new Set(arr)));
  }
}
// --- END OF FILE ---