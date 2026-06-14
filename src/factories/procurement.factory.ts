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
  overrides: Partial<ProcurementMatchDeliverable> & Pick<ProcurementMatchDeliverable, 'bulletPoint'>
): ProcurementMatchDeliverable => {
  return Object.freeze({
    // 1. Allowed Dynamic Fields
    bulletPoint: overrides.bulletPoint,
    description: overrides.description || DEFAULT_NODE.description,
    priority: overrides.priority || DEFAULT_NODE.priority,
    confidence: overrides.confidence !== undefined ? overrides.confidence : DEFAULT_NODE.confidence,
    equivalenceAllowed: overrides.equivalenceAllowed !== undefined ? overrides.equivalenceAllowed : DEFAULT_NODE.equivalenceAllowed,
    fullfillable: overrides.fullfillable !== undefined ? overrides.fullfillable : DEFAULT_NODE.fullfillable,
    
    // 2. Arrays (Cloned if provided, otherwise strictly reference the frozen default)
    deliverableArray: overrides.deliverableArray 
      ? Object.freeze([...overrides.deliverableArray]) 
      : DEFAULT_NODE.deliverableArray,
    procurementDocumentChunkIdArray: overrides.procurementDocumentChunkIdArray 
      ? Object.freeze([...overrides.procurementDocumentChunkIdArray]) 
      : DEFAULT_NODE.procurementDocumentChunkIdArray,
    workspaceDocumentChunkIdArray: overrides.workspaceDocumentChunkIdArray 
      ? Object.freeze([...overrides.workspaceDocumentChunkIdArray]) 
      : DEFAULT_NODE.workspaceDocumentChunkIdArray,

    // 3. THE BONDIQ VAULT: Strictly bind system-stage fields to DEFAULT_NODE
    // EXCEPT aiReasoning which is required for extraction quality explanation.
    status: DEFAULT_NODE.status,
    aiReasoning: overrides.aiReasoning || DEFAULT_NODE.aiReasoning,
    feedback: DEFAULT_NODE.feedback,
    feedbackText: DEFAULT_NODE.feedbackText,
    openQuestionId: DEFAULT_NODE.openQuestionId,
    citedProductIdArray: DEFAULT_NODE.citedProductIdArray,
    citedPersonIdArray: DEFAULT_NODE.citedPersonIdArray,
  });
};
// --- END OF FILE ---