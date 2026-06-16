import { Injectable } from '@nestjs/common';
import { LoggerService } from '../logger/logger.service';
import { ProcurementMatchDeliverable, LeafExtractionSchema, SemanticCluster } from '../types/procurement';
import { createProcurementNode } from '../factories/procurement.factory';

export type Result<T, E = Error> = 
  | { readonly kind: 'Success'; readonly data: Readonly<T> }
  | { readonly kind: 'Failure'; readonly error: E };

@Injectable()
export class DeepSeekService {
  constructor(private readonly logger: LoggerService) {}

  /**
   * PHASE 1: Extracts raw requirements from document text.
   * Maps the LLM string outputs safely into immutable BONDIQ nodes.
   */
  async extractLeaves(
    apiKey: string, 
    text: string, 
    chunkId: string
  ): Promise<Result<readonly ProcurementMatchDeliverable[]>> {
    this.logger.debug(`[DeepSeek] Extracting leaves from chunk: ${chunkId}`);
    
    try {
      const prompt = `You are a procurement analyst. Extract every individual obligation and requirement from this tender text.
      For each requirement, provide:
      1. A short, concise name ('bulletPoint')
      2. A detailed description in English ('descriptionEn')
      3. Priority: 'must' (mandatory), 'should' (recommended), or 'optional'
      4. Confidence: 'high', 'medium', or 'low'
      5. equivalenceAllowed: boolean (true if 'or equivalent' is accepted, false otherwise, null if silent)
      6. A brief AI reasoning for the extraction and priority ('reasoningEn')

      Return strictly a JSON array of these objects. 
      Do NOT include markdown formatting, backticks, or explanations. Output pure JSON only.
      
      Text data: ${text}`;
      
      const rawResponse = await this.callLlm(prompt, apiKey);
      const parsed = this.safeJsonParse(rawResponse);

      // 3. Strict Schema Validation (Data-Driven Guardrail)
      if (!Array.isArray(parsed)) {
        throw new Error('LLM output schema violation: Expected an array of requirements');
      }

      // 4. Pure Mapping: Safely instantiate nodes with domain validation
      const leaves = parsed.flatMap((item: unknown) => {
        const result = LeafExtractionSchema.safeParse(item);
        
        if (!result.success) {
          this.logger.warn(`[DeepSeek] Skipping invalid requirement: ${JSON.stringify(result.error.format())}`);
          return [];
        }

        const validated = result.data;
        return [createProcurementNode({
          bulletPoint: validated.bulletPoint,
          description: { en: validated.descriptionEn },
          priority: validated.priority,
          confidence: validated.confidence,
          equivalenceAllowed: validated.equivalenceAllowed,
          procurementDocumentChunkIdArray: Object.freeze([chunkId])
        })];
      });

      return { kind: 'Success', data: Object.freeze(leaves) };
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`[DeepSeek] Extraction failed for chunk ${chunkId}: ${errorMessage}`);
      
      return { 
        kind: 'Failure', 
        error: error instanceof Error ? error : new Error(errorMessage) 
      };
    }
  }

  /**
   * PHASE 2: Semantically clusters leaves and synthesizes unified descriptions.
   * BONDIQ COMPLIANT: Groups requirements from scattered pages and merges their technical specs.
   */
  async clusterSemantically(
    leaves: readonly ProcurementMatchDeliverable[],
    apiKey?: string
  ): Promise<readonly SemanticCluster[]> {
    this.logger.debug(`[DeepSeek] Clustering and synthesizing ${leaves.length} items...`);
    
    const tokenOptimizedPayload = leaves.map((leaf, index) => {
      // Extract the filename from the first chunk ID for context to prevent cross-tender leaks
      const sourceFile = leaf.procurementDocumentChunkIdArray.length > 0
        ? Buffer.from(leaf.procurementDocumentChunkIdArray[0], 'base64').toString().split('-').shift()
        : 'Unknown Source';

      return { 
        index, 
        sourceFile,
        bulletPoint: leaf.bulletPoint,
        description: leaf.description.en,
        priority: leaf.priority
      };
    });

    const prompt = `You are a procurement consolidation expert. Group these requirements semantically.
    Requirements from different pages often describe the same obligation or add technical detail to it.
    
    CRITICAL: Only merge items if they genuinely belong to the same technical requirement. 
    Use the 'sourceFile' context to avoid merging requirements from unrelated tenders unless they are identical.

    For each cluster, provide:
    1. 'consolidatedBulletPoint': A single, unified name for the requirement.
    2. 'consolidatedDescription': A single, cohesive technical description that merges all specifications from the grouped items without redundancy.
    3. 'consolidatedReasoning': A brief explanation of why these were merged and the importance of this requirement.
    4. 'originalNodeIndices': The array of indices from the input data that belong to this cluster.

    Return strictly a JSON array of these cluster objects.
    Data: ${JSON.stringify(tokenOptimizedPayload)}`;
    
    const responseJson = await this.callLlm(prompt, apiKey);
    const parsed = this.safeJsonParse(responseJson) as Array<{ 
      consolidatedBulletPoint: string; 
      consolidatedDescription: string; 
      consolidatedReasoning: string;
      originalNodeIndices: number[] 
    }>;
    
    const clusters = parsed.map(cluster => ({
      consolidatedBulletPoint: cluster.consolidatedBulletPoint,
      consolidatedDescription: cluster.consolidatedDescription,
      consolidatedReasoning: cluster.consolidatedReasoning,
      originalNodes: Object.freeze(cluster.originalNodeIndices.map(idx => leaves[idx]))
    }));

    return Object.freeze(clusters);
  }

  /**
   * PHASE 3: Assigns L1/L2 categories by asking the LLM to tag indices.
   */
  async categorizeLeaves(
    leaves: readonly ProcurementMatchDeliverable[],
    apiKey?: string
  ): Promise<Array<{ l1: string; l2: string; leaf: ProcurementMatchDeliverable }>> {
    this.logger.debug(`[DeepSeek] Categorizing ${leaves.length} items...`);
    
    const tokenOptimizedPayload = leaves.map((leaf, index) => ({ index, text: leaf.bulletPoint }));
    const prompt = `Categorize these items. Return JSON array of { "l1": "Category", "l2": "SubCategory", "leafIndex": 0 }. Data: ${JSON.stringify(tokenOptimizedPayload)}`;
    
    const responseJson = await this.callLlm(prompt, apiKey);
    const parsed = this.safeJsonParse(responseJson) as Array<{ 
      l1: string; 
      l2: string; 
      leafIndex: number 
    }>;
    
    return parsed.map(item => ({
      l1: item.l1,
      l2: item.l2,
      leaf: leaves[item.leafIndex]
    }));
  }

  /**
   * Robust JSON parsing with sanitization and self-healing.
   * Handles common LLM errors like unescaped quotes or token-limit truncation.
   */
  private safeJsonParse(input: string): any {
    // 1. Strip potential markdown code blocks
    let cleaned = input.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

    try {
      return JSON.parse(cleaned);
    } catch (e) {
      this.logger.warn(`[DeepSeek] Initial JSON parse failed. Attempting structural repair...`);
      
      // 2. Truncation Recovery: If the LLM hit a token limit and cut off mid-JSON
      if (!cleaned.endsWith(']') && !cleaned.endsWith('}')) {
        const lastCompleteObject = cleaned.lastIndexOf('}');
        if (lastCompleteObject !== -1) {
          this.logger.warn(`[DeepSeek] Detected truncated JSON. Recovering items up to position ${lastCompleteObject}...`);
          const recovered = cleaned.substring(0, lastCompleteObject + 1) + ']';
          try {
            return JSON.parse(recovered);
          } catch (innerErr) {
            // If recovery fails, fall through to quote repair
          }
        }
      }

      try {
        // 3. Structural Repair Stage: Escape unescaped double quotes in values
        cleaned = cleaned.replace(/":\s*"(.*?)"(\s*[,}]) /g, (match, value, suffix) => {
          const escapedValue = value.replace(/"/g, '\\"');
          return `": "${escapedValue}"${suffix}`;
        });
        
        return JSON.parse(cleaned);
      } catch (innerError) {
        this.logger.error(`[DeepSeek] Critical JSON Malformation: ${cleaned}`);
        throw new Error(`LLM returned malformed JSON that could not be repaired: ${(e as Error).message}`);
      }
    }
  }

  /**
   * The actual network boundary interacting with the real DeepSeek API.
   * Includes a simple retry mechanism with exponential backoff for resilience.
   */
  private async callLlm(prompt: string, apiKey?: string, retries = 3): Promise<string> {
    const key = apiKey || process.env.DEEPSEEK_KEY;
    if (!key) {
      throw new Error('DeepSeek API key is missing. Pass it via CLI or set DEEPSEEK_KEY env var.');
    }

    try {
      // DeepSeek is OpenAI-compatible
      const response = await fetch('https://api.deepseek.com/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${key}`
        },
        body: JSON.stringify({
          model: 'deepseek-chat',
          messages: [
            { role: 'system', content: 'You are a precise data extraction system. Return ONLY valid JSON, without markdown formatting or code blocks.' },
            { role: 'user', content: prompt }
          ],
          response_format: { type: 'json_object' }, // Ensures raw JSON output
          temperature: 0.1 // Low temperature for deterministic outputs
        })
      });

      if (!response.ok) {
        if (response.status === 429 && retries > 0) {
          this.logger.warn(`[DeepSeek] Rate limited (429). Retrying in 2s...`);
          await new Promise(res => setTimeout(res, 2000));
          return this.callLlm(prompt, apiKey, retries - 1);
        }
        throw new Error(`DeepSeek API Error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json() as any;
      return data.choices[0].message.content;
    } catch (error) {
      if (retries > 0) {
        this.logger.warn(`[DeepSeek] Network glitch (${(error as Error).message}). Retrying...`);
        // Exponential backoff: 1s, 2s, 3s...
        await new Promise(res => setTimeout(res, 1000 * (4 - retries)));
        return this.callLlm(prompt, apiKey, retries - 1);
      }
      this.logger.error(`[DeepSeek] Network call failed after retries: ${error}`);
      throw error;
    }
  }
}
