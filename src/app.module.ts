import { Module } from '@nestjs/common';
import { LoggerService } from './logger/logger.service';
import { BasicCommand } from './BasicCommand.service';
import { PdfParserService } from './parser/pdf-parser.service';
import { DeepSeekService } from './ai/deepseek.service';
import { ConsolidationService } from './pipeline/consolidation.service';
import { TreeBuilderService } from './pipeline/tree-builder.service';

@Module({
  imports: [],
  providers: [
    LoggerService, 
    BasicCommand, 
    PdfParserService, 
    DeepSeekService,
    ConsolidationService,
    TreeBuilderService
  ],
})
export class AppModule {}
