// --- START OF FILE: src/pipeline/consolidation.service.ts ---
import { Injectable } from '@nestjs/common';
import { ProcurementMatchDeliverable } from '../types/procurement';
import { createProcurementNode } from '../factories/procurement.factory';
import { LoggerService } from '../logger/logger.service';
import { parseLvHierarchy } from '../utils/lv-parser';

type ConfidenceLevel = ProcurementMatchDeliverable['confidence'];

// 1. ADT for the Comparison State
type LvMatchState = 'ExactLvMatch' | 'LvMismatch' | 'PartialLv' | 'NoLv';

// 2. ADT for the Array Reduction Action
type ReductionAction = 'UpdateExisting' | 'AppendNew';

@Injectable()
export class ConsolidationService {
  constructor(private readonly logger: LoggerService) {}

  consolidate(
    leaves: readonly ProcurementMatchDeliverable[]
  ): readonly ProcurementMatchDeliverable[] {
    this.logger.log(`[INFO] [CONSOLIDATE] Starting consolidation of ${leaves.length} raw leaves...`);

    const consolidated = leaves.reduce((acc: readonly ProcurementMatchDeliverable[], current) => {
      // 1. Pure ADT Unpacking for Current
      const parsedCurrent = parseLvHierarchy(current.bulletPoint);
      const currentLv = parsedCurrent.kind === 'Some' ? parsedCurrent.value.hierarchy.level3 : null;
      
      const existingIndex = acc.findIndex(item => {
        // 2. Pure ADT Unpacking for Item
        const parsedItem = parseLvHierarchy(item.bulletPoint);
        const itemLv = parsedItem.kind === 'Some' ? parsedItem.value.hierarchy.level3 : null;
        
        // Pure state evaluation instead of if/else logic
        const matchState: LvMatchState = (currentLv && itemLv) 
          ? (currentLv === itemLv ? 'ExactLvMatch' : 'LvMismatch')
          // ... (keep the rest of your matchState and switch logic exactly the same)
          : (currentLv || itemLv) 
            ? 'PartialLv' 
            : 'NoLv';

        // Exhaustive switch for boolean return
        switch (matchState) {
          case 'ExactLvMatch':
            return true;
          case 'LvMismatch':
          case 'PartialLv':
            return false;
          case 'NoLv':
            const normalize = (str: string) => str.toLowerCase().replace(/^\d{2}\.\d{2}\.\d{2,4}[A-Z]?\s*/, '').trim();
            return normalize(item.bulletPoint) === normalize(current.bulletPoint);
          default:
            const _exhaustiveCheck: never = matchState;
            return _exhaustiveCheck;
        }
      });

      // Pure state evaluation for the reduction step
      const action: ReductionAction = existingIndex > -1 ? 'UpdateExisting' : 'AppendNew';

      // Exhaustive switch for the immutable array update
      switch (action) {
        case 'UpdateExisting':
          const existing = acc[existingIndex];
          const mergedNode = createProcurementNode({
            ...existing,
            description: {
              ...existing.description,
              en: existing.description.en.length >= current.description.en.length 
                ? existing.description.en 
                : current.description.en
            },
            procurementDocumentChunkIdArray: this.mergeUnique(existing.procurementDocumentChunkIdArray, current.procurementDocumentChunkIdArray),
            workspaceDocumentChunkIdArray: this.mergeUnique(existing.workspaceDocumentChunkIdArray, current.workspaceDocumentChunkIdArray),
            citedProductIdArray: this.mergeUnique(existing.citedProductIdArray, current.citedProductIdArray),
            citedPersonIdArray: this.mergeUnique(existing.citedPersonIdArray, current.citedPersonIdArray),
            confidence: this.getHigherConfidence(existing.confidence, current.confidence)
          });

          return Object.freeze([
            ...acc.slice(0, existingIndex),
            mergedNode,
            ...acc.slice(existingIndex + 1)
          ]);

        case 'AppendNew':
          return Object.freeze([...acc, current]);

        default:
          const _exhaustiveCheck: never = action;
          return _exhaustiveCheck;
      }
    }, Object.freeze([]));

    this.logger.log(`[INFO] [CONSOLIDATE] Consolidated down to ${consolidated.length} unique leaves.`);
    return consolidated;
  }

  private mergeUnique(arr1: readonly string[], arr2: readonly string[]): readonly string[] {
    return Object.freeze(Array.from(new Set([...arr1, ...arr2])));
  }

  private getHigherConfidence(a: ConfidenceLevel, b: ConfidenceLevel): ConfidenceLevel {
    const scores: Record<NonNullable<ConfidenceLevel>, number> = { high: 3, medium: 2, low: 1 };
    const scoreA = a ? scores[a] : 0;
    const scoreB = b ? scores[b] : 0;
    
    // Pure ternary expression replacing the final `if`
    return (scoreA === 0 && scoreB === 0) 
      ? null 
      : (scoreA >= scoreB ? a : b);
  }
}
// --- END OF FILE ---