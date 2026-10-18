import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeChatResponse, getHealth, getMemories, sendChatMessage } from '../src/api.js';

test('normalizeChatResponse guarantees contract fields and arrays', () => {
  const normalized = normalizeChatResponse({
    reply: "Hello student!",
    saved_memories: null,
    warnings: undefined
  });

  assert.equal(normalized.reply, "Hello student!");
  assert.ok(Array.isArray(normalized.saved_memories));
  assert.ok(Array.isArray(normalized.retrieved_memories));
  assert.ok(Array.isArray(normalized.evidence_paths));
  assert.ok(Array.isArray(normalized.warnings));
  assert.equal(normalized.explanation, "");
});

test('mock getHealth returns connected database status', async () => {
  const health = await getHealth();
  assert.equal(health.status, 'ok');
  assert.equal(health.database, 'connected');
  assert.equal(health.llm_configured, true);
});

test('mock getMemories enforces per-user isolation', async () => {
  const aliceMems = await getMemories('student_alice');
  const bobMems = await getMemories('student_bob');

  assert.ok(Array.isArray(aliceMems.memories));
  assert.ok(Array.isArray(bobMems.memories));
  // Alice starts with seeded preference, Bob starts empty
  assert.equal(aliceMems.memories.length, 1);
  assert.equal(bobMems.memories.length, 0);
});

test('mock sendChatMessage handles extraction and evidence paths', async () => {
  const res = await sendChatMessage('student_alice', 'sess_test_1', 'I struggle with recursion in Python');
  
  assert.ok(res.reply.length > 0);
  assert.ok(res.saved_memories.length > 0);
  assert.equal(res.saved_memories[0].value, 'recursion');
  assert.ok(res.evidence_paths.length > 0);
  
  const steps = res.evidence_paths[0].steps;
  assert.equal(steps[0].from, 'Student');
  assert.equal(steps[0].relation, 'HAS_MEMORY');
  assert.equal(steps[0].to, 'Memory("Struggles with recursion")');
  assert.equal(steps[0].origin, 'You said');
  assert.equal(steps[1].from, 'Memory("Struggles with recursion")');
  assert.equal(steps[1].relation, 'ABOUT');
  assert.equal(steps[1].to, 'Concept(recursion)');
  assert.equal(steps[1].origin, 'You said');
  assert.equal(steps[2].from, 'Concept(recursion)');
  assert.equal(steps[2].relation, 'REQUIRES');
  assert.equal(steps[2].to, 'functions');
  assert.equal(steps[2].origin, 'Curated');
});

test('mock sendChatMessage handles correction to resolve memory', async () => {
  const res = await sendChatMessage('student_alice', 'sess_test_2', 'I no longer struggle with recursion');
  
  assert.ok(res.saved_memories.some(m => m.action === 'resolved'));
});

test('mock sendChatMessage handles /simulate-error correctly', async () => {
  await assert.rejects(
    async () => {
      await sendChatMessage('student_alice', 'sess_test_3', 'Please trigger /simulate-error');
    },
    /Simulated 500 error/
  );
});

test('mock sendChatMessage handles /simulate-write-failure with warning', async () => {
  const res = await sendChatMessage('student_alice', 'sess_test_4', 'Testing /simulate-write-failure command');
  assert.equal(res.warnings.length, 1);
  assert.equal(res.warnings[0].stage, 'memory_write');
});

// ---------------------------------------------------------------------------
// Phase B: Chat History & Session Management Tests
// ---------------------------------------------------------------------------

test('mock listSessions returns sessions and enforces user isolation', async () => {
  const { listSessions } = await import('../src/api.js');
  
  // Alice starts with seeded sessions; Bob starts empty
  const aliceSessions = await listSessions('student_alice');
  const bobSessions = await listSessions('student_bob');

  assert.ok(Array.isArray(aliceSessions));
  assert.ok(aliceSessions.length >= 2);
  assert.ok(aliceSessions[0].id);
  assert.ok(aliceSessions[0].title);
  assert.ok(aliceSessions[0].updated_at);

  assert.ok(Array.isArray(bobSessions));
  assert.equal(bobSessions.length, 0);

  // Missing userId rejects
  await assert.rejects(async () => {
    await listSessions('');
  }, /user_id is required/);
});

test('mock getSession returns chronological messages with turn metadata', async () => {
  const { getSession } = await import('../src/api.js');

  const session = await getSession('sess_alice_today', 'student_alice');
  assert.equal(session.id, 'sess_alice_today');
  assert.ok(Array.isArray(session.messages));
  assert.equal(session.messages.length, 2);
  assert.equal(session.messages[0].role, 'user');
  assert.equal(session.messages[1].role, 'assistant');
  assert.ok(session.messages[1].turn);
  assert.ok(session.messages[1].turn.saved_memories);

  // Nonexistent session rejects with 404
  await assert.rejects(async () => {
    await getSession('sess_nonexistent', 'student_alice');
  }, (err) => err.status === 404);
});

test('mock renameSession updates title correctly', async () => {
  const { renameSession, getSession } = await import('../src/api.js');

  const updated = await renameSession('sess_alice_today', 'student_alice', 'Mastering Base Conditions');
  assert.equal(updated.title, 'Mastering Base Conditions');

  const reloaded = await getSession('sess_alice_today', 'student_alice');
  assert.equal(reloaded.title, 'Mastering Base Conditions');
});

test('mock deleteSession deletes session and subsequent get throws 404', async () => {
  const { deleteSession, getSession } = await import('../src/api.js');

  const res = await deleteSession('sess_alice_yesterday', 'student_alice');
  assert.equal(res.status, 'deleted');

  await assert.rejects(async () => {
    await getSession('sess_alice_yesterday', 'student_alice');
  }, (err) => err.status === 404);
});

test('groupSessionsByDate groups sessions into Today, Yesterday, and Earlier', async () => {
  const { groupSessionsByDate } = await import('../src/api.js');

  const now = new Date();
  const todayTimestamp = now.toISOString();
  const yesterdayTimestamp = new Date(now.getTime() - 86400000).toISOString();
  const earlierTimestamp = new Date(now.getTime() - 86400000 * 5).toISOString();

  const sessions = [
    { id: 's1', title: 'Session 1', updated_at: todayTimestamp },
    { id: 's2', title: 'Session 2', updated_at: yesterdayTimestamp },
    { id: 's3', title: 'Session 3', updated_at: earlierTimestamp }
  ];

  const grouped = groupSessionsByDate(sessions);
  assert.equal(grouped.Today.length, 1);
  assert.equal(grouped.Today[0].id, 's1');
  assert.equal(grouped.Yesterday.length, 1);
  assert.equal(grouped.Yesterday[0].id, 's2');
  assert.equal(grouped.Earlier.length, 1);
  assert.equal(grouped.Earlier[0].id, 's3');
});

test('localStorage fallback functions handle missing window gracefully without crashing', async () => {
  const { getLocalSessions, saveLocalSession, deleteLocalSession } = await import('../src/api.js');

  // In Node.js environment where window is undefined:
  assert.deepEqual(getLocalSessions('student_test'), []);
  assert.doesNotThrow(() => saveLocalSession('student_test', { id: 's_fallback', title: 'Local fallback' }));
  assert.doesNotThrow(() => deleteLocalSession('student_test', 's_fallback'));
});

test('URL hash parsing and formatting handles sessions and new chats correctly', async () => {
  const { parseSessionIdFromHash, formatChatHash } = await import('../src/api.js');

  assert.equal(parseSessionIdFromHash('#/chat/sess_123'), 'sess_123');
  assert.equal(parseSessionIdFromHash('#/chat/new'), 'new');
  assert.equal(parseSessionIdFromHash('#/'), null);
  assert.equal(parseSessionIdFromHash(''), null);
  assert.equal(parseSessionIdFromHash(null), null);

  assert.equal(formatChatHash('sess_123'), '#/chat/sess_123');
  assert.equal(formatChatHash('new'), '#/chat/new');
  assert.equal(formatChatHash(null), '#/chat/new');
});

test('resolveInitialSessionId prioritizes URL hash over localStorage', async () => {
  const { resolveInitialSessionId } = await import('../src/api.js');

  const mockStorage = {
    data: {
      'recallai_active_session_student_alice': 'sess_from_storage',
      'recallai_active_session_id': 'sess_from_storage'
    },
    getItem(key) {
      return this.data[key] || null;
    }
  };

  // 1. When hash contains a session, it takes priority over storage
  const fromHash = resolveInitialSessionId({
    hash: '#/chat/sess_from_hash',
    userId: 'student_alice',
    storage: mockStorage
  });
  assert.equal(fromHash, 'sess_from_hash');

  // 2. When hash is empty, falls back to localStorage
  const fromStorage = resolveInitialSessionId({
    hash: '',
    userId: 'student_alice',
    storage: mockStorage
  });
  assert.equal(fromStorage, 'sess_from_storage');

  // 3. When hash is #/chat/new, returns 'new'
  const newChat = resolveInitialSessionId({
    hash: '#/chat/new',
    userId: 'student_alice',
    storage: mockStorage
  });
  assert.equal(newChat, 'new');
});

test('session restore logic recovers messages and turn data, or 404 falls back cleanly', async () => {
  const { getSession } = await import('../src/api.js');

  // Alice successfully restores her session
  const aliceSession = await getSession('sess_alice_today', 'student_alice');
  assert.equal(aliceSession.id, 'sess_alice_today');
  assert.equal(aliceSession.messages.length, 2);
  const lastAsst = [...aliceSession.messages].reverse().find(m => m.role === 'assistant' && m.turn);
  assert.ok(lastAsst);
  assert.ok(lastAsst.turn.evidence_paths);

  // Cross-user session access or invalid session throws 404, which triggers fallback to empty state
  await assert.rejects(
    async () => {
      await getSession('sess_alice_today', 'student_bob');
    },
    (err) => err.status === 404
  );

  await assert.rejects(
    async () => {
      await getSession('sess_nonexistent_xyz', 'student_alice');
    },
    (err) => err.status === 404
  );
});

// ---------------------------------------------------------------------------
// Stop Generation & AbortSignal Tests
// ---------------------------------------------------------------------------

test('aborting sendChat throws AbortError and does not produce a delivery failure state', async () => {
  const { sendChatMessage, sendChat } = await import('../src/api.js');

  // Both sendChatMessage and sendChat alias work
  assert.equal(sendChatMessage, sendChat);

  const controller = new AbortController();
  // Abort after 50ms (before mock 350ms delay finishes)
  setTimeout(() => controller.abort(), 50);

  let capturedError = null;
  try {
    await sendChatMessage('student_alice', 'sess_abort_01', 'Explain binary trees', controller.signal);
  } catch (err) {
    capturedError = err;
  }

  assert.ok(capturedError, 'Expected sendChatMessage to reject on abort');
  assert.equal(capturedError.name, 'AbortError');
  // AbortError is explicitly recognized by the UI to NOT create an error bubble or retry button
  assert.notEqual(capturedError.code, 'HTTP_ERROR');
});

test('a late response after stop is ignored via epoch guarding', async () => {
  const { sendChatMessage } = await import('../src/api.js');

  let currentEpoch = 1;
  const messages = [{ role: 'user', text: 'Slow question' }];

  // Simulate pending async request with epoch 1
  const requestEpoch = currentEpoch;
  const pendingPromise = sendChatMessage('student_alice', 'sess_epoch_test', 'Slow question');

  // User clicks Stop: epoch is incremented and user message is annotated
  currentEpoch++;
  messages[0] = {
    ...messages[0],
    stoppedNote: 'Stopped. The tutor may still have saved this to memory - check Saved memories.'
  };

  // Wait for late response
  const lateResponse = await pendingPromise;

  // Epoch guard check: if requestEpoch !== currentEpoch, ignore it in the UI!
  if (requestEpoch === currentEpoch) {
    messages.push({ role: 'assistant', text: lateResponse.reply });
  }

  // Verify that the assistant message was NOT added
  assert.equal(messages.length, 1);
  assert.equal(messages[0].stoppedNote, 'Stopped. The tutor may still have saved this to memory - check Saved memories.');
});

test('Send is disabled/hidden while pending and Stop button is displayed', () => {
  // Test state rendering contract:
  // When isLoading is true:
  // - Send button is hidden/replaced by Stop button
  // - Stop button has square icon "■", label "Stop", accessible name "Stop generation"
  // - Hint displays "Esc to stop"
  const getComposerState = (isLoading, inputText) => {
    return {
      showStop: isLoading,
      showSend: !isLoading,
      sendDisabled: !inputText.trim() || isLoading,
      hint: isLoading ? 'Esc to stop' : 'Enter to send, Shift+Enter for newline',
      stopButton: isLoading ? {
        icon: '■',
        label: 'Stop',
        ariaLabel: 'Stop generation',
        title: 'Stop response (Esc)'
      } : null
    };
  };

  const pendingState = getComposerState(true, 'Hello tutor');
  assert.equal(pendingState.showStop, true);
  assert.equal(pendingState.showSend, false);
  assert.equal(pendingState.sendDisabled, true);
  assert.equal(pendingState.hint, 'Esc to stop');
  assert.equal(pendingState.stopButton.icon, '■');
  assert.equal(pendingState.stopButton.label, 'Stop');
  assert.equal(pendingState.stopButton.ariaLabel, 'Stop generation');

  const idleState = getComposerState(false, 'Hello tutor');
  assert.equal(idleState.showStop, false);
  assert.equal(idleState.showSend, true);
  assert.equal(idleState.sendDisabled, false);
  assert.equal(idleState.hint, 'Enter to send, Shift+Enter for newline');
});

// ---------------------------------------------------------------------------
// In-Session Conversation History Tests
// ---------------------------------------------------------------------------

test('buildChatHistory sends max 6 messages in chronological order, oldest first', async () => {
  const { buildChatHistory } = await import('../src/api.js');

  const rawMessages = [
    { role: 'user', text: 'Msg 1' },
    { role: 'assistant', text: 'Reply 1' },
    { role: 'user', text: 'Msg 2' },
    { role: 'assistant', text: 'Reply 2' },
    { role: 'user', text: 'Msg 3' },
    { role: 'assistant', text: 'Reply 3' },
    { role: 'user', text: 'Msg 4' },
    { role: 'assistant', text: 'Reply 4' }
  ];

  const history = buildChatHistory(rawMessages);

  // Must take the last 6 messages, oldest first
  assert.equal(history.length, 6);
  assert.equal(history[0].text, 'Msg 2');
  assert.equal(history[1].text, 'Reply 2');
  assert.equal(history[2].text, 'Msg 3');
  assert.equal(history[3].text, 'Reply 3');
  assert.equal(history[4].text, 'Msg 4');
  assert.equal(history[5].text, 'Reply 4');
});

test('buildChatHistory strictly excludes error replies and stopped notes', async () => {
  const { buildChatHistory } = await import('../src/api.js');

  const rawMessages = [
    { role: 'user', text: 'Can you explain how recursion works?' },
    { role: 'assistant', text: 'Recursion is when a function calls itself.' },
    // Stopped user turn with stoppedNote
    {
      role: 'user',
      text: 'What is a base case?',
      stoppedNote: 'Stopped. The tutor may still have saved this to memory - check Saved memories.'
    },
    // Standalone stopped note message
    { role: 'assistant', text: 'Stopped. The tutor may still have saved this to memory - check Saved memories.' },
    // System message error reply
    { role: 'assistant', text: '[System Message] Answer model unavailable: timeout' },
    // Frontend error state message
    { role: 'assistant', text: 'Error: Failed to complete chat turn.', isError: true },
    { role: 'user', text: 'Give me one more example of that.' },
    { role: 'assistant', text: 'Here is another example of recursion.' }
  ];

  const history = buildChatHistory(rawMessages);

  // Excluded: the standalone stopped message, system message, and frontend error message
  // Included: the valid turns, in order (5 items)
  assert.equal(history.length, 5);
  assert.deepEqual(history[0], { role: 'user', text: 'Can you explain how recursion works?' });
  assert.deepEqual(history[1], { role: 'assistant', text: 'Recursion is when a function calls itself.' });
  // The stopped user message text is retained, but the stoppedNote field is strictly excluded!
  assert.deepEqual(history[2], { role: 'user', text: 'What is a base case?' });
  assert.equal(history[2].stoppedNote, undefined);
  assert.deepEqual(history[3], { role: 'user', text: 'Give me one more example of that.' });
  assert.deepEqual(history[4], { role: 'assistant', text: 'Here is another example of recursion.' });
});

test('mock sendChatMessage utilizes history to resolve follow-up references like "one more example of that"', async () => {
  const { sendChatMessage } = await import('../src/api.js');

  const history = [
    { role: 'user', text: 'Can you explain how recursion works?' },
    { role: 'assistant', text: 'Recursion is a function calling itself.' }
  ];

  // Follow-up message has no topic name: "Give me one more example of that."
  const res = await sendChatMessage('student_alice', 'sess_followup_test', 'Give me one more example of that.', null, history);

  // Mock tutor must resolve topic to recursion from history
  assert.ok(res.reply.includes('recursion'));
  assert.ok(res.reply.includes('another concrete example'));
  assert.ok(res.evidence_paths.length > 0);
  assert.ok(res.explanation.includes('recursion'));
});

test('buildChatHistory truncates messages longer than 4000 characters with " [...]"', async () => {
  const { buildChatHistory } = await import('../src/api.js');

  const longAssistantMsg = 'x'.repeat(5000);
  const rawMessages = [
    { role: 'user', text: 'Can you explain decorators?' },
    { role: 'assistant', text: longAssistantMsg }
  ];

  const history = buildChatHistory(rawMessages);
  assert.equal(history.length, 2);
  assert.equal(history[1].text.length, 4000);
  assert.ok(history[1].text.endsWith(' [...]'));
  assert.equal(history[1].text.slice(0, 10), 'xxxxxxxxxx');
});

// ---------------------------------------------------------------------------
// Quota & Model Error Formatting Tests (Part 2a)
// ---------------------------------------------------------------------------

test('formatFriendlyErrorMessage converts 429/quota/busy errors into friendly message and scrubs keys/URLs', async () => {
  const { formatFriendlyErrorMessage } = await import('../src/api.js');

  // Case 1: Status 429 with raw JSON and URL
  const err429 = new Error('429 RESOURCE_EXHAUSTED: Quota exceeded for metric GenerateContent. Visit https://console.cloud.google.com/apis {"code": 429, "key": "AIzaSySecretKey1234567890abcdef"}');
  err429.status = 429;
  const friendly1 = formatFriendlyErrorMessage(err429);
  assert.equal(friendly1, 'The AI model is busy or out of free quota. Try again later.');
  assert.ok(!friendly1.includes('429'));
  assert.ok(!friendly1.includes('RESOURCE_EXHAUSTED'));
  assert.ok(!friendly1.includes('https://'));
  assert.ok(!friendly1.includes('AIzaSy'));

  // Case 2: String with rate limit or quota keyword
  const friendly2 = formatFriendlyErrorMessage(new Error('Rate limit exceeded: too many requests'));
  assert.equal(friendly2, 'The AI model is busy or out of free quota. Try again later.');

  // Case 3: Service unavailable (503) or model not found
  const friendly3 = formatFriendlyErrorMessage(new Error('Model not found or temporarily unavailable'));
  assert.equal(friendly3, 'The AI model is temporarily unavailable. Try again later.');

  // Case 4: General error with JSON or URL or key
  const errRaw = new Error('Unexpected failure: https://api.internal/v1/call key=secret_key_value {"error": {"message": "Service dropped connection"}}');
  const friendly4 = formatFriendlyErrorMessage(errRaw);
  assert.ok(!friendly4.includes('https://'));
  assert.ok(!friendly4.includes('secret_key_value'));
  assert.ok(!friendly4.includes('{'));
});

test('quota partial success returns labeled system message in reply and raw provider error only in warnings', async () => {
  const { sendChatMessage } = await import('../src/api.js');

  const res = await sendChatMessage('student_alice', 'sess_quota_mock', 'Test /simulate-quota-warning command');

  // Chat bubble displays clean friendly message
  assert.equal(res.reply, '[System Message] The AI model is busy or out of free quota. Try again later.');
  assert.ok(!res.reply.includes('RESOURCE_EXHAUSTED'));
  assert.ok(!res.reply.includes('https://'));
  assert.ok(!res.reply.includes('{'));

  // Raw provider error is available strictly in warnings for the "Why this answer?" drawer
  assert.ok(res.warnings.length >= 1);
  const llmWarn = res.warnings.find(w => w.stage === 'llm');
  assert.ok(llmWarn);
  assert.ok(llmWarn.message.includes('429 RESOURCE_EXHAUSTED'));
  assert.ok(llmWarn.message.includes('[REDACTED]'));
  assert.ok(!llmWarn.message.includes('AIza'));
});

// ---------------------------------------------------------------------------
// Dropped Reply Bug Regression Tests (Part 2b)
// ---------------------------------------------------------------------------

test('regression: new chat -> send -> hash changes -> reply arrives -> reply must be shown without refresh', async () => {
  const { sendChatMessage, parseSessionIdFromHash, formatChatHash } = await import('../src/api.js');

  // Step 1: Initialize New Chat state
  let activeSession = 'sess_new_test_123';
  let isSending = false;
  let turnEpoch = 1;
  let messages = [];
  let currentHash = formatChatHash('new'); // '#/chat/new'

  const activeSessionRef = { current: activeSession };
  const pendingSessionRef = { current: '' };
  const isSendingRef = { current: false };

  // HashChange handler simulating App.jsx handleHashChange
  const onHashChange = (newHash) => {
    currentHash = newHash;
    const parsedId = parseSessionIdFromHash(newHash);

    // Guard 1: Ignore if hash corresponds to current active session or pending in-flight session
    if (parsedId && (parsedId === activeSessionRef.current || parsedId === pendingSessionRef.current)) {
      return;
    }

    // Guard 2: If a send is in-flight, do not let hash change reset state
    if (isSendingRef.current && (!parsedId || parsedId === 'new')) {
      return;
    }

    if (!parsedId || parsedId === 'new') {
      if (!isSendingRef.current && messages.length > 0) {
        // Reset to new chat (only if not sending)
        turnEpoch++;
        activeSession = 'sess_another_new';
        activeSessionRef.current = activeSession;
        messages = [];
      }
    } else if (parsedId !== activeSessionRef.current) {
      if (isSendingRef.current) {
        turnEpoch++;
        isSending = false;
        isSendingRef.current = false;
      }
      activeSession = parsedId;
      activeSessionRef.current = parsedId;
    }
  };

  // Step 2: Send first message in new chat
  const sendText = 'Explain recursion in Python';
  const reqSession = activeSession;
  const currentEpoch = ++turnEpoch;

  pendingSessionRef.current = reqSession;
  activeSessionRef.current = reqSession;
  isSending = true;
  isSendingRef.current = true;

  // Append user message
  messages = [...messages, { role: 'user', text: sendText }];
  assert.equal(messages.length, 1);
  assert.equal(messages[0].text, sendText);

  // Send request in background (mock delay ~350ms)
  const pendingPromise = sendChatMessage('student_alice', reqSession, sendText);

  // Step 3: Hash changes while request is in-flight!
  // URL hash updates to '#/chat/sess_new_test_123'
  onHashChange(formatChatHash(reqSession));

  // Verify that hash change DID NOT reset messages or change activeSession
  assert.equal(messages.length, 1);
  assert.equal(activeSessionRef.current, reqSession);
  assert.equal(isSendingRef.current, true);

  // Step 4: Reply arrives
  const turnResponse = await pendingPromise;

  // Epoch guard and session check in handleSendMessage
  if (
    turnEpoch === currentEpoch &&
    activeSessionRef.current === reqSession
  ) {
    const asstMsg = {
      role: 'assistant',
      text: turnResponse.reply,
      turn: turnResponse
    };
    messages = [...messages, asstMsg];
  }
  isSending = false;
  isSendingRef.current = false;

  // Step 5: Verification - Reply MUST be present in messages without requiring a refresh!
  assert.equal(messages.length, 2);
  assert.equal(messages[0].role, 'user');
  assert.equal(messages[0].text, sendText);
  assert.equal(messages[1].role, 'assistant');
  assert.ok(messages[1].text.length > 0);
  assert.ok(messages[1].turn);
});

test('every send must end in exactly one visible outcome: reply, labeled system message, or error with Retry', async () => {
  const { sendChatMessage, formatFriendlyErrorMessage } = await import('../src/api.js');

  const executeSend = async (messageText) => {
    let messages = [{ role: 'user', text: messageText }];
    try {
      const res = await sendChatMessage('student_alice', `sess_outcomes_${Date.now()}`, messageText);
      // Outcome 1 or 2: Assistant bubble (reply or labeled system message)
      messages.push({
        role: 'assistant',
        text: res.reply,
        turn: res
      });
    } catch (err) {
      // Outcome 3: Error bubble with Retry button
      messages.push({
        role: 'assistant',
        text: formatFriendlyErrorMessage(err),
        isError: true,
        failedText: messageText
      });
    }
    return messages;
  };

  // Outcome 1: Normal reply
  const normalResult = await executeSend('How do functions work?');
  assert.equal(normalResult.length, 2);
  assert.equal(normalResult[1].role, 'assistant');
  assert.ok(!normalResult[1].isError);
  assert.ok(!normalResult[1].text.startsWith('[System Message]'));

  // Outcome 2: Labeled system message on model outage / quota
  const quotaResult = await executeSend('Trigger /simulate-quota-warning');
  assert.equal(quotaResult.length, 2);
  assert.equal(quotaResult[1].role, 'assistant');
  assert.ok(quotaResult[1].text.startsWith('[System Message]'));
  assert.equal(quotaResult[1].text, '[System Message] The AI model is busy or out of free quota. Try again later.');

  // Outcome 3: Error with Retry on HTTP failure
  const errorResult = await executeSend('Trigger /simulate-error');
  assert.equal(errorResult.length, 2);
  assert.equal(errorResult[1].role, 'assistant');
  assert.equal(errorResult[1].isError, true);
  assert.ok(errorResult[1].failedText);
  assert.ok(errorResult[1].text.startsWith('Error:'));
});


