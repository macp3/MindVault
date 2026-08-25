import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'MindVault — AI Knowledge Base & Second Brain',
  description: 'Inteligentna baza wiedzy RAG zasilana przez Google Gemini i PostgreSQL pgvector',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pl" className="dark">
      <body className="bg-[#0b0f19] text-slate-100 min-h-screen flex flex-col antialiased selection:bg-indigo-500 selection:text-white">
        {children}
      </body>
    </html>
  );
}
