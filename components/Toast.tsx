'use client';

import React, { useEffect } from 'react';
import { Info } from 'lucide-react';

interface ToastProps {
  message: string | null;
  onClose: () => void;
  duration?: number;
}

export const Toast: React.FC<ToastProps> = ({ message, onClose, duration = 3000 }) => {
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => {
      onClose();
    }, duration);

    return () => clearTimeout(timer);
  }, [message, duration, onClose]);

  if (!message) return null;

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 w-11/12 max-w-sm bg-zinc-900/95 text-zinc-100 border border-blue-500/50 p-3.5 rounded-2xl shadow-2xl backdrop-blur-md flex items-center space-x-3 animate-slide-up">
      <div className="w-8 h-8 rounded-xl bg-blue-500/20 flex items-center justify-center text-blue-400 shrink-0">
        <Info className="w-4 h-4" />
      </div>
      <p className="text-xs font-bold leading-snug flex-1">{message}</p>
    </div>
  );
};
