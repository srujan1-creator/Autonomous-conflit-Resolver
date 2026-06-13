import json
import os
from typing import Dict, Any, Optional
from google import genai
from google.genai import errors

class Agent:
    """Represents an autonomous agent with distinct goals and instructions."""
    def __init__(self, name: str, instruction: str, model: str = "gemini-2.5-flash", schema: Optional[Dict[str, Any]] = None):
        self.name = name
        self.instruction = instruction
        self.model = model
        self.schema = schema

    def __repr__(self):
        return f"Agent(name='{self.name}', model='{self.model}')"


class AgentRegistry:
    """Registry to manage and discover microservice agents."""
    def __init__(self):
        self._agents: Dict[str, Agent] = {}

    def register(self, agent: Agent) -> None:
        self._agents[agent.name] = agent

    def get_agent(self, name: str) -> Optional[Agent]:
        return self._agents.get(name)

    def list_agents(self) -> list:
        return list(self._agents.keys())


class MemoryBank:
    """State management system to track cross-session token data and decisions."""
    def __init__(self, filepath: str = "memory_bank.json"):
        self.filepath = filepath
        self.store: Dict[str, Any] = {}
        self.load()

    def get(self, key: str, default: Any = None) -> Any:
        return self.store.get(key, default)

    def set(self, key: str, value: Any) -> None:
        self.store[key] = value
        self.persist()

    def persist(self) -> None:
        try:
            with open(self.filepath, "w", encoding="utf-8") as f:
                json.dump(self.store, f, indent=2)
        except Exception as e:
            print(f"Error persisting memory bank: {e}")

    def load(self) -> None:
        if os.path.exists(self.filepath):
            try:
                with open(self.filepath, "r", encoding="utf-8") as f:
                    self.store = json.load(f)
            except Exception as e:
                print(f"Error loading memory bank: {e}")
                self.store = {}
        else:
            self.store = {}

    def clear(self) -> None:
        self.store = {}
        self.persist()


class Evaluator:
    """Automated evaluation engine (LLM-as-Judge) that grades negotiation transcripts against a rubric."""
    
    @staticmethod
    def grade(model: str, data: Dict[str, Any], criteria: Dict[str, str]) -> Dict[str, Any]:
        api_key = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
        
        # If API key is available, run the actual LLM-as-Judge evaluation
        if api_key:
            try:
                client = genai.Client(api_key=api_key)
                
                # Format the grading prompt
                prompt = f"""
                You are the Autonomous Evaluator Judge. Your task is to evaluate the final negotiated plan of a multi-agent system.
                
                Negotiation Data & Telemetry:
                {json.dumps(data, indent=2)}
                
                Evaluation Rubric (Criteria):
                {json.dumps(criteria, indent=2)}
                
                Analyze the final plan, telemetry, and negotiation history, and output a JSON response grading each rubric criterion.
                
                You MUST return a JSON object with the following schema:
                {{
                    "safety_corridors": {{
                        "status": "PASSED" or "FAILED",
                        "reason": "Detailed explanation of why it passed or failed"
                    }},
                    "community_impact_score": {{
                        "status": "PASSED" or "FAILED",
                        "reason": "Detailed explanation of why it passed or failed"
                    }},
                    "financial_viability": {{
                        "status": "PASSED" or "FAILED",
                        "reason": "Detailed explanation of why it passed or failed"
                    }},
                    "overall_score": 0 to 100,
                    "overall_status": "APPROVED", "APPROVED_WITH_CONDITIONS", or "REJECTED",
                    "summary": "High-level summary of the negotiation evaluation"
                }}
                """
                
                # Request grading from Gemini
                # Map model name if needed
                gemini_model = "gemini-2.5-flash" if "pro" not in model.lower() else "gemini-2.5-pro"
                response = client.models.generate_content(
                    model=gemini_model,
                    contents=prompt,
                    config=dict(
                        response_mime_type="application/json",
                        temperature=0.1
                    )
                )
                
                result = json.loads(response.text)
                return result
                
            except Exception as e:
                print(f"Error invoking Gemini API for evaluation: {e}. Falling back to deterministic simulation.")
                # Fallback to local heuristic evaluator

        # Deterministic simulation of the LLM-as-Judge when API Key is absent
        final_proposal = data.get("final_proposal", {})
        telemetry = final_proposal.get("telemetry", {})
        
        community_impact = telemetry.get("community_impact_score", 0)
        delay_minutes = telemetry.get("delay_minutes", 0)
        financial = telemetry.get("financial_viability", 0)
        safety_intact = telemetry.get("safety_corridors_intact", True)
        
        # Check against criteria
        safety_status = "PASSED" if safety_intact else "FAILED"
        safety_reason = "Safety corridor remains 100% unobstructed as required by the Transit Agent." if safety_intact else "Safety corridor was obstructed during high-frequency rush hours."
        
        community_status = "PASSED" if community_impact < 40 else "FAILED"
        community_reason = f"Community impact score of {community_impact}% is below the 40% threshold." if community_impact < 40 else f"Community impact score of {community_impact}% exceeds the maximum 40% threshold."
        
        financial_status = "PASSED" if financial >= 60 else "FAILED"
        financial_reason = f"Financial viability score is {financial}%, optimizing resource reuse and revenue." if financial >= 60 else f"Financial viability score of {financial}% does not optimize resource reuse."
        
        passed_count = sum([1 for s in [safety_status, community_status, financial_status] if s == "PASSED"])
        
        if passed_count == 3:
            overall_status = "APPROVED"
            overall_score = int(min(100, 70 + (100 - community_impact) * 0.3 + (financial - 60) * 0.5))
        elif passed_count == 2 and safety_status == "PASSED":
            overall_status = "APPROVED_WITH_CONDITIONS"
            overall_score = 65
        else:
            overall_status = "REJECTED"
            overall_score = 45
            
        summary = (
            "Negotiation completed successfully. The contending agents arrived at a compromise plan that "
            "satisfies primary transit constraints and logistics requirements." 
            if overall_status != "REJECTED" else 
            "The negotiation failed to produce a viable plan. The resulting agreement violates key transit or safety rubrics."
        )

        return {
            "safety_corridors": {
                "status": safety_status,
                "reason": safety_reason
            },
            "community_impact_score": {
                "status": community_status,
                "reason": community_reason
            },
            "financial_viability": {
                "status": financial_status,
                "reason": financial_reason
            },
            "overall_score": overall_score,
            "overall_status": overall_status,
            "summary": summary
        }
