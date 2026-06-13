import os
import json
from typing import List, Dict, Any, Optional
from pydantic import BaseModel, Field
from google import genai
from google.genai import types

# ---------------------------------------------------------
# 1. Pydantic Schemas for Structured A2A Tokens
# ---------------------------------------------------------

class ExtraAllowance(BaseModel):
    lanes: List[int] = Field(description="Lanes requested under special conditions (1=Bus, 2=Gen1, 3=Gen2, 4=Emergency)")
    time_window: str = Field(description="Time window for special access, e.g. '12:00-16:00'")

class Telemetry(BaseModel):
    community_impact_score: int = Field(description="Estimated public impact score (0 to 100)")
    delay_minutes: int = Field(description="Estimated commute delay in minutes")
    financial_viability: int = Field(description="Estimated financial/event viability score (0 to 100)")
    safety_corridors_intact: bool = Field(description="True if emergency lanes remain unobstructed during peak hours")

class RouteProposal(BaseModel):
    event_name: str = Field(description="Name of the public event")
    avenue: str = Field(description="Name of the avenue, e.g. Main Street")
    blocks: List[int] = Field(description="List of block numbers requested (1 to 5)")
    lanes: List[int] = Field(description="List of lane numbers requested (1=Bus Lane, 2=General 1, 3=General 2, 4=Emergency Lane)")
    time_window: str = Field(description="Main time window of occupancy, e.g. '12:00-20:00'")
    extra_allowance: Optional[ExtraAllowance] = Field(default=None, description="Special off-peak allowances")
    telemetry: Telemetry = Field(description="Estimated telemetry metrics of this proposal")
    rationale: str = Field(description="Reasoning, objectives, or concession justification for this proposal")


# ---------------------------------------------------------
# 2. System Instructions
# ---------------------------------------------------------

LOGISTICS_AGENT_INSTRUCTIONS = """
You are the Logistics Agent. Your task is to occupy physical city assets on Main Street (Blocks 2, 3, 4) for the 'Grand Street Carnival' (Time: 12:00-20:00).
Your primary objective is to maximize the event footprint and financial viability by acquiring as many lanes as possible.
However, you must negotiate asynchronously with the Transit Agent who controls the corridor.
If your previous proposals are rejected or counter-offered, you must make concessions:
1. Shrink your lane footprint (e.g., from all lanes down to lanes 2 & 3).
2. Avoid blocking the Bus Lane (Lane 1) if transit load is high.
3. If you need Lane 4 (Emergency Lane) for stage setup/load-in, request it as an 'extra_allowance' for off-peak hours (12:00-16:00) rather than full-time, leaving it clear during peak evening commute hours.
Always output a JSON object matching the RouteProposal schema.
"""

TRANSIT_AGENT_INSTRUCTIONS = """
You are the Transit Agent. Your task is to maximize public commute efficiency and safety on Main Street.
Your primary objective is to keep the Bus Lane (Lane 1) and the Emergency Lane (Lane 4) unobstructed, maintaining a 'safety corridor'.
You must monitor proposals from the Logistics Agent. If they block critical lanes or cause high commuter delay, you must detect the conflict (race condition) and send a counter-proposal.
Your targets:
- Community Impact Score must be below 40%.
- Safety corridors (emergency and bus lane) must remain clear during peak commuter hours (16:00-20:00).
If the Logistics Agent is compromising, you can accommodate their setup requirements during off-peak times (12:00-16:00) via extra allowances, provided safety lanes are clear by 16:00.
Always output a JSON object matching the RouteProposal schema.
"""


# ---------------------------------------------------------
# 3. Agent Proposal Generators (Dual Mode)
# ---------------------------------------------------------

def generate_logistics_proposal(
    history: List[Dict[str, Any]], 
    event_scale: str, 
    traffic_load: str, 
    turn: int, 
    api_key: Optional[str] = None,
    blocked_cells: Optional[List[Dict[str, int]]] = None
) -> Dict[str, Any]:
    """Generates the next proposal from the Logistics Agent."""
    if blocked_cells is None:
        blocked_cells = []
    
    if api_key:
        try:
            client = genai.Client(api_key=api_key)
            blocked_desc = ", ".join([f"Block {c['block']} Lane {c['lane']}" for c in blocked_cells]) if blocked_cells else "None"
            
            prompt = f"""
            Environment Context:
            - Target Avenue: Main Street (Blocks 1-5, Lanes 1-4)
            - Event Scale setting: {event_scale} (Determines how aggressively you push for resources)
            - Traffic Load setting: {traffic_load} (Indicates how sensitive the transit routes are)
            - Current Negotiation Turn: {turn}
            - CRITICAL Hazard Blocks (Under Construction/Blocked): {blocked_desc} (These blocks/lanes cannot be used or proposed by anyone. You must negotiate around them!)
            
            Previous Negotiation History:
            {json.dumps(history, indent=2)}
            
            Propose your next plan. If this is Turn 1, make a comprehensive initial request. If it is a subsequent turn, read the Transit Agent's counter-proposal and make a structured concession that maintains event viability (financial score >= 70) while addressing their concerns. Make sure you DO NOT request any of the blocked cells listed above.
            """
            
            response = client.models.generate_content(
                model="gemini-2.5-flash",
                contents=prompt,
                config=types.GenerateContentConfig(
                    system_instruction=LOGISTICS_AGENT_INSTRUCTIONS,
                    response_mime_type="application/json",
                    response_schema=RouteProposal,
                    temperature=0.7
                )
            )
            return json.loads(response.text)
        except Exception as e:
            print(f"Logistics Agent API Error: {e}. Falling back to simulation.")

    # Procedural Simulation Mode (Slider-Responsive)
    # Event scale: 'low', 'medium', 'high'
    # Traffic load: 'low', 'medium', 'high'
    
    if turn == 1:
        # Logistics starts aggressive, scaling with Event Scale
        if event_scale == "high":
            lanes = [1, 2, 3, 4]
            blocks = [2, 3, 4]
            financial = 98
            delay = 45
            impact = 58
            safety = False
            rationale = "High-scale event requires complete shutdown of blocks 2-4 (all lanes) for safety barriers and stage structures."
        elif event_scale == "medium":
            lanes = [1, 2, 3]
            blocks = [2, 3, 4]
            financial = 85
            delay = 35
            impact = 45
            safety = True # Emergency lane 4 is clear
            rationale = "Medium-scale event footprint requires blocks 2-4, utilizing lanes 1-3. Emergency Lane 4 remains open."
        else:
            lanes = [2, 3]
            blocks = [2, 3]
            financial = 70
            delay = 20
            impact = 25
            safety = True
            rationale = "Low-scale event footprint localized to blocks 2-3, lanes 2-3. Bus lane and emergency lanes remain clear."
            
        proposal = {
            "event_name": "Grand Street Carnival",
            "avenue": "Main Street",
            "blocks": blocks,
            "lanes": lanes,
            "time_window": "12:00-20:00",
            "extra_allowance": None,
            "telemetry": {
                "community_impact_score": impact,
                "delay_minutes": delay,
                "financial_viability": financial,
                "safety_corridors_intact": safety
            },
            "rationale": rationale
        }
        
    elif turn == 3:
        # Logistics compromises based on Transit counter-proposal (which was Turn 2)
        # We look at the traffic load. If traffic load is high, we must keep bus lane 1 clear.
        if traffic_load == "high":
            lanes = [2, 3] # Relinquish Bus Lane 1
            extra_lanes = [4] # Ask for Emergency Lane for setup only
            financial = 82 if event_scale == "high" else 72
            delay = 18
            impact = 36
            safety = True
            rationale = "Concession: We accept clearing Lane 1 (Bus Lane) for transit flow. However, we request Lane 4 (Emergency Lane) for setup/load-in from 12:00-16:00, releasing it before evening rush hour."
            allowance = {"lanes": extra_lanes, "time_window": "12:00-16:00"}
        else:
            # Low/medium traffic, we can push to keep Lane 1 or request Lane 4 setup
            lanes = [2, 3]
            extra_lanes = [1, 4]
            financial = 88 if event_scale == "high" else 78
            delay = 22
            impact = 32
            safety = True
            rationale = "Concession: We restrict main event footprint to lanes 2-3. We request setup access to lanes 1 and 4 from 12:00-16:00, restoring all transit corridors by 16:00."
            allowance = {"lanes": extra_lanes, "time_window": "12:00-16:00"}
            
        proposal = {
            "event_name": "Grand Street Carnival",
            "avenue": "Main Street",
            "blocks": [2, 3, 4] if event_scale != "low" else [2, 3],
            "lanes": lanes,
            "time_window": "12:00-20:00",
            "extra_allowance": allowance,
            "telemetry": {
                "community_impact_score": impact,
                "delay_minutes": delay,
                "financial_viability": financial,
                "safety_corridors_intact": safety
            },
            "rationale": rationale
        }
    else:
        return {}

    # Calculate blocked cells impact
    blocked_in_requested = [c for c in blocked_cells if c.get("block") in proposal["blocks"] and c.get("lane") in proposal["lanes"]]
    if blocked_in_requested:
        tel = proposal["telemetry"]
        tel["financial_viability"] = max(40, tel["financial_viability"] - 12 * len(blocked_in_requested))
        tel["delay_minutes"] = min(60, tel["delay_minutes"] + 6 * len(blocked_in_requested))
        tel["community_impact_score"] = min(100, tel["community_impact_score"] + 10 * len(blocked_in_requested))
        
        blocked_lanes = [c.get("lane") for c in blocked_in_requested]
        if 4 in blocked_lanes or 1 in blocked_lanes:
            tel["safety_corridors_intact"] = False
            
        blocked_strs = ", ".join([f"B{c['block']}L{c['lane']}" for c in blocked_in_requested])
        proposal["rationale"] += f" (Note: Active construction at {blocked_strs} has constricted event capacity, impacting viability and traffic routing.)"
        
    return proposal


def generate_transit_proposal(
    history: List[Dict[str, Any]], 
    event_scale: str, 
    traffic_load: str, 
    turn: int, 
    api_key: Optional[str] = None,
    blocked_cells: Optional[List[Dict[str, int]]] = None
) -> Dict[str, Any]:
    """Generates the next counter-proposal/response from the Transit Agent."""
    if blocked_cells is None:
        blocked_cells = []
        
    if api_key:
        try:
            client = genai.Client(api_key=api_key)
            blocked_desc = ", ".join([f"Block {c['block']} Lane {c['lane']}" for c in blocked_cells]) if blocked_cells else "None"
            
            prompt = f"""
            Environment Context:
            - Target Avenue: Main Street (Blocks 1-5, Lanes 1-4)
            - Event Scale setting: {event_scale} (Size of the event request)
            - Traffic Load setting: {traffic_load} (Determines how strictly you must keep lanes open)
            - Current Negotiation Turn: {turn}
            - CRITICAL Hazard Blocks (Under Construction/Blocked): {blocked_desc} (These blocks/lanes cannot be used or proposed by anyone. You must negotiate around them!)
            
            Previous Negotiation History:
            {json.dumps(history, indent=2)}
            
            Analyze the Logistics Agent's latest proposal.
            Check if a resource overlap (race condition) exists. Specifically, check if they block Lane 1 (Bus Lane) or Lane 4 (Emergency Lane).
            If their telemetry shows Community Impact Score >= 40% or safety_corridors_intact is False, you MUST reject/counter-propose.
            Suggest a compromise: restrict them to Lanes 2 & 3, but you can offer off-peak 'extra_allowance' for setup (e.g., 12:00-16:00) if traffic load allows.
            Make sure your counter-proposals avoid any of the blocked cells.
            If their latest proposal is acceptable (Impact < 40%, safety corridors intact, reasonable delay), you can accept it by returning a plan identical to theirs but state in the rationale that you accept it.
            """
            
            response = client.models.generate_content(
                model="gemini-2.5-flash",
                contents=prompt,
                config=types.GenerateContentConfig(
                    system_instruction=TRANSIT_AGENT_INSTRUCTIONS,
                    response_mime_type="application/json",
                    response_schema=RouteProposal,
                    temperature=0.5
                )
            )
            return json.loads(response.text)
        except Exception as e:
            print(f"Transit Agent API Error: {e}. Falling back to simulation.")

    # Procedural Simulation Mode (Slider-Responsive)
    if turn == 2:
        # Transit responds to Turn 1 proposal
        # If traffic load is high, Transit is very protective of Lane 1 & 4
        if traffic_load == "high":
            lanes = [2, 3]
            delay = 15
            impact = 30
            safety = True
            rationale = "REJECTION: Main Street transit load is HIGH. Blocking Lane 1 (Bus Lane) or Lane 4 (Emergency corridor) causes severe system delay. We counter-propose restricting event to Lanes 2 & 3 only."
        elif traffic_load == "medium":
            lanes = [2, 3]
            delay = 20
            impact = 35
            safety = True
            rationale = "REJECTION: Closing Lane 1 is unacceptable during evening peak hours. We counter-propose restricting main footprint to Lanes 2 & 3, keeping transit lanes clear."
        else:
            # Low traffic: Transit is more willing to accept Lane 1 closure, but emergency lane must be open
            lanes = [1, 2, 3]
            delay = 15
            impact = 28
            safety = True
            rationale = "COUNTER-PROPOSAL: Since transit load is LOW, we allow Lane 1 (Bus Lane) closure. However, Lane 4 (Emergency Lane) must remain completely clear for emergency route compliance."
            
        proposal = {
            "event_name": "Grand Street Carnival",
            "avenue": "Main Street",
            "blocks": [2, 3, 4],
            "lanes": lanes,
            "time_window": "12:00-20:00",
            "extra_allowance": None,
            "telemetry": {
                "community_impact_score": impact,
                "delay_minutes": delay,
                "financial_viability": 75 if event_scale == "high" else 65,
                "safety_corridors_intact": safety
            },
            "rationale": rationale
        }
        
    elif turn == 4:
        # Transit decides whether to accept Turn 3 proposal
        # Usually, by turn 4, Logistics has restricted footprint and requested off-peak setup.
        # This is acceptable because setup is off-peak.
        last_logistics = history[-1]
        telemetry = last_logistics.get("telemetry", {})
        
        # Accept and echo the proposal
        proposal = dict(last_logistics)
        proposal["rationale"] = "AGREEMENT REACHED: The concession to clear Lane 1 and 4 by 16:00 satisfies transit and safety constraints. Temporary off-peak setup load-in is approved."
    else:
        return {}

    # Calculate blocked cells impact
    blocked_in_requested = [c for c in blocked_cells if c.get("block") in proposal["blocks"] and c.get("lane") in proposal["lanes"]]
    if blocked_in_requested:
        tel = proposal["telemetry"]
        tel["delay_minutes"] = min(60, tel["delay_minutes"] + 5 * len(blocked_in_requested))
        tel["community_impact_score"] = min(100, tel["community_impact_score"] + 8 * len(blocked_in_requested))
        
        blocked_lanes = [c.get("lane") for c in blocked_in_requested]
        if 4 in blocked_lanes or 1 in blocked_lanes:
            tel["safety_corridors_intact"] = False
            
        blocked_strs = ", ".join([f"B{c['block']}L{c['lane']}" for c in blocked_in_requested])
        proposal["rationale"] += f" (Transit Alert: Active road blocks at {blocked_strs} restrict general traffic squeezing and bus routes.)"
        
    return proposal
