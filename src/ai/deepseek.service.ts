import { Injectable } from '@nestjs/common';
import axios from 'axios';
import { LeafExtractionSchema, ProcurementMatchDeliverable } from '../types/procurement';
import { z } from 'zod';

@Injectable()
export class DeepSeekService {
  private readonly apiUrl = 'https://api.deepseek.com/chat/completions';

  /**
   * Pure-ish transformation: Text + Context -> Structured Extraction
   */
  async extractLeaves(
    apiKey: string,
    text: string,
    chunkId: string
  ): Promise<readonly ProcurementMatchDeliverable[]> {
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
          response_format: { type: 'json_object' }, // DeepSeek supports JSON mode
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
      
      // Robustness: Strip control characters and handle common LLM markdown wraps
      const sanitized = rawContent
        .replace(/[\u0000-\u001F\u007F-\u009F]/g, "") // Remove control characters
        .replace(/^```json/, "")
        .replace(/```$/, "")
        .trim();

      const parsedData = JSON.parse(sanitized);
      
      // Handle different possible JSON wraps from LLM
      const leafArray = Array.isArray(parsedData) ? parsedData : (parsedData.requirements || parsedData.leaves || []);

      return leafArray.map((raw: any) => {
        const validated = LeafExtractionSchema.parse(raw);
        return this.createDefaultNode({
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

    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new Error(`LLM Schema Validation Failed: ${error.message}`);
      }
      throw error;
    }
  }

  private createDefaultNode(params: Partial<ProcurementMatchDeliverable>): ProcurementMatchDeliverable {
    return {
      bulletPoint: params.bulletPoint ?? "",
      description: params.description ?? { en: "" },
      priority: params.priority ?? "must",
      confidence: params.confidence ?? "high",
      equivalenceAllowed: params.equivalenceAllowed ?? null,
      fullfillable: null,
      status: "waitingForAnalysis",
      aiReasoning: params.aiReasoning ?? null,
      feedback: null,
      feedbackText: null,
      openQuestionId: null,
      deliverableArray: [],
      procurementDocumentChunkIdArray: params.procurementDocumentChunkIdArray ?? [],
      workspaceDocumentChunkIdArray: [],
      citedProductIdArray: [],
      citedPersonIdArray: [],
    };
  }
}
