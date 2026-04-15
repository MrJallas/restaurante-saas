'use client';

import { Sparkles, AlertCircle } from 'lucide-react';

interface ChatBubbleProps {
  role: 'user' | 'assistant' | 'blocked';
  content: string;
}

export function ChatBubble({ role, content }: ChatBubbleProps) {
  if (role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] rounded-2xl rounded-br-sm bg-accent/90 px-4 py-2.5">
          <p className="text-sm text-white">{content}</p>
        </div>
      </div>
    );
  }

  if (role === 'blocked') {
    return (
      <div className="flex gap-2">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-yellow-500/20">
          <AlertCircle className="h-4 w-4 text-yellow-400" />
        </div>
        <div className="max-w-[80%] rounded-2xl rounded-bl-sm bg-yellow-500/10 px-4 py-2.5">
          <p className="text-sm text-yellow-200/80">{content}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-2">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent/20">
        <Sparkles className="h-4 w-4 text-accent" />
      </div>
      <div className="max-w-[80%] rounded-2xl rounded-bl-sm bg-white/10 px-4 py-2.5">
        <p className="text-sm leading-relaxed text-white/80">{content}</p>
      </div>
    </div>
  );
}
