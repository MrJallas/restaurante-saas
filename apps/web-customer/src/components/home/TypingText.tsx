'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

interface TypingTextProps {
  text: string;
  speed?: number;
  onComplete?: () => void;
}

export function TypingText({ text, speed = 25, onComplete }: TypingTextProps) {
  const [displayedText, setDisplayedText] = useState('');
  const [isComplete, setIsComplete] = useState(false);
  const indexRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const lastTimeRef = useRef(0);

  const actualSpeed = text.length > 150 ? 15 : speed;

  const skip = useCallback(() => {
    setDisplayedText(text);
    setIsComplete(true);
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    onComplete?.();
  }, [text, onComplete]);

  useEffect(() => {
    indexRef.current = 0;
    setDisplayedText('');
    setIsComplete(false);
    lastTimeRef.current = 0;

    function animate(timestamp: number) {
      if (!lastTimeRef.current) lastTimeRef.current = timestamp;
      const elapsed = timestamp - lastTimeRef.current;

      if (elapsed >= actualSpeed) {
        lastTimeRef.current = timestamp;
        indexRef.current++;
        setDisplayedText(text.slice(0, indexRef.current));

        if (indexRef.current >= text.length) {
          setIsComplete(true);
          onComplete?.();
          return;
        }
      }

      rafRef.current = requestAnimationFrame(animate);
    }

    rafRef.current = requestAnimationFrame(animate);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [text, actualSpeed, onComplete]);

  return (
    <div className="relative">
      <p className="text-lg leading-relaxed">
        {displayedText}
        {!isComplete && (
          <span className="ml-0.5 inline-block h-5 w-0.5 animate-pulse bg-current" />
        )}
      </p>
      {!isComplete && (
        <button
          onClick={skip}
          className="mt-2 text-xs text-gray-400 underline transition-colors hover:text-gray-600"
        >
          Pular
        </button>
      )}
    </div>
  );
}
