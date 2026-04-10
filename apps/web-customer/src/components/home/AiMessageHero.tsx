'use client';

import { useState } from 'react';
import { TypingText } from './TypingText';

interface AiMessageHeroProps {
  message: string;
  onTypingComplete?: () => void;
}

export function AiMessageHero({ message, onTypingComplete }: AiMessageHeroProps) {
  const [showContent, setShowContent] = useState(false);
  const [showDots, setShowDots] = useState(true);

  const handleComplete = () => {
    setShowContent(true);
    onTypingComplete?.();
  };

  return (
    <div className="rounded-2xl bg-white/10 p-5 backdrop-blur-sm">
      <div className="mb-2 flex items-center gap-2">
        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-accent/20">
          <svg className="h-3.5 w-3.5 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
          </svg>
        </div>
        <span className="text-xs font-medium text-white/60">Assistente do restaurante</span>
      </div>

      {showDots && !showContent && (
        <div className="flex gap-1 py-2">
          <span className="h-2 w-2 animate-bounce rounded-full bg-white/40" style={{ animationDelay: '0ms' }} />
          <span className="h-2 w-2 animate-bounce rounded-full bg-white/40" style={{ animationDelay: '150ms' }} />
          <span className="h-2 w-2 animate-bounce rounded-full bg-white/40" style={{ animationDelay: '300ms' }} />
        </div>
      )}

      <div
        className="text-white"
        onAnimationStart={() => setShowDots(false)}
      >
        {!showDots || !showContent ? (
          <TypingText
            text={message}
            onComplete={handleComplete}
          />
        ) : null}
      </div>
    </div>
  );
}
