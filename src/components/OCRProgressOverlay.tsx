'use client';

import React, { useState, useEffect } from 'react';
import { Sparkles, Scan, FileText, CheckCircle2 } from 'lucide-react';
import { useLanguage } from './LanguageContext';

interface OCRProgressOverlayProps {
  isVisible: boolean;
  onComplete?: () => void;
}

export function OCRProgressOverlay({ isVisible }: OCRProgressOverlayProps) {
  const { t, isRtl, currency } = useLanguage();
  const [stageIndex, setStageIndex] = useState(0);

  const stages = [
    t('ocrStage1', undefined, 'Preparing receipt...'),
    t('ocrStage2', undefined, 'Reading items and prices...'),
    t('ocrStage3', undefined, 'Checking receipt totals...'),
  ];

  useEffect(() => {
    if (!isVisible) {
      setStageIndex(0);
      return;
    }

    const interval = setInterval(() => {
      setStageIndex((prev) => Math.min(prev + 1, stages.length - 1));
    }, 1800);

    return () => clearInterval(interval);
  }, [isVisible, stages.length]);

  if (!isVisible) return null;

  const currencySymbol = currency === 'USD' ? '$' : '₪';

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={stages[stageIndex]}
      className="fixed inset-0 z-50 flex flex-col items-center justify-center p-5 bg-[#070A12]/92 backdrop-blur-2xl text-white animate-fadeIn"
    >
      {/* Ambient background neon glow */}
      <div className="absolute w-72 h-72 rounded-full bg-gradient-to-tr from-white/10 to-slate-500/10 blur-3xl pointer-events-none animate-ambientGlow" />

      {/* Main Glassmorphic Modal Card */}
      <div className="w-full max-w-sm rounded-[32px] p-6 sm:p-8 bg-[#0E1424]/90 border border-slate-700/50 text-center space-y-6 shadow-[0_24px_60px_-15px_rgba(0,0,0,0.7)] relative overflow-hidden backdrop-blur-xl">
        
        {/* Floating Scanner Viewport Container */}
        <div className="relative w-36 h-48 mx-auto rounded-2xl bg-gradient-to-b from-[#131B30] to-[#0A0E1A] border border-white/20 p-3 flex flex-col items-center justify-center overflow-hidden shadow-inner shadow-black/60 group">
          
          {/* Subtle grid pattern background */}
          <div className="absolute inset-0 opacity-15 bg-[radial-gradient(#ffffff_1px,transparent_1px)] [background-size:10px_10px]" />

          {/* Corner scanner targets */}
          <div className="absolute top-2 left-2 w-3 h-3 border-t-2 border-l-2 border-white/80 rounded-tl-sm" />
          <div className="absolute top-2 right-2 w-3 h-3 border-t-2 border-r-2 border-white/80 rounded-tr-sm" />
          <div className="absolute bottom-2 left-2 w-3 h-3 border-b-2 border-l-2 border-white/80 rounded-bl-sm" />
          <div className="absolute bottom-2 right-2 w-3 h-3 border-b-2 border-r-2 border-white/80 rounded-br-sm" />

          {/* Realistic 3D Floating Bill / Receipt Card Inside */}
          <div className="relative w-24 h-36 bg-gradient-to-b from-white to-slate-100 dark:from-slate-100 dark:to-slate-200 text-slate-800 rounded-lg p-2.5 shadow-lg flex flex-col justify-between animate-floatBill border border-white/40">
            {/* Jagged / Dash Receipt Header */}
            <div className="space-y-1">
              <div className="flex items-center justify-between pb-1 border-b border-dashed border-slate-300">
                <div className="w-2.5 h-2.5 rounded-full bg-slate-900 flex items-center justify-center text-[7px] text-white font-black">
                  {currencySymbol}
                </div>
                <div className="h-1.5 w-10 bg-slate-300 rounded-full" />
              </div>

              {/* Receipt Line Items Simulation */}
              <div className="space-y-1.5 pt-1">
                <div className="flex items-center justify-between">
                  <div className="h-1.5 w-8 bg-slate-400/80 rounded-full" />
                  <div className="h-1.5 w-4 bg-slate-400/80 rounded-full" />
                </div>
                <div className="flex items-center justify-between">
                  <div className="h-1.5 w-11 bg-slate-300 rounded-full" />
                  <div className="h-1.5 w-3 bg-slate-400/80 rounded-full" />
                </div>
                <div className="flex items-center justify-between">
                  <div className="h-1.5 w-7 bg-slate-300 rounded-full" />
                  <div className="h-1.5 w-4 bg-slate-400/80 rounded-full" />
                </div>
              </div>
            </div>

            {/* Receipt Footer with Subtotal and Barcode */}
            <div className="space-y-1 pt-1 border-t border-dashed border-slate-300">
              <div className="flex items-center justify-between">
                <div className="h-1.5 w-6 bg-slate-700 rounded-full" />
                <div className="h-2 w-5 bg-slate-700 rounded-full" />
              </div>
              {/* Mini barcode lines */}
              <div className="flex items-center justify-center gap-0.5 pt-0.5 opacity-40">
                <div className="h-2 w-0.5 bg-slate-800" />
                <div className="h-2 w-1 bg-slate-800" />
                <div className="h-2 w-0.5 bg-slate-800" />
                <div className="h-2 w-1.5 bg-slate-800" />
                <div className="h-2 w-0.5 bg-slate-800" />
                <div className="h-2 w-1 bg-slate-800" />
              </div>
            </div>
          </div>

          {/* Dribbble Luminous Search/Scanning Beam */}
          <div className="absolute inset-x-0 h-8 pointer-events-none animate-searchSweep">
            {/* Intense radiant laser line */}
            <div className="h-0.5 w-full bg-gradient-to-r from-transparent via-white to-transparent shadow-[0_0_12px_#ffffff]" />
            {/* Translucent trailing light glow */}
            <div className="h-7 w-full bg-gradient-to-b from-white/20 to-transparent" />
          </div>
        </div>

        {/* Dynamic Localized Status & Title */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 text-white animate-spin">
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
            </svg>
            <h3 className="text-lg font-black text-white tracking-tight">
              {t('ocrScanningTitle', undefined, 'Scanning receipt')}
            </h3>
          </div>

          <p className="text-xs font-bold text-slate-200 h-5 transition-all flex items-center justify-center gap-1.5">
            <span>{stages[stageIndex]}</span>
          </p>
        </div>

        {/* Sleek Fluid Gradient Progress Bar */}
        <div className="space-y-1">
          <div className="w-full h-2 rounded-full bg-slate-900/90 overflow-hidden p-0.5 border border-slate-700/60 relative">
            <div className="h-full rounded-full bg-gradient-to-r from-white via-slate-300 to-slate-400 shadow-[0_0_14px_rgba(255,255,255,0.7)] animate-fluidShimmer w-2/5" />
          </div>
        </div>

        {/* Localized Footer Note */}
        <p className="text-[11px] text-slate-400 font-medium leading-normal">
          {t('ocrPoweredBy', undefined, 'Powered by Real-Time Browser & AI OCR')}
        </p>
      </div>
    </div>
  );
}
