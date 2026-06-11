import { Injectable } from '@nestjs/common';
import { ProcurementMatchDeliverable } from '../types/procurement';
import { LoggerService } from '../logger/logger.service';
import { parseLvHierarchy } from '../utils/lv-parser';

@Injectable()
export class ConsolidationService {
  constructor(private readonly logger: LoggerService) {}

  /**
   * Pure transformation: Flat Leaves -> Consolidated Leaves
   * This identifies requirements that are essentially the same and merges them.
   */
  async consolidate(
    leaves: readonly ProcurementMatchDeliverable[]
  ): Promise<readonly ProcurementMatchDeliverable[]> {
    this.logger.log(`[INFO] [CONSOLIDATE] Starting consolidation of ${leaves.length} raw leaves...`);

    const consolidated = leaves.reduce((acc: ProcurementMatchDeliverable[], current) => {
      const currentLv = parseLvHierarchy(current.bulletPoint)?.hierarchy.level3;
      
      const existingIndex = acc.findIndex(item => {
        const itemLv = parseLvHierarchy(item.bulletPoint)?.hierarchy.level3;
        
        // Priority 1: If both have LV numbers, they must match exactly
        if (currentLv && itemLv) {
          return currentLv === itemLv;
        }
        
        // Priority 2: If one is missing an LV number, fall back to normalized name matching
        const normalize = (str: string) => str.toLowerCase().replace(/^\d{2}\.\d{2}\.\d{2,4}[A-Z]?\s*/, '').trim();
        return normalize(item.bulletPoint) === normalize(current.bulletPoint);
      });

      if (existingIndex > -1) {
      const existing = acc[existingIndex];
      
      const mergedNode: ProcurementMatchDeliverable = {
        ...existing,
        description: {
          ...existing.description,
          en: existing.description.en.length >= current.description.en.length 
            ? existing.description.en 
            : current.description.en
        },
        procurementDocumentChunkIdArray: Array.from(new Set([
          ...existing.procurementDocumentChunkIdArray,
          ...current.procurementDocumentChunkIdArray
        ])),
        confidence: this.getHigherConfidence(existing.confidence, current.confidence)
      };

      // Pure FP: Return a new array replacing the item at existingIndex
      return [
        ...acc.slice(0, existingIndex),
        mergedNode,
        ...acc.slice(existingIndex + 1)
      ];
    }

    // If no match, append immutably
      return [...acc, current];
    }, []);

    this.logger.log(`[INFO] [CONSOLIDATE] Consolidated down to ${consolidated.length} unique leaves.`);
    return Object.freeze(consolidated);
  }

  private getHigherConfidence(a: string | null, b: string | null): "high" | "medium" | "low" | null {
    const scores = { high: 3, medium: 2, low: 1 };
    const scoreA = scores[a as keyof typeof scores] || 0;
    const scoreB = scores[b as keyof typeof scores] || 0;
    
    return scoreA >= scoreB ? (a as any) : (b as any);
  }
}
