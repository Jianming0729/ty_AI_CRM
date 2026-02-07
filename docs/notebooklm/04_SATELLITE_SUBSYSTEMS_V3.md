# 🛰️ Satellite Subsystems Technical Reference (V3.0)

This document details the seven "Satellite" modules surrounding the WeCom Bridge hub. It defines their current status, technical stack, and intended architectural role for the Tongye AI CRM ecosystem.

---

## 1. gateway/ (OpenClaw Control Plane)
*   **Status**: **ACTIVE**
*   **Role**: Acts as the "Cerebral Cortex" of the AI system. It handles agent orchestration and multi-provider management.
*   **Key Files**: 
    *   `config/openclaw.json`: Configures the upstream LLM providers (e.g., local-mock) and the listening port (18789).
*   **Integration**: The `wecom-bridge` calls this gateway to get AI responses. It decouples the bridge from specific LLM implementations.

## 2. local-llm/ (Inference Brain)
*   **Status**: **ACTIVE**
*   **Role**: Provides the physical "Intelligence" of the system without relying on external APIs.
*   **Key Files**: 
    *   `mock_provider.py`: A Flask-based server that emulates the OpenAI API. 
    *   **Logic**: It implements a "Simple RAG" engine that scans the knowledge base for keywords and returns context-aware answers.
    *   `docker-compose.yml`: Handles containerization of the Python environment.
*   **Integration**: Receives requests from `gateway/` on port 8000.

## 3. kb/ (Source Knowledge Base)
*   **Status**: **Placeholder/Structure**
*   **Role**: Intended to house the raw Markdown source of truth for all business policies.
*   **Structure**: Planned categories include `01_rental_process/`, `02_pricing_deposit/`, and `10_insurance/`.
*   **Current State**: Raw context is currently concentrated in the root `knowledge_base.json`, but `kb/` is the architectural target for the "Doc-to-Chunk" pipeline.

## 4. eval/ (Evaluation & Benchmarking)
*   **Status**: **Placeholder**
*   **Role**: Quality Assurance for the AI.
*   **Function**: Stores the "Gold Standard" Q&A pairs (e.g., the 100-question test set) to run regression tests against the AI after knowledge updates.
*   **Integration**: Used by developer scripts to calculate "Accuracy" and "Hallucination" metrics.

## 5. rag-service/ (Retrieval Augmented Generation)
*   **Status**: **Placeholder**
*   **Role**: The bridge between static documents and the LLM. 
*   **Planned Tech**: Likely Python-based service using `pgvector` or `FAISS` for semantic vector search.
*   **Function**: Breaks Markdown files in `kb/` into chunks and provides the "Vector Search" capability currently mocked by `mock_provider.py`.

## 6. rental-tools/ (Business System Adapters)
*   **Status**: **Placeholder**
*   **Role**: "The Hands" of the Agent.
*   **Function**: Contains API wrappers for the existing legacy Car Rental System (SQL-based).
*   **Key Capabilities**: `inventory_check`, `order_status_lookup`, `price_calculator`.
*   **Architecture**: These are exposed as "Tools" or "Functions" that the AI can trigger when a user asks about their specific order.

## 7. skills/ (Modular Agent Capabilities)
*   **Status**: **Placeholder**
*   **Role**: Discrete capabilities for the AI Agent defined in the OpenClaw standard.
*   **Benefit**: Allows adding standalone features (e.g., "Invoice Generator", "Insurance Recommender") without modifying the core Bridge code.
*   **Integration**: Loaded by `gateway/` and utilized via the Tool Use protocol.

---

## 🛠️ Summary of the "Smart Agent" Location
The **Agent** in this project is a **distributed entity**:
- **Its Logic** is in `wecom-bridge/src/intent_processor.js`.
- **Its Knowledge** is in `wecom-bridge/knowledge_base.json`.
- **Its Reasoning** is in `local-llm/mock_provider.py`.
- **Its Orchestration** is in `gateway/`.
