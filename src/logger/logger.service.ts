import { Injectable } from '@nestjs/common';

@Injectable()
export class LoggerService {
  log(message: any, ...optionalParams: any[]) {
    this.print('INFO', message, ...optionalParams);
  }

  error(message: any, ...optionalParams: any[]) {
    this.print('ERROR', message, ...optionalParams);
  }

  warn(message: any, ...optionalParams: any[]) {
    this.print('WARN', message, ...optionalParams);
  }

  debug(message: any, ...optionalParams: any[]) {
    this.print('DEBUG', message, ...optionalParams);
  }

  private print(level: string, message: any, ...optionalParams: any[]) {
    const timestamp = new Date().toISOString();
    const prefix = `[${timestamp}] [${level}]`;
    
    if (typeof message === 'string') {
      console.log(`${prefix} ${message}`, ...optionalParams);
    } else {
      console.log(`${prefix}`, JSON.stringify(message, null, 2), ...optionalParams);
    }
  }
}
