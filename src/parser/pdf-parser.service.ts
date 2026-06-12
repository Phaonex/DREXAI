// --- START OF FILE: src/parser/pdf-parser.service.ts ---
import { Injectable } from '@nestjs/common';
import * as fs from 'fs/promises'; // 🟢 FIX 1: Non-blocking async I/O
import * as pdf from 'pdf-parse';
import { DocumentChunk } from '../types/procurement';

// 🟢 FIX 2: Import or define the strict Result ADT
export type Result<T, E = Error> = 
  | { readonly kind: 'Success'; readonly data: Readonly<T> }
  | { readonly kind: 'Failure'; readonly error: E };

@Injectable()
export class PdfParserService {
  /**
   * I/O Boundary: File Path -> Document Chunks
   * Note: Completely non-blocking and protected by the Result ADT.
   */
  async parsePdfToChunks(filePath: string): Promise<Result<readonly DocumentChunk[]>> {
    try {
      // Yields to the event loop while reading the file
      const dataBuffer = await fs.readFile(filePath);
      
      const pdfParser = (pdf as any).default || pdf;
      const chunks: DocumentChunk[] = [];
      
      const options = {
        pagerender: async (pageData: any) => {
          const textContent = await pageData.getTextContent();
          
          const extractedText = textContent.items.reduce(
            (acc: { readonly text: string; readonly lastY: number | null }, item: any) => {
              // 🟢 FIX 3: Math.round() prevents floating-point precision errors in PDF coordinate parsing
              const currentY = Math.round(item.transform[5]);
              const isSameLine = acc.lastY === currentY || acc.lastY === null;
              
              return {
                text: acc.text + (isSameLine ? item.str : '\n' + item.str),
                lastY: currentY
              };
            }, 
            { text: '', lastY: null }
          ).text;
          
          const pageNumber = pageData.pageIndex + 1;
          const chunkId = Buffer.from(`${filePath}-${pageNumber}`).toString('base64');
          
          chunks.push({
            id: chunkId,
            sourceFile: filePath,
            pageNumber: pageNumber,
            text: extractedText
          });
          
          return extractedText;
        }
      };

      await pdfParser(dataBuffer, options);
      
      const sortedChunks = Object.freeze([...chunks].sort((a, b) => a.pageNumber - b.pageNumber));
      
      // Return the pure ADT
      return { kind: 'Success', data: sortedChunks };

    } catch (error) {
      // Trap OS/Filesystem/PDF format explosions securely
      return { 
        kind: 'Failure', 
        error: error instanceof Error ? error : new Error(String(error)) 
      };
    }
  }
}
// --- END OF FILE ---