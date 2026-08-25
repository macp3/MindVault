'use client';

import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { User, Sparkles, Copy, Check, ChevronDown, ChevronUp, FileText, ExternalLink } from 'lucide-react';
import { MessageItem, SourceCitation } from '../lib/api';

interface ChatMessageProps {
  message: MessageItem;
  isStreaming?: boolean;
}

export default function ChatMessage({ message, isStreaming }: ChatMessageProps) {
  const isUser = message.role === 'user';
  const [copied, setCopied] = useState(false);
  const [sourcesOpen, setSourcesOpen] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      className={`py-6 px-4 md:px-8 flex gap-4 ${
        isUser ? 'bg-transparent' : 'bg-slate-900/40 border-y border-slate-800/40'
      }`}
    >
      {/* Avatar */}
      <div
        className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 text-white shadow-md ${
          isUser
            ? 'bg-slate-700'
            : 'bg-gradient-to-tr from-indigo-600 via-indigo-500 to-purple-500 shadow-indigo-500/20'
        }`}
      >
        {isUser ? <User className="w-4 h-4" /> : <Sparkles className="w-4 h-4" />}
      </div>

      {/* Content Body */}
      <div className="flex-1 space-y-3 overflow-hidden">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-slate-300">
            {isUser ? 'Ty' : 'MindVault AI'}
          </span>
          {!isUser && !isStreaming && message.content && (
            <button
              onClick={handleCopy}
              className="text-slate-400 hover:text-white p-1 rounded-md hover:bg-slate-800 transition flex items-center gap-1 text-[11px]"
              title="Kopiuj odpowiedź"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-emerald-400">Skopiowano</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>Kopiuj</span>
                </>
              )}
            </button>
          )}
        </div>

        {/* Markdown Message Text */}
        <div className="markdown-body text-slate-200">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {message.content || (isStreaming ? '...' : '')}
          </ReactMarkdown>
          {isStreaming && (
            <span className="inline-block w-2 h-4 bg-indigo-500 animate-pulse ml-1 align-middle" />
          )}
        </div>

        {/* Citations / Sources Accordion */}
        {!isUser && message.sources && message.sources.length > 0 && (
          <div className="pt-2">
            <button
              onClick={() => setSourcesOpen(!sourcesOpen)}
              className="inline-flex items-center gap-2 text-xs font-semibold text-indigo-400 hover:text-indigo-300 bg-indigo-500/10 hover:bg-indigo-500/15 border border-indigo-500/20 px-3 py-1.5 rounded-lg transition"
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Cytowane źródła ({message.sources.length})</span>
              {sourcesOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>

            {sourcesOpen && (
              <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2 animate-in fade-in duration-200">
                {message.sources.map((src, idx) => (
                  <div
                    key={idx}
                    className="p-3 bg-slate-900 border border-slate-800 rounded-xl text-xs space-y-1.5 shadow-sm"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-slate-200 truncate flex items-center gap-1.5" title={src.document_title}>
                        <FileText className="w-3.5 h-3.5 text-indigo-400 flex-shrink-0" />
                        <span className="truncate">{src.document_title}</span>
                      </span>
                      <span className="text-[10px] bg-emerald-500/10 text-emerald-400 font-mono px-1.5 py-0.5 rounded border border-emerald-500/20 flex-shrink-0">
                        {Math.round(src.similarity_score * 100)}% zgodności
                      </span>
                    </div>

                    {src.page_number && (
                      <p className="text-[11px] text-slate-400 font-mono">
                        Strona: {src.page_number} | Fragment #{src.chunk_index}
                      </p>
                    )}

                    <p className="text-[11px] text-slate-300 bg-slate-950/60 p-2 rounded-lg border border-slate-800/80 line-clamp-3 italic">
                      "{src.snippet}"
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
