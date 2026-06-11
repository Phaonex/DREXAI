import { Injectable } from '@nestjs/common';

// 1. Data Definition (DDD)
export type LogLevel = 'INFO' | 'ERROR' | 'WARN' | 'DEBUG';

export interface LogEvent {
  readonly timestamp: string;
  readonly level: LogLevel;
  readonly message: string;
  readonly context?: unknown; // 'unknown' forces type-checking, unlike 'any'
}

@Injectable()
export class LoggerService {
  log(message: string, context?: unknown) {
    this.emit('INFO', message, context);
  }

  error(message: string, context?: unknown) {
    this.emit('ERROR', message, context);
  }

  warn(message: string, context?: unknown) {
    this.emit('WARN', message, context);
  }

  debug(message: string, context?: unknown) {
    this.emit('DEBUG', message, context);
  }

  /**
   * Pure data transformation: Takes arguments and creates an immutable LogEvent.
   * (Note: new Date() breaks strict purity, but is necessary for telemetry)
   */
  private createLogEvent(level: LogLevel, message: string, context?: unknown): LogEvent {
    return Object.freeze({
      timestamp: new Date().toISOString(),
      level,
      message,
      ...(context !== undefined && { context })
    });
  }

  /**
   * The Imperative Boundary: This is the ONLY place in the entire app where 
   * side-effects (console.log) are allowed to occur.
   */
  private emit(level: LogLevel, message: string, context?: unknown) {
    const logEvent = this.createLogEvent(level, message, context);
    
    // In local dev, you might still want string formatting. 
    // In production, you emit pure JSON for log ingestion.
    if (process.env.NODE_ENV === 'production') {
      console.log(JSON.stringify(logEvent));
    } else {
      const prefix = `[${logEvent.timestamp}] [${logEvent.level}]`;
      if (logEvent.context) {
        console.log(`${prefix} ${logEvent.message}`, JSON.stringify(logEvent.context, null, 2));
      } else {
        console.log(`${prefix} ${logEvent.message}`);
      }
    }
  }
}