'use client';

import React, { useState } from 'react';
import {
  FileText,
  Plus,
  MessageSquare,
  Trash2,
  RefreshCw,
  Layers,
  ChevronRight,
  Sparkles,
  UploadCloud,
  CheckCircle2,
  Clock,
  AlertTriangle,
  FolderOpen
} from 'lucide-react';
import { DocumentItem, ConversationSummary } from '../lib/api';

interface SidebarProps {
  documents: DocumentItem[];
  conversations: ConversationSummary[];
  currentConversationId: string | null;
  onSelectConversation: (id: string | null) => void;
  onDeleteConversation: (id: string) => void;
  onOpenUpload: () => void;
  onDeleteDocument: (id: string) => void;
  onReindexDocument: (id: string) => void;
  isLoadingDocs: boolean;
}

export default function Sidebar({
  documents,
  conversations,
  currentConversationId,
  onSelectConversation,
  onDeleteConversation,
  onOpenUpload,
  onDeleteDocument,
  onReindexDocument,
  isLoadingDocs,
}: SidebarProps) {
  const [activeTab, setActiveTab] = useState<'docs' | 'chats'>('docs');

  return (
    <aside className="w-80 flex-shrink-0 border-r border-slate-800/80 bg-[#0d1322]/50 flex flex-col h-[calc(100vh-4rem)]">
      {/* Top Actions */}
      <div className="p-4 border-b border-slate-800/80 space-y-2.5">
        <button
          onClick={() => onSelectConversation(null)}
          className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs transition shadow-lg shadow-indigo-500/20"
        >
          <Plus className="w-4 h-4" />
          <span>Nowa Rozmowa</span>
        </button>

        <button
          onClick={onOpenUpload}
          className="w-full flex items-center justify-center gap-2 py-2 px-4 rounded-xl bg-slate-800/80 hover:bg-slate-700/80 text-slate-200 font-medium text-xs border border-slate-700/50 transition"
        >
          <UploadCloud className="w-4 h-4 text-indigo-400" />
          <span>Dodaj Dokument</span>
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-800/80 px-4 pt-2">
        <button
          onClick={() => setActiveTab('docs')}
          className={`flex-1 pb-2.5 text-xs font-semibold flex items-center justify-center gap-1.5 border-b-2 transition ${
            activeTab === 'docs'
              ? 'border-indigo-500 text-white'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <FolderOpen className="w-3.5 h-3.5" />
          <span>Baza Wiedzy ({documents.length})</span>
        </button>
        <button
          onClick={() => setActiveTab('chats')}
          className={`flex-1 pb-2.5 text-xs font-semibold flex items-center justify-center gap-1.5 border-b-2 transition ${
            activeTab === 'chats'
              ? 'border-indigo-500 text-white'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <MessageSquare className="w-3.5 h-3.5" />
          <span>Historia ({conversations.length})</span>
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {activeTab === 'docs' ? (
          /* Documents List */
          <div>
            {documents.length === 0 ? (
              <div className="text-center py-10 px-4">
                <div className="w-12 h-12 mx-auto rounded-full bg-slate-800/60 flex items-center justify-center text-slate-400 mb-3">
                  <FileText className="w-6 h-6" />
                </div>
                <p className="text-xs font-medium text-slate-300">Brak dokumentów</p>
                <p className="text-[11px] text-slate-500 mt-1">
                  Wgraj pliki PDF, Markdown lub TXT, aby zasilić wiedzę AI.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {documents.map((doc) => {
                  const isReady = doc.status === 'indexed';
                  const isProcessing = doc.status === 'processing' || doc.status === 'uploaded';
                  const isFailed = doc.status === 'failed';

                  return (
                    <div
                      key={doc.id}
                      className="group bg-slate-900/60 hover:bg-slate-900 border border-slate-800/80 hover:border-slate-700/80 rounded-xl p-3 transition"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-start gap-2.5 overflow-hidden">
                          <div className="w-7 h-7 rounded-lg bg-indigo-500/10 text-indigo-400 flex items-center justify-center flex-shrink-0 mt-0.5">
                            <FileText className="w-3.5 h-3.5" />
                          </div>
                          <div className="truncate">
                            <h4 className="text-xs font-medium text-slate-200 truncate" title={doc.title}>
                              {doc.title}
                            </h4>
                            <div className="flex items-center gap-2 mt-1">
                              {/* Status badge */}
                              {isReady && (
                                <span className="inline-flex items-center gap-1 text-[10px] text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded-md font-medium">
                                  <CheckCircle2 className="w-2.5 h-2.5" />
                                  {doc.total_chunks} fragmentów
                                </span>
                              )}
                              {isProcessing && (
                                <span className="inline-flex items-center gap-1 text-[10px] text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded-md font-medium animate-pulse">
                                  <Clock className="w-2.5 h-2.5" />
                                  Indeksowanie...
                                </span>
                              )}
                              {isFailed && (
                                <span
                                  className="inline-flex items-center gap-1 text-[10px] text-rose-400 bg-rose-500/10 px-1.5 py-0.5 rounded-md font-medium"
                                  title={doc.error_message || 'Błąd przetwarzania'}
                                >
                                  <AlertTriangle className="w-2.5 h-2.5" />
                                  Błąd
                                </span>
                              )}
                              <span className="text-[10px] text-slate-500 uppercase font-mono">
                                {doc.file_type}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center opacity-0 group-hover:opacity-100 transition gap-1">
                          <button
                            onClick={() => onReindexDocument(doc.id)}
                            title="Przeindeksuj"
                            className="p-1 rounded text-slate-400 hover:text-indigo-400 hover:bg-slate-800 transition"
                          >
                            <RefreshCw className="w-3 h-3" />
                          </button>
                          <button
                            onClick={() => onDeleteDocument(doc.id)}
                            title="Usuń dokument"
                            className="p-1 rounded text-slate-400 hover:text-rose-400 hover:bg-slate-800 transition"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          /* Chats List */
          <div>
            {conversations.length === 0 ? (
              <div className="text-center py-10 px-4">
                <div className="w-12 h-12 mx-auto rounded-full bg-slate-800/60 flex items-center justify-center text-slate-400 mb-3">
                  <MessageSquare className="w-6 h-6" />
                </div>
                <p className="text-xs font-medium text-slate-300">Brak historii rozmów</p>
                <p className="text-[11px] text-slate-500 mt-1">Zadaj pierwsze pytanie w czacie.</p>
              </div>
            ) : (
              <div className="space-y-1.5">
                {conversations.map((conv) => {
                  const isActive = currentConversationId === conv.id;
                  return (
                    <div
                      key={conv.id}
                      onClick={() => onSelectConversation(conv.id)}
                      className={`group flex items-center justify-between p-2.5 rounded-xl cursor-pointer transition ${
                        isActive
                          ? 'bg-indigo-600/15 border border-indigo-500/30 text-white'
                          : 'bg-slate-900/40 hover:bg-slate-900/80 border border-transparent text-slate-300'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 truncate">
                        <MessageSquare className={`w-3.5 h-3.5 flex-shrink-0 ${isActive ? 'text-indigo-400' : 'text-slate-500'}`} />
                        <span className="text-xs font-medium truncate">{conv.title}</span>
                      </div>

                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteConversation(conv.id);
                        }}
                        className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded transition"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}
