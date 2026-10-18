import React from 'react';

export default function EvidenceInspector({ currentTurnData }) {
  const {
    explanation,
    evidence_paths = [],
    saved_memories = [],
    retrieved_memories = [],
    warnings = []
  } = currentTurnData || {};

  const hasData = explanation || evidence_paths.length > 0 || saved_memories.length > 0 || retrieved_memories.length > 0;

  return (
    <div className="panel evidence-panel">
      <div className="panel-header">
        <span className="panel-title">
          <span>🧠</span> Why this answer? (Graph Evidence)
        </span>
      </div>

      <div className="panel-content">
        {!hasData ? (
          <div className="empty-state">
            <p>No evidence was returned.</p>
            <p style={{ marginTop: '0.5rem', fontSize: '0.8rem' }}>
              Send a message to see the FalkorDB graph traversal and reasoning steps behind the response.
            </p>
          </div>
        ) : (
          <>
            {/* Warnings banner if any stage generated a warning */}
            {warnings.length > 0 && (
              <div className="evidence-card" style={{ borderColor: 'var(--accent-amber)', background: 'rgba(245, 158, 11, 0.08)' }}>
                <div className="evidence-title" style={{ color: 'var(--accent-amber)' }}>⚠️ Pipeline Warnings</div>
                {warnings.map((w, idx) => (
                  <p key={idx} style={{ fontSize: '0.85rem', color: '#fde68a' }}>
                    <strong>[{w.stage}]</strong>: {w.message}
                  </p>
                ))}
              </div>
            )}

            {/* Explanation from deterministic template */}
            {explanation && (
              <div className="evidence-card">
                <div className="evidence-title">Deterministic Retrieval Explanation</div>
                <div className="explanation-text">{explanation}</div>
              </div>
            )}

            {/* Real graph traversal paths */}
            {evidence_paths.length > 0 && (
              <div className="evidence-card">
                <div className="evidence-title">Graph Traversal Steps</div>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
                  Real paths traversed in FalkorDB (never fabricated):
                </p>
                {evidence_paths.map((path, pIdx) => (
                  <div key={pIdx} className="path-step-flow">
                    {path.steps.map((step, sIdx) => {
                      const originClass = (step.origin || '').toLowerCase().includes('you')
                        ? 'user-said'
                        : 'curated';
                      const fromClass = step.from === 'Student' ? 'node-student' : step.from.startsWith('Memory(') ? 'node-memory' : step.from.startsWith('Concept(') ? 'node-concept' : 'node-term';
                      const toClass = step.to === 'Student' ? 'node-student' : step.to.startsWith('Memory(') ? 'node-memory' : step.to.startsWith('Concept(') ? 'node-concept' : 'node-term';
                      return (
                        <div key={sIdx} className="path-step">
                          <span className={`path-node ${fromClass}`}>{step.from}</span>
                          <span className="path-relation">─[:{step.relation}]─▶</span>
                          <span className={`path-node ${toClass}`}>{step.to}</span>
                          <span className={`origin-badge ${originClass}`}>
                            {step.origin}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            )}

            {/* Memories modified or created this turn */}
            {saved_memories.length > 0 && (
              <div className="evidence-card">
                <div className="evidence-title">Memories Saved / Updated This Turn</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.5rem' }}>
                  {saved_memories.map((mem) => {
                    const kindClass = (mem.kind || '').toLowerCase();
                    const actionClass = (mem.action || 'created').toLowerCase();
                    return (
                      <div key={mem.id} className="memory-card">
                        <div className="memory-card-header">
                          <span className={`kind-badge ${kindClass}`}>{mem.kind}</span>
                          <span className={`action-badge ${actionClass}`}>
                            {mem.action?.replace('_', ' ').toUpperCase()}
                          </span>
                        </div>
                        <div className="memory-value">{mem.value}</div>
                        {mem.source_text && (
                          <div className="memory-source">"{mem.source_text}"</div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Retrieved memories that influenced the prompt */}
            {retrieved_memories.length > 0 && (
              <div className="evidence-card">
                <div className="evidence-title">Retrieved Active Context</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.5rem' }}>
                  {retrieved_memories.map((mem) => {
                    const kindClass = (mem.kind || '').toLowerCase();
                    return (
                      <div key={mem.id} className="memory-card">
                        <div className="memory-card-header">
                          <span className={`kind-badge ${kindClass}`}>{mem.kind}</span>
                          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>active</span>
                        </div>
                        <div className="memory-value">{mem.value}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
