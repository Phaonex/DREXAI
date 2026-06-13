import * as fc from 'fast-check';
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { BasicCommand } from './BasicCommand.service';
import { LoggerService } from './logger/logger.service';
import { PdfParserService } from './parser/pdf-parser.service';
import { DeepSeekService } from './ai/deepseek.service';
import { ConsolidationService } from './pipeline/consolidation.service';
import { TreeBuilderService } from './pipeline/tree-builder.service';
import * as fs from 'fs';

// Mock system modules at the top level
jest.mock('fs');
jest.mock('path', () => {
  const actualPath = jest.requireActual('path') as any;
  return {
    ...actualPath,
    resolve: jest.fn((...args: string[]) => args.join('/')),
  };
});

describe('BasicCommand (Property-Based Tests)', () => {
  let command: BasicCommand;
  let logger: jest.Mocked<LoggerService>;
  let pdfParser: jest.Mocked<PdfParserService>;
  let deepSeek: jest.Mocked<DeepSeekService>;
  let consolidation: jest.Mocked<ConsolidationService>;
  let treeBuilder: jest.Mocked<TreeBuilderService>;

  const mockedFs = fs as jest.Mocked<typeof fs>;

  beforeEach(() => {
    logger = {
      log: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    } as any;

    pdfParser = {
      parsePdfToChunks: jest.fn(),
    } as any;

    deepSeek = {
      extractLeaves: jest.fn(),
    } as any;

    consolidation = {
      consolidate: jest.fn(),
    } as any;

    treeBuilder = {
      buildTree: jest.fn(),
    } as any;

    command = new BasicCommand(logger, pdfParser, deepSeek, consolidation, treeBuilder);

    // Default fs mocks
    mockedFs.statSync.mockReturnValue({ isDirectory: () => false } as any);
    mockedFs.readdirSync.mockReturnValue([]);
    mockedFs.writeFileSync.mockImplementation(() => {});
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('Property 1: Chaos Resilience - Never crashes on arbitrary CLI options', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          input: fc.oneof(fc.constant(undefined), fc.string()),
          apiKey: fc.oneof(fc.constant(undefined), fc.string()),
          output: fc.oneof(fc.constant(undefined), fc.string()),
          pages: fc.oneof(fc.constant(undefined), fc.string()),
        }),
        async (options) => {
          // Mock successful empty results to focus on orchestration resilience
          pdfParser.parsePdfToChunks.mockResolvedValue({ kind: 'Success', data: [] });
          consolidation.consolidate.mockResolvedValue([]);
          treeBuilder.buildTree.mockResolvedValue([]);

          // Avoid readline hang by ensuring an API key is present for the logic that needs it
          const testOptions = { ...options, apiKey: options.apiKey || 'test-key' };

          await expect(command.run([], testOptions)).resolves.not.toThrow();
        }
      )
    );
  });

  it('Property 2: Input Validation - Aborts early if no input path is provided', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          apiKey: fc.string(),
          output: fc.string(),
          pages: fc.string(),
        }),
        async (options) => {
          logger.log.mockClear();
          await command.run([], options);
          
          expect(logger.log).toHaveBeenCalledWith(
            expect.stringContaining('Error: Please provide an input file')
          );
          expect(pdfParser.parsePdfToChunks).not.toHaveBeenCalled();
        }
      )
    );
  });

  it('Property 3: API Key Requirement - Aborts if no API key can be resolved', async () => {
    // We mock resolveApiKey behavior by providing an empty string key to the run method
    // as we want to avoid triggering the actual readline.question prompt.
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1 }), // valid input path
        async (inputPath) => {
          logger.log.mockClear();
          pdfParser.parsePdfToChunks.mockClear();
          deepSeek.extractLeaves.mockClear();
          
          // Mock pdfParser to return at least one chunk so it proceeds to API key resolution
          pdfParser.parsePdfToChunks.mockResolvedValue({ 
            kind: 'Success', 
            data: [{ id: '1', sourceFile: 'test.pdf', pageNumber: 1, text: 'some content' }] 
          });

          // Abort if apiKey is empty string (one of the check conditions in BasicCommand)
          // The command checks if (!activeApiKey || activeApiKey.trim() === '')
          await command.run([], { input: inputPath, apiKey: ' ' });

          expect(logger.log).toHaveBeenCalledWith(
            expect.stringContaining('[ERROR] Pipeline aborted. API Key is required')
          );
          expect(deepSeek.extractLeaves).not.toHaveBeenCalled();
        }
      )
    );
  });
});
