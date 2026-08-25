'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Send, Square, Sparkles, CornerDownLeft } from 'lucide-react';

interface ChatInputProps {
  onSendMessage: (message: string) => void;
  onStop: () => void;
  isStreaming: boolean;
  disabled?: boolean;
}

const SUGGESTIONS = [
  'Podsumuj najważniejsze wnioski z moich dokumentów',
  'Wypisz kluczowe punkty i definicje',
  'Jakie są główne zagadnienia poruszone w bazie wiedzy?',
];

export default function ChatInput({ onSendMessage, onStop, isStreaming, disabled }: ChatInputProps) {
  const [input, setInput] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 180)}px`;
    }
  }, [input]);

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!input.trim() || isStreaming || disabled) return;
    onSendMessage(input.trim());
    setInput('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="p-4 md:px-8 border-t border-slate-800/80 bg-[#0d1322]/80 backdrop-blur-md">
      <div className="max-w-4xl mx-auto space-y-3">
        {/* Quick Suggestion Chips */}
        <div className="hidden sm:flex items-center gap-2 overflow-x-auto pb-1">
          {SUGGESTIONS.map((s, idx) => (
            <button
              key={idx}
              type="button"
              disabled={isStreaming || disabled}
              onClick={() => {
                setInput(s);
                textareaRef.current?.focus();
              }}
              className="text-[11px] font-medium text-slate-400 hover:text-indigo-300 bg-slate-900/80 hover:bg-indigo-500/10 border border-slate-800 hover:border-indigo-500/30 px-2.5 py-1 rounded-full whitespace-nowrap transition flex items-center gap-1.5"
            >
              <Sparkles className="w-3 h-3 text-indigo-400" />
              <span>{s}</span>
            </button>
          ))}
        </div>

        {/* Input Box */}
        <form
          onSubmit={handleSubmit}
          className="relative flex items-end bg-slate-900/90 border border-slate-800 focus-within:border-indigo-500/60 rounded-2xl p-2 shadow-xl transition"
        >
          <textarea
            ref={textareaRef}
            rows={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={disabled}
            placeholder="Zadaj pytanie dotyczące Twojej bazy wiedzy... (Enter aby wysłać, Shift+Enter nowa linia)"
            className="flex-1 bg-transparent text-slate-100 placeholder-slate-500 text-sm resize-none outline-none px-3 py-2 max-h-[180px] leading-relaxed"
          />

          <div className="flex items-center gap-2 flex-shrink-0 pb-1 pr-1">
            {isStreaming ? (
              <button
                type="button"
                onClick={onStop}
                className="w-9 h-9 rounded-xl bg-rose-600 hover:bg-rose-500 text-white flex items-center justify-center shadow-lg transition"
                title="Zatrzymaj generowanie"
              >
                <Square className="w-4 h-4 fill-white" />
              </button>
            ) : (
              <button
                type="submit"
                disabled={!input.trim() || disabled}
                className="w-9 h-9 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-30 disabled:hover:bg-indigo-600 text-white flex items-center justify-center shadow-lg shadow-indigo-500/20 transition cursor-pointer disabled:cursor-not-allowed"
                title="Wyślij zapytanie"
              >
                <Send className="w-4 h-4" />
              </button>
            )}
          </div>
        </form>

        <p className="text-[11px] text-center text-slate-500">
          MindVault analizuje wektory w PostgreSQL (pgvector) i odpowiada z pomocą Google Gemini.
        </p>
      </div>
    </div>
  );
}
