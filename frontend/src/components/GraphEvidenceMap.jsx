import React from 'react';

function nodeType(label = '') {
  if (label === 'Student' || label.startsWith('Student(')) return 'student';
  if (label.startsWith('Memory(')) return 'memory';
  if (label.startsWith('Concept(')) return 'concept';
  return 'other';
}

export default function GraphEvidenceMap({ paths = [] }) {
  const validPaths = paths.filter(path => Array.isArray(path.steps) && path.steps.length > 0);
  if (!validPaths.length) return null;

  return (
    <section className="graph-map" aria-label="Visual graph paths returned for this answer">
      <div className="graph-map-heading">
        <div>
          <div className="drawer-card-title">Graph map</div>
          <p className="graph-map-caption">Nodes and links returned in the answer’s evidence paths.</p>
        </div>
        <span className="graph-map-count">{validPaths.length} {validPaths.length === 1 ? 'path' : 'paths'}</span>
      </div>

      <div className="graph-map-paths">
        {validPaths.map((path, pathIndex) => {
          const nodes = [path.steps[0].from, ...path.steps.map(step => step.to)];
          return (
            <div className="graph-map-path" key={pathIndex}>
              <div className="graph-map-path-label">Path {pathIndex + 1}</div>
              <div className="graph-map-flow">
                {nodes.map((node, nodeIndex) => (
                  <React.Fragment key={`${pathIndex}-${nodeIndex}`}>
                    <div className={`graph-map-node graph-map-node-${nodeType(node)}`} title={node}>
                      <span className="graph-map-node-type">{nodeType(node)}</span>
                      <span className="graph-map-node-label">{node}</span>
                    </div>
                    {path.steps[nodeIndex] && (
                      <div className="graph-map-edge" key={`edge-${pathIndex}-${nodeIndex}`}>
                        <span className="graph-map-edge-line" aria-hidden="true" />
                        <span className="graph-map-edge-label">{path.steps[nodeIndex].relation}</span>
                        <span className={`graph-map-edge-origin ${(path.steps[nodeIndex].origin || '').toLowerCase().includes('you') ? 'user-said' : 'curated'}`}>
                          {path.steps[nodeIndex].origin || 'Graph'}
                        </span>
                      </div>
                    )}
                  </React.Fragment>
                ))}
              </div>
            </div>
          );
        })}
      </div>
      <div className="graph-map-legend">
        <span><i className="graph-map-legend-dot user-said" /> You said</span>
        <span><i className="graph-map-legend-dot curated" /> Curated curriculum</span>
      </div>
    </section>
  );
}
