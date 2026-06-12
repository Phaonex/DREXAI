// --- START OF FILE: src/ai/deepseek.service.ts ---
import { Injectable } from '@nestjs/common';
import { LoggerService } from '../logger/logger.service';
import { ProcurementMatchDeliverable } from '../types/procurement';
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
      const prompt = `You are a procurement analyst. Extract the core requirements from this text. 
      Return strictly a JSON array of objects with a single key 'bulletPoint'. 
      Example: [{"bulletPoint": "Provide 24/7 support"}].
      Do NOT include markdown formatting, backticks, or explanations. Output pure JSON only.
      Text data: ${text}`;
      
      const rawResponse = await this.callLlm(prompt, apiKey);

      // 1. Pure Data Transformation: Strip hallucinatory markdown backticks
      const cleanJson = rawResponse.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

      // 2. Parse into unknown (Do not trust the data type yet)
      const parsed: unknown = JSON.parse(cleanJson);

      // 3. Strict Schema Validation (Data-Driven Guardrail)
      if (!Array.isArray(parsed) || !parsed.every(item => 
          typeof item === 'object' && 
          item !== null && 
          'bulletPoint' in item && 
          typeof (item as any).bulletPoint === 'string'
      )) {
        throw new Error('LLM output schema violation: Expected Array<{ bulletPoint: string }>');
      }

      // 4. Pure Mapping: Safely instantiate nodes with deep-frozen arrays
      const leaves = parsed.map((item: { bulletPoint: string }) => createProcurementNode({
        bulletPoint: item.bulletPoint,
        procurementDocumentChunkIdArray: Object.freeze([chunkId])
      }));

      // Return the mathematically safe Success state
      return { kind: 'Success', data: Object.freeze(leaves) };
      
    } catch (error) {
      // Trap the explosion and return a mathematically safe Failure state
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`[DeepSeek] Extraction failed for chunk ${chunkId}: ${errorMessage}`);
      
      return { 
        kind: 'Failure', 
        error: error instanceof Error ? error : new Error(errorMessage) 
      };
    }
  }

  /**
   * PHASE 2: Semantically clusters leaves by asking the LLM to group indices.
   */
  async clusterSemantically(
    leaves: readonly ProcurementMatchDeliverable[],
    apiKey?: string
  ): Promise<Array<{ consolidatedBulletPoint: string; originalNodes: ProcurementMatchDeliverable[] }>> {
    this.logger.debug(`[DeepSeek] Clustering ${leaves.length} items...`);
    
    const tokenOptimizedPayload = leaves.map((leaf, index) => ({ index, text: leaf.bulletPoint }));
    const prompt = `Group these items semantically. Return JSON array of { "consolidatedBulletPoint": "...", "originalNodeIndices": [0, 1] }. Data: ${JSON.stringify(tokenOptimizedPayload)}`;
    
    const responseJson = await this.callLlm(prompt, apiKey);
    const parsed = JSON.parse(responseJson) as Array<{ consolidatedBulletPoint: string; originalNodeIndices: number[] }>;
    
    return parsed.map(cluster => ({
      consolidatedBulletPoint: cluster.consolidatedBulletPoint,
      originalNodes: cluster.originalNodeIndices.map(idx => leaves[idx])
    }));
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
    const parsed = JSON.parse(responseJson) as Array<{ l1: string; l2: string; leafIndex: number }>;
    
    return parsed.map(item => ({
      l1: item.l1,
      l2: item.l2,
      leaf: leaves[item.leafIndex]
    }));
  }

  /**
   * The actual network boundary interacting with the real DeepSeek API.
   * Fallback to process.env.DEEPSEEK_KEY if not explicitly passed by the CLI.
   */
  private async callLlm(prompt: string, apiKey?: string): Promise<string> {
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
        throw new Error(`DeepSeek API Error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      return data.choices[0].message.content;
    } catch (error) {
      this.logger.error(`[DeepSeek] Network call failed: ${error}`);
      throw error;
    }
  }
}
// --- END OF FILE ---