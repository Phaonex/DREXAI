// --- START OF FILE: src/logger/logger.service.ts ---
import { Injectable } from '@nestjs/common';

export type LogLevel = 'INFO' | 'ERROR' | 'WARN' | 'DEBUG';
type AppEnvironment = 'production' | 'development';

export interface LogEvent {
  readonly timestamp: string;
  readonly level: LogLevel;
  readonly message: string;
  readonly context?: unknown; 
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
   * Pure formatting projection
   */
  private formatDevelopment(event: LogEvent): string {
    const prefix = `[${event.timestamp}] [${event.level}]`;
    return event.context !== undefined
      ? `${prefix} ${event.message}\n${JSON.stringify(event.context, null, 2)}`
      : `${prefix} ${event.message}`;
  }

  /**
   * The Imperative Boundary: Resolves state purely, then dispatches to the correct OS stream.
   */
  private emit(level: LogLevel, message: string, context?: unknown) {
    const event = this.createLogEvent(level, message, context);
    
    // Pure state resolution
    const env: AppEnvironment = process.env.NODE_ENV === 'production' ? 'production' : 'development';
    
    // Pure payload computation (Zero if/else)
    const payload = env === 'production' 
      ? JSON.stringify(event) 
      : this.formatDevelopment(event);

    // Exhaustive mapping to OS-level streams
    const dispatchMap: Record<LogLevel, (msg: string) => void> = {
      INFO: console.log,
      ERROR: console.error,
      WARN: console.warn,
      DEBUG: console.debug
    };

    // The single, unavoidable I/O action
    dispatchMap[level](payload);
  }
}
// --- END OF FILE ---