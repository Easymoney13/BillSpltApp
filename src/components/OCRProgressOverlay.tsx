'use client';

import React, { useState, useEffect } from 'react';
import { Receipt, Sparkles } from 'lucide-react';

interface OCRProgressOverlayProps {
  isVisible: boolean;
  onComplete?: () => void;
}

export function OCRProgressOverlay({ isVisible }: OCRProgressOverlayProps) {
  const stages = ['Preparing receipt...', 'Reading items and prices...', 'Checking receipt totals...'];
  const [stageIndex, setStageIndex] = useState(0);

  useEffect(() => {
    if (!isVisible) {
      setStageIndex(0);
      return;
    }

    const interval = setInterval(() => {
      setStageIndex((previous) => Math.min(previous + 1, stages.length - 1));
    }, 1800);

    return () => clearInterval(interval);
  }, [isVisible]);

  if (!isVisible) return null;

  return (
    <div role="status" aria-live="polite" aria-label={stages[stageIndex]} className="fixed inset-0 z-50 flex flex-col items-center justify-center p-6 bg-[#0A0E17]/95 backdrop-blur-xl text-white animate-fadeIn">
      <div className="w-full max-w-sm photo-card p-8 bg-[#121824] border border-[#222C3D] text-center space-y-6 shadow-2xl relative overflow-hidden">
        
        {/* Animated Laser Scanning Box - Black & White */}
        <div className="relative w-28 h-36 mx-auto rounded-2xl bg-[#0A0E17] border border-[#222C3D] flex items-center justify-center overflow-hidden shadow-inner">
          <Receipt className="w-14 h-14 text-slate-500" />
          
          {/* Pure white laser scanning beam */}
          <div className="absolute inset-x-0 h-1 bg-gradient-to-r from-transparent via-white to-transparent shadow-[0_0_15px_#FFFFFF] animate-scanBeam" />
        </div>

        {/* Honest indeterminate progress: OCR duration depends on the image and network. */}
        <div className="space-y-1">
          <div className="flex items-center justify-center gap-2">
            <Sparkles className="w-5 h-5 text-white animate-spin" />
            <span className="text-xl font-black text-white tracking-tight">Scanning receipt</span>
          </div>

          <p className="text-xs font-semibold text-slate-300 uppercase tracking-wider h-5 transition-all">
            {stages[stageIndex]}
          </p>
        </div>

        {/* Smooth White Progress Bar */}
        <div className="w-full h-2 rounded-full bg-[#0A0E17] overflow-hidden p-0.5 border border-[#222C3D]">
          <div className="h-full w-1/3 rounded-full bg-white shadow-[0_0_12px_rgba(255,255,255,0.8)] animate-pulse" />
        </div>

        <p className="text-[11px] text-slate-400 font-medium">
          Powered by Real-Time Browser & AI OCR
        </p>
      </div>
    </div>
  );
}
