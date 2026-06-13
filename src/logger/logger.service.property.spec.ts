import * as fc from 'fast-check';
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { LoggerService, LogLevel } from './logger.service';

describe('LoggerService (Property-Based Tests)', () => {
  let service: LoggerService;

  beforeEach(() => {
    service = new LoggerService();
    // Mock console methods to avoid polluting test output and to verify calls
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'debug').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  const logLevels: LogLevel[] = ['INFO', 'ERROR', 'WARN', 'DEBUG'];

  it('Property 1: Chaos Resilience - Never throws on arbitrary string messages', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...logLevels),
        fc.string(),
        (level, message) => {
          expect(() => {
            switch (level) {
              case 'INFO': service.log(message); break;
              case 'ERROR': service.error(message); break;
              case 'WARN': service.warn(message); break;
              case 'DEBUG': service.debug(message); break;
            }
          }).not.toThrow();
        }
      )
    );
  });

  it('Property 2: Structural Integrity - Output always contains [TIMESTAMP] [LEVEL] and the message', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...logLevels),
        fc.string({ minLength: 1 }),
        (level, message) => {
          let interceptedPayload = '';
          const consoleMethod = level === 'INFO' ? 'log' : level.toLowerCase() as 'error' | 'warn' | 'debug';
          
          const spy = jest.spyOn(console, consoleMethod).mockImplementation((payload: string) => {
            interceptedPayload = payload;
          });

          switch (level) {
            case 'INFO': service.log(message); break;
            case 'ERROR': service.error(message); break;
            case 'WARN': service.warn(message); break;
            case 'DEBUG': service.debug(message); break;
          }

          // INVARIANT: Format must be [ISO_TIMESTAMP] [LEVEL] Message
          // We check for the level and message. Timestamp is dynamic but should be there.
          expect(interceptedPayload).toContain(`[${level}]`);
          expect(interceptedPayload).toContain(message);
          
          // Basic ISO Timestamp check: [YYYY-MM-DDTHH:mm:ss.sssZ]
          const timestampRegex = /\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\]/;
          expect(interceptedPayload).toMatch(timestampRegex);

          spy.mockRestore();
        }
      )
    );
  });

  it('Property 3: Context Inclusion - Serializable context is always present in the output', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...logLevels),
        fc.string(),
        fc.jsonValue(),
        (level, message, context) => {
          let interceptedPayload = '';
          const consoleMethod = level === 'INFO' ? 'log' : level.toLowerCase() as 'error' | 'warn' | 'debug';
          
          const spy = jest.spyOn(console, consoleMethod).mockImplementation((payload: string) => {
            interceptedPayload = payload;
          });

          switch (level) {
            case 'INFO': service.log(message, context); break;
            case 'ERROR': service.error(message, context); break;
            case 'WARN': service.warn(message, context); break;
            case 'DEBUG': service.debug(message, context); break;
          }

          // INVARIANT: Context must be stringified in development mode
          const expectedContextSnippet = JSON.stringify(context, null, 2);
          expect(interceptedPayload).toContain(expectedContextSnippet);

          spy.mockRestore();
        }
      )
    );
  });
});
