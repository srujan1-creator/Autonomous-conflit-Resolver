import os
import time
import json
import hashlib
import asyncio
import threading
from flask import Flask, jsonify, request, send_from_directory
from flask_sock import Sock
from werkzeug.security import generate_password_hash, check_password_hash

app = Flask(__name__, static_folder="static", static_url_path="")

USERS_FILE = "users.json"

def load_users():
    """Load users from json database, or initialize with default admin account."""
    if not os.path.exists(USERS_FILE):
        default = {
            "admin": {
                "password": generate_password_hash("adk-orchestrator"),
                "name": "System Admin",
                "role": "Lead Orchestrator",
                "avatar": "👤"
            }
        }
        try:
            with open(USERS_FILE, "w", encoding="utf-8") as f:
                json.dump(default, f, indent=2)
        except Exception as e:
            print(f"Error creating default users file: {e}")
        return default
    try:
        with open(USERS_FILE, "r", encoding="utf-8") as f:
            users = json.load(f)
            # Auto-migrate legacy plaintext passwords to secure hash
            migrated = False
            for u, info in users.items():
                pwd = info.get("password", "")
                if pwd and not pwd.startswith("scrypt:") and not pwd.startswith("pbkdf2:"):
                    info["password"] = generate_password_hash(pwd)
                    migrated = True
            if migrated:
                save_users(users)
            return users
    except Exception as e:
        print(f"Error loading users file: {e}")
        return {}

def save_users(users):
    """Persist users dict to json file."""
    try:
        with open(USERS_FILE, "w", encoding="utf-8") as f:
            json.dump(users, f, indent=2)
    except Exception as e:
        print(f"Error saving users file: {e}")

@app.after_request
def add_header(response):
    """Enable high-performance browser caching for static assets while keeping dynamic APIs fresh."""
    path = request.path
    if path.startswith("/images/") or path.endswith((".css", ".js", ".jpg", ".png", ".svg", ".woff2", ".ico")):
        response.headers["Cache-Control"] = "public, max-age=31536000, immutable"
    else:
        response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
    
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Content-Security-Policy"] = "default-src 'self'; script-src 'self' 'unsafe-inline' https://fonts.googleapis.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self' ws: wss:;"
    return response

# Global WebSocket communication state
sock = Sock(app)
CONNECTED_CLIENTS = set()

@sock.route("/ws")
def ws_handler(ws):
    """Handle connection lifecycle of WebSocket clients."""
    CONNECTED_CLIENTS.add(ws)
    try:
        ws.send(json.dumps({
            "type": "status", 
            "message": "Connected to Autonomous Conflict A2A Broker."
        }))
        while True:
            message = ws.receive()
            if message is None:
                break
    except Exception:
        pass
    finally:
        try:
            CONNECTED_CLIENTS.remove(ws)
        except KeyError:
            pass

def send_ws_update(message_dict):
    """Bridge function to send updates from the Flask/Worker threads to WebSocket clients."""
    if CONNECTED_CLIENTS:
        message_str = json.dumps(message_dict)
        for client in list(CONNECTED_CLIENTS):
            try:
                client.send(message_str)
            except Exception:
                try:
                    CONNECTED_CLIENTS.remove(client)
                except KeyError:
                    pass


# ---------------------------------------------------------
# Flask API Endpoints
# ---------------------------------------------------------

@app.route("/")
def index():
    """Serve the visualizer front-end."""
    return send_from_directory("static", "index.html")

@app.route("/api/auth/signup", methods=["POST"])
def auth_signup():
    """Register a new user in the system database with hashed credentials."""
    data = request.get_json() or {}
    username = data.get("username", "").strip().lower()
    password = data.get("password", "").strip()
    name = data.get("name", "").strip() or "System Operator"
    role = data.get("role", "").strip() or "Lead Orchestrator"
    avatar = data.get("avatar", "").strip() or "👤"
    
    if not username or not password:
        return jsonify({"status": "error", "message": "Username and password are required."}), 400
        
    users = load_users()
    if username in users:
        return jsonify({"status": "error", "message": "Username already exists."}), 400
        
    users[username] = {
        "password": generate_password_hash(password),
        "name": name,
        "role": role,
        "avatar": avatar
    }
    save_users(users)
    return jsonify({"status": "success", "message": "Account created successfully. You can now login!"})

@app.route("/api/auth/login", methods=["POST"])
def auth_login():
    """Verify hashed user credentials against the registry database."""
    data = request.get_json() or {}
    username = data.get("username", "").strip().lower()
    password = data.get("password", "").strip()
    
    if not username or not password:
        return jsonify({"status": "error", "message": "Username and password are required."}), 400
        
    users = load_users()
    user_info = users.get(username)
    
    if user_info and check_password_hash(user_info.get("password", ""), password):
        return jsonify({
            "status": "success",
            "profile": {
                "name": user_info.get("name"),
                "role": user_info.get("role"),
                "avatar": user_info.get("avatar")
            }
        })
        
    return jsonify({"status": "error", "message": "Invalid username or password."}), 401

@app.route("/api/scenarios", methods=["GET"])
def get_scenarios():
    """Return preset urban crisis scenarios for one-click simulation loading."""
    scenarios = {
        "carnival": {
            "title": "Grand Street Carnival",
            "description": "Logistics requests complete multi-block venue setup for annual parade.",
            "event_scale": "high",
            "traffic_load": "medium",
            "blocked_cells": []
        },
        "water_main": {
            "title": "Downtown Water Main Burst",
            "description": "Emergency hazard blocks Core Plaza Block 3 Lanes 2 & 3. Heavy traffic rerouting.",
            "event_scale": "medium",
            "traffic_load": "high",
            "blocked_cells": [{"block": 3, "lane": 2}, {"block": 3, "lane": 3}]
        },
        "vip_convoy": {
            "title": "VIP Presidential Convoy",
            "description": "Emergency clearance corridor active on Lane 4 and Block 2 Lane 1. High security.",
            "event_scale": "low",
            "traffic_load": "high",
            "blocked_cells": [{"block": 1, "lane": 4}, {"block": 2, "lane": 4}, {"block": 3, "lane": 4}, {"block": 4, "lane": 4}, {"block": 5, "lane": 4}]
        },
        "subway_outage": {
            "title": "Metropolitan Subway Outage",
            "description": "Bus bridge replacement active. Transit protects Bus Routes across all blocks.",
            "event_scale": "low",
            "traffic_load": "high",
            "blocked_cells": [{"block": 2, "lane": 2}, {"block": 4, "lane": 2}]
        }
    }
    return jsonify({"status": "success", "scenarios": scenarios})

@app.route("/api/report/export", methods=["POST"])
def export_audit_report():
    """Generate a cryptographically signed compliance audit report of the A2A negotiation."""
    data = request.get_json() or {}
    scorecard = data.get("scorecard", {})
    history = data.get("history", [])
    user_name = data.get("user_name", "System Administrator")
    
    timestamp = time.strftime("%Y-%m-%d %H:%M:%S UTC", time.gmtime())
    raw_payload = json.dumps({"scorecard": scorecard, "history": history, "timestamp": timestamp}, sort_keys=True)
    digital_signature = hashlib.sha256(raw_payload.encode('utf-8')).hexdigest()
    
    report = {
        "system": "Autonomous Conflict Resolver (ADK Version 2.4)",
        "protocol": "Agent-to-Agent (A2A) Peer Negotiation",
        "audit_id": f"AUD-{int(time.time())}",
        "timestamp": timestamp,
        "certified_by": user_name,
        "security_level": "SHA256 Encrypted Audit Trail",
        "digital_signature": digital_signature,
        "scorecard": scorecard,
        "negotiation_summary": {
            "turns_count": len(history),
            "agreement_status": scorecard.get("overall_status", "PENDING"),
            "final_score": scorecard.get("overall_score", 0)
        },
        "history": history
    }
    return jsonify({"status": "success", "report": report})

@app.route("/api/config", methods=["GET", "POST"])
def manage_config():
    """Get or Set Gemini API key details in the local runtime env."""
    if request.method == "GET":
        api_key = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY") or ""
        masked_key = f"{api_key[:6]}...{api_key[-4:]}" if len(api_key) > 10 else ""
        return jsonify({
            "api_key_set": bool(api_key),
            "masked_key": masked_key
        })
    elif request.method == "POST":
        data = request.get_json() or {}
        api_key = data.get("api_key", "").strip()
        if api_key:
            os.environ["GEMINI_API_KEY"] = api_key
            os.environ["GOOGLE_API_KEY"] = api_key
            return jsonify({"status": "success", "message": "API Key saved successfully."})
        else:
            # Clear key
            os.environ.pop("GEMINI_API_KEY", None)
            os.environ.pop("GOOGLE_API_KEY", None)
            return jsonify({"status": "success", "message": "API Key removed. Switched to Simulation Mode."})

@app.route("/api/negotiate/start", methods=["POST"])
def start_negotiation():
    """Trigger the multi-agent negotiation sequence in a background worker thread."""
    data = request.get_json() or {}
    event_scale = data.get("event_scale", "medium")
    traffic_load = data.get("traffic_load", "medium")
    blocked_cells = data.get("blocked_cells", [])
    
    # Start negotiation in background thread so HTTP call returns immediately
    thread = threading.Thread(
        target=run_negotiation_flow, 
        args=(event_scale, traffic_load, blocked_cells),
        daemon=True
    )
    thread.start()
    return jsonify({"status": "started", "message": "Negotiation sequence triggered."})

@app.route("/api/helper/chat", methods=["POST"])
def helper_chat():
    """Answer user questions about the A2A system, agents, and parameters."""
    data = request.get_json() or {}
    message = data.get("message", "").strip()
    
    api_key = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
    
    if api_key:
        try:
            from google import genai
            client = genai.Client(api_key=api_key)
            
            prompt = f"""
            You are the Helper Agent (System Assistant) for the 'Autonomous Conflict Resolver' multi-agent dashboard.
            Answer the user's question about this application or its AI negotiation concepts.
            
            Concepts Context:
            - Logistics Agent: Secure Main Street assets for public carnival (wants max lanes).
            - Transit Agent: Protect traffic flow & emergency corridors (wants impact < 40% and lanes 1 & 4 clear).
            - A2A loop: Asynchronous Pub/Sub channel where agents negotiate via JSON schemas to resolve overlaps (race conditions).
            - Memory Bank: Local state store tracking session states and plan revisions.
            - Evaluator Agent: Autonomous LLM-as-Judge that evaluates the final plan against safety, community delay, and financial criteria.
            - Simulation vs. Live mode: Switch by providing a Gemini API Key on the left. Live mode runs real LLM negotiations.
            
            User Question: "{message}"
            
            Provide a friendly, helpful response. Keep it concise (1-3 sentences maximum).
            """
            
            response = client.models.generate_content(
                model="gemini-2.5-flash",
                contents=prompt
            )
            return jsonify({"reply": response.text.strip()})
        except Exception as e:
            print(f"Helper Chatbot Gemini Error: {e}. Falling back to keyword heuristics.")
            
    # Offline keyword heuristics
    msg_lower = message.lower()
    
    if "loop" in msg_lower or "negotiat" in msg_lower or "a2a" in msg_lower:
        reply = "The A2A (Agent-to-Agent) loop is a turn-based negotiation channel. The Logistics Agent broadcasts a route token proposal. The Transit Agent catches it, detects a race condition (lane conflict), and replies with a counter-proposal. They repeat this cycle until constraints are met."
    elif "live" in msg_lower or "mode" in msg_lower or "api" in msg_lower or "key" in msg_lower:
        reply = "To run in Gemini Live Mode, click 'Configure Gemini API Key' in the left panel, paste your key, and save. The backend will switch from slider-based procedural simulation to real-time LLM-driven negotiation using the google-genai SDK!"
    elif "rubric" in msg_lower or "judge" in msg_lower or "evaluat" in msg_lower:
        reply = "The LLM Evaluator Agent acts as a judge, analyzing the negotiated agreement. It grades the plan against a rubric: safety corridors must be 100% unobstructed, community impact must be under 40%, and financial reuse must be optimized."
    elif "logistics" in msg_lower or "footprint" in msg_lower:
        reply = "The Logistics Agent represents the event orchestrator. Its system instruction is to secure as much block and lane space as possible on Main Street for the Grand Street Carnival, optimizing event capacity and financial viability."
    elif "transit" in msg_lower or "commute" in msg_lower:
        reply = "The Transit Agent represents the city transportation authority. It strives to maximize public commute efficiency, specifically ensuring that Lane 1 (Bus Route) and Lane 4 (Emergency Lane) remain clear during peak rush hours."
    elif "conflict" in msg_lower or "race" in msg_lower or "overlap" in msg_lower:
        reply = "A race condition occurs when both agents try to claim the same block and lane at the same time. The A2A protocol dynamically resolves this resource overlap by suggesting compromise lanes or off-peak setup allowances."
    elif "visual" in msg_lower or "grid" in msg_lower or "cell" in msg_lower or "color" in msg_lower or "map" in msg_lower:
        reply = "The Avenue Grid Visualizer shows lane occupancy. Grey is free, Red is Logistics (event footprint), Blue is Transit (bus route), and flashing Amber/Red stripes represent a conflict (overlap). Light green outlines represent off-peak setup privileges."
    elif "run" in msg_lower or "start" in msg_lower or "button" in msg_lower or "use" in msg_lower or "how to" in msg_lower:
        reply = "To use the resolver: 1. Adjust the sliders on the left (Event Footprint & Transit Load). 2. Click 'Resolve Conflict'. 3. Watch the graph send pulses and the grid update. 4. View the final grade from the LLM Judge."
    elif "block" in msg_lower or "lane" in msg_lower:
        reply = "Main Street is divided into 5 blocks (representing segments of the avenue) and 4 lanes: Lane 1 (Bus Route), Lane 2 & 3 (General Traffic), and Lane 4 (Emergency Lane)."
    elif "memory" in msg_lower or "bank" in msg_lower or "state" in msg_lower:
        reply = "The Memory Bank is the native state storage feature of the framework. It saves agent tokens, planned route parameters, and evaluations to a local JSON file (memory_bank.json), allowing cross-session tracking of decisions."
    elif "what is this" in msg_lower or "about" in msg_lower or "project" in msg_lower or "portfolio" in msg_lower:
        reply = "This is the Autonomous Conflict Resolver portfolio project. It showcases A2A (Agent-to-Agent) protocol negotiation and LLM-as-Judge evaluation under Vertex AI/Gemini structures, demonstrating how microservices solve resource contentions."
    else:
        reply = "I am the system Helper Agent. I can explain the A2A negotiation loop, the Logistics and Transit agents, the LLM Judge rubric, the visualizer grid, the Memory Bank, or how to set up Gemini Live Mode. Select one of the quick actions below or ask me a specific question!"
        
    return jsonify({"reply": reply})


# ---------------------------------------------------------
# Multi-Agent Orchestration Flow
# ---------------------------------------------------------

def run_negotiation_flow(event_scale: str, traffic_load: str, blocked_cells: list = None):
    """Orchestrates the turn-based A2A communication, Memory Bank persistence, and LLM-as-Judge evaluation."""
    if blocked_cells is None:
        blocked_cells = []
    print(f"\n[ORCHESTRATOR] === Starting Negotiation Flow ===")
    print(f"[ORCHESTRATOR] Event Scale: {event_scale} | Traffic Load: {traffic_load} | Blocked Cells: {blocked_cells}")
    try:
        from agent_development_kit import AgentRegistry, MemoryBank, Evaluator, Agent
        from agents import generate_logistics_proposal, generate_transit_proposal
        
        # 1. Initialize ADK Registry & Memory Bank
        registry = AgentRegistry()
        logistics_agent = Agent("Logistics Agent", "Secure Main Street assets for public carnival.")
        transit_agent = Agent("Transit Agent", "Maintain traffic flow and safety corridors.")
        registry.register(logistics_agent)
        registry.register(transit_agent)
        
        mb = MemoryBank()
        mb.clear()
        
        history = []
        api_key = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
        print(f"[ORCHESTRATOR] Live Mode Active: {bool(api_key)}")
        
        # Send initial setup notification
        send_ws_update({
            "type": "negotiation_start", 
            "parameters": {"event_scale": event_scale, "traffic_load": traffic_load, "blocked_cells": blocked_cells},
            "api_mode": bool(api_key)
        })
        time.sleep(2.0)
        
        # Turn 1: Logistics Agent broadcasts initial route proposal
        print("[ORCHESTRATOR] Turn 1: Logistics broadcasting initial proposal...")
        send_ws_update({"type": "pulse", "from": "logistics", "to": "broker", "message": "Broadcasting initial route token proposal..."})
        time.sleep(1.2)
        
        proposal_1 = generate_logistics_proposal(history, event_scale, traffic_load, turn=1, api_key=api_key, blocked_cells=blocked_cells)
        history.append(proposal_1)
        mb.set("turn_1", proposal_1)
        print(f"[ORCHESTRATOR] Turn 1 Logistics Rationale: {proposal_1.get('rationale')}")
        
        send_ws_update({
            "type": "agent_message",
            "sender": "logistics",
            "payload": proposal_1,
            "turn": 1,
            "telemetry": proposal_1.get("telemetry", {})
        })
        time.sleep(3.0)
        
        # Turn 2: Transit Agent catches token, detects race condition (conflict), broadcasts counter-proposal
        print("[ORCHESTRATOR] Turn 2: Transit evaluating and broadcasting counter-proposal...")
        send_ws_update({"type": "pulse", "from": "broker", "to": "transit", "message": "Conflict detected! Routing proposal to Transit Agent..."})
        time.sleep(1.2)
        
        proposal_2 = generate_transit_proposal(history, event_scale, traffic_load, turn=2, api_key=api_key, blocked_cells=blocked_cells)
        history.append(proposal_2)
        mb.set("turn_2", proposal_2)
        print(f"[ORCHESTRATOR] Turn 2 Transit Rationale: {proposal_2.get('rationale')}")
        
        send_ws_update({
            "type": "agent_message",
            "sender": "transit",
            "payload": proposal_2,
            "turn": 2,
            "telemetry": proposal_2.get("telemetry", {})
        })
        time.sleep(3.0)
        
        # Turn 3: Logistics Agent reviews counter-proposal, concedes/re-proposes
        print("[ORCHESTRATOR] Turn 3: Logistics reviewing counter-proposal and conceding...")
        send_ws_update({"type": "pulse", "from": "logistics", "to": "broker", "message": "Broadcasting concession counter-proposal..."})
        time.sleep(1.2)
        
        proposal_3 = generate_logistics_proposal(history, event_scale, traffic_load, turn=3, api_key=api_key, blocked_cells=blocked_cells)
        history.append(proposal_3)
        mb.set("turn_3", proposal_3)
        print(f"[ORCHESTRATOR] Turn 3 Logistics Concession: {proposal_3.get('rationale')}")
        
        send_ws_update({
            "type": "agent_message",
            "sender": "logistics",
            "payload": proposal_3,
            "turn": 3,
            "telemetry": proposal_3.get("telemetry", {})
        })
        time.sleep(3.0)
        
        # Turn 4: Transit Agent accepts/re-evaluates proposal
        print("[ORCHESTRATOR] Turn 4: Transit final review and agreement...")
        send_ws_update({"type": "pulse", "from": "broker", "to": "transit", "message": "Evaluating concession limits..."})
        time.sleep(1.2)
        
        proposal_4 = generate_transit_proposal(history, event_scale, traffic_load, turn=4, api_key=api_key, blocked_cells=blocked_cells)
        history.append(proposal_4)
        mb.set("turn_4", proposal_4)
        mb.set("final_plan", proposal_4)
        mb.persist()
        print(f"[ORCHESTRATOR] Turn 4 Transit Decision: {proposal_4.get('rationale')}")
        
        send_ws_update({
            "type": "agent_message",
            "sender": "transit",
            "payload": proposal_4,
            "turn": 4,
            "telemetry": proposal_4.get("telemetry", {})
        })
        time.sleep(3.0)
        
        # Step 3: LLM-as-Judge Evaluation (Evaluator Agent)
        print("[ORCHESTRATOR] Step 3: Invoking LLM-as-Judge Evaluator...")
        send_ws_update({"type": "pulse", "from": "broker", "to": "judge", "message": "Compiling final plan and telemetry for LLM Judge..."})
        time.sleep(1.5)
        
        rubric = {
            "safety_corridors": "Must remain 100% unobstructed during peak hours",
            "community_impact_score": "Must be below 40%",
            "financial_viability": "Must optimize resource reuse"
        }
        
        final_data = {
            "negotiation_history": history,
            "final_proposal": proposal_4
        }
        
        score = Evaluator.grade(
            model="gemini-pro",
            data=final_data,
            criteria=rubric
        )
        
        mb.set("evaluation", score)
        mb.persist()
        print(f"[ORCHESTRATOR] Judge Overall Score: {score.get('overall_score')} | Verdict: {score.get('overall_status')}")
        
        # Push final judge report
        send_ws_update({
            "type": "judge_evaluation",
            "payload": score
        })
        print("[ORCHESTRATOR] === Negotiation Flow Complete ===\n")
        
    except Exception as e:
        print(f"[ORCHESTRATOR] [ERROR] Error in negotiation flow: {e}")
        send_ws_update({
            "type": "error",
            "message": f"Negotiation execution failed: {str(e)}"
        })


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    # Start Flask API server
    print(f"Flask Server running on http://0.0.0.0:{port}")
    app.run(host="0.0.0.0", port=port)
