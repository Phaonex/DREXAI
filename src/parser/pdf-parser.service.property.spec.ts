// --- START OF FILE: src/parser/pdf-parser.service.property.spec.ts ---
import * as fc from 'fast-check';
import { describe, it, expect, jest } from '@jest/globals';
import { PdfParserService } from './pdf-parser.service';
import * as fs from 'fs/promises';
import * as pdf from 'pdf-parse';

// Mock the volatile filesystem and 3rd-party library
jest.mock('fs/promises');
jest.mock('pdf-parse');

describe('PdfParserService (Property-Based Tests)', () => {
  const pdfParserService = new PdfParserService();

  it('Property 1: OS Failure Isolation - Filesystem explosions return Failure ADT, never crash', async () => {
    await fc.assert(
      fc.asyncProperty(fc.string(), async (errorMessage) => {
        // Simulate catastrophic OS failure (e.g., File locked, corrupted)
       (fs.readFile as jest.Mock<any>).mockRejectedValueOnce(new Error(errorMessage));
        const result = await pdfParserService.parsePdfToChunks('/fake/path.pdf');

        // INVARIANT: The pipeline is protected. Exception is trapped in the ADT.
        expect(result.kind).toBe('Failure');
        if (result.kind === 'Failure') {
          expect(result.error).toBeInstanceOf(Error);
          expect(result.error.message).toBe(errorMessage);
        }
      })
    );
  });

  it('Property 2: Library Isolation - Third-party parsing explosions return Failure ADT', async () => {
    await fc.assert(
      fc.asyncProperty(fc.string(), async (errorMessage) => {
        (fs.readFile as jest.Mock<any>).mockResolvedValueOnce(Buffer.from('fake pdf data'));
        
        // Simulate pdf-parse library crashing
        const mockPdf = pdf as unknown as jest.Mock<any>;
        mockPdf.mockRejectedValueOnce(new Error(errorMessage));

        const result = await pdfParserService.parsePdfToChunks('/fake/path.pdf');

        // INVARIANT: Third-party failures cannot crash our functional core.
        expect(result.kind).toBe('Failure');
      })
    );
  });

  
});
// --- END OF FILE ---