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
import * as readline from 'readline/promises';
import { stdin as input, stdout as output } from 'process';

interface BasicCommandOptions {
  input?: string;
  apiKey?: string;
  output?: string;
  pages?: string; // Format: "1-2"
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
    const outputPath = options?.output;
    const pageRange = options?.pages ? this.parseRange(options.pages) : null;
    
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

      // Step A: Parse all PDFs to Immutable Chunks
      const chunkNestedArrays = await Promise.all(
        files.map(file => this.pdfParser.parsePdfToChunks(file))
      );
      const allChunks = chunkNestedArrays.flat();
      
      this.logger.log(`[INFO] Ingestion complete: ${allChunks.length} total chunks extracted.`);

      // Isolate the I/O side-effect and maintain immutability in the main flow
      const activeApiKey = await this.resolveApiKey(options?.apiKey);

      if (!activeApiKey || activeApiKey.trim() === '') {
        this.logger.log('[ERROR] Pipeline aborted. API Key is required for LLM extraction.');
        return;
      }

      // Step B: Atomic Extraction (LLM Phase)
      this.logger.log(`[INFO] [PIPELINE] Stage 1: Atomic Extraction (LLM)...`);
      
      // Surgical Filter: Apply page range here
      const targetChunks = allChunks
        .filter(c => c.text.trim().length > 50)
        .filter(c => !pageRange || (c.pageNumber >= pageRange.start && c.pageNumber <= pageRange.end));
      
      const BATCH_SIZE = 5;
      
      const numBatches = Math.ceil(targetChunks.length / BATCH_SIZE);
      const batches = Array.from({ length: numBatches }, (_, i) => 
        targetChunks.slice(i * BATCH_SIZE, (i + 1) * BATCH_SIZE)
      );

      const rawLeaves = await batches.reduce(async (accPromise, batch, index) => {
        const acc = await accPromise;
        
        const startPage = index * BATCH_SIZE + 1;
        const endPage = Math.min((index + 1) * BATCH_SIZE, targetChunks.length);
        this.logger.log(`[INFO] [LLM_BATCH] Processing pages ${startPage} to ${endPage} of ${targetChunks.length}...`);
        
        const results = await Promise.all(batch.map(async (chunk) => {
          try {
            // Use the strictly resolved activeApiKey here
            return await this.deepSeek.extractLeaves(activeApiKey, chunk.text, chunk.id);
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            this.logger.error(`[LLM_ERROR] Failed on Page ${chunk.pageNumber}: ${msg}`);
            return [];
          }
        }));
        
        return [...acc, ...results.flat()];
      }, Promise.resolve([] as ProcurementMatchDeliverable[]));
      
      this.logger.log(`[INFO] [PIPELINE] Stage 1 Complete: ${rawLeaves.length} atomic requirements extracted.`);

      // Step C & D: The Pure Core
      this.logger.log(`[INFO] [PIPELINE] Stage 2: Cross-Document Consolidation...`);
      const consolidatedLeaves = await this.consolidation.consolidate(rawLeaves);

      this.logger.log(`[INFO] [PIPELINE] Stage 3: Hierarchical Tree Construction...`);
      const finalTree = await this.treeBuilder.buildTree(consolidatedLeaves);

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
   * Pure I/O isolation method. Resolves the API key from CLI, Env, or interactive prompt.
   */
  private async resolveApiKey(cliKey?: string): Promise<string | undefined> {
    if (cliKey && cliKey !== '$DEEPSEEK_KEY') return cliKey;
    if (process.env.DEEPSEEK_KEY) return process.env.DEEPSEEK_KEY;

    this.logger.log('[INFO] No API key detected in flags or environment.');
    const rl = readline.createInterface({ input, output });
    const promptedKey = await rl.question('🔑 Please enter your DeepSeek API Key: ');
    rl.close();
    
    return promptedKey;
  }

  private parseRange(range: string) {
    const [start, end] = range.split('-').map(Number);
    return { start, end };
  }

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

  @Option({ flags: '-i, --input [input]', description: 'Path to a PDF file or directory of PDFs' })
  parseInput(val: string): string { return val; }

  @Option({ flags: '-k, --apiKey [key]', description: 'DeepSeek API Key' })
  parseApiKey(val: string): string { return val; }

  @Option({ flags: '-o, --output [file]', description: 'Path to save the final JSON tree' })
  parseOutput(val: string): string { return val; }

  @Option({ flags: '-p, --pages [pages]', description: 'Range, e.g., 1-2' })
  parsePages(val: string): string { return val; }
}
// --- END OF FILE ---