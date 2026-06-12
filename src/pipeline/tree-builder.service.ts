// --- START OF FILE: src/pipeline/tree-builder.service.ts ---
import { Injectable } from '@nestjs/common';
import { ProcurementMatchDeliverable } from '../types/procurement';
import { createProcurementNode } from '../factories/procurement.factory';
import { LoggerService } from '../logger/logger.service';
import { parseLvHierarchy, Option, LvMatch } from '../utils/lv-parser';

@Injectable()
export class TreeBuilderService {
  constructor(private readonly logger: LoggerService) {}

  buildTree(
    leaves: readonly ProcurementMatchDeliverable[]
  ): readonly ProcurementMatchDeliverable[] {
    this.logger.log(`[INFO] [TREE_BUILDER] Building hierarchy from ${leaves.length} consolidated leaves...`);

    // 1. Pure ADT Unwrapping: Filter for 'Some' and map to the actual LvMatch value
    const validMatches = leaves
      .map(leaf => parseLvHierarchy(leaf.bulletPoint))
      .filter((match): match is { kind: 'Some'; value: LvMatch } => match.kind === 'Some')
      .map(match => match.value);

    // Now validMatches is strictly LvMatch[], so .hierarchy works perfectly!
    const uniqueL1Keys = Array.from(new Set(validMatches.map(m => m.hierarchy.level1)));
    const uniqueL2Keys = Array.from(new Set(validMatches.map(m => m.hierarchy.level2)));

    const finalTree = uniqueL1Keys.map(l1Key => {
      const matchingL2Keys = uniqueL2Keys.filter(l2Key => l2Key.startsWith(l1Key));

      const l2Children = matchingL2Keys.map(l2Key => {
        // 2. Pure ADT filtering for children
        const rawChildren = leaves.filter(leaf => {
          const parsed = parseLvHierarchy(leaf.bulletPoint);
          return parsed.kind === 'Some' && parsed.value.hierarchy.level2 === l2Key;
        });
        
        const normalize = (str: string) => str.toLowerCase().replace(/^\d{2}\.\d{2}\.\d{2,4}[A-Z]?\s*/, '').trim();
        const nodeNormalized = normalize(`${l2Key} [Sub-Category]`);
        
        const validChildren = rawChildren.filter(child => {
          const childNormalized = normalize(child.bulletPoint);
          return childNormalized !== nodeNormalized && childNormalized !== l2Key;
        });

        const betterTitle = validChildren.find(c => c.bulletPoint.includes(l2Key))?.bulletPoint 
            || `${l2Key} [Sub-Category]`;

        return createProcurementNode({
          bulletPoint: betterTitle,
          deliverableArray: validChildren,
          procurementDocumentChunkIdArray: this.mergeUnique(validChildren.flatMap(c => c.procurementDocumentChunkIdArray)),
          workspaceDocumentChunkIdArray: this.mergeUnique(validChildren.flatMap(c => c.workspaceDocumentChunkIdArray)),
          citedProductIdArray: this.mergeUnique(validChildren.flatMap(c => c.citedProductIdArray)),
          citedPersonIdArray: this.mergeUnique(validChildren.flatMap(c => c.citedPersonIdArray)),
        });
      });

      const firstChildBullet = l2Children[0]?.bulletPoint;
      const rootTitle = firstChildBullet 
        ? `${firstChildBullet.split('.')[0]} [Root Category]` 
        : `${l1Key} [Category]`;

      return createProcurementNode({
        bulletPoint: rootTitle,
        deliverableArray: l2Children,
        procurementDocumentChunkIdArray: this.mergeUnique(l2Children.flatMap(c => c.procurementDocumentChunkIdArray)),
        workspaceDocumentChunkIdArray: this.mergeUnique(l2Children.flatMap(c => c.workspaceDocumentChunkIdArray)),
        citedProductIdArray: this.mergeUnique(l2Children.flatMap(c => c.citedProductIdArray)),
        citedPersonIdArray: this.mergeUnique(l2Children.flatMap(c => c.citedPersonIdArray)),
      });
    });

    this.logger.log(`[INFO] [TREE_BUILDER] Hierarchy built with ${finalTree.length} root nodes.`);
    return Object.freeze(finalTree);
  }

  private mergeUnique(arr: readonly string[]): readonly string[] {
    return Object.freeze(Array.from(new Set(arr)));
  }
}
// --- END OF FILE ---