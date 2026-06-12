import { describe, beforeAll, it, expect } from '@jest/globals';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { z } from 'zod';

// 1. Pure Data Contract (Zod Schema)
const baseDeliverableSchema = z.object({
  bulletPoint: z.string(),
  description: z.object({ en: z.string() }),
  priority: z.string().nullable(),
  confidence: z.number().nullable(),
  equivalenceAllowed: z.boolean().nullable(),
  fullfillable: z.boolean().nullable(),
  procurementDocumentChunkIdArray: z.array(z.string()),
  workspaceDocumentChunkIdArray: z.array(z.string()),
  status: z.string(),
  aiReasoning: z.string().nullable(),
  feedback: z.string().nullable(),
  feedbackText: z.string().nullable(),
  openQuestionId: z.string().nullable(),
  citedProductIdArray: z.array(z.string()),
  citedPersonIdArray: z.array(z.string())
}).strict(); // STRICT: Fails immediately if AI hallucinates fields

type ProcurementNodeSchema = z.infer<typeof baseDeliverableSchema> & {
  readonly deliverableArray: readonly ProcurementNodeSchema[];
};

const deliverableSchema: z.ZodType<ProcurementNodeSchema> = baseDeliverableSchema.extend({
  deliverableArray: z.lazy(() => z.array(deliverableSchema))
});

const outputSchema = z.array(deliverableSchema);

describe('BOND CLI Extraction Pipeline (E2E)', () => {
  const inputPdf = 'docs/Tender_For_Christmas_Lights_Installation_2026.pdf';
  const outputFile = 'test_output.json';
  const absoluteOutput = path.resolve(process.cwd(), outputFile);

  let stdout: string;
  let outputData: unknown;

  beforeAll(() => {
    if (fs.existsSync(absoluteOutput)) fs.unlinkSync(absoluteOutput);

    const apiKey = process.env.DEEPSEEK_KEY; 
    if (!apiKey) throw new Error('DEEPSEEK_KEY is missing for E2E test.');

    stdout = execSync(
      `npx ts-node -r tsconfig-paths/register src/main.ts process --input ${inputPdf} --apiKey ${apiKey} --output ./${outputFile} --pages 1-2`,
      { encoding: 'utf-8' }
    );

    if (!fs.existsSync(absoluteOutput)) {
      throw new Error('Pipeline failed to generate the output file.');
    }
    
    outputData = Object.freeze(JSON.parse(fs.readFileSync(absoluteOutput, 'utf-8')));
  }, 60000);

  it('should emit the correct deterministic Terminal UI', () => {
    expect(stdout).toContain('[SUCCESS] Pipeline complete.');
    expect(stdout).toMatch(/root categories/i);
    expect(stdout).toContain('📁');
    expect(stdout).toContain('└─ 📂');
  });

  it('should mathematically guarantee the strict DACH JSON tree structure', () => {
    // Passes the raw output through the pure Zod validation boundary
    const result = outputSchema.safeParse(outputData);

    if (!result.success) {
      console.error(result.error.format());
    }

    expect(result.success).toBe(true);

    if (result.success) {
      const tree = result.data;
      expect(tree.length).toBeGreaterThan(0);
      
      const firstRoot = tree[0];
      expect(firstRoot.procurementDocumentChunkIdArray.length).toBeGreaterThan(0);
      
      const base64Regex = /^[A-Za-z0-9+/]+={0,2}$/;
      expect(firstRoot.procurementDocumentChunkIdArray[0]).toMatch(base64Regex);
    }
  });
});