import { Injectable } from '@nestjs/common';
import * as fs from 'fs';
import * as pdf from 'pdf-parse';
import { DocumentChunk } from '../types/procurement';

@Injectable()
export class PdfParserService {
  /**
   * Pure-ish transformation: File Path -> Document Chunks
   * We treat each page as a chunk to maintain traceability.
   */
  async parsePdfToChunks(filePath: string): Promise<readonly DocumentChunk[]> {
    const dataBuffer = fs.readFileSync(filePath);
    
    // Fix for pdf-parse import issue in some TS environments
    const pdfParser = (pdf as any).default || pdf;
    
    const chunks: DocumentChunk[] = [];
    
    const options = {
      pagerender: async (pageData: any) => {
        const textContent = await pageData.getTextContent();
        let lastY, text = '';
        for (let item of textContent.items) {
          if (lastY == item.transform[5] || !lastY){
            text += item.str;
          } else {
            text += '\n' + item.str;
          }    
          lastY = item.transform[5];
        }
        
        const pageNumber = pageData.pageIndex + 1;
        const chunkId = Buffer.from(`${filePath}-${pageNumber}`).toString('base64');
        
        chunks.push({
          id: chunkId,
          sourceFile: filePath,
          pageNumber: pageNumber,
          text: text
        });
        
        return text;
      }
    };

    await pdfParser(dataBuffer, options);
    
    // Sort chunks by page number to ensure deterministic order
    return Object.freeze([...chunks].sort((a, b) => a.pageNumber - b.pageNumber));
  }
}
