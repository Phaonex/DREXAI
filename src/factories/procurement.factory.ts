// --- START OF FILE: src/factories/procurement.factory.ts ---
import { ProcurementMatchDeliverable } from '../types/procurement';

const DEFAULT_NODE: ProcurementMatchDeliverable = Object.freeze({
  bulletPoint: '',
  description: { en: '' },
  priority: 'must',
  confidence: null,
  equivalenceAllowed: null,
  fullfillable: null,
  status: 'waitingForAnalysis',
  aiReasoning: null,
  feedback: null,
  feedbackText: null,
  openQuestionId: null,
  deliverableArray: Object.freeze([]),
  procurementDocumentChunkIdArray: Object.freeze([]),
  workspaceDocumentChunkIdArray: Object.freeze([]),
  citedProductIdArray: Object.freeze([]),
  citedPersonIdArray: Object.freeze([]),
});

export const createProcurementNode = (
  overrides: Partial<ProcurementMatchDeliverable>
): ProcurementMatchDeliverable => {
  return Object.freeze({
    ...DEFAULT_NODE,
    ...overrides,
    // FIX: Clone the arrays using [...array] before freezing!
    deliverableArray: overrides.deliverableArray 
      ? Object.freeze([...overrides.deliverableArray]) 
      : DEFAULT_NODE.deliverableArray,
    procurementDocumentChunkIdArray: overrides.procurementDocumentChunkIdArray 
      ? Object.freeze([...overrides.procurementDocumentChunkIdArray]) 
      : DEFAULT_NODE.procurementDocumentChunkIdArray,
    workspaceDocumentChunkIdArray: overrides.workspaceDocumentChunkIdArray 
      ? Object.freeze([...overrides.workspaceDocumentChunkIdArray]) 
      : DEFAULT_NODE.workspaceDocumentChunkIdArray,
    citedProductIdArray: overrides.citedProductIdArray 
      ? Object.freeze([...overrides.citedProductIdArray]) 
      : DEFAULT_NODE.citedProductIdArray,
    citedPersonIdArray: overrides.citedPersonIdArray 
      ? Object.freeze([...overrides.citedPersonIdArray]) 
      : DEFAULT_NODE.citedPersonIdArray,
  });
};
// --- END OF FILE ---