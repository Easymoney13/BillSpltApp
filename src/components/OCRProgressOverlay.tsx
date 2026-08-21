'use client';

import React from 'react';
import { useLanguage } from './LanguageContext';

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
      className="fixed inset-0 z-50 flex flex-col items-center justify-center p-6 bg-slate-950/80 dark:bg-[#060911]/90 backdrop-blur-xl text-white animate-fadeIn"
      dir={isRtl ? 'rtl' : 'ltr'}
    >
      <style jsx>{`
        @keyframes scanSlide {
          0% {
            transform: translateX(0);
          }
          100% {
            transform: translateX(-50%);
          }
        }
        @keyframes lensFloat {
          0%, 100% {
            transform: translateY(0) rotate(0deg);
          }
          50% {
            transform: translateY(-4px) rotate(-2deg);
          }
        }
        @keyframes trackShimmer {
          0% {
            transform: translateX(-100%);
          }
          100% {
            transform: translateX(250%);
          }
        }
        .animate-scan-slide {
          animation: scanSlide 3.5s linear infinite;
        }
        .animate-lens-float {
          animation: lensFloat 2.5s ease-in-out infinite;
        }
        .animate-track-shimmer {
          animation: trackShimmer 2s ease-in-out infinite;
        }
      `}</style>

      {/* Main Container Card */}
      <div className="w-full max-w-sm rounded-[32px] p-8 bg-white/95 dark:bg-[#0E1524]/95 border border-slate-200/80 dark:border-slate-800 shadow-2xl text-center space-y-6 flex flex-col items-center justify-center relative overflow-hidden backdrop-blur-2xl">
        
        {/* Visual Animation Area Inspired by Dribbble "Loading Search Results" */}
        <div className="relative w-full h-36 flex items-center justify-center overflow-hidden py-4">
          
          {/* Horizontal Track of Sliding Item Cards */}
          <div className="absolute inset-x-0 flex items-center justify-center overflow-hidden pointer-events-none opacity-40 dark:opacity-30 mask-radial">
            <div className="flex items-center gap-3 animate-scan-slide w-max">
              {/* Duplicate track for seamless infinite loop */}
              {[...Array(8)].map((_, i) => (
                <div
                  key={i}
                  className="w-24 h-14 rounded-xl bg-slate-200/70 dark:bg-slate-800/80 border border-slate-300 dark:border-slate-700 p-2.5 flex items-center gap-2 shrink-0 shadow-xs"
                >
                  <div className="w-4 h-4 rounded-full border-2 border-slate-400 dark:border-slate-600 shrink-0" />
                  <div className="space-y-1.5 flex-1">
                    <div className="h-1.5 w-10 bg-slate-400 dark:bg-slate-600 rounded-full" />
                    <div className="h-1.5 w-6 bg-slate-300 dark:bg-slate-700 rounded-full" />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Central Magnifying Glass with Focused Item Card */}
          <div className="relative z-10 flex flex-col items-center justify-center animate-lens-float">
            <div className="relative">
              {/* Magnifying Glass Body */}
              <div className="w-24 h-24 rounded-full border-[6px] border-slate-400/90 dark:border-slate-400 bg-white/90 dark:bg-[#141E33]/90 shadow-xl backdrop-blur-md flex items-center justify-center relative overflow-hidden ring-4 ring-slate-200/50 dark:ring-slate-700/40">
                
                {/* Internal Luminous Scan Reflection */}
                <div className="absolute inset-0 bg-gradient-to-tr from-sky-400/10 via-transparent to-white/30 pointer-events-none" />

                {/* Magnified Active Receipt Item Inside Lens */}
                <div className="w-16 h-10 rounded-lg bg-sky-50 dark:bg-sky-950/50 border-2 border-sky-400/80 p-1.5 flex items-center gap-2 shadow-sm">
                  <div className="w-4 h-4 rounded-full border-2 border-sky-500 shrink-0 bg-sky-500/10" />
                  <div className="space-y-1 flex-1">
                    <div className="h-1.5 w-7 bg-sky-500 rounded-full" />
                    <div className="h-1.5 w-4 bg-sky-400/70 rounded-full" />
                  </div>
                </div>
              </div>

              {/* Magnifying Glass Handle (Angle bottom right) */}
              <div 
                className="absolute -bottom-3 -right-3 w-8 h-4 bg-slate-400/90 dark:border-slate-400 rounded-full transform rotate-45 shadow-md border-2 border-slate-300 dark:border-slate-500"
              />
            </div>
          </div>
        </div>

        {/* Status Line */}
        <div className="space-y-3">
          <h3 className="text-base font-extrabold text-slate-800 dark:text-slate-100 tracking-tight">
            {t('ocrScanningTitle', undefined, 'Scanning receipt...')}
          </h3>

          {/* Minimalist Dribbble Progress Indicator */}
          <div className="flex items-center justify-center gap-1.5 pt-1">
            <div className="w-16 h-1.5 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden relative">
              <div className="w-8 h-full rounded-full bg-slate-400 dark:bg-slate-300 animate-track-shimmer" />
            </div>
            <div className="w-2.5 h-1.5 rounded-full bg-slate-400 dark:bg-slate-300" />
          </div>
        </div>
      </div>
    </div>
  );
}
