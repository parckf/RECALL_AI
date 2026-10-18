import React, { useState, useEffect, useRef, useCallback } from 'react';
import Header from './components/Header';
import Sidebar from './components/Sidebar';
import ChatArea from './components/ChatArea';
import EvidenceDrawer from './components/EvidenceDrawer';
import { RenameModal, DeleteModal } from './components/Modals';
import {
  getHealth,
  getMemories,
  sendChatMessage,
  listSessions,
  getSession,
  renameSession,
  deleteSession,
  getLocalSessions,
  saveLocalSession,
  deleteLocalSession,
  parseSessionIdFromHash,
  formatChatHash,
  getStoredUserId,
  setStoredUserId,
  getStoredActiveSessionId,
  setStoredActiveSessionId,
  resolveInitialSessionId,
  buildChatHistory,
  formatFriendlyErrorMessage
} from './api';

const DEMO_USERS = [
  { id: 'student_alice', label: 'Alice (visual learner)' },
  { id: 'student_bob', label: 'Bob (fresh graph)' }
];

function generateSessionId() {
  return `sess_${Date.now()}`;
}

export default function App() {
  // Selected demo student identity (safely read from localStorage)
  const [userId, setUserId] = useState(() => getStoredUserId());

  // Active session and conversation messages
  const [sessionId, setSessionId] = useState(() => generateSessionId());
  const [messages, setMessages] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentTurnData, setCurrentTurnData] = useState(null);
  const [inputText, setInputText] = useState('');

  // FalkorDB Memories
  const [memories, setMemories] = useState([]);
  const [isLoadingMemories, setIsLoadingMemories] = useState(false);
  const [memoriesError, setMemoriesError] = useState(null);

  // Health and Storage Status
  const [systemHealth, setSystemHealth] = useState(null);
  const [isHistoryOffline, setIsHistoryOffline] = useState(false);
  const [isSending, setIsSending] = useState(false);

  // UI Drawer and Sidebar state
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [drawerTab, setDrawerTab] = useState('evidence');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // Modals state
  const [renameModal, setRenameModal] = useState({ isOpen: false, session: null });
  const [deleteModal, setDeleteModal] = useState({ isOpen: false, session: null });

  // Refs for tracking active user, session, search, and abort controllers
  const activeUserRef = useRef(userId);
  const activeSessionRef = useRef(sessionId);
  const turnEpochRef = useRef(0);
  const abortControllerRef = useRef(null);
  const pendingTextRef = useRef('');
  const pendingSessionRef = useRef('');
  const isSendingRef = useRef(false);
  const searchInputRef = useRef(null);
  const chatInputRef = useRef(null);

  useEffect(() => {
    activeUserRef.current = userId;
    setStoredUserId(userId);
  }, [userId]);

  useEffect(() => {
    activeSessionRef.current = sessionId;
  }, [sessionId]);

  useEffect(() => {
    isSendingRef.current = isSending;
  }, [isSending]);

  // Load backend and database health
  useEffect(() => {
    getHealth()
      .then(data => setSystemHealth(data))
      .catch(() => setSystemHealth({ status: 'degraded', database: 'disconnected', supabase: 'unavailable' }));
  }, []);

  // Fetch FalkorDB graph memories for a user
  const loadMemories = useCallback((targetUser = userId) => {
    setIsLoadingMemories(true);
    setMemoriesError(null);

    getMemories(targetUser)
      .then(res => {
        if (activeUserRef.current === targetUser) {
          setMemories(res.memories || []);
        }
      })
      .catch(err => {
        if (activeUserRef.current === targetUser) {
          setMemoriesError(err.message || 'Error loading graph memories');
        }
      })
      .finally(() => {
        if (activeUserRef.current === targetUser) {
          setIsLoadingMemories(false);
        }
      });
  }, [userId]);

  // Fetch chat sessions from Supabase with graceful localStorage fallback
  const loadSessions = useCallback((targetUser = userId) => {
    listSessions(targetUser)
      .then(remoteSessions => {
        if (activeUserRef.current === targetUser) {
          setSessions(remoteSessions);
          setIsHistoryOffline(false);
        }
      })
      .catch(() => {
        // Supabase unreachable -> Fallback gracefully to localStorage
        if (activeUserRef.current === targetUser) {
          const local = getLocalSessions(targetUser);
          setSessions(local);
          setIsHistoryOffline(true);
        }
      });
  }, [userId]);

  // Restore session messages & Why-this-answer evidence from Supabase (or fallback)
  const loadSessionDetail = useCallback(async (targetSessionId, targetUser = userId) => {
    // If a send is in-flight for this session, ignore to prevent wiping out state
    if (isSendingRef.current && (targetSessionId === pendingSessionRef.current || targetSessionId === activeSessionRef.current)) {
      return;
    }

    if (!targetSessionId || targetSessionId === 'new') {
      const freshId = generateSessionId();
      setSessionId(freshId);
      setMessages([]);
      setCurrentTurnData(null);
      if (typeof window !== 'undefined') {
        window.location.hash = formatChatHash('new');
      }
      setStoredActiveSessionId(targetUser, null);
      return;
    }

    try {
      const detail = await getSession(targetSessionId, targetUser);
      // Guard against stale user switch
      if (activeUserRef.current !== targetUser) return;

      const historyMsgs = (detail.messages || []).map(m => ({
        role: m.role,
        text: m.text,
        turn: m.turn,
        created_at: m.created_at
      }));

      setSessionId(targetSessionId);
      setMessages(historyMsgs);

      // Restore Why-this-answer drawer data from last assistant turn
      const lastAsst = [...historyMsgs].reverse().find(m => m.role === 'assistant' && m.turn);
      setCurrentTurnData(lastAsst ? lastAsst.turn : null);

      if (typeof window !== 'undefined') {
        window.location.hash = formatChatHash(targetSessionId);
      }
      setStoredActiveSessionId(targetUser, targetSessionId);
    } catch {
      if (activeUserRef.current !== targetUser) return;
      if (isSendingRef.current && (targetSessionId === pendingSessionRef.current || targetSessionId === activeSessionRef.current)) {
        return;
      }

      // Check if found in localStorage offline fallback
      const local = getLocalSessions(targetUser);
      const match = local.find(s => s.id === targetSessionId);
      if (match) {
        setSessionId(targetSessionId);
        const msgs = match.messages || [];
        setMessages(msgs);
        const lastAsst = [...msgs].reverse().find(m => m.role === 'assistant' && m.turn);
        setCurrentTurnData(lastAsst ? lastAsst.turn : null);
        if (typeof window !== 'undefined') {
          window.location.hash = formatChatHash(targetSessionId);
        }
        setStoredActiveSessionId(targetUser, targetSessionId);
        return;
      }

      // 404 or failed: fall back to empty state without an error popup
      const freshId = generateSessionId();
      setSessionId(freshId);
      setMessages([]);
      setCurrentTurnData(null);
      if (typeof window !== 'undefined') {
        window.location.hash = formatChatHash('new');
      }
      setStoredActiveSessionId(targetUser, null);
    }
  }, [userId]);

  // Initial load: restore last chat (Hash first, then localStorage)
  useEffect(() => {
    const initialUser = getStoredUserId();
    activeUserRef.current = initialUser;

    loadMemories(initialUser);
    loadSessions(initialUser);

    const hash = typeof window !== 'undefined' ? window.location.hash : '';
    const targetSessionId = resolveInitialSessionId({
      hash,
      userId: initialUser
    });

    if (targetSessionId && targetSessionId !== 'new') {
      loadSessionDetail(targetSessionId, initialUser);
    } else {
      const freshId = generateSessionId();
      setSessionId(freshId);
      setMessages([]);
      setCurrentTurnData(null);
      if (typeof window !== 'undefined') {
        window.location.hash = formatChatHash('new');
      }
      setStoredActiveSessionId(initialUser, null);
    }
  }, [loadMemories, loadSessions, loadSessionDetail]);

  // Start a New Chat
  const handleNewChat = useCallback(() => {
    turnEpochRef.current++;
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsSending(false);
    isSendingRef.current = false;
    setInputText('');

    const newSess = generateSessionId();
    activeSessionRef.current = newSess;
    setSessionId(newSess);
    setMessages([]);
    setCurrentTurnData(null);
    setIsSidebarOpen(false);
    if (typeof window !== 'undefined') {
      window.location.hash = formatChatHash('new');
    }
    setStoredActiveSessionId(userId, null);
    setTimeout(() => chatInputRef.current?.focus(), 50);
  }, [userId]);

  // Listen for browser navigation hash changes
  useEffect(() => {
    const handleHashChange = () => {
      const hash = typeof window !== 'undefined' ? window.location.hash : '';
      const parsedId = parseSessionIdFromHash(hash);

      // Guard 1: If hash matches current active session or pending in-flight session, do nothing!
      if (parsedId && (parsedId === activeSessionRef.current || parsedId === pendingSessionRef.current)) {
        return;
      }

      // Guard 2: If a message is currently in-flight, do not let hashchange to 'new' or empty reset state
      if (isSendingRef.current && (!parsedId || parsedId === 'new')) {
        return;
      }

      if (!parsedId || parsedId === 'new') {
        if (!isSendingRef.current && (messages.length > 0 || currentTurnData)) {
          handleNewChat();
        }
      } else if (parsedId !== activeSessionRef.current) {
        // If user explicitly navigated to a different session while sending, abort in-flight send
        if (isSendingRef.current) {
          turnEpochRef.current++;
          if (abortControllerRef.current) {
            abortControllerRef.current.abort();
            abortControllerRef.current = null;
          }
          setIsSending(false);
          isSendingRef.current = false;
        }
        loadSessionDetail(parsedId, activeUserRef.current);
      }
    };

    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, [handleNewChat, loadSessionDetail, messages.length, currentTurnData]);

  // Global Keyboard Shortcuts (Esc closes modals/drawers; Ctrl+K / Cmd+K focuses search)
  useEffect(() => {
    const handleGlobalKeyDown = (e) => {
      if (e.key === 'Escape') {
        // If composer textarea is currently focused and sending, Stop is handled by textarea onKeyDown
        if (document.activeElement === chatInputRef.current && isSending) {
          return;
        }

        if (renameModal.isOpen) {
          setRenameModal({ isOpen: false, session: null });
        } else if (deleteModal.isOpen) {
          setDeleteModal({ isOpen: false, session: null });
        } else if (isDrawerOpen) {
          setIsDrawerOpen(false);
        } else if (isSidebarOpen) {
          setIsSidebarOpen(false);
        }
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [renameModal.isOpen, deleteModal.isOpen, isDrawerOpen, isSidebarOpen, isSending]);

  // User Switch Handler
  const handleUserChange = (newUserId) => {
    if (newUserId === userId) return;
    turnEpochRef.current++;
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsSending(false);
    isSendingRef.current = false;
    setInputText('');

    setUserId(newUserId);
    activeUserRef.current = newUserId;
    setStoredUserId(newUserId);
    setIsSidebarOpen(false);

    // 1. Clear the hash
    if (typeof window !== 'undefined') {
      window.location.hash = '';
    }

    // 2. Load memories and sessions for new user
    loadMemories(newUserId);
    loadSessions(newUserId);

    // 3. Show that user's own last chat or the empty state; never load one user's session under another user
    const lastSessionForUser = getStoredActiveSessionId(newUserId);
    if (lastSessionForUser && lastSessionForUser !== 'new') {
      loadSessionDetail(lastSessionForUser, newUserId);
    } else {
      const newSess = generateSessionId();
      setSessionId(newSess);
      setMessages([]);
      setCurrentTurnData(null);
      if (typeof window !== 'undefined') {
        window.location.hash = formatChatHash('new');
      }
      setStoredActiveSessionId(newUserId, null);
    }
  };

  // Select a Chat from Sidebar
  const handleSelectSession = (targetSessionId) => {
    if (targetSessionId === sessionId && messages.length > 0) {
      setIsSidebarOpen(false);
      return;
    }

    turnEpochRef.current++;
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsSending(false);
    isSendingRef.current = false;
    setInputText('');

    setIsSidebarOpen(false);
    loadSessionDetail(targetSessionId, userId);
  };

  // Stop Generation Handler
  const handleStop = useCallback(async () => {
    if (!isSending) return;

    // 1. Advance epoch so late response is ignored
    turnEpochRef.current++;

    // 2. Abort active network/mock request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }

    setIsSending(false);
    isSendingRef.current = false;

    const pendingText = pendingTextRef.current;
    const reqSession = pendingSessionRef.current;
    const reqUser = activeUserRef.current;

    // 3. Keep user's message in thread and add small muted note under it
    setMessages(prev => {
      if (prev.length === 0) return prev;
      const updated = [...prev];
      const lastIdx = updated.length - 1;
      if (updated[lastIdx]?.role === 'user') {
        updated[lastIdx] = {
          ...updated[lastIdx],
          stoppedNote: 'Stopped. The tutor may still have saved this to memory - check Saved memories.'
        };
      }
      return updated;
    });

    // 4. Refresh memories and sidebar sessions
    loadMemories(reqUser);
    loadSessions(reqUser);

    // 5. Restore text to composer only if the user message was not saved
    try {
      if (reqSession) {
        const detail = await getSession(reqSession, reqUser);
        const wasSaved = (detail?.messages || []).some(m => m.role === 'user' && m.text === pendingText);
        if (!wasSaved) {
          setInputText(pendingText);
        } else {
          setInputText('');
        }
      } else {
        setInputText(pendingText);
      }
    } catch {
      setInputText(pendingText);
    }
  }, [isSending, loadMemories, loadSessions]);

  // Send Message
  const handleSendMessage = async (text) => {
    const reqUser = userId;
    const reqSession = sessionId;
    const currentEpoch = ++turnEpochRef.current;

    pendingTextRef.current = text;
    pendingSessionRef.current = reqSession;
    activeSessionRef.current = reqSession;
    isSendingRef.current = true;

    // Build history from existing messages of CURRENT chat before appending new message
    const history = buildChatHistory(messages);

    const userMsg = { role: 'user', text };
    setMessages(prev => [...prev, userMsg]);
    setIsSending(true);
    setInputText('');

    // Ensure session ID and URL hash immediately reflect this chat so navigation stays in sync
    if (typeof window !== 'undefined' && window.location.hash !== formatChatHash(reqSession)) {
      window.location.hash = formatChatHash(reqSession);
    }
    setStoredActiveSessionId(reqUser, reqSession);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const turnResponse = await sendChatMessage(reqUser, reqSession, text, controller.signal, history);

      // Epoch guard: ignore if user switched mid-request, started new chat, or stopped
      if (
        turnEpochRef.current !== currentEpoch ||
        activeUserRef.current !== reqUser ||
        activeSessionRef.current !== reqSession
      ) {
        return;
      }

      const asstMsg = {
        role: 'assistant',
        text: turnResponse.reply,
        turn: turnResponse
      };

      setMessages(prev => [...prev, asstMsg]);
      setCurrentTurnData(turnResponse);

      // Save active session to URL hash & localStorage now that message turn exists
      if (typeof window !== 'undefined' && window.location.hash !== formatChatHash(reqSession)) {
        window.location.hash = formatChatHash(reqSession);
      }
      setStoredActiveSessionId(reqUser, reqSession);

      // Refresh graph memories in FalkorDB
      loadMemories(reqUser);

      // Refresh session list so newly created session appears with backend-generated title
      loadSessions(reqUser);

      // If offline storage active, save locally
      if (isHistoryOffline) {
        saveLocalSession(reqUser, {
          id: reqSession,
          title: text.slice(0, 40),
          messages: [...messages, userMsg, asstMsg]
        });
      }
    } catch (err) {
      if (
        err.name === 'AbortError' ||
        controller.signal.aborted ||
        turnEpochRef.current !== currentEpoch ||
        activeUserRef.current !== reqUser ||
        activeSessionRef.current !== reqSession
      ) {
        // Abort must not be treated as a failure: no error message and no retry button
        return;
      }

      setMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          text: formatFriendlyErrorMessage(err),
          isError: true,
          failedText: text
        }
      ]);
    } finally {
      if (turnEpochRef.current === currentEpoch) {
        setIsSending(false);
        isSendingRef.current = false;
        abortControllerRef.current = null;
      }
    }
  };

  // Retry Last Message
  const handleRetryLastMessage = () => {
    const lastMsg = messages[messages.length - 1];
    if (lastMsg?.isError && lastMsg.failedText) {
      setMessages(prev => prev.slice(0, -1));
      handleSendMessage(lastMsg.failedText);
    }
  };

  // Rename Session Handlers
  const handleOpenRename = (session) => {
    setRenameModal({ isOpen: true, session });
  };

  const handleSaveRename = async (newTitle) => {
    const sessionToRename = renameModal.session;
    if (!sessionToRename) return;

    try {
      await renameSession(sessionToRename.id, userId, newTitle);
      setSessions(prev =>
        prev.map(s => (s.id === sessionToRename.id ? { ...s, title: newTitle } : s))
      );
      if (isHistoryOffline) {
        saveLocalSession(userId, { ...sessionToRename, title: newTitle });
      }
    } catch (err) {
      console.error('Rename failed:', err);
    } finally {
      setRenameModal({ isOpen: false, session: null });
    }
  };

  // Delete Session Handlers
  const handleOpenDelete = (session) => {
    setDeleteModal({ isOpen: true, session });
  };

  const handleConfirmDelete = async () => {
    const sessionToDelete = deleteModal.session;
    if (!sessionToDelete) return;

    try {
      await deleteSession(sessionToDelete.id, userId);
      setSessions(prev => prev.filter(s => s.id !== sessionToDelete.id));
      if (isHistoryOffline) {
        deleteLocalSession(userId, sessionToDelete.id);
      }
      // If deleted active session, start a new chat
      if (sessionToDelete.id === sessionId) {
        handleNewChat();
      }
    } catch (err) {
      console.error('Delete failed:', err);
    } finally {
      setDeleteModal({ isOpen: false, session: null });
    }
  };

  // "Why this answer?" Evidence trigger
  const handleOpenEvidence = (turnData) => {
    if (turnData) {
      setCurrentTurnData(turnData);
    }
    setDrawerTab('evidence');
    setIsDrawerOpen(true);
  };

  const currentUserObj = DEMO_USERS.find(u => u.id === userId) || { label: userId };
  const activeMemoriesCount = memories.filter(m => m.status === 'active').length;

  return (
    <div className="app-container">
      {/* Top Header */}
      <Header
        systemHealth={systemHealth}
        isHistoryOffline={isHistoryOffline}
        activeMemoriesCount={activeMemoriesCount}
        isDrawerOpen={isDrawerOpen}
        onToggleDrawer={() => setIsDrawerOpen(prev => !prev)}
        onToggleSidebar={() => setIsSidebarOpen(prev => !prev)}
      />

      {/* Main Layout Body */}
      <div className="app-body">
        {/* Left Sidebar */}
        <Sidebar
          sessions={sessions}
          activeSessionId={sessionId}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          onSelectSession={handleSelectSession}
          onNewChat={handleNewChat}
          onOpenRename={handleOpenRename}
          onOpenDelete={handleOpenDelete}
          userId={userId}
          demoUsers={DEMO_USERS}
          onUserChange={handleUserChange}
          isHistoryOffline={isHistoryOffline}
          isOpen={isSidebarOpen}
          searchInputRef={searchInputRef}
        />

        {/* Center Chat Area */}
        <ChatArea
          messages={messages}
          isLoading={isSending}
          inputText={inputText}
          onInputChange={setInputText}
          onSendMessage={handleSendMessage}
          onStop={handleStop}
          onRetry={handleRetryLastMessage}
          onOpenEvidence={handleOpenEvidence}
          demoUserLabel={currentUserObj.label}
          inputRef={chatInputRef}
        />

        {/* Right Slide-out Graph Evidence Drawer */}
        <EvidenceDrawer
          isOpen={isDrawerOpen}
          onClose={() => setIsDrawerOpen(false)}
          activeTab={drawerTab}
          onTabChange={setDrawerTab}
          currentTurnData={currentTurnData}
          memories={memories}
          isLoadingMemories={isLoadingMemories}
          memoriesError={memoriesError}
          onRefreshMemories={() => loadMemories(userId)}
          userId={userId}
        />
      </div>

      {/* Modals */}
      <RenameModal
        isOpen={renameModal.isOpen}
        initialTitle={renameModal.session?.title || ''}
        onSave={handleSaveRename}
        onClose={() => setRenameModal({ isOpen: false, session: null })}
      />

      <DeleteModal
        isOpen={deleteModal.isOpen}
        sessionTitle={deleteModal.session?.title || ''}
        onConfirm={handleConfirmDelete}
        onClose={() => setDeleteModal({ isOpen: false, session: null })}
      />
    </div>
  );
}
