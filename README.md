# Bond.IQ AI Engineer Assessment - Document Retrieval & Extraction

## DREXAI stand for Document Retrieval and EXtraction with Artificial Intelligence.
This project implements a robust, "Scientist-first" AI pipeline for the automated retrieval and extraction of structured procurement data from complex, multi-page PDF documents (Tenders).

## 🚀 Quick Start

### 1. Installation
```bash
sudo npm install
```

### 2. Run the Full Extraction Pipeline
You can process a single PDF or an entire directory of documents.

```bash
# Process all documents in the docs folder
npm run cli -- process --input "../docs" --apiKey "YOUR_DEEPSEEK_KEY" --output "./final_extraction.json"
```

## 🏗 Architectural Methodology (Technical Critique)

### 1. Development Roadmap & Iterative Strategy
The project followed a disciplined, step-by-step engineering roadmap to ensure robustness at scale:
- **Phase 1: Domain & Requirement Analysis:** Exhaustive review of the assessment briefing to map the recursive `ProcurementMatchDeliverable` contract and identifying the semantic challenges of Austrian/German *Leistungsverzeichnis* (LV) standards.
- **Phase 2: Prototyping (The Deterministic Baseline):** Started with the `LV_Fahrradgaragen` tender. Its rigid numbering system allowed us to build and validate the core **Deterministic Consolidation** logic before introducing AI complexity.
- **Phase 3: Scaling & Stress Testing:** Moved to the 424-page `Salzburg Laboratory` tender. This phase forced the implementation of **Batch Processing (5 pages/batch)** and **JSON Sanitization** to handle high-volume, "dirty" technical data.
- **Phase 4: Final Product Delivery:** Implementation of cross-document consolidation and the JSON export engine, enabling the processing of the entire `docs/` directory into a single structured deliverable.

### 2. "Scientist-First" Data Pipeline
Instead of asking an LLM to "summarize the document," we use a functional **Map-Reduce** pattern:
- **Ingestion:** PDF parsing into immutable `DocumentChunk` records (one per page).
- **Atomic Extraction (Map):** Structured LLM calls extract granular Level 3 requirements from individual chunks using Zod schemas for 100% type safety.
- **Deterministic Consolidation (Reduce):** Atomic leaves are merged across chunks/documents.
- **Hierarchical Construction:** A bottom-up assembly of the L1 -> L2 -> L3 tree based on discovered LV Position Numbers.

### 3. Handling High-Fragmentation (The Salzburg Lab Test)
In the 424-page Salzburg Laboratory tender, requirements are often split hundreds of pages apart.
- **The Solution:** Our pipeline uses DACH standard **LV Position Numbers** (e.g., `01.01.0010`) as primary keys.
- **The Result:** Successfully consolidated requirements like "Excavation" across **31 different pages**, merging technical specifications from the start and end of the document into a single, cited deliverable.

### 4. Engineering for Rigor & Traceability
To meet the assessment's requirements for transparency and structural integrity:
- **Full Provenance:** Every node in the final JSON includes a `procurementDocumentChunkIdArray`, tracing every claim back to its specific page(s) in the source PDF.
- **AI Reasoning:** Every requirement includes an English `aiReasoning` object explaining the priority classification and contextual relevance.
- **Resilience:** Implemented batch processing (5 pages/batch) and defensive JSON sanitization to handle "dirty" LLM outputs and massive document volumes without API/Memory failure.

### 5. Technical Stack
- **NestJS & Nest-Commander:** For a modular, dependency-injected TUI.
- **DeepSeek API:** For high-performance, structured LLM extraction.
- **Zod:** For rigorous runtime type validation of AI outputs.
- **Pdf-Parse:** For deterministic, page-by-page text ingestion.

## 📄 Deliverables
The pipeline generates a recursive JSON tree matching the `ProcurementMatchDeliverable` interface, ready for downstream processing or review.
