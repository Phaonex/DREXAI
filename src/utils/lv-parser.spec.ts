// --- START OF FILE: src/utils/lv-parser.spec.ts ---
import { describe, it, expect } from '@jest/globals';
import { parseLvHierarchy, containsLvPositions } from './lv-parser';

describe('LV Parser (BONDIQ Business Logic)', () => {

  it('BONDIQ CRITERIA: Strictly extracts standard Austrian/German LV numbering (L3)', () => {
    // ARRANGE: A standard LV item from an Austrian tender
    const text = '02.04.0123 Systemwartung und 24/7 Support';

    // ACT
    const result = parseLvHierarchy(text);

    // ASSERT: Mathematically validates the exact semantic slicing
    expect(result.kind).toBe('Some');
    if (result.kind === 'Some') {
      expect(result.value.hierarchy.level1).toBe('02');
      expect(result.value.hierarchy.level2).toBe('02.04');
      expect(result.value.hierarchy.level3).toBe('02.04.0123');
      expect(result.value.title).toBe('Systemwartung und 24/7 Support');
    }
  });

  it('BONDIQ CRITERIA: Ruthlessly rejects non-LV standard document numbering (False Positives)', () => {
    // Standard document sections are NOT LV items and must be ignored
    expect(parseLvHierarchy('1. Introduction').kind).toBe('None');
    expect(parseLvHierarchy('1.1.1 Background').kind).toBe('None');
    
    // Too deep or improperly padded
    expect(parseLvHierarchy('01.02.03.04.05 Way Too Deep').kind).toBe('None');
    
    // Just normal text
    expect(parseLvHierarchy('The supplier must provide servers.').kind).toBe('None');
  });

  it('BONDIQ CRITERIA: Accurately detects LV blocks inside mixed document chunks', () => {
    // ARRANGE
    const validTenderChunk = `
      Allgemeine Bedingungen für den Vertrag:
      Der Auftragnehmer hat Folgendes zu liefern:
      05.12.0001 Server-Rack 42U
      Dies muss bis Q3 passieren.
    `;

    const normalDocumentChunk = `
      1. Einleitung
      Wir brauchen ein neues System für das Krankenhaus.
      1.1 Ziele
      Kostenreduktion.
    `;

    // ACT & ASSERT
    expect(containsLvPositions(validTenderChunk)).toBe(true);
    expect(containsLvPositions(normalDocumentChunk)).toBe(false);
  });
});
// --- END OF FILE ---