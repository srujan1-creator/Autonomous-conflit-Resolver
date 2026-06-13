import os
import json
import sys

# Add current path to sys.path to ensure local package imports successfully
sys.path.append(os.path.abspath(os.path.dirname(__file__)))

try:
    from agent_development_kit import Agent, AgentRegistry, MemoryBank, Evaluator
    from agents import generate_logistics_proposal, generate_transit_proposal
    print("SUCCESS: local agent_development_kit package imported successfully.")
except ImportError as e:
    print(f"FAILED: Failed to import agent_development_kit components: {e}")
    sys.exit(1)


def test_registry():
    print("\n--- Testing Agent Registry ---")
    registry = AgentRegistry()
    
    agent1 = Agent("Agent_A", "Instruction A")
    agent2 = Agent("Agent_B", "Instruction B")
    
    registry.register(agent1)
    registry.register(agent2)
    
    agents = registry.list_agents()
    print(f"Registered agents: {agents}")
    assert "Agent_A" in agents, "Registry missing Agent_A"
    assert "Agent_B" in agents, "Registry missing Agent_B"
    
    resolved = registry.get_agent("Agent_A")
    assert resolved.instruction == "Instruction A", "Agent instruction mismatch"
    print("SUCCESS: AgentRegistry test passed.")


def test_memory_bank():
    print("\n--- Testing Memory Bank ---")
    mb = MemoryBank("test_memory_bank.json")
    mb.clear()
    
    mb.set("test_key", "test_value")
    mb.set("numbers", [1, 2, 3])
    
    # Reload and test persistence
    mb_reload = MemoryBank("test_memory_bank.json")
    print(f"Loaded test_key: {mb_reload.get('test_key')}")
    print(f"Loaded numbers: {mb_reload.get('numbers')}")
    
    assert mb_reload.get("test_key") == "test_value", "MemoryBank failed to persist text value"
    assert mb_reload.get("numbers") == [1, 2, 3], "MemoryBank failed to persist list value"
    
    # Cleanup
    if os.path.exists("test_memory_bank.json"):
        os.remove("test_memory_bank.json")
        
    print("SUCCESS: MemoryBank test passed.")


def test_agent_proposals():
    print("\n--- Testing Agent Proposals (Simulation Mode) ---")
    history = []
    
    # Turn 1: Logistics Agent Proposal
    prop1 = generate_logistics_proposal(history, event_scale="high", traffic_load="high", turn=1)
    print(f"Turn 1 (Logistics) Rationale: {prop1['rationale']}")
    assert prop1["event_name"] == "Grand Street Carnival", "Event name mismatch"
    assert 1 in prop1["lanes"], "Lanes mismatch in Turn 1 Logistics"
    history.append(prop1)
    
    # Turn 2: Transit Agent Counter
    prop2 = generate_transit_proposal(history, event_scale="high", traffic_load="high", turn=2)
    print(f"Turn 2 (Transit) Rationale: {prop2['rationale']}")
    assert prop2["telemetry"]["safety_corridors_intact"] is True, "Safety corridors should be intact in Turn 2"
    history.append(prop2)
    
    # Turn 3: Logistics concession
    prop3 = generate_logistics_proposal(history, event_scale="high", traffic_load="high", turn=3)
    print(f"Turn 3 (Logistics concession) Rationale: {prop3['rationale']}")
    assert 1 not in prop3["lanes"], "Bus lane 1 should be relinquished in Turn 3 concession under high traffic"
    history.append(prop3)
    
    # Turn 4: Transit acceptance
    prop4 = generate_transit_proposal(history, event_scale="high", traffic_load="high", turn=4)
    print(f"Turn 4 (Transit acceptance) Rationale: {prop4['rationale']}")
    history.append(prop4)
    
    print("SUCCESS: Agent proposals simulated negotiation path verified.")
    return history


def test_evaluator(history):
    print("\n--- Testing LLM-as-Judge Evaluator (Simulation Mode) ---")
    rubric = {
        "safety_corridors": "Must remain 100% unobstructed",
        "community_impact_score": "Must be below 40%",
        "financial_viability": "Must optimize resource reuse"
    }
    
    evaluation_data = {
        "negotiation_history": history,
        "final_proposal": history[-1]
    }
    
    score = Evaluator.grade(
        model="gemini-pro",
        data=evaluation_data,
        criteria=rubric
    )
    
    print(f"Judge Score: {score['overall_score']}")
    print(f"Judge Verdict: {score['overall_status']}")
    print(f"Safety corridors status: {score['safety_corridors']['status']} - {score['safety_corridors']['reason']}")
    print(f"Community impact status: {score['community_impact_score']['status']} - {score['community_impact_score']['reason']}")
    print(f"Financial viability status: {score['financial_viability']['status']} - {score['financial_viability']['reason']}")
    
    assert score["overall_status"] in ["APPROVED", "APPROVED_WITH_CONDITIONS"], "Simulation evaluation failed to approve valid proposal"
    print("SUCCESS: Evaluator Judge tests completed successfully.")


def test_blocked_cells_impact():
    print("\n--- Testing Blocked Cells Impact (Simulation Mode) ---")
    history = []
    # Block a cell inside the requested footprint (Block 3, Lane 2)
    blocked = [{"block": 3, "lane": 2}]
    
    # Generate Turn 1 Logistics proposal under blockage
    prop1 = generate_logistics_proposal(history, event_scale="high", traffic_load="high", turn=1, blocked_cells=blocked)
    print(f"Logistics Rationale: {prop1['rationale']}")
    
    # Assertions
    assert prop1["telemetry"]["financial_viability"] < 98, "Financial viability should decrease due to blockage"
    assert "construction" in prop1["rationale"].lower(), "Rationale should state construction hazard"
    
    # Generate Turn 2 Transit counter-proposal under blockage
    history.append(prop1)
    prop2 = generate_transit_proposal(history, event_scale="high", traffic_load="high", turn=2, blocked_cells=blocked)
    print(f"Transit Rationale: {prop2['rationale']}")
    assert "road blocks" in prop2["rationale"].lower(), "Transit rationale should state active road block alert"
    print("SUCCESS: Blocked cells impact test passed.")


if __name__ == "__main__":
    print("==================================================")
    print("Running Autonomous Conflict Resolver Test Suite")
    print("==================================================")
    
    test_registry()
    test_memory_bank()
    history_data = test_agent_proposals()
    test_evaluator(history_data)
    test_blocked_cells_impact()
    
    print("\n==================================================")
    print("ALL TESTS PASSED SUCCESSFULLY!")
    print("==================================================")
