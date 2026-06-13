# The Autonomous Conflict Resolver (A2A Protocol & Evaluation)

This project is a high-observability developer portfolio piece demonstrating **Agent-to-Agent (A2A) protocol communication**, asynchronous conflict negotiation, and automated evaluation using the Google Gemini model ecosystem.

Instead of writing hardcoded static fallback rules to manage resource constraints, this system deploys two distinct microservice agents that negotiate using structured JSON tokens over a simulated Pub/Sub broker channel, storing session state in a native Memory Bank. An autonomous Evaluator Agent (the LLM Judge) scores the final agreement against a strict rubric.

---

## 🏗️ Architecture Stack

1. **Agent Framework:** Custom-built local `agent_development_kit` package mimicking the code-first developer interfaces of the Gemini Enterprise Agent Platform.
2. **Contending Agents:**
   - **Logistics Agent:** Tasks itself with securing Main Street physical blocks for the "Grand Street Carnival" event footprint, striving to maximize venue space and financial viability.
   - **Transit Agent:** Tasks itself with maintaining commute lane traffic flow, protecting emergency response routes, and keeping public delay metrics low.
3. **Communication Broker:** WebSockets pipeline mirroring Cloud Pub/Sub message broadcasts. Signals inter-agent pulses (Logistics proposal $\rightarrow$ Transit counter-proposal $\rightarrow$ Logistics concession $\rightarrow$ Transit agreement).
4. **State Management:** Local `MemoryBank` JSON repository tracking tokens, decisions, and cross-session evaluation logs.
5. **The Judge:** An Evaluator Agent utilizing Gemini Pro (`gemini-2.5-flash` or `gemini-pro`) to grade final plan viability against:
   - Unobstructed emergency safety corridors.
   - Community impact scores ($< 40\%$).
   - Optimal resource reuse and financial viability.

---

## 🛠️ Getting Started & Dependencies

The project uses standard Python libraries. Since you already have them installed in your local environment, no additional setups are required.

### Key Packages Used:
- `google-genai` (2.8.0)
- `websockets` (16.0)
- `Flask` (3.1.3)
- `pydantic` (2.13.4)

---

## 🚀 Running the Project

### 1. Launch Using the Batch Script:
Double-click `run.bat` in the root folder, or run the following command in PowerShell:
```powershell
.\run.bat
```
This script will:
- Run automated unit tests in `test_negotiation.py` to check the integrity of the ADK imports and agent logic.
- Startup the Flask Web server on `http://localhost:5000`.
- Startup the WebSocket message broker on `ws://localhost:5001`.

### 2. Access the Dashboard:
Open your web browser and navigate to:
**[http://localhost:5000](http://localhost:5000)**

---

## 🎨 Observability Dashboard Features

- **Avenue Asset Monitor:** Visualizes 5 blocks of Main Street across 4 lanes (Bus Lane, General 1, General 2, Emergency Lane). Watch cell colors update from free (dark grey), logistics occupancy (neon red), transit routes (neon blue), to overlapping race conditions (flashing amber stripes).
- **A2A Pulse Graph:** Visualizes active nodes (Logistics, Transit, Memory Bank, Broker, Judge). Watch photon pulses travel across network connection lines representing WebSockets messages.
- **Telemetry gauges:** Circular SVG dials charting Commute Delay, Community Impact Score, Financial Viability, and a compliance status light for the Emergency Safety Corridor.
- **Timeline Logs:** Chat window logging agent reasoning alongside an **"Inspect Routing Token"** button to view the underlying JSON schemas in a code viewer.
- **LLM Judge Scorecard:** Displays the overall grade card, evaluation summary, and detailed pass/fail status per rubric.
- **Dual-Mode Configurator:** Toggle between **Simulation Mode** (sliders generate interactive mock calculations) or provide a **Gemini API Key** to watch actual Gemini models conduct the negotiations in real-time.
