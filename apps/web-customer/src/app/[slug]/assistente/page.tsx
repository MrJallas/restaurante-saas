'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams } from 'next/navigation';
import { Send, Loader2, Sparkles } from 'lucide-react';
import { apiPost, apiGet } from '../../../lib/api';
import { useSession } from '../../../hooks/useSession';
import { AppShell } from '../../../components/layout/AppShell';
import { ChatBubble } from '../../../components/assistente/ChatBubble';
import { SuggestionChips } from '../../../components/assistente/SuggestionChips';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'blocked';
  content: string;
}

interface SendResponse {
  response: string;
  wasBlocked: boolean;
  blockReason?: string;
  suggestions?: string[];
}

const DEFAULT_SUGGESTIONS = [
  'Qual o prato do dia?',
  'Recomende uma bebida',
  'Quais sobremesas tem?',
  'Opcoes sem glutem',
  'Mais pedidos do restaurante',
];

export default function AssistentePage() {
  const params = useParams();
  const session = useSession();
  const slug = params.slug as string;

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>(DEFAULT_SUGGESTIONS);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Load history on mount
  useEffect(() => {
    if (!slug) return;
    const load = async () => {
      try {
        const res = await apiGet<{ messages: { role: string; content: string }[] }>(
          `/${slug}/assistant/history`,
        );
        if (res.messages.length > 0) {
          setMessages(
            res.messages.map((m, i) => ({
              id: `history-${i}`,
              role: m.role as 'user' | 'assistant',
              content: m.content,
            })),
          );
        }
      } catch {
        // silently fail
      }
    };
    load();
  }, [slug]);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = async (text: string) => {
    if (!text.trim() || loading) return;

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: text.trim(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const res = await apiPost<SendResponse>(`/${slug}/assistant/message`, {
        message: text.trim(),
        customerId: session.customerId || undefined,
      });

      const aiMsg: ChatMessage = {
        id: `ai-${Date.now()}`,
        role: res.wasBlocked ? 'blocked' : 'assistant',
        content: res.response,
      };
      setMessages((prev) => [...prev, aiMsg]);

      if (res.suggestions) {
        setSuggestions(res.suggestions);
      }
    } catch {
      const errorMsg: ChatMessage = {
        id: `error-${Date.now()}`,
        role: 'assistant',
        content: 'Desculpe, estou com dificuldade no momento. Tente novamente.',
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(input);
  };

  return (
    <AppShell
      slug={slug}
      restaurantName=""
      logoUrl={null}
      tableLabel={session.tableLabel || ''}
    >
      <div className="flex h-[calc(100vh-8rem)] flex-col">
        {/* Header */}
        <div className="mb-3 flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-accent" />
          <h1 className="font-hero text-lg font-bold text-white">Assistente</h1>
        </div>

        {/* Messages */}
        <div className="flex-1 space-y-3 overflow-y-auto pb-4">
          {messages.length === 0 && (
            <div className="py-8 text-center">
              <Sparkles className="mx-auto mb-3 h-10 w-10 text-accent/40" />
              <p className="text-sm text-white/50">
                Ola! Sou o assistente do restaurante.
              </p>
              <p className="mt-1 text-xs text-white/30">
                Posso recomendar pratos, informar ingredientes e mais.
              </p>
            </div>
          )}

          {messages.map((msg) => (
            <ChatBubble key={msg.id} role={msg.role} content={msg.content} />
          ))}

          {loading && (
            <div className="flex gap-2">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent/20">
                <Sparkles className="h-4 w-4 text-accent" />
              </div>
              <div className="rounded-2xl rounded-bl-sm bg-white/10 px-4 py-3">
                <div className="flex gap-1">
                  <div className="h-2 w-2 animate-bounce rounded-full bg-white/40" />
                  <div className="h-2 w-2 animate-bounce rounded-full bg-white/40 [animation-delay:0.15s]" />
                  <div className="h-2 w-2 animate-bounce rounded-full bg-white/40 [animation-delay:0.3s]" />
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Suggestions */}
        {messages.length <= 2 && (
          <div className="mb-3">
            <SuggestionChips
              suggestions={suggestions}
              onSelect={(text) => sendMessage(text)}
            />
          </div>
        )}

        {/* Input */}
        <form onSubmit={handleSubmit} className="flex gap-2">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Pergunte sobre o cardapio..."
            disabled={loading}
            className="flex-1 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-white/30 focus:border-accent/50 focus:outline-none disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="flex items-center justify-center rounded-xl bg-accent px-4 py-3 text-white transition-opacity hover:opacity-90 disabled:opacity-30"
          >
            {loading ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Send className="h-5 w-5" />
            )}
          </button>
        </form>
      </div>
    </AppShell>
  );
}
