import { Injectable } from '@nestjs/common';
import * as fs from 'fs';
import * as pdf from 'pdf-parse';
import { DocumentChunk } from '../types/procurement';

@Injectable()
export class PdfParserService {
  /**
   * Transformation: File Path -> Document Chunks
   * Note: The outer boundary utilizes isolated mutation due to pdf-parse callback constraints,
   * but text extraction logic is 100% pure FP.
   */
  async parsePdfToChunks(filePath: string): Promise<readonly DocumentChunk[]> {
    const dataBuffer = fs.readFileSync(filePath);
    
    // Fix for pdf-parse import issue in some TS environments
    const pdfParser = (pdf as any).default || pdf;
    
    // Imperative Boundary: Array isolated to this scope to collect library callbacks
    const chunks: DocumentChunk[] = [];
    
    const options = {
      pagerender: async (pageData: any) => {
        const textContent = await pageData.getTextContent();
        
        // 🟢 PURE FP FIX: Replace 'for' loop and 'let' with an immutable reducer
        const extractedText = textContent.items.reduce(
          (acc: { readonly text: string; readonly lastY: number | null }, item: any) => {
            const currentY = item.transform[5];
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
        
        // Push is contained purely within the ingestion boundary
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
    
    // Freeze immediately upon crossing the boundary into the functional core
    return Object.freeze([...chunks].sort((a, b) => a.pageNumber - b.pageNumber));
  }
}