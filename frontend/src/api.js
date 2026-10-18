/**
 * RecallAI API Client
 * THE ONLY FILE IN THE FRONTEND THAT CALLS FETCH.
 * Supports "live" backend mode and a deterministic "mock" adapter with identical shapes.
 * Never silently falls back to mock when live mode encounters an error.
 */

const API_BASE_URL = (import.meta.env?.VITE_API_BASE_URL || "http://127.0.0.1:8000").replace(/\/$/, "");
export const API_MODE = (import.meta.env?.VITE_API_MODE || "mock").toLowerCase().trim();

const FETCH_TIMEOUT_MS = 30000;

// ---------------------------------------------------------------------------
// In-Memory Mock Store (Per-user state for offline development & testing)
// ---------------------------------------------------------------------------
const mockDatabase = {
  student_alice: [
    {
      id: "mem_seed_alice_01",
      kind: "PREFERS",
      value: "visual analogies and stepwise code examples",
      status: "active",
      origin: "user_stated",
      source_text: "I learn best with visual analogies and code examples",
      session_id: "sess_seed_00",
      created_at: "2026-10-15T09:00:00Z"
    }
  ],
  student_bob: []
};

// In-Memory Mock Sessions Store
export const mockSessions = {
  student_alice: [
    {
      id: "sess_alice_today",
      title: "Recursion and call stack base cases",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      messages: [
        {
          id: 1,
          session_id: "sess_alice_today",
          user_id: "student_alice",
          role: "user",
          text: "I struggle with recursion in Python, but I know how functions work.",
          turn: null,
          created_at: new Date(Date.now() - 3600000).toISOString()
        },
        {
          id: 2,
          session_id: "sess_alice_today",
          user_id: "student_alice",
          role: "assistant",
          text: "Recursion is simply a function that calls itself with a termination condition (base case). Since you already know functions, think of each recursive call as opening a fresh call stack frame.",
          turn: {
            saved_memories: [{ id: "mem_rec_01", kind: "STRUGGLES_WITH", value: "recursion", status: "active", action: "created" }],
            retrieved_memories: [{ id: "mem_seed_alice_01", kind: "PREFERS", value: "visual analogies and stepwise code examples", status: "active" }],
            evidence_paths: [{
              steps: [
                { from: "Student", relation: "HAS_MEMORY", to: 'Memory("Struggles with recursion")', origin: "You said" },
                { from: 'Memory("Struggles with recursion")', relation: "ABOUT", to: "Concept(recursion)", origin: "You said" },
                { from: "Concept(recursion)", relation: "REQUIRES", to: "functions", origin: "Curated" }
              ]
            }],
            warnings: [],
            explanation: "Retrieved preference for visual analogies; traversed recursion prerequisite to functions."
          },
          created_at: new Date(Date.now() - 3590000).toISOString()
        }
      ]
    },
    {
      id: "sess_alice_yesterday",
      title: "Python functions and parameter scoping",
      created_at: new Date(Date.now() - 86400000).toISOString(),
      updated_at: new Date(Date.now() - 86400000).toISOString(),
      messages: [
        {
          id: 3,
          session_id: "sess_alice_yesterday",
          user_id: "student_alice",
          role: "user",
          text: "How do return statements work in Python functions?",
          turn: null,
          created_at: new Date(Date.now() - 86400000).toISOString()
        },
        {
          id: 4,
          session_id: "sess_alice_yesterday",
          user_id: "student_alice",
          role: "assistant",
          text: "The return statement immediately terminates function execution and passes back the specified value to the caller.",
          turn: {
            saved_memories: [],
            retrieved_memories: [],
            evidence_paths: [],
            warnings: [],
            explanation: "Answered foundational question about functions."
          },
          created_at: new Date(Date.now() - 86395000).toISOString()
        }
      ]
    }
  ],
  student_bob: []
};

// Simulated 2-hop prerequisite graph
const mockCurriculumPrereqs = {
  recursion: "functions",
  functions: "variables",
  generators: "loops",
  list_comprehensions: "lists",
  classes: "functions",
  inheritance: "classes"
};

/**
 * Normalizes backend or mock responses to guarantee strict contract safety.
 */
export function normalizeChatResponse(raw) {
  if (!raw || typeof raw !== "object") {
    throw new Error("Invalid response format: payload is not an object.");
  }
  return {
    reply: typeof raw.reply === "string" ? raw.reply : "No reply generated.",
    saved_memories: Array.isArray(raw.saved_memories) ? raw.saved_memories : [],
    retrieved_memories: Array.isArray(raw.retrieved_memories) ? raw.retrieved_memories : [],
    evidence_paths: Array.isArray(raw.evidence_paths) ? raw.evidence_paths : [],
    warnings: Array.isArray(raw.warnings) ? raw.warnings : [],
    explanation: typeof raw.explanation === "string" ? raw.explanation : ""
  };
}

/**
 * Formats error messages for display in the chat bubble.
 * Enforces:
 * - Friendly messages for quota/busy/rate limit errors
 * - Never shows raw JSON or URLs in the chat bubble
 * - Never exposes API keys or credentials
 */
export function formatFriendlyErrorMessage(err) {
  if (!err) return "The AI model is temporarily unavailable. Try again later.";

  const raw = String(err?.message || err || "").trim();
  const lower = raw.toLowerCase();

  // Quota or rate-limit error (429, RESOURCE_EXHAUSTED, quota, etc.)
  if (
    err?.status === 429 ||
    err?.code === 429 ||
    lower.includes("429") ||
    lower.includes("resource_exhausted") ||
    lower.includes("quota") ||
    lower.includes("rate limit") ||
    lower.includes("ratelimit") ||
    lower.includes("too many requests") ||
    lower.includes("busy")
  ) {
    return "The AI model is busy or out of free quota. Try again later.";
  }

  // Model unavailable, not found, or backend service error
  if (
    lower.includes("model not found") ||
    lower.includes("not_found") ||
    lower.includes("503") ||
    lower.includes("service unavailable") ||
    lower.includes("temporarily unavailable")
  ) {
    return "The AI model is temporarily unavailable. Try again later.";
  }

  // If raw string contains JSON, strip/parse it
  let cleaned = raw;
  if (cleaned.includes("{") && cleaned.includes("}")) {
    try {
      const match = cleaned.match(/\{[\s\S]*\}/);
      if (match) {
        const parsed = JSON.parse(match[0]);
        if (parsed?.error?.message) {
          cleaned = parsed.error.message;
        } else if (parsed?.message) {
          cleaned = parsed.message;
        } else {
          return "The AI model is temporarily unavailable. Try again later.";
        }
      }
    } catch {
      return "The AI model is temporarily unavailable. Try again later.";
    }
  }

  // Check again after JSON extraction for quota
  const cleanedLower = cleaned.toLowerCase();
  if (
    cleanedLower.includes("429") ||
    cleanedLower.includes("resource_exhausted") ||
    cleanedLower.includes("quota") ||
    cleanedLower.includes("rate limit") ||
    cleanedLower.includes("too many requests")
  ) {
    return "The AI model is busy or out of free quota. Try again later.";
  }

  // Strip URLs (never show URLs in chat bubble)
  cleaned = cleaned.replace(/https?:\/\/[^\s]+/gi, "").trim();

  // Scrub any accidental keys
  cleaned = cleaned.replace(/AIza[0-9A-Za-z\-_]{35}/g, "[REDACTED]");
  cleaned = cleaned.replace(/(?:key|api_key|token|secret|password)=([^\s&"\'<>]+)/gi, "key=[REDACTED]");
  cleaned = cleaned.replace(/Bearer\s+([^\s"\'<>]+)/gi, "Bearer [REDACTED]");

  // Clean trailing punctuation or empty message
  cleaned = cleaned.replace(/^[,\s:\-]+|[,\s:\-]+$/g, "").trim();
  if (!cleaned) {
    return "The AI model is temporarily unavailable. Try again later.";
  }

  return cleaned.startsWith("Error:") ? cleaned : `Error: ${cleaned}`;
}

/**
 * Builds in-session conversation history array matching API contract:
 * - Array of { role: "user" | "assistant", text: string }
 * - Max the last 6 messages, oldest first
 * - Excludes the new message (which is not yet in the array)
 * - Excludes any "[System Message]" error replies, "Error:" replies, and "Stopped" notes
 */
export function buildChatHistory(messages = []) {
  if (!Array.isArray(messages)) return [];

  const MAX_HISTORY_MSG_LEN = 4000;
  const TRUNC_SUFFIX = " [...]";

  return messages
    .filter(m => {
      if (!m || typeof m !== "object") return false;
      if (m.isError) return false;
      if (typeof m.text !== "string" || !m.text.trim()) return false;
      if (m.text.startsWith("[System Message]")) return false;
      if (m.text.startsWith("Error:")) return false;
      if (m.text.startsWith("Stopped.") || m.text.startsWith("Stopped:")) return false;
      if (m.role !== "user" && m.role !== "assistant") return false;
      return true;
    })
    .map(m => {
      let text = m.text.trim();
      if (text.length > MAX_HISTORY_MSG_LEN) {
        text = text.slice(0, MAX_HISTORY_MSG_LEN - TRUNC_SUFFIX.length) + TRUNC_SUFFIX;
      }
      return {
        role: m.role,
        text
      };
    })
    .slice(-6);
}

/**
 * Mock implementation of POST /chat
 */
async function mockChatTurn(userId, sessionId, message, signal = null, history = []) {
  if (signal?.aborted) {
    const err = new Error("The operation was aborted.");
    err.name = "AbortError";
    throw err;
  }

  // Artificial slight latency to test loading UI states, cancelable via AbortSignal
  if (signal) {
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(resolve, 350);
      const onAbort = () => {
        clearTimeout(timeout);
        signal.removeEventListener("abort", onAbort);
        const err = new Error("The operation was aborted.");
        err.name = "AbortError";
        reject(err);
      };
      signal.addEventListener("abort", onAbort, { once: true });
    });
  } else {
    await new Promise(res => setTimeout(res, 350));
  }

  if (signal?.aborted) {
    const err = new Error("The operation was aborted.");
    err.name = "AbortError";
    throw err;
  }

  // Special command: simulate general backend failure
  if (message.includes("/simulate-error")) {
    const error = new Error("Simulated 500 error from /simulate-error command.");
    error.status = 500;
    error.code = "SIMULATED_ERROR";
    throw error;
  }

  // Special command: simulate LLM quota partial success (returns friendly reply with raw error in warnings)
  if (message.includes("/simulate-quota-warning")) {
    return normalizeChatResponse({
      reply: "[System Message] The AI model is busy or out of free quota. Try again later.",
      saved_memories: [],
      retrieved_memories: [],
      evidence_paths: [],
      warnings: [{
        stage: "llm",
        message: "Answer generation error: 429 RESOURCE_EXHAUSTED: Quota exceeded for metric GenerateContent. key=[REDACTED]. Visit https://console.cloud.google.com/apis {\"error\": {\"code\": 429, \"message\": \"Resource has been exhausted.\"}}"
      }],
      explanation: "No answer generated due to simulated LLM quota exhaustion."
    });
  }

  // Special command: simulate HTTP 429 rejection (e.g. gateway rejection)
  if (message.includes("/simulate-http-429")) {
    const error = new Error('429 RESOURCE_EXHAUSTED: Quota exceeded. Visit https://console.cloud.google.com/apis {"code": 429, "key": "AIzaSyFakeSecret1234567890abcdef"}');
    error.status = 429;
    error.code = "RESOURCE_EXHAUSTED";
    throw error;
  }

  // Ensure user bucket exists
  if (!mockDatabase[userId]) {
    mockDatabase[userId] = [];
  }
  const userMems = mockDatabase[userId];

  // Special command: simulate memory write failure with partial success
  if (message.includes("/simulate-write-failure")) {
    return normalizeChatResponse({
      reply: "I received your message, but encountered an internal warning while persisting memory to FalkorDB.",
      saved_memories: [],
      retrieved_memories: [],
      evidence_paths: [],
      warnings: [{ stage: "memory_write", message: "Simulated memory write failure." }],
      explanation: "No memories retrieved due to simulated storage failure."
    });
  }

  const savedMemories = [];
  const lowerMsg = message.toLowerCase();

  // Correction check: "no longer struggle with <topic>"
  if (lowerMsg.includes("no longer struggle with") || lowerMsg.includes("don't struggle with")) {
    const topicMatch = lowerMsg.match(/(?:struggle with|difficulty with)\s+([a-z_-]+)/i);
    const targetTopic = topicMatch ? topicMatch[1] : "recursion";
    const existing = userMems.find(m => m.kind === "STRUGGLES_WITH" && m.value.toLowerCase().includes(targetTopic) && m.status === "active");
    if (existing) {
      existing.status = "resolved";
      savedMemories.push({
        ...existing,
        action: "resolved"
      });
    }
    return normalizeChatResponse({
      reply: `Congratulations on conquering ${targetTopic}! I have updated your learning profile and marked that struggle resolved.`,
      saved_memories: savedMemories,
      retrieved_memories: [],
      evidence_paths: [],
      warnings: [],
      explanation: `Marked previous struggle with ${targetTopic} as resolved.`
    });
  }

  // Extraction check: "struggle with <topic>" or "find <topic> hard/tricky"
  let extractedConcept = null;
  if (lowerMsg.includes("struggle") || lowerMsg.includes("tricky") || lowerMsg.includes("hard")) {
    for (const concept of Object.keys(mockCurriculumPrereqs)) {
      if (lowerMsg.includes(concept)) {
        extractedConcept = concept;
        break;
      }
    }
    if (!extractedConcept && lowerMsg.includes("recursion")) {
      extractedConcept = "recursion";
    }

    if (extractedConcept) {
      const existing = userMems.find(m => m.kind === "STRUGGLES_WITH" && m.value.toLowerCase() === extractedConcept);
      if (existing) {
        savedMemories.push({
          ...existing,
          action: "already_known"
        });
      } else {
        const newMem = {
          id: `mem_mock_${Date.now()}`,
          kind: "STRUGGLES_WITH",
          value: extractedConcept,
          status: "active",
          origin: "user_stated",
          source_text: message,
          session_id: sessionId,
          created_at: new Date().toISOString(),
          action: "created"
        };
        userMems.unshift(newMem);
        savedMemories.push(newMem);
      }
    }
  }

  // Retrieval & Evidence generation
  let activeConcept = extractedConcept;
  if (!activeConcept && lowerMsg.includes("recursion")) {
    activeConcept = "recursion";
  }

  // Follow-up context resolution: if current query has no concept, inspect history hints
  if (!activeConcept && Array.isArray(history) && history.length > 0) {
    for (let i = history.length - 1; i >= 0; i--) {
      const h = history[i];
      if (h.role === "user" && typeof h.text === "string") {
        const hLower = h.text.toLowerCase();
        for (const concept of Object.keys(mockCurriculumPrereqs)) {
          if (hLower.includes(concept)) {
            activeConcept = concept;
            break;
          }
        }
        if (activeConcept) break;
        if (hLower.includes("recursion")) {
          activeConcept = "recursion";
          break;
        }
      }
    }
  }

  const retrievedMemories = userMems.filter(m => m.status === "active");
  const evidencePaths = [];
  let explanation = "";

  if (activeConcept) {
    const prereq1 = mockCurriculumPrereqs[activeConcept] || "functions";
    const prereq2 = mockCurriculumPrereqs[prereq1] || "variables";

    const memLabel = `Memory("Struggles with ${activeConcept}")`;
    const conceptLabel = `Concept(${activeConcept})`;
    evidencePaths.push({
      steps: [
        { from: "Student", relation: "HAS_MEMORY", to: memLabel, origin: "You said" },
        { from: memLabel, relation: "ABOUT", to: conceptLabel, origin: "You said" },
        { from: conceptLabel, relation: "REQUIRES", to: prereq1, origin: "Curated" },
        { from: prereq1, relation: "REQUIRES", to: prereq2, origin: "Curated" }
      ]
    });
    explanation = `Retrieved active struggle with '${activeConcept}' and traversed curated prerequisites '${prereq1}' and '${prereq2}'.`;
  } else if (retrievedMemories.length > 0) {
    explanation = `Retrieved ${retrievedMemories.length} general active learner preferences.`;
  } else {
    explanation = "No memories matched this query.";
  }

  let replyText = "";
  if (activeConcept && !extractedConcept && !lowerMsg.includes("recursion")) {
    replyText = `[Mock AI Tutor] Building on our discussion of ${activeConcept}, here is another concrete example! In Python, recursion always needs a clear base condition so the call stack terminates safely.`;
  } else {
    replyText = `[Mock AI Tutor] I understand you are exploring ${activeConcept || "Python"}! Because recursion relies heavily on functions and variable scope, let's step through a concrete base condition example first.`;
  }

  const normResp = normalizeChatResponse({
    reply: replyText,
    saved_memories: savedMemories,
    retrieved_memories: retrievedMemories,
    evidence_paths: evidencePaths,
    warnings: [],
    explanation
  });

  // Persist turn to in-memory mockSessions store
  if (!mockSessions[userId]) {
    mockSessions[userId] = [];
  }
  let session = mockSessions[userId].find(s => s.id === sessionId);
  const nowIso = new Date().toISOString();
  if (!session) {
    session = {
      id: sessionId,
      title: message.trim().slice(0, 40) || "New Chat",
      user_id: userId,
      created_at: nowIso,
      updated_at: nowIso,
      messages: []
    };
    mockSessions[userId].unshift(session);
  } else {
    session.updated_at = nowIso;
  }
  session.messages.push({
    id: Date.now(),
    session_id: sessionId,
    user_id: userId,
    role: "user",
    text: message,
    turn: null,
    created_at: nowIso
  });
  session.messages.push({
    id: Date.now() + 1,
    session_id: sessionId,
    user_id: userId,
    role: "assistant",
    text: normResp.reply,
    turn: {
      saved_memories: normResp.saved_memories,
      retrieved_memories: normResp.retrieved_memories,
      evidence_paths: normResp.evidence_paths,
      warnings: normResp.warnings,
      explanation: normResp.explanation
    },
    created_at: nowIso
  });

  return normResp;
}

// ---------------------------------------------------------------------------
// Public Exported API Functions
// ---------------------------------------------------------------------------

/**
 * Fetch health status of backend and database.
 */
export async function getHealth() {
  if (API_MODE === "mock") {
    return {
      status: "ok",
      database: "connected",
      llm_configured: true
    };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(`${API_BASE_URL}/health`, {
      method: "GET",
      signal: controller.signal
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data?.error?.message || `Health check failed with status ${res.status}`);
    }
    return data;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Fetch all memories for a user.
 */
export async function getMemories(userId) {
  if (!userId) {
    throw new Error("user_id is required to fetch memories.");
  }

  if (API_MODE === "mock") {
    await new Promise(res => setTimeout(res, 200));
    return {
      memories: mockDatabase[userId] ? [...mockDatabase[userId]] : []
    };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(`${API_BASE_URL}/memories?user_id=${encodeURIComponent(userId)}`, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data?.error?.message || `Failed to fetch memories (${res.status})`);
    }
    return {
      memories: Array.isArray(data.memories) ? data.memories : []
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Send a chat turn to the agent.
 */
export async function sendChatMessage(userId, sessionId, message, signal = null, history = []) {
  if (!userId || !sessionId || !message) {
    throw new Error("user_id, session_id, and message are required.");
  }

  if (API_MODE === "mock") {
    return await mockChatTurn(userId, sessionId, message, signal, history);
  }

  if (signal?.aborted) {
    const err = new Error("The operation was aborted.");
    err.name = "AbortError";
    throw err;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  const onExternalAbort = () => {
    controller.abort(signal?.reason);
  };

  if (signal) {
    signal.addEventListener("abort", onExternalAbort, { once: true });
  }

  try {
    const reqBody = {
      user_id: userId,
      session_id: sessionId,
      message: message
    };
    if (Array.isArray(history) && history.length > 0) {
      reqBody.history = history;
    }

    const res = await fetch(`${API_BASE_URL}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(reqBody),
      signal: controller.signal
    });

    const data = await res.json();

    // Partial success handling: If HTTP 200 with warnings, it is accepted!
    if (!res.ok) {
      const errorMsg = data?.error?.message || `Chat request failed with HTTP ${res.status}`;
      const error = new Error(errorMsg);
      error.status = res.status;
      error.code = data?.error?.code || "HTTP_ERROR";
      throw error;
    }

    return normalizeChatResponse(data);
  } catch (err) {
    if (signal?.aborted || err.name === "AbortError") {
      const abortErr = new Error("The operation was aborted.");
      abortErr.name = "AbortError";
      throw abortErr;
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
    if (signal) {
      signal.removeEventListener("abort", onExternalAbort);
    }
  }
}

export const sendChat = sendChatMessage;

/**
 * List chat sessions for a user (newest first, max 50).
 */
export async function listSessions(userId) {
  if (!userId) {
    throw new Error("user_id is required to list sessions.");
  }

  if (API_MODE === "mock") {
    await new Promise(res => setTimeout(res, 120));
    const list = mockSessions[userId] || [];
    return list.map(s => ({
      id: s.id,
      title: s.title,
      updated_at: s.updated_at,
      created_at: s.created_at
    }));
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(`${API_BASE_URL}/sessions?user_id=${encodeURIComponent(userId)}`, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data?.error?.message || data?.detail || `Failed to fetch sessions (${res.status})`);
    }
    return Array.isArray(data) ? data : (data.sessions || []);
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Retrieve a specific session and all its messages in chronological order.
 */
export async function getSession(sessionId, userId) {
  if (!sessionId || !userId) {
    throw new Error("session_id and user_id are required.");
  }

  if (API_MODE === "mock") {
    await new Promise(res => setTimeout(res, 120));
    const list = mockSessions[userId] || [];
    const found = list.find(s => s.id === sessionId);
    if (!found) {
      const err = new Error(`Session '${sessionId}' not found.`);
      err.status = 404;
      throw err;
    }
    return JSON.parse(JSON.stringify(found));
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(`${API_BASE_URL}/sessions/${encodeURIComponent(sessionId)}?user_id=${encodeURIComponent(userId)}`, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal
    });
    const data = await res.json();
    if (!res.ok) {
      const err = new Error(data?.error?.message || data?.detail || `Failed to fetch session (${res.status})`);
      err.status = res.status;
      throw err;
    }
    return data;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Rename a chat session.
 */
export async function renameSession(sessionId, userId, title) {
  if (!sessionId || !userId || !title) {
    throw new Error("session_id, user_id, and title are required.");
  }

  if (API_MODE === "mock") {
    await new Promise(res => setTimeout(res, 120));
    const list = mockSessions[userId] || [];
    const found = list.find(s => s.id === sessionId);
    if (!found) {
      const err = new Error(`Session '${sessionId}' not found.`);
      err.status = 404;
      throw err;
    }
    found.title = title.trim();
    found.updated_at = new Date().toISOString();
    return { id: found.id, title: found.title, updated_at: found.updated_at };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(`${API_BASE_URL}/sessions/${encodeURIComponent(sessionId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: userId, title: title.trim() }),
      signal: controller.signal
    });
    const data = await res.json();
    if (!res.ok) {
      const err = new Error(data?.error?.message || data?.detail || `Failed to rename session (${res.status})`);
      err.status = res.status;
      throw err;
    }
    return data;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Delete a chat session.
 */
export async function deleteSession(sessionId, userId) {
  if (!sessionId || !userId) {
    throw new Error("session_id and user_id are required.");
  }

  if (API_MODE === "mock") {
    await new Promise(res => setTimeout(res, 120));
    if (mockSessions[userId]) {
      const idx = mockSessions[userId].findIndex(s => s.id === sessionId);
      if (idx !== -1) {
        mockSessions[userId].splice(idx, 1);
        return { status: "deleted", id: sessionId };
      }
    }
    const err = new Error(`Session '${sessionId}' not found.`);
    err.status = 404;
    throw err;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(`${API_BASE_URL}/sessions/${encodeURIComponent(sessionId)}?user_id=${encodeURIComponent(userId)}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal
    });
    const data = await res.json();
    if (!res.ok) {
      const err = new Error(data?.error?.message || data?.detail || `Failed to delete session (${res.status})`);
      err.status = res.status;
      throw err;
    }
    return data;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Groups sessions into Today, Yesterday, and Earlier.
 */
export function groupSessionsByDate(sessions = []) {
  const groups = {
    Today: [],
    Yesterday: [],
    Earlier: []
  };

  if (!Array.isArray(sessions)) return groups;

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfYesterday = startOfToday - 86400000;

  for (const session of sessions) {
    const timestamp = session.updated_at || session.created_at;
    const d = timestamp ? new Date(timestamp).getTime() : now.getTime();
    if (d >= startOfToday) {
      groups.Today.push(session);
    } else if (d >= startOfYesterday) {
      groups.Yesterday.push(session);
    } else {
      groups.Earlier.push(session);
    }
  }

  return groups;
}

/**
 * Local storage fallback helpers (per-user, wrapped in try/catch)
 */
export function getLocalSessions(userId) {
  try {
    if (typeof window === "undefined" || !window.localStorage) return [];
    const raw = localStorage.getItem(`recallai_local_sessions_${userId}`);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveLocalSession(userId, session) {
  try {
    if (typeof window === "undefined" || !window.localStorage || !session?.id) return;
    const existing = getLocalSessions(userId);
    const idx = existing.findIndex(s => s.id === session.id);
    const updated = {
      ...session,
      updated_at: session.updated_at || new Date().toISOString()
    };
    if (idx !== -1) {
      existing[idx] = updated;
    } else {
      existing.unshift(updated);
    }
    localStorage.setItem(`recallai_local_sessions_${userId}`, JSON.stringify(existing.slice(0, 50)));
  } catch {
    // Graceful fallback
  }
}

export function deleteLocalSession(userId, sessionId) {
  try {
    if (typeof window === "undefined" || !window.localStorage) return;
    const existing = getLocalSessions(userId);
    const filtered = existing.filter(s => s.id !== sessionId);
    localStorage.setItem(`recallai_local_sessions_${userId}`, JSON.stringify(filtered));
  } catch {
    // Graceful fallback
  }
}

/**
 * URL Hash & Session Persistence Helpers
 */
export function parseSessionIdFromHash(hash = "") {
  if (typeof hash !== "string") return null;
  const trimmed = hash.trim();
  const match = trimmed.match(/^#\/chat\/([a-zA-Z0-9_\-]+)$/);
  if (!match) return null;
  const candidate = match[1];
  if (candidate === "new") return "new";
  return candidate;
}

export function formatChatHash(sessionId) {
  if (!sessionId || sessionId === "new") {
    return "#/chat/new";
  }
  return `#/chat/${encodeURIComponent(sessionId)}`;
}

export function getStoredUserId() {
  try {
    if (typeof window === "undefined" || !window.localStorage) return "student_alice";
    return window.localStorage.getItem("recallai_demo_user_id") || "student_alice";
  } catch {
    return "student_alice";
  }
}

export function setStoredUserId(userId) {
  try {
    if (typeof window === "undefined" || !window.localStorage) return;
    if (userId) {
      window.localStorage.setItem("recallai_demo_user_id", userId);
    }
  } catch {}
}

export function getStoredActiveSessionId(userId) {
  try {
    if (typeof window === "undefined" || !window.localStorage) return null;
    return window.localStorage.getItem(`recallai_active_session_${userId}`) || null;
  } catch {
    return null;
  }
}

export function setStoredActiveSessionId(userId, sessionId) {
  try {
    if (typeof window === "undefined" || !window.localStorage) return;
    if (sessionId && sessionId !== "new") {
      window.localStorage.setItem(`recallai_active_session_${userId}`, sessionId);
      window.localStorage.setItem("recallai_active_session_id", sessionId);
    } else {
      window.localStorage.removeItem(`recallai_active_session_${userId}`);
      window.localStorage.removeItem("recallai_active_session_id");
    }
  } catch {}
}

export function resolveInitialSessionId({ hash = "", userId = "student_alice", storage = null } = {}) {
  // 1. Check URL hash first
  const fromHash = parseSessionIdFromHash(hash);
  if (fromHash) {
    return fromHash;
  }

  // 2. Fall back to localStorage
  try {
    const store = storage || (typeof window !== "undefined" ? window.localStorage : null);
    if (store) {
      const fromStore = store.getItem(`recallai_active_session_${userId}`) || store.getItem("recallai_active_session_id");
      if (fromStore && fromStore !== "new") {
        return fromStore;
      }
    }
  } catch {}

  return null;
}
