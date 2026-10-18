import React from 'react';

export default function MemoryList({
  userId,
  memories,
  isLoading,
  error,
  onRefresh
}) {
  return (
    <div className="panel memory-panel">
      <div className="panel-header">
        <span className="panel-title">
          <span>🗂️</span> User Graph Memories ({memories.length})
        </span>
        <button
          className="btn-secondary"
          onClick={onRefresh}
          disabled={isLoading}
          style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
        >
          {isLoading ? '...' : 'Refresh'}
        </button>
      </div>

      <div className="panel-content">
        {isLoading && memories.length === 0 && (
          <div className="empty-state">Loading user graph memories from FalkorDB...</div>
        )}

        {error && (
          <div className="evidence-card" style={{ borderColor: 'var(--accent-rose)', background: 'rgba(244, 63, 94, 0.1)' }}>
            <div className="evidence-title" style={{ color: 'var(--accent-rose)' }}>Failed to load memories</div>
            <p style={{ fontSize: '0.85rem', color: '#fda4af' }}>{error}</p>
            <button
              className="btn-secondary"
              onClick={onRefresh}
              style={{ marginTop: '0.5rem', fontSize: '0.8rem' }}
            >
              Retry
            </button>
          </div>
        )}

        {!isLoading && !error && memories.length === 0 && (
          <div className="empty-state">
            <p>No memories stored for <strong>{userId}</strong> yet.</p>
            <p style={{ marginTop: '0.5rem', fontSize: '0.8rem' }}>
              State what you struggle with, learn, or prefer in the chat to create graph memory nodes.
            </p>
          </div>
        )}

        {memories.map((mem) => {
          const kindClass = (mem.kind || '').toLowerCase();
          const isResolved = mem.status === 'resolved';

          return (
            <div
              key={mem.id}
              className={`memory-card ${isResolved ? 'resolved' : ''}`}
            >
              <div className="memory-card-header">
                <span className={`kind-badge ${kindClass}`}>{mem.kind}</span>
                <span style={{
                  fontSize: '0.72rem',
                  fontWeight: 600,
                  color: isResolved ? 'var(--text-muted)' : 'var(--accent-emerald)'
                }}>
                  {mem.status?.toUpperCase()}
                </span>
              </div>

              <div className="memory-value" style={{ textDecoration: isResolved ? 'line-through' : 'none' }}>
                {mem.value}
              </div>

              {mem.source_text && (
                <div className="memory-source">"{mem.source_text}"</div>
              )}

              <div className="memory-date">
                Session: {mem.session_id || 'N/A'} • {new Date(mem.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
