import React, { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';

const SUGGESTIONS = [
  "I'm learning Python, struggle with recursion, and prefer small examples.",
  "Can you explain how recursion works?",
  "I no longer struggle with recursion, but generators confuse me."
];

export default function ChatArea({
  messages = [],
  isLoading = false,
  inputText: externalInputText,
  onInputChange,
  onSendMessage,
  onStop,
  onRetry,
  onOpenEvidence,
  demoUserLabel = 'Student',
  inputRef
}) {
  const [localInput, setLocalInput] = useState('');
  const inputText = externalInputText !== undefined ? externalInputText : localInput;
  const setInputText = onInputChange || setLocalInput;

  const [copiedIndex, setCopiedIndex] = useState(null);
  const threadEndRef = useRef(null);
  const localTextareaRef = useRef(null);
  const textareaRef = inputRef || localTextareaRef;

  // Auto scroll to bottom of thread
  useEffect(() => {
    if (messages.length > 0) {
      threadEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isLoading]);

  // Auto-grow textarea
  const adjustTextareaHeight = () => {
    const el = textareaRef.current;
    if (el) {
      el.style.height = 'auto';
      el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
    }
  };

  const handleTextChange = (e) => {
    setInputText(e.target.value);
    adjustTextareaHeight();
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      if (isLoading && onStop) {
        e.preventDefault();
        e.stopPropagation();
        onStop();
        return;
      }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleSend = (textToSend) => {
    const text = (textToSend || inputText).trim();
    if (!text || isLoading) return;
    onSendMessage(text);
    setInputText('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  const handleCopyMessage = async (text, idx) => {
    try {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(text);
        setCopiedIndex(idx);
        setTimeout(() => setCopiedIndex(null), 2000);
      }
    } catch {
      // Fallback
    }
  };

  // Helper to extract first name or clean label
  const cleanName = demoUserLabel.split(' ')[0] || 'there';
  const isThreadEmpty = messages.length === 0;

  return (
    <section className="chat-center" aria-label="Main chat area">
      {isThreadEmpty ? (
        /* Empty State / Welcome Home Screen */
        <div className="empty-chat-state">
          <h1 className="greeting-text">
            Hey there, <span className="user-highlight">{cleanName}</span>
          </h1>

          <div className="empty-composer-container">
            <div className="composer-card">
              <textarea
                ref={textareaRef}
                className="composer-textarea"
                placeholder="Ask anything or continue studying..."
                value={inputText}
                onChange={handleTextChange}
                onKeyDown={handleKeyDown}
                rows={2}
                aria-label="Message composer"
              />
              <div className="composer-footer">
                <span className="composer-hint">
                  {isLoading ? 'Esc to stop' : 'Enter to send, Shift+Enter for newline'}
                </span>
                {isLoading ? (
                  <button
                    className="btn-stop"
                    onClick={onStop}
                    aria-label="Stop generation"
                    title="Stop response (Esc)"
                    type="button"
                  >
                    <span className="btn-stop-icon">■</span>
                    <span className="btn-stop-label">Stop</span>
                  </button>
                ) : (
                  <button
                    className="btn-send"
                    onClick={() => handleSend()}
                    disabled={!inputText.trim() || isLoading}
                    aria-label="Send message"
                    title="Send message"
                  >
                    ↑
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Suggestion Chips */}
          <div className="suggestion-chips-grid">
            {SUGGESTIONS.map((suggestion, idx) => (
              <button
                key={idx}
                className="suggestion-chip"
                onClick={() => handleSend(suggestion)}
                title="Send this prompt"
                disabled={isLoading}
              >
                {suggestion}
              </button>
            ))}
          </div>
        </div>
      ) : (
        /* Active Conversation Thread */
        <>
          <div className="thread-container">
            <div className="thread-inner">
              {messages.map((msg, idx) => {
                const isUser = msg.role === 'user';
                const turnData = msg.turn;
                const savedMemories = turnData?.saved_memories || [];

                return (
                  <div
                    key={idx}
                    className={`message-row ${isUser ? 'user' : 'assistant'}`}
                  >
                    <div className={`message-bubble ${isUser ? 'user' : 'assistant'}`}>
                      {isUser ? (
                        msg.text
                      ) : (
                        <div className="markdown-body">
                          <ReactMarkdown>{msg.text}</ReactMarkdown>
                        </div>
                      )}
                    </div>

                    {/* Muted note under user message if stopped */}
                    {isUser && msg.stoppedNote && (
                      <div className="stopped-note">
                        {msg.stoppedNote}
                      </div>
                    )}

                    {/* Assistant Footer with memory badges, copy button, and evidence trigger */}
                    {!isUser && !msg.isError && (
                      <div className="assistant-footer">
                        {/* Inline Memory Badge */}
                        {savedMemories.length > 0 && (
                          <div className="inline-memory-badge" title="FalkorDB graph memory updated">
                            <span>🧠</span>
                            <span>
                              {savedMemories[0].action === 'resolved'
                                ? `Updated: ${savedMemories[0].value} resolved`
                                : `Remembered: ${savedMemories[0].value}`}
                            </span>
                          </div>
                        )}

                        <div className="assistant-actions">
                          {/* Copy Markdown button */}
                          <button
                            className="btn-action-pill"
                            onClick={() => handleCopyMessage(msg.text, idx)}
                            title="Copy reply to clipboard"
                            aria-label="Copy reply"
                          >
                            <span>{copiedIndex === idx ? '✓' : '⧉'}</span>
                            <span>{copiedIndex === idx ? 'Copied' : 'Copy'}</span>
                          </button>

                          {/* "Why this answer?" Evidence Drawer Trigger */}
                          {turnData && (
                            <button
                              className="btn-action-pill evidence"
                              onClick={() => onOpenEvidence(turnData)}
                              title="Inspect FalkorDB graph reasoning steps"
                            >
                              <span>🔍</span>
                              <span>Why this answer?</span>
                            </button>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Error display with retry */}
                    {msg.isError && (
                      <div className="error-bubble" role="alert">
                        <span>{msg.text}</span>
                        {onRetry && (
                          <button
                            className="btn-retry"
                            onClick={onRetry}
                            disabled={isLoading}
                          >
                            Retry
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Typing / Reasoning Indicator */}
              {isLoading && (
                <div className="message-row assistant">
                  <div className="typing-indicator" aria-live="polite">
                    <span>Reasoning with FalkorDB graph memory</span>
                    <span className="typing-dots">
                      <span className="typing-dot" />
                      <span className="typing-dot" />
                      <span className="typing-dot" />
                    </span>
                  </div>
                </div>
              )}

              <div ref={threadEndRef} />
            </div>
          </div>

          {/* Sticky Bottom Floating Composer */}
          <div className="bottom-composer-wrapper">
            <div className="composer-card">
              <textarea
                ref={textareaRef}
                className="composer-textarea"
                placeholder="Reply to RecallAI..."
                value={inputText}
                onChange={handleTextChange}
                onKeyDown={handleKeyDown}
                rows={1}
                aria-label="Reply composer"
              />
              <div className="composer-footer">
                <span className="composer-hint">
                  {isLoading ? 'Esc to stop' : 'Enter to send, Shift+Enter for newline'}
                </span>
                {isLoading ? (
                  <button
                    className="btn-stop"
                    onClick={onStop}
                    aria-label="Stop generation"
                    title="Stop response (Esc)"
                    type="button"
                  >
                    <span className="btn-stop-icon">■</span>
                    <span className="btn-stop-label">Stop</span>
                  </button>
                ) : (
                  <button
                    className="btn-send"
                    onClick={() => handleSend()}
                    disabled={!inputText.trim() || isLoading}
                    aria-label="Send message"
                    title="Send message"
                  >
                    ↑
                  </button>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
