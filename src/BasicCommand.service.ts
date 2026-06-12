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

// 1. The Monadic Exception-as-Data ADT
type Result<T, E = Error> = 
  | { readonly kind: 'Success'; readonly data: Readonly<T> }
  | { readonly kind: 'Failure'; readonly error: E };

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
      const files = fs.statSync(absoluteInput).isDirectory()
        ? fs.readdirSync(absoluteInput)
            .filter(f => f.endsWith('.pdf'))
            .map(f => path.join(absoluteInput, f))
        : [absoluteInput];

      this.logger.log(`[INFO] Found ${files.length} PDF documents to process.`);

      const chunkNestedArrays = await Promise.all(
        files.map(file => this.pdfParser.parsePdfToChunks(file))
      );
// Step A: Parse all PDFs to Immutable Chunks (Returns Result ADTs)
      const parseResults = await Promise.all(
        files.map(file => this.pdfParser.parsePdfToChunks(file))
      );
      
      // Pure ADT Unpacking: Filter for successes and flatten the inner data arrays
      const allChunks = parseResults
        .filter((res): res is { kind: 'Success'; data: readonly DocumentChunk[] } => res.kind === 'Success')
        .flatMap(res => res.data); // Extracts the actual DocumentChunk objects

      // Optional: Log any files that failed to parse
      const failedPdfs = parseResults.filter(res => res.kind === 'Failure');
      if (failedPdfs.length > 0) {
        this.logger.log(`[WARN] Failed to parse ${failedPdfs.length} documents.`);
      }
      
      this.logger.log(`[INFO] Ingestion complete: ${allChunks.length} total chunks extracted.`);      

      // Isolate the key resolution side-effect cleanly
      const activeApiKey = await this.resolveApiKey(options?.apiKey);

      if (!activeApiKey || activeApiKey.trim() === '') {
        this.logger.log('[ERROR] Pipeline aborted. API Key is required for LLM extraction.');
        return;
      }

      this.logger.log(`[INFO] [PIPELINE] Stage 1: Atomic Extraction (LLM)...`);
      
      const targetChunks = allChunks
        .filter(c => c.text.trim().length > 50)
        .filter(c => !pageRange || (c.pageNumber >= pageRange.start && c.pageNumber <= pageRange.end));
      
      const BATCH_SIZE = 5;
      
      // 2. Consume the generator iterator into an array of batches safely
      const batches = Array.from(this.chunkIterator(targetChunks, BATCH_SIZE));

      const rawLeaves = await batches.reduce(async (accPromise, batch, index) => {
        const acc = await accPromise;
        
        const startPage = index * BATCH_SIZE + 1;
        const endPage = Math.min((index + 1) * BATCH_SIZE, targetChunks.length);
        this.logger.log(`[INFO] [LLM_BATCH] Processing pages ${startPage} to ${endPage} of ${targetChunks.length}...`);
        
        const results = await Promise.all(batch.map(async (chunk) => {
          // ✅ CORRECT: The DeepSeek service returns the ADT directly now!
        const result: Result<readonly ProcurementMatchDeliverable[]> = await this.deepSeek
          .extractLeaves(activeApiKey, chunk.text, chunk.id);

        // 3. Exhaustive Type Pattern Matching remains exactly the same
        switch (result.kind) {
          case 'Success':
            return result.data;
          case 'Failure':
            this.logger.error(`[LLM_ERROR] Failed on Page ${chunk.pageNumber}: ${result.error.message}`);
            return [];
          default:
            const _exhaustiveCheck: never = result;
            return _exhaustiveCheck;
          }
        }));
        
        return Object.freeze([...acc, ...results.flat()]);
      }, Promise.resolve([] as readonly ProcurementMatchDeliverable[]));
      
      this.logger.log(`[INFO] [PIPELINE] Stage 1 Complete: ${rawLeaves.length} atomic requirements extracted.`);

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
   * Safe Iterator/Generator Pattern. Emits data slices lazily without matrix iteration logic.
   */
  private *chunkIterator<T>(items: readonly T[], size: number): Generator<readonly T[]> {
    const numBatches = Math.ceil(items.length / size);
    yield* Array.from({ length: numBatches }, (_, i) => 
      Object.freeze(items.slice(i * size, (i + 1) * size))
    );
  }

  /**
   * Pure edge resolution for the credential payload
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