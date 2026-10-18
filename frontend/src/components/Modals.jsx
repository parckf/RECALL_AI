import React, { useState, useEffect, useRef } from 'react';

export function RenameModal({
  isOpen,
  initialTitle = '',
  onSave,
  onClose
}) {
  const [title, setTitle] = useState(initialTitle);
  const inputRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      setTitle(initialTitle);
      setTimeout(() => inputRef.current?.select(), 50);
    }
  }, [isOpen, initialTitle]);

  if (!isOpen) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    const trimmed = title.trim();
    if (trimmed) {
      onSave(trimmed);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="rename-title">
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        <h3 id="rename-title" className="modal-title">Rename Chat</h3>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <input
            ref={inputRef}
            type="text"
            className="modal-input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Enter chat title..."
            maxLength={120}
            required
            autoFocus
          />
          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={!title.trim()}>
              Save
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function DeleteModal({
  isOpen,
  sessionTitle = '',
  onConfirm,
  onClose
}) {
  if (!isOpen) return null;

  return (
    <div className="modal-backdrop" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="delete-title">
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        <h3 id="delete-title" className="modal-title">Delete Chat?</h3>
        <p style={{ fontSize: '0.88rem', color: 'var(--muted)', lineHeight: 1.5 }}>
          Are you sure you want to delete <strong style={{ color: 'var(--text)' }}>"{sessionTitle || 'this chat'}"</strong>? This will permanently remove the conversation history from Supabase. (Your FalkorDB graph memory remains untouched).
        </p>
        <div className="modal-actions" style={{ marginTop: '0.5rem' }}>
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn-danger" onClick={onConfirm}>
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

export function GeminiKeyModal({ isOpen, onSave, onClear, onClose, hasKey }) {
  const [key, setKey] = useState("");
  const inputRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      setKey("");
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  if (!isOpen) return null;
  const handleSubmit = (event) => {
    event.preventDefault();
    if (key.trim()) onSave(key.trim());
  };

  return (
    <div className="modal-backdrop" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="gemini-key-title">
      <div className="modal-box" onClick={event => event.stopPropagation()}>
        <h3 id="gemini-key-title" className="modal-title">Connect Gemini</h3>
        <p style={{ fontSize: "0.88rem", color: "var(--muted)", lineHeight: 1.5 }}>
          Paste your own Gemini API key. It is kept in this browser tab's session storage and sent directly to Google. Do not use a shared or production key on a public site.
        </p>
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <input ref={inputRef} type="password" className="modal-input" value={key} onChange={event => setKey(event.target.value)} placeholder={hasKey ? "Key already set for this tab; enter a replacement" : "Gemini API key"} autoComplete="off" />
          <div className="modal-actions">
            {hasKey && <button type="button" className="btn-secondary" onClick={onClear}>Clear key</button>}
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={!key.trim()}>Save key</button>
          </div>
        </form>
      </div>
    </div>
  );
}
