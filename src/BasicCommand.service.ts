// --- START OF FILE: src/basic-command.service.ts ---
import { Injectable } from '@nestjs/common';
import { CommandRunner, Command, Option } from 'nest-commander';
import { LoggerService } from './logger/logger.service';
import { PdfParserService } from './parser/pdf-parser.service';
import { DeepSeekService } from './ai/deepseek.service';
import { ConsolidationService } from './pipeline/consolidation.service';
import { TreeBuilderService } from './pipeline/tree-builder.service';
import { DocumentChunk, ProcurementMatchDeliverable } from './types/procurement';
import * as path from 'path';
import * as fs from 'fs';

interface BasicCommandOptions {
  input?: string;
  apiKey?: string;
  output?: string;
}

@Command({ name: 'process', description: 'Run the full BOND AI extraction pipeline' })
export class BasicCommand extends CommandRunner {
  
  constructor(
    private readonly logger: LoggerService,
    private readonly pdfParser: PdfParserService,
    private readonly deepSeek: DeepSeekService,
    private readonly consolidation: ConsolidationService,
    private readonly treeBuilder: TreeBuilderService
  ){
    super();
  }

  async run(passedParams: string[], options?: BasicCommandOptions): Promise<void> {
    const inputPath = options?.input;
    const apiKey = options?.apiKey;
    const outputPath = options?.output;
    
    if (!inputPath) {
      this.logger.log('Error: Please provide an input file or directory using --input <path>');
      return;
    }

    const absoluteInput = path.resolve(process.cwd(), inputPath);
    this.logger.log(`[INFO] Starting full BOND pipeline for: ${absoluteInput}`);

    try {
      // 1. Gather all PDF files purely
      const files = fs.statSync(absoluteInput).isDirectory()
        ? fs.readdirSync(absoluteInput)
            .filter(f => f.endsWith('.pdf'))
            .map(f => path.join(absoluteInput, f))
        : [absoluteInput];

      this.logger.log(`[INFO] Found ${files.length} PDF documents to process.`);

      // Step A: Parse all PDFs to Immutable Chunks using Promise.all + flat
      const chunkNestedArrays = await Promise.all(
        files.map(file => this.pdfParser.parsePdfToChunks(file))
      );
      const allChunks = chunkNestedArrays.flat();
      
      this.logger.log(`[INFO] Ingestion complete: ${allChunks.length} total chunks extracted.`);

      if (!apiKey) {
        this.logger.log('[HINT] Provide --apiKey <key> to run full AI extraction.');
        return;
      }

      // Step B: Atomic Extraction (LLM Phase)
      this.logger.log(`[INFO] [PIPELINE] Stage 1: Atomic Extraction (LLM)...`);
      const targetChunks = allChunks.filter(c => c.text.trim().length > 50);
      
      const BATCH_SIZE = 5;
      
      // Purely calculate batches without 'let i'
      const numBatches = Math.ceil(targetChunks.length / BATCH_SIZE);
      const batches = Array.from({ length: numBatches }, (_, i) => 
        targetChunks.slice(i * BATCH_SIZE, (i + 1) * BATCH_SIZE)
      );

      // Execute sequential async batches purely using reduce
      const rawLeaves = await batches.reduce(async (accPromise, batch, index) => {
        const acc = await accPromise;
        
        const startPage = index * BATCH_SIZE + 1;
        const endPage = Math.min((index + 1) * BATCH_SIZE, targetChunks.length);
        this.logger.log(`[INFO] [LLM_BATCH] Processing pages ${startPage} to ${endPage} of ${targetChunks.length}...`);
        
        const results = await Promise.all(batch.map(async (chunk) => {
          try {
            return await this.deepSeek.extractLeaves(apiKey, chunk.text, chunk.id);
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            this.logger.error(`[LLM_ERROR] Failed on Page ${chunk.pageNumber}: ${msg}`);
            return []; // Skip failed chunks
          }
        }));
        
        return [...acc, ...results.flat()];
      }, Promise.resolve([] as ProcurementMatchDeliverable[]));
      
      this.logger.log(`[INFO] [PIPELINE] Stage 1 Complete: ${rawLeaves.length} atomic requirements extracted.`);

      // Step C & D: The Pure Core (Direct chaining)
      this.logger.log(`[INFO] [PIPELINE] Stage 2: Cross-Document Consolidation...`);
      const consolidatedLeaves = await this.consolidation.consolidate(rawLeaves);

      this.logger.log(`[INFO] [PIPELINE] Stage 3: Hierarchical Tree Construction...`);
      const finalTree = await this.treeBuilder.buildTree(consolidatedLeaves);

      // Final Success Log & Output
      this.logger.log(`[SUCCESS] Pipeline complete. Generated ${finalTree.length} root categories.`);
      
      if (outputPath) {
        const absoluteOutput = path.resolve(process.cwd(), outputPath);
        fs.writeFileSync(absoluteOutput, JSON.stringify(finalTree, null, 2));
        this.logger.log(`[FILE] Structured JSON saved to: ${absoluteOutput}`);
      }

      this.renderTuiTree(finalTree);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.log(`[ERROR] Pipeline failure: ${errorMessage}`);
    }
  }

  /**
   * Pure functional rendering: Transforms the tree into a single string 
   * via nested maps, rather than triggering line-by-line side-effects via forEach.
   */
  private renderTuiTree(tree: readonly ProcurementMatchDeliverable[]) {
    const outputString = tree.map(root => {
      const rootPages = root.procurementDocumentChunkIdArray
        .map(id => Buffer.from(id, 'base64').toString().split('-').pop())
        .join(', ');

      const rootHeader = `📁 ${root.bulletPoint} (Cited on Pages: ${rootPages})`;
      
      const subNodes = root.deliverableArray.map(sub => {
        const subHeader = `  └─ 📂 ${sub.bulletPoint}`;
        
        const leaves = sub.deliverableArray.map(leaf => {
          const pages = leaf.procurementDocumentChunkIdArray
            .map(id => Buffer.from(id, 'base64').toString().split('-').pop())
            .join(', ');

          return `      └─ 📄 [${leaf.priority.toUpperCase()}] ${leaf.bulletPoint} (Page: ${pages})\n          💡 Reasoning: ${leaf.aiReasoning?.en}`;
        }).join('\n');

        return leaves ? `${subHeader}\n${leaves}` : subHeader;
      }).join('\n');

      return subNodes ? `${rootHeader}\n${subNodes}` : rootHeader;
    }).join('\n\n');

    this.logger.log(`\n${outputString}`);
  }

  @Option({
    flags: '-i, --input [input]',
    description: 'Path to a PDF file or directory of PDFs',
  })
  parseInput(val: string): string {
    return val;
  }

  @Option({
    flags: '-k, --apiKey [key]',
    description: 'DeepSeek API Key',
  })
  parseApiKey(val: string): string {
    return val;
  }

  @Option({
    flags: '-o, --output [file]',
    description: 'Path to save the final JSON tree',
  })
  parseOutput(val: string): string {
    return val;
  }
}
// --- END OF FILE ---