import { AppModule } from './app.module';
import { CommandFactory } from 'nest-commander';
import { LoggerService } from '@nestjs/common';

async function bootstrap() {
  await CommandFactory.run(AppModule);
}
bootstrap();
