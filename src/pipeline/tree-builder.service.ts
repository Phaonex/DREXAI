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

    const l1Nodes = new Map<string, ProcurementMatchDeliverable>();
    const l2Nodes = new Map<string, ProcurementMatchDeliverable>();

    // 1. Identify all L1 and L2 keys present in the leaves
    leaves.forEach(leaf => {
      const match = parseLvHierarchy(leaf.bulletPoint);
      if (!match) return;

      const { hierarchy, title } = match;

      if (!l1Nodes.has(hierarchy.level1)) {
        l1Nodes.set(hierarchy.level1, this.createEmptyNode(`${hierarchy.level1} [Category]`));
      }

      if (!l2Nodes.has(hierarchy.level2)) {
        l2Nodes.set(hierarchy.level2, this.createEmptyNode(`${hierarchy.level2} [Sub-Category]`));
      }
    });

    // 2. Nest L3 leaves into L2 parents
    const l2WithChildren = new Map<string, ProcurementMatchDeliverable>();
    l2Nodes.forEach((node, key) => {
      let children = leaves.filter(leaf => parseLvHierarchy(leaf.bulletPoint)?.hierarchy.level2 === key);
      
      // DEDUPLICATION: Remove children that are identical to the L2 header itself
      const normalize = (str: string) => str.toLowerCase().replace(/^\d{2}\.\d{2}\.\d{2,4}[A-Z]?\s*/, '').trim();
      const nodeNormalized = normalize(node.bulletPoint);
      
      children = children.filter(child => {
        const childNormalized = normalize(child.bulletPoint);
        // If the child name is essentially the same as the parent and has no sub-children, it's just header noise
        return childNormalized !== nodeNormalized && childNormalized !== key;
      });

      // Try to find a better title for the L2 node from the children's text if possible
      const betterTitle = children.find(c => c.bulletPoint.includes(key))?.bulletPoint || node.bulletPoint;

      l2WithChildren.set(key, { 
        ...node, 
        bulletPoint: betterTitle,
        deliverableArray: children,
        procurementDocumentChunkIdArray: Array.from(new Set(children.flatMap(c => c.procurementDocumentChunkIdArray)))
      });
    });

    // 3. Nest L2 nodes into L1 parents
    const finalTree: ProcurementMatchDeliverable[] = [];
    l1Nodes.forEach((node, l1Key) => {
      const children = Array.from(l2WithChildren.entries())
        .filter(([l2Key]) => l2Key.startsWith(l1Key))
        .map(([_, l2Node]) => l2Node);
      
      const betterTitle = children[0]?.bulletPoint.split('.')[0] + " [Root Category]" || node.bulletPoint;

      finalTree.push({ 
        ...node, 
        bulletPoint: betterTitle,
        deliverableArray: children,
        procurementDocumentChunkIdArray: Array.from(new Set(children.flatMap(c => c.procurementDocumentChunkIdArray)))
      });
    });

    this.logger.log(`[INFO] [TREE_BUILDER] Hierarchy built with ${finalTree.length} root nodes.`);
    return Object.freeze(finalTree);
  }

  private extractHierarchy(leaf: ProcurementMatchDeliverable) {
    // Try to find an LV number in the bullet point or description
    const lvMatch = parseLvHierarchy(leaf.bulletPoint);
    if (lvMatch) return lvMatch;

    // Fallback: Check if description starts with an LV number
    const descMatch = parseLvHierarchy(leaf.description.en);
    return descMatch;
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
