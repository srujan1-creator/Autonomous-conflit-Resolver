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
const landingContainer = document.getElementById("landing-container");
const authModal = document.getElementById("auth-modal");
const closeAuthModal = document.getElementById("close-auth-modal");
const navLaunchBtn = document.getElementById("nav-launch-btn");
const heroLaunchBtn = document.getElementById("hero-launch-btn");

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
let selectedAvatarEmoji = "/images/avatar_admin.jpg";
const avatars3D = [
    "/images/avatar_admin.jpg",
    "/images/avatar_dev_m.jpg",
    "/images/avatar_dev_f.jpg",
    "/images/logistics.jpg",
    "/images/transit.jpg",
    "/images/broker.jpg",
    "/images/judge.jpg",
    "/images/brand_logo.jpg",
    "/images/chatbot_assistant.jpg"
];

if (signupAvatarGrid) {
    signupAvatarGrid.querySelectorAll(".avatar-option").forEach(option => {
        option.addEventListener("click", () => {
            signupAvatarGrid.querySelectorAll(".avatar-option").forEach(opt => opt.classList.remove("selected"));
            option.classList.add("selected");
            selectedAvatarEmoji = option.getAttribute("data-avatar") || option.getAttribute("data-emoji") || "/images/avatar_admin.jpg";
            playUiSound("click");
        });
    });
}

function loadUserProfile() {
    const savedName = localStorage.getItem("user_profile_name") || "System Admin";
    const savedRole = localStorage.getItem("user_profile_role") || "Lead Orchestrator";
    const savedAvatar = localStorage.getItem("user_profile_avatar") || "/images/avatar_admin.jpg";
    
    profileName.textContent = savedName;
    profileRole.textContent = savedRole;
    
    if (savedAvatar.startsWith("/") || savedAvatar.startsWith("http") || savedAvatar.includes(".jpg")) {
        profileAvatar.innerHTML = `<img src="${savedAvatar}" alt="Profile Avatar" class="profile-3d-avatar-img">`;
    } else {
        profileAvatar.textContent = savedAvatar;
    }
}

profileAvatar.addEventListener("click", () => {
    let current = localStorage.getItem("user_profile_avatar") || "/images/avatar_admin.jpg";
    let idx = avatars3D.indexOf(current);
    if (idx === -1) idx = 0;
    const nextIdx = (idx + 1) % avatars3D.length;
    const nextAvatar = avatars3D[nextIdx];
    localStorage.setItem("user_profile_avatar", nextAvatar);
    loadUserProfile();
    playUiSound("click");
});

function checkAuthStatus() {
    if (sessionStorage.getItem("resolver_authenticated") === "true") {
        // Already authenticated, bypass login
        landingContainer.classList.add("hidden");
        dashboardContainer.classList.remove("hidden");
        userProfile.classList.remove("hidden");
        
        loadUserProfile();
        connectWebSocket();
        fetchConfig();
    } else {
        // Show landing page
        landingContainer.classList.remove("hidden");
        dashboardContainer.classList.add("hidden");
        userProfile.classList.add("hidden");
    }
}

function openAuthModal() {
    authModal.classList.remove("hidden");
    usernameInput.focus();
}

function closeAuthModalWindow() {
    authModal.classList.add("hidden");
    loginError.classList.add("hidden");
    signupMessage.classList.add("hidden");
}

// Bind launch triggers
function launchSimulatorAction() {
    playUiSound("click");
    // Ensure user session is marked authenticated with default profile if not set
    if (!sessionStorage.getItem("resolver_authenticated")) {
        sessionStorage.setItem("resolver_authenticated", "true");
        if (!localStorage.getItem("user_profile_name")) {
            localStorage.setItem("user_profile_name", "System Admin");
            localStorage.setItem("user_profile_role", "Lead Orchestrator");
            localStorage.setItem("user_profile_avatar", "/images/avatar_admin.jpg");
        }
    }
    transitionToDashboard();
}

if (navLaunchBtn) {
    navLaunchBtn.addEventListener("click", launchSimulatorAction);
}

if (heroLaunchBtn) {
    heroLaunchBtn.addEventListener("click", launchSimulatorAction);
}

if (closeAuthModal) {
    closeAuthModal.addEventListener("click", closeAuthModalWindow);
}
if (authModal && authModal.querySelector(".modal-backdrop")) {
    authModal.querySelector(".modal-backdrop").addEventListener("click", closeAuthModalWindow);
}

function transitionToDashboard() {
    landingContainer.classList.add("fade-out-page");
    
    setTimeout(() => {
        landingContainer.classList.add("hidden");
        landingContainer.classList.remove("fade-out-page");
        
        dashboardContainer.className = "glass-bg-container fade-in-page";
        userProfile.classList.remove("hidden");
        
        loadUserProfile();
        connectWebSocket();
        fetchConfig();
    }, 600);
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
            closeAuthModalWindow();
            
            transitionToDashboard();
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
    
    // Smooth transition back to landing page
    dashboardContainer.classList.add("fade-out-page");
    
    setTimeout(() => {
        dashboardContainer.classList.add("hidden");
        dashboardContainer.classList.remove("fade-out-page");
        dashboardContainer.className = "glass-bg-container hidden";
        userProfile.classList.add("hidden");
        
        landingContainer.className = "landing-page-wrapper fade-in-page";
        
        setTimeout(() => {
            landingContainer.className = "landing-page-wrapper";
        }, 800);
    }, 600);
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
            playUiSound("click");
            console.log("Blocked cells state:", blockedCells);
        }
    });
});


// ==========================================================================
// Ultra-Premium Web Audio API Synthesizer (Cyberpunk SFX Engine)
// ==========================================================================
let audioCtx = null;
let sfxEnabled = true;
const sfxToggleBtn = document.getElementById("sfx-toggle-btn");

function initAudioContext() {
    if (!audioCtx) {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (AudioContext) {
            audioCtx = new AudioContext();
        }
    }
    if (audioCtx && audioCtx.state === "suspended") {
        audioCtx.resume();
    }
}

function playUiSound(type) {
    if (!sfxEnabled) return;
    try {
        initAudioContext();
        if (!audioCtx) return;

        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.connect(gain);
        gain.connect(audioCtx.destination);

        const now = audioCtx.currentTime;

        if (type === "click") {
            osc.type = "sine";
            osc.frequency.setValueAtTime(600, now);
            osc.frequency.exponentialRampToValueAtTime(300, now + 0.08);
            gain.gain.setValueAtTime(0.12, now);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.08);
            osc.start(now);
            osc.stop(now + 0.08);
        } else if (type === "pulse") {
            osc.type = "triangle";
            osc.frequency.setValueAtTime(320, now);
            osc.frequency.exponentialRampToValueAtTime(140, now + 0.15);
            gain.gain.setValueAtTime(0.15, now);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
            osc.start(now);
            osc.stop(now + 0.15);
        } else if (type === "success") {
            // High chord sequence
            osc.type = "sine";
            osc.frequency.setValueAtTime(523.25, now); // C5
            osc.frequency.setValueAtTime(659.25, now + 0.08); // E5
            osc.frequency.setValueAtTime(783.99, now + 0.16); // G5
            gain.gain.setValueAtTime(0.15, now);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.35);
            osc.start(now);
            osc.stop(now + 0.35);
        } else if (type === "error") {
            osc.type = "sawtooth";
            osc.frequency.setValueAtTime(160, now);
            osc.frequency.exponentialRampToValueAtTime(80, now + 0.2);
            gain.gain.setValueAtTime(0.2, now);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
            osc.start(now);
            osc.stop(now + 0.2);
        }
    } catch (e) {
        console.warn("Audio Context playback error:", e);
    }
}

if (sfxToggleBtn) {
    sfxToggleBtn.addEventListener("click", () => {
        sfxEnabled = !sfxEnabled;
        if (sfxEnabled) {
            sfxToggleBtn.classList.remove("muted");
            sfxToggleBtn.querySelector(".status-icon").textContent = "🔊";
            sfxToggleBtn.querySelector(".status-text").textContent = "SFX ON";
            playUiSound("click");
        } else {
            sfxToggleBtn.classList.add("muted");
            sfxToggleBtn.querySelector(".status-icon").textContent = "🔇";
            sfxToggleBtn.querySelector(".status-text").textContent = "SFX OFF";
        }
    });
}

// Bind audio blips to global action buttons
document.querySelectorAll(".primary-btn, .secondary-btn, .quick-action-btn, .auth-tab").forEach(btn => {
    btn.addEventListener("click", () => playUiSound("click"));
});


// ==========================================================================
// Urban Crisis Scenario Presets & Audit Certificate Exporter
// ==========================================================================
const scenarioPresetGrid = document.getElementById("scenario-preset-grid");
const scenarioDesc = document.getElementById("scenario-desc");
const exportAuditBtn = document.getElementById("export-audit-btn");

let currentScorecard = null;
let currentNegotiationHistory = [];

const defaultScenarios = {
    carnival: {
        title: "Grand Street Carnival",
        description: "Preset: Grand Street Carnival (Standard multi-lane event setup)",
        event_scale: 1, // Medium
        traffic_load: 1, // Medium
        blocked_cells: []
    },
    water_main: {
        title: "Downtown Water Main Burst",
        description: "Preset: Downtown Water Main Burst (Emergency road blocks on Block 3 Lanes 2 & 3)",
        event_scale: 1,
        traffic_load: 2, // High
        blocked_cells: [{ block: 3, lane: 2 }, { block: 3, lane: 3 }]
    },
    vip_convoy: {
        title: "VIP Presidential Convoy",
        description: "Preset: VIP Presidential Convoy (Emergency Lane 4 strictly cleared across blocks 1-5)",
        event_scale: 0, // Low
        traffic_load: 2, // High
        blocked_cells: [
            { block: 1, lane: 4 }, { block: 2, lane: 4 }, { block: 3, lane: 4 }, { block: 4, lane: 4 }, { block: 5, lane: 4 }
        ]
    },
    subway_outage: {
        title: "Metropolitan Subway Outage",
        description: "Preset: Metropolitan Subway Outage (Heavy bus bridge traffic; Lanes 1 & 2 priority)",
        event_scale: 0, // Low
        traffic_load: 2, // High
        blocked_cells: [{ block: 2, lane: 2 }, { block: 4, lane: 2 }]
    }
};

if (scenarioPresetGrid) {
    scenarioPresetGrid.querySelectorAll(".preset-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            scenarioPresetGrid.querySelectorAll(".preset-btn").forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            
            const scenarioKey = btn.getAttribute("data-scenario");
            const config = defaultScenarios[scenarioKey] || defaultScenarios.carnival;
            
            // Set sliders
            eventScaleSlider.value = config.event_scale;
            trafficLoadSlider.value = config.traffic_load;
            eventScaleVal.textContent = scaleMap[config.event_scale];
            trafficLoadVal.textContent = scaleMap[config.traffic_load];
            
            // Set blocked cells
            blockedCells = JSON.parse(JSON.stringify(config.blocked_cells));
            sandboxToggle.checked = blockedCells.length > 0;
            if (sandboxToggle.checked) {
                sandboxHelp.classList.remove("hidden");
            } else {
                sandboxHelp.classList.add("hidden");
            }
            
            // Update UI grid
            updateAvenueGrid();
            scenarioDesc.textContent = config.description;
            playUiSound("click");
        });
    });
}

// Audit Export Handler
if (exportAuditBtn) {
    exportAuditBtn.addEventListener("click", async () => {
        const userName = localStorage.getItem("user_profile_name") || "System Administrator";
        try {
            const res = await fetch("/api/report/export", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    scorecard: currentScorecard || { overall_score: 100, overall_status: "APPROVED" },
                    history: currentNegotiationHistory,
                    user_name: userName
                })
            });
            const result = await res.json();
            if (result.status === "success") {
                const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(result.report, null, 4));
                const downloadAnchor = document.createElement("a");
                downloadAnchor.setAttribute("href", dataStr);
                downloadAnchor.setAttribute("download", `${result.report.audit_id}.json`);
                document.body.appendChild(downloadAnchor);
                downloadAnchor.click();
                downloadAnchor.remove();
                
                playUiSound("success");
            }
        } catch (e) {
            console.error("Export Audit Certificate error:", e);
            alert("Unable to generate audit report.");
            playUiSound("error");
        }
    });
}

// Track history and scorecards for report export
const originalHandleBrokerMessage = handleBrokerMessage;
handleBrokerMessage = function(data) {
    if (data.type === "negotiation_start") {
        currentNegotiationHistory = [];
        currentScorecard = null;
    } else if (data.type === "agent_message") {
        currentNegotiationHistory.push(data.payload);
        playUiSound("pulse");
    } else if (data.type === "judge_evaluation") {
        currentScorecard = data.payload;
        playUiSound("success");
    }
    originalHandleBrokerMessage(data);
};


// ==========================================================================
// Interactive Canvas 2D Particle System (Neural Network Backdrop)
// ==========================================================================
function initParticleCanvas() {
    const canvas = document.getElementById("particle-canvas");
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    let mouse = { x: width / 2, y: height / 2, active: false };

    window.addEventListener("resize", () => {
        width = canvas.width = window.innerWidth;
        height = canvas.height = window.innerHeight;
    });

    window.addEventListener("mousemove", (e) => {
        mouse.x = e.clientX;
        mouse.y = e.clientY;
        mouse.active = true;
    });

    const particles = [];
    const particleCount = Math.min(45, Math.floor(width / 30));

    class Particle {
        constructor() {
            this.x = Math.random() * width;
            this.y = Math.random() * height;
            this.vx = (Math.random() - 0.5) * 0.8;
            this.vy = (Math.random() - 0.5) * 0.8;
            this.radius = Math.random() * 2 + 1;
            this.color = Math.random() > 0.5 ? "rgba(139, 92, 246, " : "rgba(0, 240, 255, ";
            this.alpha = Math.random() * 0.5 + 0.2;
        }

        update() {
            this.x += this.vx;
            this.y += this.vy;

            if (this.x < 0 || this.x > width) this.vx *= -1;
            if (this.y < 0 || this.y > height) this.vy *= -1;

            // Mouse attraction physics
            if (mouse.active) {
                const dx = mouse.x - this.x;
                const dy = mouse.y - this.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist < 140) {
                    this.x += dx * 0.015;
                    this.y += dy * 0.015;
                }
            }
        }

        draw() {
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
            ctx.fillStyle = this.color + this.alpha + ")";
            ctx.shadowColor = this.color + "0.8)";
            ctx.shadowBlur = 8;
            ctx.fill();
        }
    }

    for (let i = 0; i < particleCount; i++) {
        particles.push(new Particle());
    }

    function animate() {
        ctx.clearRect(0, 0, width, height);

        // Draw node connection lines
        for (let i = 0; i < particles.length; i++) {
            particles[i].update();
            particles[i].draw();

            for (let j = i + 1; j < particles.length; j++) {
                const dx = particles[i].x - particles[j].x;
                const dy = particles[i].y - particles[j].y;
                const dist = Math.sqrt(dx * dx + dy * dy);

                if (dist < 130) {
                    ctx.beginPath();
                    ctx.moveTo(particles[i].x, particles[i].y);
                    ctx.lineTo(particles[j].x, particles[j].y);
                    const lineAlpha = (1 - dist / 130) * 0.25;
                    ctx.strokeStyle = `rgba(139, 92, 246, ${lineAlpha})`;
                    ctx.lineWidth = 0.8;
                    ctx.stroke();
                }
            }
        }

        requestAnimationFrame(animate);
    }

    animate();
}

// Launch particle canvas on load
document.addEventListener("DOMContentLoaded", () => {
    initParticleCanvas();
});
initParticleCanvas();


