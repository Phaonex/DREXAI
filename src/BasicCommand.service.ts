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
      // 1. Gather all PDF files
      const files = fs.statSync(absoluteInput).isDirectory()
        ? fs.readdirSync(absoluteInput)
            .filter(f => f.endsWith('.pdf'))
            .map(f => path.join(absoluteInput, f))
        : [absoluteInput];

      this.logger.log(`[INFO] Found ${files.length} PDF documents to process.`);

      // Step A: Parse all PDFs to Immutable Chunks
      const allChunks: DocumentChunk[] = [];
      for (const file of files) {
        const chunks = await this.pdfParser.parsePdfToChunks(file);
        allChunks.push(...chunks);
      }
      this.logger.log(`[INFO] Ingestion complete: ${allChunks.length} total chunks extracted.`);

      if (!apiKey) {
        this.logger.log('[HINT] Provide --apiKey <key> to run full AI extraction.');
        return;
      }

      // Step B: Atomic Extraction (LLM Phase) across all documents
      this.logger.log(`[INFO] [PIPELINE] Stage 1: Atomic Extraction (LLM)...`);
      const targetChunks = allChunks.filter(c => c.text.trim().length > 50);
      
      const rawLeaves: ProcurementMatchDeliverable[] = [];
      const BATCH_SIZE = 5; // Process 5 pages at a time

      for (let i = 0; i < targetChunks.length; i += BATCH_SIZE) {
        const batch = targetChunks.slice(i, i + BATCH_SIZE);
        this.logger.log(`[INFO] [LLM_BATCH] Processing pages ${i + 1} to ${Math.min(i + BATCH_SIZE, targetChunks.length)} of ${targetChunks.length}...`);
        
        const leafTasks = batch.map(async (chunk) => {
          try {
            return await this.deepSeek.extractLeaves(apiKey, chunk.text, chunk.id);
          } catch (e) {
            this.logger.error(`[LLM_ERROR] Failed on Page ${chunk.pageNumber}: ${e.message}`);
            return []; // Skip failed chunks but keep the pipeline running
          }
        });

        const results = await Promise.all(leafTasks);
        rawLeaves.push(...results.flat());
      }
      
      this.logger.log(`[INFO] [PIPELINE] Stage 1 Complete: ${rawLeaves.length} atomic requirements extracted.`);

      // Step C: Cross-Document Consolidation
      this.logger.log(`[INFO] [PIPELINE] Stage 2: Cross-Document Consolidation...`);
      const consolidatedLeaves = await this.consolidation.consolidate(rawLeaves);

      // Step D: Hierarchical Tree Construction
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

  private renderTuiTree(tree: readonly ProcurementMatchDeliverable[]) {
    tree.forEach(root => {
      const rootPages = root.procurementDocumentChunkIdArray
        .map(id => Buffer.from(id, 'base64').toString().split('-').pop())
        .join(', ');

      this.logger.log(`\n📁 ${root.bulletPoint} (Cited on Pages: ${rootPages})`);
      
      root.deliverableArray.forEach(sub => {
        this.logger.log(`  └─ 📂 ${sub.bulletPoint}`);
        
        sub.deliverableArray.forEach(leaf => {
          const pages = leaf.procurementDocumentChunkIdArray
            .map(id => Buffer.from(id, 'base64').toString().split('-').pop())
            .join(', ');

          this.logger.log(`      └─ 📄 [${leaf.priority.toUpperCase()}] ${leaf.bulletPoint} (Page: ${pages})`);
          this.logger.log(`          💡 Reasoning: ${leaf.aiReasoning?.en}`);
        });
      });
    });
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
