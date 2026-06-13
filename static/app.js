// ---------------------------------------------------------
// DOM Elements Selection
// ---------------------------------------------------------
const runBtn = document.getElementById("run-btn");
const resetBtn = document.getElementById("reset-btn");
const eventScaleSlider = document.getElementById("event-scale");
const trafficLoadSlider = document.getElementById("traffic-load");
const eventScaleVal = document.getElementById("event-scale-val");
const trafficLoadVal = document.getElementById("traffic-load-val");

const wsStatusBadge = document.getElementById("ws-status");
const apiStatusBadge = document.getElementById("api-status");
const toggleApiBtn = document.getElementById("toggle-api-btn");
const apiKeyContainer = document.getElementById("api-key-container");
const apiKeyInput = document.getElementById("api-key-input");
const saveApiBtn = document.getElementById("save-api-btn");

const networkActivity = document.getElementById("network-activity");
const networkContainer = document.querySelector(".network-container");
const pulseDot = document.getElementById("pulse-dot-active");

// Telemetry Elements
const telemetryDelay = document.getElementById("telemetry-delay");
const telemetryImpact = document.getElementById("telemetry-impact");
const telemetryFinancial = document.getElementById("telemetry-financial");
const safetyLight = document.getElementById("safety-light");
const safetyStatusText = document.getElementById("safety-status-text");

const gaugeDelay = document.getElementById("gauge-delay");
const gaugeImpact = document.getElementById("gauge-impact");
const gaugeFinancial = document.getElementById("gauge-financial");

// Timeline & Judge Elements
const timelineEmpty = document.getElementById("timeline-empty");
const timelineFlow = document.getElementById("timeline-flow");
const judgeOverallScore = document.getElementById("judge-overall-score");
const judgeVerdict = document.getElementById("judge-verdict");
const rubricSafety = document.getElementById("rubric-safety");
const rubricSafetyText = document.getElementById("rubric-safety-text");
const rubricImpact = document.getElementById("rubric-impact");
const rubricImpactText = document.getElementById("rubric-impact-text");
const rubricFinancial = document.getElementById("rubric-financial");
const rubricFinancialText = document.getElementById("rubric-financial-text");
const judgeSummaryText = document.getElementById("judge-summary-text");

// Modal Elements
const jsonModal = document.getElementById("json-modal");
const modalCode = document.getElementById("modal-code");
const closeModal = document.getElementById("close-modal");

// State trackers
let socket = null;
let activeLogisticsPlan = null;
let activeTransitPlan = null;
const scaleMap = ["Low", "Medium", "High"];
let blockedCells = [];

// ---------------------------------------------------------
// WebSocket Connection Manager
// ---------------------------------------------------------
function connectWebSocket() {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const host = window.location.host || "localhost:5000";
    socket = new WebSocket(`${protocol}//${host}/ws`);

    socket.onopen = () => {
        console.log("WebSocket connected to broker.");
        wsStatusBadge.className = "status-badge online";
        wsStatusBadge.querySelector(".status-text").textContent = "Broker Connected";
    };

    socket.onclose = () => {
        console.log("WebSocket closed. Attempting reconnect...");
        wsStatusBadge.className = "status-badge offline";
        wsStatusBadge.querySelector(".status-text").textContent = "Broker Offline";
        setTimeout(connectWebSocket, 3000);
    };

    socket.onerror = (err) => {
        console.error("WebSocket error:", err);
    };

    socket.onmessage = (event) => {
        const data = JSON.parse(event.data);
        handleBrokerMessage(data);
    };
}

// ---------------------------------------------------------
// Backend Config Fetch (API Key check)
// ---------------------------------------------------------
async function fetchConfig() {
    try {
        const res = await fetch("/api/config");
        const config = await res.json();
        updateApiBadge(config.api_key_set, config.masked_key);
    } catch (e) {
        console.error("Error fetching config:", e);
    }
}

function updateApiBadge(api_key_set, masked_key) {
    if (api_key_set) {
        apiStatusBadge.className = "status-badge live";
        apiStatusBadge.querySelector(".status-text").textContent = "Gemini Live Mode";
        apiKeyInput.value = masked_key;
        toggleApiBtn.textContent = "Edit Gemini API Key";
    } else {
        apiStatusBadge.className = "status-badge simulation";
        apiStatusBadge.querySelector(".status-text").textContent = "Simulation Mode";
        apiKeyInput.value = "";
        toggleApiBtn.textContent = "Configure Gemini API Key";
    }
}

// ---------------------------------------------------------
// Event Handlers for UI Controls
// ---------------------------------------------------------
eventScaleSlider.addEventListener("input", (e) => {
    eventScaleVal.textContent = scaleMap[e.target.value];
});

trafficLoadSlider.addEventListener("input", (e) => {
    trafficLoadVal.textContent = scaleMap[e.target.value];
});

toggleApiBtn.addEventListener("click", () => {
    apiKeyContainer.classList.toggle("hidden");
});

saveApiBtn.addEventListener("click", async () => {
    const key = apiKeyInput.value.trim();
    try {
        const res = await fetch("/api/config", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ api_key: key })
        });
        const result = await res.json();
        if (result.status === "success") {
            alert(result.message);
            apiKeyContainer.classList.add("hidden");
            fetchConfig();
        }
    } catch (e) {
        alert("Error saving API Key.");
    }
});

runBtn.addEventListener("click", async () => {
    // Disable buttons during run
    runBtn.disabled = true;
    resetBtn.disabled = true;
    runBtn.textContent = "Negotiating...";
    
    // Clear previous runs
    resetVisualization();
    
    const payload = {
        event_scale: scaleMap[eventScaleSlider.value].toLowerCase(),
        traffic_load: scaleMap[trafficLoadSlider.value].toLowerCase(),
        blocked_cells: blockedCells
    };
    
    try {
        const res = await fetch("/api/negotiate/start", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });
        const result = await res.json();
        console.log(result.message);
    } catch (e) {
        console.error("Error triggering negotiation:", e);
        runBtn.disabled = false;
        resetBtn.disabled = false;
        runBtn.textContent = "Resolve Conflict";
    }
});

resetBtn.addEventListener("click", () => {
    resetVisualization();
});

// ---------------------------------------------------------
// A2A Pulse Graph Animations
// ---------------------------------------------------------
function triggerPulse(fromNodeId, toNodeId, description) {
    networkActivity.textContent = description;
    
    const fromNode = document.getElementById(`node-${fromNodeId}`);
    const toNode = document.getElementById(`node-${toNodeId}`);
    
    if (!fromNode || !toNode) return;
    
    // Active nodes styling
    document.querySelectorAll(".network-node").forEach(n => n.classList.remove("active-pulse"));
    document.querySelectorAll(".node-line").forEach(l => {
        l.classList.remove("active-logistics");
        l.classList.remove("active-transit");
    });
    
    fromNode.classList.add("active-pulse");
    
    // Set line active style
    if (fromNodeId === "logistics" || toNodeId === "logistics") {
        const line = document.getElementById("line-logistics-broker");
        if (line) line.classList.add("active-logistics");
    }
    if (fromNodeId === "transit" || toNodeId === "transit") {
        const line = document.getElementById("line-transit-broker");
        if (line) line.classList.add("active-transit");
    }

    // Calculate center coordinates relative to container
    const containerRect = networkContainer.getBoundingClientRect();
    const fromRect = fromNode.getBoundingClientRect();
    const toRect = toNode.getBoundingClientRect();
    
    const startX = (fromRect.left + fromRect.width / 2) - containerRect.left;
    const startY = (fromRect.top + fromRect.height / 2) - containerRect.top;
    const endX = (toRect.left + toRect.width / 2) - containerRect.left;
    const endY = (toRect.top + toRect.height / 2) - containerRect.top;
    
    // Update SVG pulse circle coordinates and re-trigger animation
    pulseDot.style.setProperty("--start-x", `${startX}px`);
    pulseDot.style.setProperty("--start-y", `${startY}px`);
    pulseDot.style.setProperty("--end-x", `${endX}px`);
    pulseDot.style.setProperty("--end-y", `${endY}px`);
    
    pulseDot.classList.remove("hidden");
    pulseDot.classList.remove("pulse-active");
    void pulseDot.offsetWidth; // Force reflow
    pulseDot.classList.add("pulse-active");
    
    // Once animation finishes, highlight destination node
    setTimeout(() => {
        fromNode.classList.remove("active-pulse");
        toNode.classList.add("active-pulse");
        pulseDot.classList.add("hidden");
    }, 1200);
}

// ---------------------------------------------------------
// Message Handler: Parses Websocket Pulse Updates
// ---------------------------------------------------------
function handleBrokerMessage(data) {
    switch(data.type) {
        case "negotiation_start":
            timelineEmpty.classList.add("hidden");
            timelineFlow.classList.remove("hidden");
            timelineFlow.innerHTML = "";
            resetVisualization();
            networkActivity.textContent = "Negotiation initialized. Syncing channels...";
            break;
            
        case "pulse":
            triggerPulse(data.from, data.to, data.message);
            break;
            
        case "agent_message":
            // Update local store of active route plans
            if (data.sender === "logistics") {
                activeLogisticsPlan = data.payload;
            } else if (data.sender === "transit") {
                activeTransitPlan = data.payload;
            }
            
            updateAvenueGrid();
            updateTelemetry(data.telemetry);
            appendTimelineItem(data.sender, data.payload, data.turn);
            break;
            
        case "judge_evaluation":
            updateJudgeScorecard(data.payload);
            
            // Re-enable run buttons at complete end
            runBtn.disabled = false;
            resetBtn.disabled = false;
            runBtn.textContent = "Resolve Conflict";
            break;
            
        case "error":
            alert(data.message);
            runBtn.disabled = false;
            resetBtn.disabled = false;
            runBtn.textContent = "Resolve Conflict";
            break;
    }
}

// ---------------------------------------------------------
// Visualizer: Avenue Lane Allocation Grid Renderer
// ---------------------------------------------------------
function updateAvenueGrid() {
    // Clear all cell state styles, keeping blocked cells
    document.querySelectorAll(".avenue-cell").forEach(cell => {
        const block = parseInt(cell.getAttribute("data-block"));
        const lane = parseInt(cell.getAttribute("data-lane"));
        const isBlocked = blockedCells.some(c => c.block === block && c.lane === lane);
        if (isBlocked) {
            cell.className = "avenue-cell cell-blocked";
        } else {
            cell.className = "avenue-cell cell-free";
        }
    });
    
    const logisticsBlocks = activeLogisticsPlan ? activeLogisticsPlan.blocks : [];
    const logisticsLanes = activeLogisticsPlan ? activeLogisticsPlan.lanes : [];
    const logisticsExtra = activeLogisticsPlan ? activeLogisticsPlan.extra_allowance : null;
    
    const transitBlocks = activeTransitPlan ? activeTransitPlan.blocks : [];
    const transitLanes = activeTransitPlan ? activeTransitPlan.lanes : [];
    
    // Process main footprint allocations
    for (let block = 1; block <= 5; block++) {
        for (let lane = 1; lane <= 4; lane++) {
            const isBlocked = blockedCells.some(c => c.block === block && c.lane === lane);
            const isLogisticsReserved = logisticsBlocks.includes(block) && logisticsLanes.includes(lane);
            const isTransitReserved = transitBlocks.includes(block) && transitLanes.includes(lane);
            
            const cell = document.querySelector(`.avenue-cell[data-block="${block}"][data-lane="${lane}"]`);
            if (!cell) continue;
            
            if (isBlocked) {
                cell.className = "avenue-cell cell-blocked";
            } else if (isLogisticsReserved && isTransitReserved) {
                cell.className = "avenue-cell cell-conflict";
            } else if (isLogisticsReserved) {
                cell.className = "avenue-cell cell-logistics";
            } else if (isTransitReserved) {
                cell.className = "avenue-cell cell-transit";
            }
        }
    }
    
    // Process Off-Peak Extra Allowance visual overlays
    const allowanceBar = document.getElementById("allowance-bar");
    if (logisticsExtra) {
        allowanceBar.classList.remove("hidden");
        const allowanceLanesFormatted = logisticsExtra.lanes.map(l => {
            if (l === 1) return "Lane 1 (Bus)";
            if (l === 4) return "Lane 4 (Emergency)";
            return `Lane ${l}`;
        }).join(" & ");
        
        document.getElementById("allowance-text").textContent = 
            `${allowanceLanesFormatted} in Blocks ${logisticsBlocks.join("-")} from ${logisticsExtra.time_window} (Pre-clearance guaranteed by 16:00)`;
            
        // Style extra allowance cells on grid with glowing green outlines or similar off-peak labels
        logisticsBlocks.forEach(block => {
            logisticsExtra.lanes.forEach(lane => {
                const cell = document.querySelector(`.avenue-cell[data-block="${block}"][data-lane="${lane}"]`);
                if (cell && cell.className === "avenue-cell cell-free") {
                    cell.style.borderColor = "var(--success-color)";
                    cell.style.boxShadow = "inset 0 0 8px rgba(16, 185, 129, 0.2)";
                }
            });
        });
    } else {
        allowanceBar.classList.add("hidden");
    }
}

// ---------------------------------------------------------
// Telemetry: Update progress rings and lights
// ---------------------------------------------------------
function updateTelemetry(metrics) {
    if (!metrics) return;
    
    // Set text values
    telemetryDelay.textContent = metrics.delay_minutes;
    telemetryImpact.textContent = `${metrics.community_impact_score}%`;
    telemetryFinancial.textContent = `${metrics.financial_viability}%`;
    
    // Update SVG progress rings (dashoffset = 251 * (1 - ratio))
    const setRingValue = (element, val, max = 100) => {
        const ratio = Math.min(1, Math.max(0, val / max));
        const offset = 251 - (251 * ratio);
        element.style.strokeDashoffset = offset;
    };
    
    setRingValue(gaugeDelay, metrics.delay_minutes, 60); // Max delay scale: 60 mins
    setRingValue(gaugeImpact, metrics.community_impact_score, 100);
    setRingValue(gaugeFinancial, metrics.financial_viability, 100);
    
    // Safety lights
    if (metrics.safety_corridors_intact) {
        safetyLight.className = "safety-light active-passed";
        safetyStatusText.textContent = "SAFETY CORRIDOR CLEAR";
    } else {
        safetyLight.className = "safety-light active-failed";
        safetyStatusText.textContent = "SAFETY OBSTRUCTED";
    }
}

// ---------------------------------------------------------
// Timeline: Append A2A conversation bubbles
// ---------------------------------------------------------
function appendTimelineItem(sender, payload, turn) {
    const item = document.createElement("div");
    item.className = `timeline-item ${sender}-item`;
    
    const formattedSenderName = sender === "logistics" ? "Logistics Agent 💼" : "Transit Agent 🚌";
    
    item.innerHTML = `
        <div class="timeline-marker"></div>
        <div class="timeline-item-header">
            <span class="agent-name">${formattedSenderName}</span>
            <span class="proposal-turn">Turn ${turn}</span>
        </div>
        <div class="timeline-bubble">
            <p>${payload.rationale}</p>
            <button class="inspect-payload-btn">
                🔍 Inspect Routing Token
            </button>
        </div>
    `;
    
    const inspectBtn = item.querySelector(".inspect-payload-btn");
    inspectBtn.payloadData = payload;
    inspectBtn.addEventListener("click", (e) => {
        const payloadObj = e.currentTarget.payloadData;
        modalCode.textContent = JSON.stringify(payloadObj, null, 4);
        jsonModal.classList.remove("hidden");
    });
    
    timelineFlow.appendChild(item);
    
    // Auto scroll timeline container to bottom
    const timelineContainer = document.getElementById("timeline-container");
    timelineContainer.scrollTop = timelineContainer.scrollHeight;
}

// ---------------------------------------------------------
// Modal Controller
// ---------------------------------------------------------
closeModal.addEventListener("click", () => {
    jsonModal.classList.add("hidden");
});

window.addEventListener("click", (e) => {
    if (e.target === jsonModal) {
        jsonModal.classList.add("hidden");
    }
});

// ---------------------------------------------------------
// Judge scorecard: updates rubric items
// ---------------------------------------------------------
function updateJudgeScorecard(scorecard) {
    if (!scorecard) return;
    
    // Score & Verdict
    judgeOverallScore.textContent = scorecard.overall_score;
    
    const verdict = scorecard.overall_status;
    judgeVerdict.textContent = verdict.replace(/_/g, " ");
    
    if (verdict === "APPROVED") {
        judgeVerdict.className = "verdict-badge status-approved";
    } else if (verdict === "APPROVED_WITH_CONDITIONS") {
        judgeVerdict.className = "verdict-badge status-conditions";
    } else {
        judgeVerdict.className = "verdict-badge status-rejected";
    }
    
    // Rubrics helper
    const updateRubricRow = (rowEl, data) => {
        const statusLight = rowEl.querySelector(".rubric-status");
        if (data.status === "PASSED") {
            statusLight.className = "rubric-status status-pass";
        } else {
            statusLight.className = "rubric-status status-fail";
        }
        rowEl.querySelector("p").textContent = data.reason;
    };
    
    updateRubricRow(rubricSafety, scorecard.safety_corridors);
    updateRubricRow(rubricImpact, scorecard.community_impact_score);
    updateRubricRow(rubricFinancial, scorecard.financial_viability);
    
    // Summary
    judgeSummaryText.textContent = scorecard.summary;
    judgeSummaryText.className = "text-secondary";
}

// ---------------------------------------------------------
// Reset/Clearing Visualization Elements
// ---------------------------------------------------------
function resetVisualization() {
    activeLogisticsPlan = null;
    activeTransitPlan = null;
    
    // Clear visualizer cells, keeping blocked cells
    document.querySelectorAll(".avenue-cell").forEach(cell => {
        const block = parseInt(cell.getAttribute("data-block"));
        const lane = parseInt(cell.getAttribute("data-lane"));
        const isBlocked = blockedCells.some(c => c.block === block && c.lane === lane);
        if (isBlocked) {
            cell.className = "avenue-cell cell-blocked";
        } else {
            cell.className = "avenue-cell cell-free";
        }
        cell.removeAttribute("style");
    });
    document.getElementById("allowance-bar").classList.add("hidden");
    
    // Clear network connections
    document.querySelectorAll(".network-node").forEach(n => n.classList.remove("active-pulse"));
    document.querySelectorAll(".node-line").forEach(l => {
        l.classList.remove("active-logistics");
        l.classList.remove("active-transit");
    });
    pulseDot.classList.add("hidden");
    networkActivity.textContent = "Awaiting signal...";
    
    // Reset gauges
    telemetryDelay.textContent = "0";
    telemetryImpact.textContent = "0%";
    telemetryFinancial.textContent = "0%";
    gaugeDelay.style.strokeDashoffset = 251;
    gaugeImpact.style.strokeDashoffset = 251;
    gaugeFinancial.style.strokeDashoffset = 251;
    
    safetyLight.className = "safety-light inactive";
    safetyStatusText.textContent = "No Active Plan";
    
    // Reset timeline & Judge Scorecard
    timelineFlow.innerHTML = "";
    timelineFlow.classList.add("hidden");
    timelineEmpty.classList.remove("hidden");
    
    judgeOverallScore.textContent = "--";
    judgeVerdict.className = "verdict-badge status-none";
    judgeVerdict.textContent = "PENDING";
    
    const resetRubricRow = (rowEl) => {
        rowEl.querySelector(".rubric-status").className = "rubric-status status-none";
        rowEl.querySelector("p").textContent = "Awaiting evaluation...";
    };
    resetRubricRow(rubricSafety);
    resetRubricRow(rubricImpact);
    resetRubricRow(rubricFinancial);
    judgeSummaryText.textContent = "The evaluator has not received the final negotiated agreement yet.";
}


// ==========================================================================
// Authentication & Session Controller (Full-Stack)
// ==========================================================================
const loginContainer = document.getElementById("login-container");
const dashboardContainer = document.getElementById("dashboard-container");
const usernameInput = document.getElementById("username");
const passwordInput = document.getElementById("password");
const loginBtn = document.getElementById("login-btn");
const loginError = document.getElementById("login-error");
const loginCard = document.getElementById("login-card");

// Tab Elements
const tabLogin = document.getElementById("tab-login");
const tabSignup = document.getElementById("tab-signup");
const loginFormContainer = document.getElementById("login-form-container");
const signupFormContainer = document.getElementById("signup-form-container");
const signupMessage = document.getElementById("signup-message");

// Signup Form Elements
const signupUsernameInput = document.getElementById("signup-username");
const signupPasswordInput = document.getElementById("signup-password");
const signupNameInput = document.getElementById("signup-name");
const signupRoleSelect = document.getElementById("signup-role");
const signupBtn = document.getElementById("signup-btn");
const signupAvatarGrid = document.getElementById("signup-avatar-grid");

let selectedAvatarEmoji = "👤";

// User Profile Badge Selectors
const userProfile = document.getElementById("user-profile");
const profileAvatar = document.getElementById("profile-avatar");
const profileName = document.getElementById("profile-name");
const profileRole = document.getElementById("profile-role");
const logoutBtn = document.getElementById("logout-btn");

const avatars = ["👤", "👨‍💻", "👩‍💻", "🧙‍♂️", "🚀", "🤖", "🕵️‍♂️", "👑", "🌟"];

// Switch between tabs
tabLogin.addEventListener("click", () => {
    tabLogin.classList.add("active");
    tabSignup.classList.remove("active");
    loginFormContainer.classList.remove("hidden");
    signupFormContainer.classList.add("hidden");
    signupMessage.classList.add("hidden");
    loginError.classList.add("hidden");
});

tabSignup.addEventListener("click", () => {
    tabSignup.classList.add("active");
    tabLogin.classList.remove("active");
    signupFormContainer.classList.remove("hidden");
    loginFormContainer.classList.add("hidden");
    signupMessage.classList.add("hidden");
    loginError.classList.add("hidden");
});

// Avatar selection grid in signup
signupAvatarGrid.querySelectorAll(".avatar-option").forEach(option => {
    option.addEventListener("click", () => {
        signupAvatarGrid.querySelectorAll(".avatar-option").forEach(opt => opt.classList.remove("selected"));
        option.classList.add("selected");
        selectedAvatarEmoji = option.getAttribute("data-emoji");
    });
});

function loadUserProfile() {
    const savedName = localStorage.getItem("user_profile_name") || "System Admin";
    const savedRole = localStorage.getItem("user_profile_role") || "Lead Orchestrator";
    const savedAvatar = localStorage.getItem("user_profile_avatar") || "👤";
    
    profileName.textContent = savedName;
    profileRole.textContent = savedRole;
    profileAvatar.textContent = savedAvatar;
}

function checkAuthStatus() {
    if (sessionStorage.getItem("resolver_authenticated") === "true") {
        // Already authenticated, bypass login
        loginContainer.classList.add("hidden");
        dashboardContainer.classList.remove("hidden");
        userProfile.classList.remove("hidden");
        
        loadUserProfile();
        connectWebSocket();
        fetchConfig();
    } else {
        // Show login screen
        loginContainer.classList.remove("hidden");
        dashboardContainer.classList.add("hidden");
        userProfile.classList.add("hidden");
        usernameInput.focus();
    }
}

async function handleLoginSubmit() {
    const user = usernameInput.value.trim();
    const pass = passwordInput.value.trim();
    
    if (!user || !pass) {
        loginError.textContent = "⚠️ Username and password are required.";
        loginError.classList.remove("hidden");
        return;
    }
    
    try {
        const res = await fetch("/api/auth/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username: user, password: pass })
        });
        const result = await res.json();
        
        if (res.status === 200 && result.status === "success") {
            // Valid credentials
            sessionStorage.setItem("resolver_authenticated", "true");
            
            // Save registered profile info to localStorage for badge use
            localStorage.setItem("user_profile_name", result.profile.name);
            localStorage.setItem("user_profile_role", result.profile.role);
            localStorage.setItem("user_profile_avatar", result.profile.avatar);
            
            loginError.classList.add("hidden");
            
            // Fade out transition
            loginContainer.style.opacity = "0";
            loginContainer.style.transform = "scale(1.05)";
            
            setTimeout(() => {
                loginContainer.classList.add("hidden");
                dashboardContainer.classList.remove("hidden");
                userProfile.classList.remove("hidden");
                
                loadUserProfile();
                connectWebSocket();
                fetchConfig();
            }, 500);
        } else {
            throw new Error(result.message || "Invalid username or password.");
        }
    } catch (err) {
        // Invalid credentials
        loginError.textContent = `⚠️ ${err.message}`;
        loginError.classList.remove("hidden");
        passwordInput.value = "";
        passwordInput.focus();
        
        // Trigger visual card shake animation
        loginCard.classList.remove("shake-card");
        void loginCard.offsetWidth; // Force browser layout reflow
        loginCard.classList.add("shake-card");
    }
}

async function handleSignupSubmit() {
    const user = signupUsernameInput.value.trim();
    const pass = signupPasswordInput.value.trim();
    const name = signupNameInput.value.trim();
    const role = signupRoleSelect.value;
    const avatar = selectedAvatarEmoji;
    
    if (!user || !pass || !name) {
        signupMessage.textContent = "⚠️ Please fill out all required fields.";
        signupMessage.className = "signup-message-msg error";
        signupMessage.classList.remove("hidden");
        return;
    }
    
    try {
        const res = await fetch("/api/auth/signup", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                username: user,
                password: pass,
                name: name,
                role: role,
                avatar: avatar
            })
        });
        const result = await res.json();
        
        if (res.status === 200 && result.status === "success") {
            // Display success message
            signupMessage.textContent = `✅ ${result.message}`;
            signupMessage.className = "signup-message-msg success";
            signupMessage.classList.remove("hidden");
            
            // Clear inputs
            signupUsernameInput.value = "";
            signupPasswordInput.value = "";
            signupNameInput.value = "";
            
            // Automatically switch back to login tab after 1.5s
            setTimeout(() => {
                tabLogin.click();
                usernameInput.value = user;
                passwordInput.focus();
            }, 1500);
        } else {
            throw new Error(result.message || "Registration failed.");
        }
    } catch (err) {
        signupMessage.textContent = `⚠️ ${err.message}`;
        signupMessage.className = "signup-message-msg error";
        signupMessage.classList.remove("hidden");
    }
}

signupBtn.addEventListener("click", handleSignupSubmit);

signupPasswordInput.addEventListener("keypress", (e) => {
    if (e.key === "Enter") handleSignupSubmit();
});

signupNameInput.addEventListener("keypress", (e) => {
    if (e.key === "Enter") handleSignupSubmit();
});

signupUsernameInput.addEventListener("keypress", (e) => {
    if (e.key === "Enter") signupPasswordInput.focus();
});

// Profile edit event listeners
profileName.addEventListener("blur", () => {
    const newName = profileName.textContent.trim() || "System Admin";
    profileName.textContent = newName;
    localStorage.setItem("user_profile_name", newName);
});

profileName.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
        e.preventDefault();
        profileName.blur();
    }
});

profileRole.addEventListener("blur", () => {
    const newRole = profileRole.textContent.trim() || "Lead Orchestrator";
    profileRole.textContent = newRole;
    localStorage.setItem("user_profile_role", newRole);
});

profileRole.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
        e.preventDefault();
        profileRole.blur();
    }
});

profileAvatar.addEventListener("click", () => {
    const current = profileAvatar.textContent;
    const idx = avatars.indexOf(current);
    const nextIdx = (idx + 1) % avatars.length;
    const nextAvatar = avatars[nextIdx];
    profileAvatar.textContent = nextAvatar;
    localStorage.setItem("user_profile_avatar", nextAvatar);
});

logoutBtn.addEventListener("click", () => {
    sessionStorage.removeItem("resolver_authenticated");
    window.location.reload();
});

loginBtn.addEventListener("click", handleLoginSubmit);

passwordInput.addEventListener("keypress", (e) => {
    if (e.key === "Enter") handleLoginSubmit();
});

usernameInput.addEventListener("keypress", (e) => {
    if (e.key === "Enter") passwordInput.focus();
});

// Run auth check on boot
checkAuthStatus();


// ==========================================================================
// Helper Chatbot Guide JS Controller
// ==========================================================================
const chatToggle = document.getElementById("chat-toggle");
const chatWidget = document.getElementById("helper-chat-widget");
const closeChat = document.getElementById("close-chat");
const chatMessagesContainer = document.getElementById("chat-messages-container");
const chatUserInput = document.getElementById("chat-user-input");
const chatSendBtn = document.getElementById("chat-send-btn");
const chatQuickActions = document.getElementById("chat-quick-actions");

// Toggle visibility of chatbot
chatToggle.addEventListener("click", () => {
    chatWidget.classList.toggle("hidden");
    if (!chatWidget.classList.contains("hidden")) {
        chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight;
        chatUserInput.focus();
    }
});

// Close chatbot
closeChat.addEventListener("click", () => {
    chatWidget.classList.add("hidden");
});

// Send message via button click
chatSendBtn.addEventListener("click", () => {
    submitUserChatQuery();
});

// Send message via Enter key press
chatUserInput.addEventListener("keypress", (e) => {
    if (e.key === "Enter") {
        submitUserChatQuery();
    }
});

// Bind quick actions buttons
document.querySelectorAll(".quick-action-btn").forEach(btn => {
    btn.addEventListener("click", (e) => {
        const query = e.currentTarget.getAttribute("data-query");
        submitUserChatQuery(query);
    });
});

function appendHelperChatBubble(text, sender) {
    const bubble = document.createElement("div");
    bubble.className = `chat-bubble ${sender}-bubble`;
    bubble.innerHTML = `<p>${text}</p>`;
    
    // Insert before quick-action buttons so buttons remain at the bottom
    chatMessagesContainer.insertBefore(bubble, chatQuickActions);
    chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight;
}

function appendTypingIndicator() {
    const bubble = document.createElement("div");
    bubble.className = "chat-bubble helper-bubble typing-bubble";
    bubble.innerHTML = `
        <span class="typing-dot"></span>
        <span class="typing-dot"></span>
        <span class="typing-dot"></span>
    `;
    chatMessagesContainer.insertBefore(bubble, chatQuickActions);
    chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight;
    return bubble;
}

async function submitUserChatQuery(forcedQuery = "") {
    const queryText = forcedQuery ? forcedQuery : chatUserInput.value.trim();
    if (!queryText) return;
    
    // Clear user text input
    if (!forcedQuery) chatUserInput.value = "";
    
    // Print User Bubble
    appendHelperChatBubble(queryText, "user");
    
    // Show Bouncing Typing Indicator
    const typingIndicator = appendTypingIndicator();
    
    try {
        const res = await fetch("/api/helper/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ message: queryText })
        });
        const result = await res.json();
        
        // Remove typing indicator and print helper reply
        typingIndicator.remove();
        appendHelperChatBubble(result.reply, "helper");
    } catch (e) {
        console.error("Helper Chatbot API error:", e);
        typingIndicator.remove();
        appendHelperChatBubble("Sorry, I'm having trouble connecting to the backend service. Please verify the Python server is running.", "helper");
    }
}

// ==========================================================================
// Scenario Sandbox Controller
// ==========================================================================
const sandboxToggle = document.getElementById("sandbox-toggle");
const sandboxHelp = document.getElementById("sandbox-help");

sandboxToggle.addEventListener("change", () => {
    if (sandboxToggle.checked) {
        sandboxHelp.classList.remove("hidden");
    } else {
        sandboxHelp.classList.add("hidden");
        // Clear all active blockages when toggled off
        blockedCells = [];
        document.querySelectorAll(".avenue-cell").forEach(cell => {
            if (cell.classList.contains("cell-blocked")) {
                cell.className = "avenue-cell cell-free";
            }
        });
    }
});

document.querySelectorAll(".avenue-cell").forEach(cell => {
    cell.addEventListener("click", () => {
        if (sandboxToggle.checked) {
            const block = parseInt(cell.getAttribute("data-block"));
            const lane = parseInt(cell.getAttribute("data-lane"));
            
            const index = blockedCells.findIndex(c => c.block === block && c.lane === lane);
            if (index !== -1) {
                // Unblock cell
                blockedCells.splice(index, 1);
                cell.className = "avenue-cell cell-free";
            } else {
                // Block cell
                blockedCells.push({ block, lane });
                cell.className = "avenue-cell cell-blocked";
            }
            console.log("Blocked cells state:", blockedCells);
        }
    });
});

