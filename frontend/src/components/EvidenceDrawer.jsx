import React from 'react';
import GraphEvidenceMap from './GraphEvidenceMap';

export default function EvidenceDrawer({
  isOpen = false,
  onClose,
  activeTab = 'evidence',
  onTabChange,
  currentTurnData,
  memories = [],
  isLoadingMemories = false,
  memoriesError = null,
  onRefreshMemories,
  userId
}) {
  const {
    explanation,
    evidence_paths = [],
    saved_memories = [],
    retrieved_memories = [],
    warnings = []
  } = currentTurnData || {};

  const activeMemoriesCount = memories.filter(m => m.status === 'active').length;
  const hasEvidence = explanation || evidence_paths.length > 0 || saved_memories.length > 0 || retrieved_memories.length > 0;

  return (
    <>
      {/* Background Dim Backdrop */}
      <div
        className={`drawer-overlay ${isOpen ? 'open' : ''}`}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Slide-out / Bottom Sheet Drawer */}
      <aside
        className={`evidence-drawer ${isOpen ? 'open' : ''}`}
        aria-label="Graph evidence and memories drawer"
        aria-hidden={!isOpen}
      >
        <div className="drawer-header">
          <div className="drawer-tabs">
            <button
              className={`drawer-tab ${activeTab === 'evidence' ? 'active' : ''}`}
              onClick={() => onTabChange('evidence')}
            >
              <span>🔍</span>
              <span>Why this answer?</span>
            </button>
            <button
              className={`drawer-tab ${activeTab === 'memories' ? 'active' : ''}`}
              onClick={() => onTabChange('memories')}
            >
              <span>🗂️</span>
              <span>Saved memories</span>
              {activeMemoriesCount > 0 && (
                <span style={{
                  background: 'var(--surface-2)',
                  color: 'var(--accent)',
                  fontSize: '0.72rem',
                  padding: '0.1rem 0.4rem',
                  borderRadius: '9999px',
                  border: '1px solid var(--border)'
                }}>
                  {activeMemoriesCount}
                </span>
              )}
            </button>
          </div>

          <button
            className="drawer-close-btn"
            onClick={onClose}
            aria-label="Close drawer"
            title="Close drawer (Esc)"
          >
            ✕
          </button>
        </div>

        <div className="drawer-body">
          {activeTab === 'evidence' ? (
            /* TAB 1: Why This Answer? Graph Evidence */
            !hasEvidence ? (
              <div style={{ textAlign: 'center', padding: '2rem 1rem', color: 'var(--muted)', fontSize: '0.9rem' }}>
                <p>No turn evidence selected.</p>
                <p style={{ marginTop: '0.5rem', fontSize: '0.8rem' }}>
                  Ask a question or click "Why this answer?" on an assistant response to inspect the FalkorDB traversal path and reasoning.
                </p>
              </div>
            ) : (
              <>
                {/* Pipeline Warnings */}
                {warnings.length > 0 && (
                  <div className="drawer-card" style={{ borderColor: 'var(--accent)', backgroundColor: 'rgba(197, 160, 89, 0.08)' }}>
                    <div className="drawer-card-title" style={{ color: 'var(--accent)' }}>⚠️ Pipeline Warnings</div>
                    {warnings.map((w, idx) => (
                      <p key={idx} style={{ fontSize: '0.82rem', color: 'var(--text)' }}>
                        <strong>[{w.stage}]</strong>: {w.message}
                      </p>
                    ))}
                  </div>
                )}

                {/* Explanation */}
                {explanation && (
                  <div className="drawer-card">
                    <div className="drawer-card-title">Reasoning Summary</div>
                    <div style={{ fontSize: '0.88rem', color: 'var(--text)', lineHeight: 1.6 }}>
                      {explanation}
                    </div>
                  </div>
                )}

                {/* Traversed Graph Paths */}
                {evidence_paths.length > 0 && (
                  <div className="drawer-card">
                    <div className="drawer-card-title">Traversed Graph Paths (FalkorDB)</div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--muted)', marginBottom: '0.25rem' }}>
                      Exact knowledge and memory nodes traversed:
                    </div>

                    <GraphEvidenceMap paths={evidence_paths} />

                    <div className="evidence-chain">
                      {evidence_paths.map((path, pIdx) => (
                        <div key={pIdx} style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                          {path.steps.map((step, sIdx) => {
                            const isUserSaid = (step.origin || '').toLowerCase().includes('you');
                            return (
                              <div key={sIdx} className="chain-step">
                                <div className="chain-nodes">
                                  <span className="chain-node">{step.from}</span>
                                  <span className="chain-arrow">─[:{step.relation}]─▶</span>
                                  <span className="chain-node">{step.to}</span>
                                </div>
                                <span className={`chip-origin ${isUserSaid ? 'user-said' : 'curated'}`}>
                                  {step.origin}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Memories Saved / Updated This Turn */}
                {saved_memories.length > 0 && (
                  <div className="drawer-card">
                    <div className="drawer-card-title">Memories Saved / Updated This Turn</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.25rem' }}>
                      {saved_memories.map((mem) => (
                        <div key={mem.id || mem.value} className="memory-item-card">
                          <div className="memory-item-header">
                            <span className="memory-kind-tag">{mem.kind}</span>
                            <span className="memory-status-tag active">
                              {(mem.action || 'saved').toUpperCase()}
                            </span>
                          </div>
                          <div className="memory-value-text">{mem.value}</div>
                          {mem.source_text && (
                            <div className="memory-source-snippet">"{mem.source_text}"</div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Retrieved Active Memories */}
                {retrieved_memories.length > 0 && (
                  <div className="drawer-card">
                    <div className="drawer-card-title">Retrieved Active Context</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.25rem' }}>
                      {retrieved_memories.map((mem) => (
                        <div key={mem.id || mem.value} className="memory-item-card">
                          <div className="memory-item-header">
                            <span className="memory-kind-tag">{mem.kind}</span>
                            <span className="memory-status-tag active">ACTIVE</span>
                          </div>
                          <div className="memory-value-text">{mem.value}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )
          ) : (
            /* TAB 2: Saved Memories in FalkorDB */
            <div className="memories-list">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                <span style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>
                  Student: <strong style={{ color: 'var(--text)' }}>{userId}</strong>
                </span>
                <button
                  className="btn-secondary"
                  onClick={onRefreshMemories}
                  disabled={isLoadingMemories}
                  style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
                >
                  {isLoadingMemories ? 'Refreshing...' : '↻ Refresh'}
                </button>
              </div>

              {isLoadingMemories && memories.length === 0 && (
                <div style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--muted)', fontSize: '0.85rem' }}>
                  Loading FalkorDB graph memory...
                </div>
              )}

              {memoriesError && (
                <div className="drawer-card" style={{ borderColor: 'var(--danger)', backgroundColor: 'rgba(201, 107, 91, 0.1)' }}>
                  <div className="drawer-card-title" style={{ color: 'var(--danger)' }}>Failed to load memories</div>
                  <p style={{ fontSize: '0.82rem', color: '#E8A89C' }}>{memoriesError}</p>
                </div>
              )}

              {!isLoadingMemories && !memoriesError && memories.length === 0 && (
                <div style={{ textAlign: 'center', padding: '2rem 1rem', color: 'var(--muted)', fontSize: '0.85rem' }}>
                  <p>No memories stored in FalkorDB for <strong>{userId}</strong> yet.</p>
                  <p style={{ marginTop: '0.5rem', fontSize: '0.78rem' }}>
                    Share your learning preferences or challenges in the chat to populate your graph memory.
                  </p>
                </div>
              )}

              {memories.map(mem => {
                const isResolved = mem.status === 'resolved';
                return (
                  <div key={mem.id} className="memory-item-card">
                    <div className="memory-item-header">
                      <span className="memory-kind-tag">{mem.kind}</span>
                      <span className={`memory-status-tag ${isResolved ? '' : 'active'}`}>
                        {mem.status?.toUpperCase()}
                      </span>
                    </div>

                    <div
                      className="memory-value-text"
                      style={{ textDecoration: isResolved ? 'line-through' : 'none', opacity: isResolved ? 0.6 : 1 }}
                    >
                      {mem.value}
                    </div>

                    {mem.source_text && (
                      <div className="memory-source-snippet">"{mem.source_text}"</div>
                    )}

                    <div style={{ fontSize: '0.72rem', color: 'var(--muted)', marginTop: '0.2rem' }}>
                      Session: {mem.session_id || 'N/A'} • {new Date(mem.created_at).toLocaleDateString()}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
