import React from 'react';
import { API_MODE } from '../api';

export default function Header({
  systemHealth,
  isHistoryOffline,
  activeMemoriesCount,
  isDrawerOpen,
  onToggleDrawer,
  onToggleSidebar
}) {
  const isDbConnected = systemHealth?.database === 'connected';
  const historyStatus = isHistoryOffline ? 'LocalStorage' : 'Supabase';

  return (
    <header className="app-header">
      <div className="header-left">
        <button
          className="mobile-menu-btn"
          onClick={onToggleSidebar}
          aria-label="Toggle navigation menu"
          title="Open chat sidebar"
        >
          ☰
        </button>

        <div className="brand-title">
          Recall<span className="brand-accent">AI</span>
        </div>
      </div>

      <div className="header-right">
        {/* Mode pill */}
        <span className={`pill ${API_MODE === 'live' ? 'active' : 'warn'}`}>
          <span className="pill-dot" />
          {API_MODE.toUpperCase()}
        </span>

        {/* Database status pill */}
        <span
          className={`pill falkor ${isDbConnected ? 'ok' : 'error'}`}
          title={`FalkorDB: ${systemHealth?.database || 'unknown'}, LLM Configured: ${systemHealth?.llm_configured ?? false}`}
        >
          <span className="pill-dot" />
          DB: {systemHealth?.database || 'checking'}
        </span>

        {/* History status pill */}
        <span
          className={`pill supabase ${isHistoryOffline ? 'warn' : 'ok'}`}
          title={isHistoryOffline ? 'Operating in offline local storage fallback mode' : 'Connected to Supabase chat history storage'}
        >
          <span className="pill-dot" />
          History: {historyStatus}
        </span>

        {/* Graph Evidence Drawer Button */}
        <button
          className={`btn-action-pill evidence ${isDrawerOpen ? 'active' : ''}`}
          onClick={onToggleDrawer}
          title="Toggle Graph Evidence and Saved Memories Drawer"
          aria-expanded={isDrawerOpen}
        >
          <span>🧠</span>
          <span>Graph Evidence</span>
          {activeMemoriesCount > 0 && (
            <span style={{
              background: 'var(--accent)',
              color: '#141210',
              fontWeight: 700,
              fontSize: '0.7rem',
              padding: '0.1rem 0.4rem',
              borderRadius: '9999px',
              marginLeft: '0.2rem'
            }}>
              {activeMemoriesCount}
            </span>
          )}
        </button>
      </div>
    </header>
  );
}
