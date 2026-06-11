import { describe, beforeAll, it, expect } from '@jest/globals';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

describe('BOND CLI Extraction Pipeline (E2E)', () => {
  const inputPdf = 'docs/Tender_For_Christmas_Lights_Installation_2026.pdf';
  const outputFile = 'test_output.json';
  const absoluteOutput = path.resolve(process.cwd(), outputFile);

  // State captured once during setup
  let stdout: string;
  let sanitizedStdout: string;
  let outputData: readonly any[];

  beforeAll(() => {
    // 1. Pure cleanup
    if (fs.existsSync(absoluteOutput)) fs.unlinkSync(absoluteOutput);

    const apiKey = process.env.DEEPSEEK_KEY; 
    if (!apiKey) throw new Error('DEEPSEEK_KEY is missing for E2E test.');

    // 2. The single I/O execution
    stdout = execSync(
      `npx ts-node -r tsconfig-paths/register src/main.ts process --input ${inputPdf} --apiKey ${apiKey} --output ./${outputFile} --pages 1-2`,
      { encoding: 'utf-8' }
    );

    // 3. Prepare immutable test states
    sanitizedStdout = stdout
      .replace(/\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\]/g, '[TIMESTAMP]')
      .split(process.cwd()).join('<WORKSPACE_ROOT>');

    if (!fs.existsSync(absoluteOutput)) {
      throw new Error('Pipeline failed to generate the output file.');
    }
    
    outputData = Object.freeze(JSON.parse(fs.readFileSync(absoluteOutput, 'utf-8')));

  }, 60000); // The 60s timeout belongs on beforeAll since that's where the API call happens

  // --- TEST 1: The UI / Logging Boundary ---
  it('should emit the correct deterministic Terminal UI', () => {
    // 1. Check that the pipeline finished without errors
    expect(stdout).toContain('[SUCCESS] Pipeline complete.');
    expect(stdout).toMatch(/root categories/i);
    
    // 2. Check the Shape of the UI (Did it render the ASCII tree?)
    expect(sanitizedStdout).toContain('📁');
    expect(sanitizedStdout).toContain('└─ 📂');
    
    // We REMOVE the UI Snapshot because the probabilistic LLM 
    // will change the number of lines printed every run!
  });

  // --- TEST 2: The Functional / Data Boundary ---
  it('should build a structurally valid JSON data tree', () => {
    // Assert that the pipeline returned a valid, non-empty array
    expect(Array.isArray(outputData)).toBe(true);
    expect(outputData.length).toBeGreaterThan(0);

    // 2. Assert the exact Data-Driven shape of the nodes
    const firstNode = outputData[0];
    
    expect(firstNode).toHaveProperty('bulletPoint');
    expect(firstNode).toHaveProperty('priority');
    expect(firstNode).toHaveProperty('deliverableArray');
    expect(Array.isArray(firstNode.deliverableArray)).toBe(true);
    
    // If there are sub-nodes, assert they have the required AI Reasoning
    if (firstNode.deliverableArray.length > 0) {
      const subNode = firstNode.deliverableArray[0];
      if (subNode.deliverableArray.length > 0) {
        const leafNode = subNode.deliverableArray[0];
        expect(leafNode).toHaveProperty('aiReasoning');
        expect(leafNode).toHaveProperty('procurementDocumentChunkIdArray');
      }
    }

    // We REMOVE the exact JSON Snapshot because LLM text drift breaks it!
  });
});