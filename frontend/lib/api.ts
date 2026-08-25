export interface DocumentItem {
  id: string;
  title: string;
  filename: string;
  file_type: string;
  file_size: number;
  status: 'uploaded' | 'processing' | 'indexed' | 'failed';
  error_message?: string | null;
  total_chunks: number;
  created_at: string;
  updated_at: string;
}

export interface DocumentStats {
  total_documents: number;
  ready_documents: number;
  total_chunks: number;
  total_size_bytes: number;
}

export interface SourceCitation {
  chunk_id?: string;
  document_id: string;
  document_title: string;
  chunk_index: number;
  page_number?: number | null;
  similarity_score: number;
  snippet: string;
}

export interface MessageItem {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  sources?: SourceCitation[];
  created_at: string;
}

export interface ConversationSummary {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  message_count: number;
}

export interface ConversationDetail {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  messages: MessageItem[];
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000/api/v1';

export const api = {
  // Health
  async getHealth() {
    const res = await fetch(`${API_BASE}/health`);
    if (!res.ok) throw new Error('Health check failed');
    return res.json();
  },

  // Documents
  async getDocuments(): Promise<DocumentItem[]> {
    const res = await fetch(`${API_BASE}/documents`);
    if (!res.ok) throw new Error('Failed to fetch documents');
    return res.json();
  },

  async getStats(): Promise<DocumentStats> {
    const res = await fetch(`${API_BASE}/documents/stats`);
    if (!res.ok) throw new Error('Failed to fetch stats');
    return res.json();
  },

  async uploadDocument(file: File): Promise<DocumentItem> {
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch(`${API_BASE}/documents/upload`, {
      method: 'POST',
      body: formData,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || 'Failed to upload document');
    }
    return res.json();
  },

  async deleteDocument(id: string): Promise<void> {
    const res = await fetch(`${API_BASE}/documents/${id}`, {
      method: 'DELETE',
    });
    if (!res.ok) throw new Error('Failed to delete document');
  },

  async reindexDocument(id: string): Promise<DocumentItem> {
    const res = await fetch(`${API_BASE}/documents/${id}/reindex`, {
      method: 'POST',
    });
    if (!res.ok) throw new Error('Failed to reindex document');
    return res.json();
  },

  // Conversations & Chat
  async getConversations(): Promise<ConversationSummary[]> {
    const res = await fetch(`${API_BASE}/chat/conversations`);
    if (!res.ok) throw new Error('Failed to fetch conversations');
    return res.json();
  },

  async getConversation(id: string): Promise<ConversationDetail> {
    const res = await fetch(`${API_BASE}/chat/conversations/${id}`);
    if (!res.ok) throw new Error('Failed to fetch conversation detail');
    return res.json();
  },

  async deleteConversation(id: string): Promise<void> {
    const res = await fetch(`${API_BASE}/chat/conversations/${id}`, {
      method: 'DELETE',
    });
    if (!res.ok) throw new Error('Failed to delete conversation');
  },

  // Stream Chat SSE
  async streamChat(
    message: string,
    conversationId?: string | null,
    onInit?: (data: { conversation_id: string; sources: SourceCitation[] }) => void,
    onToken?: (token: string) => void,
    onDone?: (data: { message_id: string; conversation_id: string }) => void,
    onError?: (error: string) => void,
    signal?: AbortSignal
  ) {
    try {
      const response = await fetch(`${API_BASE}/chat/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message,
          conversation_id: conversationId || undefined,
        }),
        signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('Response body is null');

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data: ')) continue;
          const jsonStr = trimmed.replace('data: ', '');
          try {
            const parsed = JSON.parse(jsonStr);
            if (parsed.type === 'init' && onInit) {
              onInit(parsed);
            } else if (parsed.type === 'token' && onToken) {
              onToken(parsed.content);
            } else if (parsed.type === 'done' && onDone) {
              onDone(parsed);
            } else if (parsed.type === 'error' && onError) {
              onError(parsed.content);
            }
          } catch (e) {
            console.error('SSE parse error:', e, jsonStr);
          }
        }
      }
    } catch (err: any) {
      if (err.name !== 'AbortError' && onError) {
        onError(err.message || 'Stream connection failed');
      }
    }
  },
};
