// --- START OF FILE: src/ai/deepseek.service.ts ---
import { Injectable } from '@nestjs/common';
import axios from 'axios';
import { LeafExtractionSchema, ProcurementMatchDeliverable } from '../types/procurement';
import { createProcurementNode } from '../factories/procurement.factory';

// 1. Define the boundary ADT (or import it if you moved it to types/procurement.ts)
export type Result<T, E = Error> = 
  | { readonly kind: 'Success'; readonly data: Readonly<T> }
  | { readonly kind: 'Failure'; readonly error: E };

@Injectable()
export class DeepSeekService {
  private readonly apiUrl = 'https://api.deepseek.com/chat/completions';

  /**
   * Network I/O Boundary: Converts chaotic LLM responses into strict, pure ADTs.
   */
  async extractLeaves(
    apiKey: string,
    text: string,
    chunkId: string
  ): Promise<Result<readonly ProcurementMatchDeliverable[]>> {
    const prompt = `
    Extract all individual procurement requirements (Level 3 positions) from the following text.
    
    CRITICAL INSTRUCTION: 
    - Most requirements start with an LV number (e.g., 01.01.0010 or 02.02.001A). 
    - You MUST include this number at the start of the "bulletPoint" field.
    - If a requirement has no number, just provide the name.

    For each requirement, identify:
    - bulletPoint: The LV number followed by a short name (e.g., "01.01.0010 Excavation")
    - descriptionEn: Detailed description translated to English
    - descriptionDe: Original German description
    - priority: "must" if it's a "Muss-Kriterium", "should" if it's a "Soll-Kriterium", otherwise "optional"
    - confidence: How sure you are about the extraction (high, medium, low)
    - equivalenceAllowed: boolean if "Gleichwertigkeit" is mentioned, else null
    - reasoningEn: Why you chose this priority and how it relates to the project.

    Return the result ONLY as a JSON array matching this structure:
    [{ "bulletPoint": string, "descriptionEn": string, "descriptionDe": string, "priority": "must"|"should"|"optional", "confidence": "high"|"medium"|"low", "equivalenceAllowed": boolean|null, "reasoningEn": string }]

    --- Text Content ---
    ${text}
    `;

    try {
      const response = await axios.post(
        this.apiUrl,
        {
          model: 'deepseek-chat',
          messages: [
            { role: 'system', content: 'You are a professional AI Procurement Engineer specializing in DACH tender documents.' },
            { role: 'user', content: prompt }
          ],
          response_format: { type: 'json_object' },
          temperature: 0.1
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
          }
        }
      );

      const rawContent = response.data.choices[0].message.content;
      
      const sanitized = rawContent
        .replace(/[\u0000-\u001F\u007F-\u009F]/g, "")
        .replace(/^```json/, "")
        .replace(/```$/, "")
        .trim();

      const parsedData = JSON.parse(sanitized);
      const leafArray = Array.isArray(parsedData) ? parsedData : (parsedData.requirements || parsedData.leaves || []);

      // 2. Pure Mapping with safeParse (Drops hallucinations without throwing exceptions)
      const validNodes = leafArray
        .map((raw: unknown) => LeafExtractionSchema.safeParse(raw))
        .filter((validation): validation is { success: true; data: any } => validation.success)
        .map(validation => {
          const validated = validation.data;
          
          // 3. Factory-First Instantiation
          return createProcurementNode({
            bulletPoint: validated.bulletPoint,
            description: {
              en: validated.descriptionEn,
              de: validated.descriptionDe || ''
            },
            priority: validated.priority,
            confidence: validated.confidence,
            equivalenceAllowed: validated.equivalenceAllowed,
            aiReasoning: { en: validated.reasoningEn },
            procurementDocumentChunkIdArray: [chunkId]
          });
        });

      return { kind: 'Success', data: Object.freeze(validNodes) };

    } catch (error) {
      // 4. Trap all network and parsing explosions here, return pure data
      return { 
        kind: 'Failure', 
        error: error instanceof Error ? error : new Error(String(error)) 
      };
    }
  }
}
// --- END OF FILE ---