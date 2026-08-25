'use client';

import React, { useEffect, useState } from 'react';
import { Brain, Database, Sparkles, Layers, Activity } from 'lucide-react';
import { api, DocumentStats } from '../lib/api';

interface NavbarProps {
  stats: DocumentStats | null;
}

export default function Navbar({ stats }: NavbarProps) {
  const [health, setHealth] = useState<{ status: string; pgvector: string; ai_provider: string } | null>(null);

  useEffect(() => {
    const checkHealth = async () => {
      try {
        const data = await api.getHealth();
        setHealth(data);
      } catch (err) {
        setHealth({ status: 'offline', pgvector: 'unknown', ai_provider: 'Gemini' });
      }
    };
    checkHealth();
    const interval = setInterval(checkHealth, 30000);
    return () => clearInterval(interval);
  }, []);

  return (
    <header className="h-16 border-b border-slate-800/80 bg-[#0d1322]/80 backdrop-blur-md px-5 flex items-center justify-between z-20">
      {/* Brand */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-purple-500 flex items-center justify-center shadow-lg shadow-indigo-500/20">
          <Brain className="w-5 h-5 text-white" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <span className="font-bold text-lg text-white tracking-tight">MindVault</span>
            <span className="text-[10px] uppercase font-semibold px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
              RAG AI
            </span>
          </div>
          <p className="text-xs text-slate-400">Twoja prywatna baza wiedzy z Google Gemini & pgvector</p>
        </div>
      </div>

      {/* Stats & Status Indicators */}
      <div className="flex items-center gap-3">
        {stats && (
          <div className="hidden sm:flex items-center gap-2 bg-slate-900/90 border border-slate-800 px-3 py-1.5 rounded-lg text-xs text-slate-300">
            <div className="flex items-center gap-1.5 pr-2 border-r border-slate-800">
              <Database className="w-3.5 h-3.5 text-indigo-400" />
              <span>
                <strong className="text-white">{stats.ready_documents}</strong> dok.
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-purple-400" />
              <span>
                <strong className="text-white">{stats.total_chunks}</strong> fragmentów
              </span>
            </div>
          </div>
        )}

        {/* Backend status pill */}
        <div className="flex items-center gap-2 bg-slate-900/90 border border-slate-800 px-3 py-1.5 rounded-lg text-xs">
          <span className="relative flex h-2 w-2">
            {health?.status === 'healthy' ? (
              <>
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </>
            ) : (
              <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
            )}
          </span>
          <span className="text-slate-300 font-medium">
            {health?.status === 'healthy' ? 'API Online' : 'Łączenie...'}
          </span>
        </div>
      </div>
    </header>
  );
}
