import React from 'react';
import { groupSessionsByDate } from '../api';

export default function Sidebar({
  sessions = [],
  activeSessionId,
  searchQuery,
  onSearchChange,
  onSelectSession,
  onNewChat,
  onOpenRename,
  onOpenDelete,
  userId,
  demoUsers = [],
  onUserChange,
  isHistoryOffline = false,
  isOpen = false,
  searchInputRef
}) {
  // Client-side search filtering
  const filteredSessions = searchQuery.trim()
    ? sessions.filter(s =>
        (s.title || 'Untitled Session')
          .toLowerCase()
          .includes(searchQuery.toLowerCase().trim())
      )
    : sessions;

  const groups = groupSessionsByDate(filteredSessions);
  const groupKeys = ['Today', 'Yesterday', 'Earlier'];

  return (
    <aside className={`sidebar ${isOpen ? 'open' : ''}`} aria-label="Chat history sidebar">
      <div className="sidebar-top">
        {/* + New Chat Button */}
        <button
          className="btn-new-chat"
          onClick={onNewChat}
          title="Start a new chat session"
        >
          <span>+</span>
          <span>New chat</span>
        </button>

        {/* Search bar with Ctrl+K shortcut */}
        <div className="chat-search-wrapper">
          <input
            ref={searchInputRef}
            type="text"
            className="chat-search-input"
            placeholder="Search chats..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            aria-label="Search chat sessions"
          />
          <span className="search-shortcut-badge" title="Focus search">
            ⌘K
          </span>
        </div>
      </div>

      {/* Offline Storage Notice */}
      {isHistoryOffline && (
        <div className="sidebar-offline-notice" role="alert">
          <span>⚠️</span>
          <span>Offline storage active. Sessions saved locally in browser.</span>
        </div>
      )}

      {/* Grouped Chat Sessions */}
      <nav className="sidebar-sessions" aria-label="Previous chats">
        {sessions.length === 0 ? (
          <div style={{ padding: '1rem 0.5rem', fontSize: '0.82rem', color: 'var(--muted)', textAlign: 'center' }}>
            No previous conversations. Start a new chat!
          </div>
        ) : filteredSessions.length === 0 ? (
          <div style={{ padding: '1rem 0.5rem', fontSize: '0.82rem', color: 'var(--muted)', textAlign: 'center' }}>
            No chats matching "{searchQuery}".
          </div>
        ) : (
          groupKeys.map(key => {
            const list = groups[key] || [];
            if (list.length === 0) return null;

            return (
              <div key={key} className="session-group">
                <div className="session-group-title">{key}</div>
                {list.map(session => {
                  const isActive = session.id === activeSessionId;
                  return (
                    <div
                      key={session.id}
                      className={`session-item ${isActive ? 'active' : ''}`}
                      onClick={() => onSelectSession(session.id)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          onSelectSession(session.id);
                        }
                      }}
                      aria-current={isActive ? 'true' : undefined}
                      title={session.title || 'Untitled Session'}
                    >
                      <span className="session-title">
                        {session.title || 'Untitled Session'}
                      </span>

                      <div className="session-actions" onClick={(e) => e.stopPropagation()}>
                        <button
                          className="btn-icon-subtle"
                          onClick={() => onOpenRename(session)}
                          title="Rename chat"
                          aria-label={`Rename chat ${session.title}`}
                        >
                          ✎
                        </button>
                        <button
                          className="btn-icon-subtle delete"
                          onClick={() => onOpenDelete(session)}
                          title="Delete chat"
                          aria-label={`Delete chat ${session.title}`}
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })
        )}
      </nav>

      {/* Bottom User Switcher */}
      <div className="sidebar-footer">
        <span className="sidebar-user-label">Demo Student Graph</span>
        <select
          className="user-select"
          value={userId}
          onChange={(e) => onUserChange(e.target.value)}
          title="Switch isolated FalkorDB graph student identity"
          aria-label="Select student identity"
        >
          {demoUsers.map(u => (
            <option key={u.id} value={u.id}>
              {u.label}
            </option>
          ))}
        </select>
      </div>
    </aside>
  );
}
