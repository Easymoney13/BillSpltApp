'use client';

import React from 'react';
import { useLanguage } from './LanguageContext';
import { ThinkingPandaIllustration } from './PandaIllustrations';

interface OCRProgressOverlayProps {
  isVisible: boolean;
  onComplete?: () => void;
}

export function OCRProgressOverlay({ isVisible }: OCRProgressOverlayProps) {
  const { t, isRtl } = useLanguage();

  if (!isVisible) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={t('ocrScanningTitle', undefined, 'Scanning receipt...')}
      className="fixed inset-0 z-50 flex flex-col items-center justify-center p-6 bg-slate-950/85 backdrop-blur-xl text-white animate-fadeIn"
      dir={isRtl ? 'rtl' : 'ltr'}
    >
      <style jsx>{`
        @keyframes trackShimmer {
          0% {
            transform: translateX(-100%);
          }
          100% {
            transform: translateX(250%);
          }
        }
        .animate-track-shimmer {
          animation: trackShimmer 2s ease-in-out infinite;
        }
      `}</style>

      {/* Main Container - Clean floating icon without heavy background card */}
      <div className="w-full max-w-xs flex flex-col items-center justify-center text-center space-y-4">
        {/* Thinking Panda Loading Icon (Pic 5) */}
        <div className="relative w-full flex items-center justify-center">
          <ThinkingPandaIllustration className="w-48 h-44 drop-shadow-2xl" />
        </div>

        {/* Status Line */}
        <div className="space-y-2.5 w-full">
          <h3 className="text-base font-semibold text-white tracking-tight">
            {t('ocrScanningTitle', undefined, 'Scanning receipt...')}
          </h3>

          {/* Minimalist Shimmer Progress Indicator */}
          <div className="flex items-center justify-center gap-1.5 pt-1">
            <div className="w-24 h-1.5 rounded-full bg-white/20 overflow-hidden relative">
              <div className="w-12 h-full rounded-full bg-violet-400 animate-track-shimmer" />
            </div>
            <div className="w-2 h-1.5 rounded-full bg-violet-400" />
          </div>
        </div>
      </div>
    </div>
  );
}
