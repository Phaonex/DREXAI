import { Injectable } from '@nestjs/common';
import { ProcurementMatchDeliverable } from '../types/procurement';
import { createProcurementNode } from '../factories/procurement.factory';
import { LoggerService } from '../logger/logger.service';
import { parseLvHierarchy } from '../utils/lv-parser';

@Injectable()
export class ConsolidationService {
  constructor(private readonly logger: LoggerService) {}

  async consolidate(
    leaves: readonly ProcurementMatchDeliverable[]
  ): Promise<readonly ProcurementMatchDeliverable[]> {
    this.logger.log(`[INFO] [CONSOLIDATE] Starting consolidation of ${leaves.length} raw leaves...`);

    const consolidated = leaves.reduce((acc: readonly ProcurementMatchDeliverable[], current) => {
      const currentLv = parseLvHierarchy(current.bulletPoint)?.hierarchy.level3;
      
      const existingIndex = acc.findIndex(item => {
        const itemLv = parseLvHierarchy(item.bulletPoint)?.hierarchy.level3;
        
        // CONDITION A: If BOTH have an LV number, they MUST match exactly. No fallback.
        if (currentLv && itemLv) {
          return currentLv === itemLv;
        }
        
        // CONDITION B: If ONLY ONE has an LV number, they are fundamentally different.
        if (currentLv || itemLv) {
          return false;
        }
        
        // CONDITION C: NEITHER has an LV number. Safe to do narrative text matching.
        const normalize = (str: string) => str.toLowerCase().replace(/^\d{2}\.\d{2}\.\d{2,4}[A-Z]?\s*/, '').trim();
        return normalize(item.bulletPoint) === normalize(current.bulletPoint);
      });

      if (existingIndex > -1) {
        const existing = acc[existingIndex];
        
        // Factory-First: Safe, exhaustive merging of ALL array data
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
      }

      return Object.freeze([...acc, current]);
    }, Object.freeze([]));

    this.logger.log(`[INFO] [CONSOLIDATE] Consolidated down to ${consolidated.length} unique leaves.`);
    return consolidated;
  }

  // Pure helper function to keep the reduction clean
  private mergeUnique(arr1: readonly string[], arr2: readonly string[]): readonly string[] {
    return Object.freeze(Array.from(new Set([...arr1, ...arr2])));
  }

  private getHigherConfidence(a: string | null, b: string | null): "high" | "medium" | "low" | null {
    const scores = { high: 3, medium: 2, low: 1 };
    const scoreA = scores[a as keyof typeof scores] || 0;
    const scoreB = scores[b as keyof typeof scores] || 0;
    
    if (scoreA === 0 && scoreB === 0) return null;
    return scoreA >= scoreB ? (a as "high" | "medium" | "low") : (b as "high" | "medium" | "low");
  }
}