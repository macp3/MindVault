'use client';

import React, { useState, useEffect, useRef } from 'react';
import Navbar from '../components/Navbar';
import Sidebar from '../components/Sidebar';
import ChatMessage from '../components/ChatMessage';
import ChatInput from '../components/ChatInput';
import FileUploadModal from '../components/FileUploadModal';
import {
  api,
  DocumentItem,
  DocumentStats,
  ConversationSummary,
  MessageItem,
  SourceCitation,
} from '../lib/api';
import { Brain, Sparkles, UploadCloud, FileText, ArrowRight, ShieldCheck } from 'lucide-react';

export default function Home() {
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [stats, setStats] = useState<DocumentStats | null>(null);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<MessageItem[]>([]);

  const [isLoadingDocs, setIsLoadingDocs] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [uploadModalOpen, setUploadModalOpen] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Initial load
  useEffect(() => {
    loadInitialData();
  }, []);

  const loadInitialData = async () => {
    setIsLoadingDocs(true);
    try {
      const [docsData, statsData, convsData] = await Promise.all([
        api.getDocuments().catch(() => []),
        api.getStats().catch(() => null),
        api.getConversations().catch(() => []),
      ]);
      setDocuments(docsData);
      setStats(statsData);
      setConversations(convsData);
    } finally {
      setIsLoadingDocs(false);
    }
  };

  // Poll documents for indexing status change
  useEffect(() => {
    const hasPending = documents.some(
      (d) => d.status === 'processing' || d.status === 'uploaded'
    );
    if (!hasPending) return;

    const interval = setInterval(async () => {
      try {
        const [docsData, statsData] = await Promise.all([
          api.getDocuments(),
          api.getStats(),
        ]);
        setDocuments(docsData);
        setStats(statsData);
      } catch (e) {
        console.error(e);
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [documents]);

  // Scroll to bottom on messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isStreaming]);

  // Select conversation
  const handleSelectConversation = async (id: string | null) => {
    if (isStreaming) {
      handleStop();
    }
    setCurrentConversationId(id);
    if (!id) {
      setMessages([]);
      return;
    }

    try {
      const conv = await api.getConversation(id);
      setMessages(conv.messages || []);
    } catch (err) {
      console.error('Failed to load conversation:', err);
    }
  };

  const handleDeleteConversation = async (id: string) => {
    try {
      await api.deleteConversation(id);
      setConversations((prev) => prev.filter((c) => c.id !== id));
      if (currentConversationId === id) {
        handleSelectConversation(null);
      }
    } catch (err) {
      console.error('Failed to delete conversation:', err);
    }
  };

  const handleDeleteDocument = async (id: string) => {
    if (!confirm('Czy na pewno chcesz usunąć ten dokument z bazy wiedzy?')) return;
    try {
      await api.deleteDocument(id);
      setDocuments((prev) => prev.filter((d) => d.id !== id));
      const newStats = await api.getStats();
      setStats(newStats);
    } catch (err) {
      console.error('Failed to delete document:', err);
    }
  };

  const handleReindexDocument = async (id: string) => {
    try {
      await api.reindexDocument(id);
      const docs = await api.getDocuments();
      setDocuments(docs);
    } catch (err) {
      console.error('Failed to reindex document:', err);
    }
  };

  // Send message & stream RAG response
  const handleSendMessage = async (text: string) => {
    if (isStreaming) return;

    // Append user message immediately
    const userMsg: MessageItem = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: text,
      created_at: new Date().toISOString(),
    };

    // Placeholder assistant message
    const assistantMsgId = `assistant-${Date.now()}`;
    const assistantPlaceholder: MessageItem = {
      id: assistantMsgId,
      role: 'assistant',
      content: '',
      sources: [],
      created_at: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMsg, assistantPlaceholder]);
    setIsStreaming(true);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    let accumulatedText = '';
    let latestSources: SourceCitation[] = [];

    await api.streamChat(
      text,
      currentConversationId,
      // onInit
      (data) => {
        if (!currentConversationId && data.conversation_id) {
          setCurrentConversationId(data.conversation_id);
          // Refresh conversations list
          api.getConversations().then(setConversations).catch(console.error);
        }
        if (data.sources) {
          latestSources = data.sources;
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === assistantMsgId ? { ...msg, sources: latestSources } : msg
            )
          );
        }
      },
      // onToken
      (token) => {
        accumulatedText += token;
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantMsgId
              ? { ...msg, content: accumulatedText, sources: latestSources }
              : msg
          )
        );
      },
      // onDone
      (data) => {
        setIsStreaming(false);
        abortControllerRef.current = null;
        api.getConversations().then(setConversations).catch(console.error);
      },
      // onError
      (error) => {
        setIsStreaming(false);
        accumulatedText += `\n\n*[Błąd połączenia: ${error}]*`;
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantMsgId
              ? { ...msg, content: accumulatedText, sources: latestSources }
              : msg
          )
        );
        abortControllerRef.current = null;
      },
      controller.signal
    );
  };

  const handleStop = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      setIsStreaming(false);
    }
  };

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      {/* Top Navbar */}
      <Navbar stats={stats} />

      {/* Main Workspace */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Sidebar */}
        <Sidebar
          documents={documents}
          conversations={conversations}
          currentConversationId={currentConversationId}
          onSelectConversation={handleSelectConversation}
          onDeleteConversation={handleDeleteConversation}
          onOpenUpload={() => setUploadModalOpen(true)}
          onDeleteDocument={handleDeleteDocument}
          onReindexDocument={handleReindexDocument}
          isLoadingDocs={isLoadingDocs}
        />

        {/* Chat Area */}
        <main className="flex-1 flex flex-col h-[calc(100vh-4rem)] bg-[#0b0f19] relative">
          {messages.length === 0 ? (
            /* Empty State / Welcome Screen */
            <div className="flex-1 overflow-y-auto flex items-center justify-center p-6">
              <div className="max-w-2xl text-center space-y-6 animate-in fade-in zoom-in-95 duration-300">
                <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-purple-500 flex items-center justify-center shadow-xl shadow-indigo-500/20">
                  <Brain className="w-8 h-8 text-white" />
                </div>

                <div className="space-y-2">
                  <h2 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
                    Witaj w MindVault
                  </h2>
                  <p className="text-sm text-slate-400 max-w-lg mx-auto leading-relaxed">
                    Twój inteligentny asystent bazy wiedzy. Wgraj pliki PDF, Markdown lub tekstowe, 
                    a AI przeanalizuje je semantycznie i odpowie na Twoje pytania z cytowaniem źródeł.
                  </p>
                </div>

                {/* Quick Action Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-left pt-2">
                  <div
                    onClick={() => setUploadModalOpen(true)}
                    className="p-4 rounded-2xl bg-slate-900/60 hover:bg-slate-900 border border-slate-800 hover:border-indigo-500/40 cursor-pointer transition group"
                  >
                    <div className="w-9 h-9 rounded-xl bg-indigo-500/10 text-indigo-400 flex items-center justify-center mb-3 group-hover:scale-110 transition">
                      <UploadCloud className="w-5 h-5" />
                    </div>
                    <h3 className="text-sm font-semibold text-white flex items-center justify-between">
                      <span>Wgraj Dokumenty</span>
                      <ArrowRight className="w-4 h-4 text-slate-500 group-hover:text-indigo-400 transition" />
                    </h3>
                    <p className="text-xs text-slate-400 mt-1">
                      Dodaj pliki PDF, raporty, notatki lub dokumentację do zaindeksowania.
                    </p>
                  </div>

                  <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800 text-left">
                    <div className="w-9 h-9 rounded-xl bg-purple-500/10 text-purple-400 flex items-center justify-center mb-3">
                      <Sparkles className="w-5 h-5" />
                    </div>
                    <h3 className="text-sm font-semibold text-white">Wyszukiwanie Hybrydowe</h3>
                    <p className="text-xs text-slate-400 mt-1">
                      PostgreSQL + pgvector wylicza odległości cosinusowe (Cosine Similarity) w ułamku sekundy.
                    </p>
                  </div>
                </div>

                {documents.length > 0 && (
                  <p className="text-xs text-slate-500">
                    Masz już <strong className="text-indigo-400">{documents.length}</strong> dokumentów w bazie. 
                    Napisz pytanie poniżej, aby rozpocząć rozmowę!
                  </p>
                )}
              </div>
            </div>
          ) : (
            /* Active Messages Thread */
            <div className="flex-1 overflow-y-auto">
              <div className="max-w-4xl mx-auto divide-y divide-slate-800/40">
                {messages.map((msg, idx) => (
                  <ChatMessage
                    key={msg.id || idx}
                    message={msg}
                    isStreaming={isStreaming && idx === messages.length - 1 && msg.role === 'assistant'}
                  />
                ))}
                <div ref={messagesEndRef} />
              </div>
            </div>
          )}

          {/* Bottom Chat Input */}
          <ChatInput
            onSendMessage={handleSendMessage}
            onStop={handleStop}
            isStreaming={isStreaming}
          />
        </main>
      </div>

      {/* Upload Modal */}
      <FileUploadModal
        isOpen={uploadModalOpen}
        onClose={() => setUploadModalOpen(false)}
        onUploaded={loadInitialData}
      />
    </div>
  );
}
