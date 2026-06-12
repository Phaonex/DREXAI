// --- START OF FILE: src/parser/pdf-parser.service.spec.ts ---
import { describe, it, expect, jest } from '@jest/globals';
import { PdfParserService } from './pdf-parser.service';
import * as fs from 'fs/promises';
import * as pdf from 'pdf-parse';

// Mock the volatile filesystem and 3rd-party library
jest.mock('fs/promises');
jest.mock('pdf-parse');

describe('PdfParserService (BondIQ requirements test)', () => {
  const pdfParserService = new PdfParserService();

  it('BONDIQ CRITERIA: Successfully extracts text, concatenates Y-axis lines, and assigns exact Base64 Chunk IDs', async () => {
    // ARRANGE: Mock a successful file read
    (fs.readFile as jest.Mock<any>).mockResolvedValueOnce(Buffer.from('fake binary data'));

    // Mock the pdf-parse library to simulate the actual callback execution
    const mockPdf = pdf as unknown as jest.Mock<any>;
    mockPdf.mockImplementationOnce(async (buffer: any, options: any) => {
      // Simulate Page 1 data from the PDF engine
      const mockPageData = {
        pageIndex: 0, // Page 1
        getTextContent: async () => ({
          items: [
            { str: 'Provide a', transform: [0, 0, 0, 0, 0, 500.2] }, // Y = 500 (Rounded)
            { str: ' Ticket System', transform: [0, 0, 0, 0, 0, 500.4] }, // Y = 500 (Same line)
            { str: 'SLA 4 hours', transform: [0, 0, 0, 0, 0, 480.1] } // Y = 480 (New line)
          ]
        })
      };

      // Trigger the internal callback your service defined
      if (options && options.pagerender) {
        await options.pagerender(mockPageData);
      }
      return { numpages: 1 };
    });

    // ACT
    const result = await pdfParserService.parsePdfToChunks('/fake/doc.pdf');

    // ASSERT 1: ADT is strictly a Success
    expect(result.kind).toBe('Success');
    
    if (result.kind === 'Success') {
      const chunks = result.data;
      
      // ASSERT 2: The chunk array is strictly frozen
      expect(Object.isFrozen(chunks)).toBe(true);
      expect(chunks).toHaveLength(1);

      // ASSERT 3: Line merging logic works (Same Y coordinates combine, different Y triggers \n)
      expect(chunks[0].text).toBe('Provide a Ticket System\nSLA 4 hours');
      
      // ASSERT 4: Page number offset is mathematically correct
      expect(chunks[0].pageNumber).toBe(1);

      // ASSERT 5: Chunk ID is the correct Base64 encoding of "filepath-pageNumber"
      const expectedId = Buffer.from('/fake/doc.pdf-1').toString('base64');
      expect(chunks[0].id).toBe(expectedId);
    }
  });
  
});
// --- END OF FILE ---