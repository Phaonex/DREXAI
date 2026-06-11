// --- START OF FILE: src/pipeline/tree-builder.service.ts ---
import { Injectable } from '@nestjs/common';
import { ProcurementMatchDeliverable } from '../types/procurement';
import { LoggerService } from '../logger/logger.service';
import { parseLvHierarchy } from '../utils/lv-parser';

@Injectable()
export class TreeBuilderService {
  constructor(private readonly logger: LoggerService) {}

  /**
   * Pure transformation: Consolidated Leaves -> Hierarchical Tree (L1 -> L2 -> L3)
   */
  async buildTree(
    leaves: readonly ProcurementMatchDeliverable[]
  ): Promise<readonly ProcurementMatchDeliverable[]> {
    this.logger.log(`[INFO] [TREE_BUILDER] Building hierarchy from ${leaves.length} consolidated leaves...`);

    // 1. Extract valid matches purely
    const validMatches = leaves
      .map(leaf => parseLvHierarchy(leaf.bulletPoint))
      .filter((match): match is NonNullable<typeof match> => match !== null);

    // 2. Derive unique L1 and L2 keys purely
    const uniqueL1Keys = Array.from(new Set(validMatches.map(m => m.hierarchy.level1)));
    const uniqueL2Keys = Array.from(new Set(validMatches.map(m => m.hierarchy.level2)));

    // 3. Compose the tree Top-Down using purely nested .map() calls
    const finalTree = uniqueL1Keys.map(l1Key => {
      // Find L2 keys belonging to this L1
      const matchingL2Keys = uniqueL2Keys.filter(l2Key => l2Key.startsWith(l1Key));

      // Build L2 Nodes
      const l2Children = matchingL2Keys.map(l2Key => {
        const rawChildren = leaves.filter(
          leaf => parseLvHierarchy(leaf.bulletPoint)?.hierarchy.level2 === l2Key
        );
        
        const normalize = (str: string) => str.toLowerCase().replace(/^\d{2}\.\d{2}\.\d{2,4}[A-Z]?\s*/, '').trim();
        const nodeNormalized = normalize(`${l2Key} [Sub-Category]`);
        
        const validChildren = rawChildren.filter(child => {
          const childNormalized = normalize(child.bulletPoint);
          return childNormalized !== nodeNormalized && childNormalized !== l2Key;
        });

        const betterTitle = validChildren.find(c => c.bulletPoint.includes(l2Key))?.bulletPoint 
            || `${l2Key} [Sub-Category]`;

        return {
          ...this.createEmptyNode(betterTitle),
          deliverableArray: validChildren,
          procurementDocumentChunkIdArray: Array.from(new Set(validChildren.flatMap(c => c.procurementDocumentChunkIdArray)))
        };
      });

      const rootTitle = l2Children[0]?.bulletPoint.split('.')[0] + " [Root Category]" || `${l1Key} [Category]`;

      // Return the L1 Node (pure replacement for array.push)
      return {
        ...this.createEmptyNode(rootTitle),
        deliverableArray: l2Children,
        procurementDocumentChunkIdArray: Array.from(new Set(l2Children.flatMap(c => c.procurementDocumentChunkIdArray)))
      };
    });

    this.logger.log(`[INFO] [TREE_BUILDER] Hierarchy built with ${finalTree.length} root nodes.`);
    return Object.freeze(finalTree);
  }

  private createEmptyNode(title: string): ProcurementMatchDeliverable {
    return {
      bulletPoint: title,
      description: { en: "" },
      priority: "must",
      confidence: "high",
      equivalenceAllowed: null,
      fullfillable: null,
      status: "waitingForAnalysis",
      aiReasoning: null,
      feedback: null,
      feedbackText: null,
      openQuestionId: null,
      deliverableArray: [],
      procurementDocumentChunkIdArray: [],
      workspaceDocumentChunkIdArray: [],
      citedProductIdArray: [],
      citedPersonIdArray: [],
    };
  }
}
// --- END OF FILE ---