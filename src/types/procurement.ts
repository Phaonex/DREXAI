import { z } from "zod";

/**
 * Localizable text object as per BOND specification
 */
export type LocaleObject<T> = {
  en: T;
  [key: string]: T;
};

/**
 * The core deliverable structure (L1, L2, and L3)
 */
export interface ProcurementMatchDeliverable {
  readonly bulletPoint: string;
  readonly description: LocaleObject<string>;
  readonly priority: "must" | "should" | "optional";
  readonly confidence: "high" | "medium" | "low" | null;
  readonly equivalenceAllowed: boolean | null;
  readonly fullfillable: "yes" | "no" | "maybe" | null;
  readonly status: "waitingForAnalysis" | "waitingForAnswer" | "waitingForAnswerPropagation" | "waitingForReview" | "userDefined";
  readonly aiReasoning: LocaleObject<string> | null;
  readonly feedback: "good" | "bad" | null;
  readonly feedbackText: string | null;
  readonly openQuestionId: string | null;
  readonly deliverableArray: readonly ProcurementMatchDeliverable[];
  readonly procurementDocumentChunkIdArray: readonly string[];
  readonly workspaceDocumentChunkIdArray: readonly string[];
  readonly citedProductIdArray: readonly string[];
  readonly citedPersonIdArray: readonly string[];
}

/**
 * Zod schema for the initial Atomic L3 Extraction
 * Used to ensure structured output from DeepSeek
 */
export const LeafExtractionSchema = z.object({
  bulletPoint: z.string().describe("Short, concise name of the requirement/position"),
  descriptionEn: z.string().describe("Detailed description in English"),
  descriptionDe: z.string().optional().describe("Original German description if available"),
  priority: z.enum(["must", "should", "optional"]),
  confidence: z.enum(["high", "medium", "low"]),
  equivalenceAllowed: z.boolean().nullable(),
  reasoningEn: z.string().describe("Internal AI reasoning for the extraction and priority"),
});

/**
 * Type for the raw document chunks
 */
export interface DocumentChunk {
  readonly id: string;
  readonly sourceFile: string;
  readonly pageNumber: number;
  readonly text: string;
}

/**
 * Immutable type for extracted LV Position (DACH Standard)
 */
export interface LvPositionKey {
  readonly level1: string; // e.g., "02"
  readonly level2: string; // e.g., "02.01"
  readonly level3: string; // e.g., "02.01.001A"
}
