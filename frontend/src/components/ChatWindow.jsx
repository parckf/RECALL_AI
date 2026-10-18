import React, { useState, useRef, useEffect } from 'react';

export default function ChatWindow({
  messages,
  isLoading,
  onSendMessage,
  onRetryLastMessage
}) {
  const [inputText, setInputText] = useState('');
  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleSubmit = () => {
    const trimmed = inputText.trim();
    if (!trimmed || isLoading) return;
    onSendMessage(trimmed);
    setInputText('');
  };

  const lastMessage = messages[messages.length - 1];
  const hasError = lastMessage?.isError;

  return (
    <div className="panel chat-panel">
      <div className="panel-header">
        <span className="panel-title">
          <span>💬</span> Interactive Tutoring Chat
        </span>
      </div>

      <div className="chat-messages">
        {messages.map((msg, idx) => (
          <div
            key={idx}
            className={`chat-bubble ${msg.role} ${msg.isError ? 'error' : ''}`}
          >
            {msg.text}
          </div>
        ))}

        {isLoading && (
          <div className="chat-bubble assistant">
            <em>Analyzing graph memory and reasoning...</em>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {hasError && (
        <div style={{ padding: '0 1rem 0.5rem 1rem', display: 'flex', justifyContent: 'flex-end' }}>
          <button
            className="btn-secondary"
            onClick={onRetryLastMessage}
            disabled={isLoading}
            style={{ borderColor: 'var(--accent-rose)', color: 'var(--accent-rose)' }}
          >
            🔄 Retry last request
          </button>
        </div>
      )}

      <div className="chat-input-area">
        <textarea
          ref={textareaRef}
          className="chat-textarea"
          placeholder="Ask a question or state what you're learning (e.g. 'I struggle with recursion', 'What is recursion?')..."
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isLoading}
          rows={2}
        />
        <div className="chat-input-controls">
          <span className="input-hint">
            <strong>Enter</strong> to send, <strong>Shift+Enter</strong> for newline
          </span>
          <button
            className="btn-primary"
            onClick={handleSubmit}
            disabled={!inputText.trim() || isLoading}
          >
            {isLoading ? 'Sending...' : 'Send Message'}
          </button>
        </div>
      </div>
    </div>
  );
}
