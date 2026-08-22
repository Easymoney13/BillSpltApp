'use client';

import React from 'react';

/**
 * App Logo Panda (Official Logo)
 * Panda sitting and holding the split coin.
 */
export function AppLogoPanda({ className = "w-11 h-11" }: { className?: string }) {
  return (
    <div className={`relative inline-flex items-center justify-center shrink-0 select-none ${className}`}>
      <img
        src="/images/panda_logo.png"
        alt="EasySplit Logo"
        width={48}
        height={48}
        className="w-full h-full object-contain drop-shadow-xs"
        style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
        draggable={false}
      />
    </div>
  );
}

export const PandaLogoIcon = AppLogoPanda;

/**
 * Sleeping Panda (Empty groups state)
 * Static transparent icon.
 */
export function SleepingPandaIllustration({ className = "w-40 h-22" }: { className?: string }) {
  return (
    <div className={`relative inline-flex items-center justify-center select-none ${className}`}>
      <img
        src="/images/panda_sleeping.png"
        alt="No active groups"
        width={160}
        height={90}
        className="w-full h-full object-contain"
        style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
        draggable={false}
      />
    </div>
  );
}

/**
 * Thinking / Scanning Panda (Receipt loading screen)
 * Clean, seamless single-piece illustration with gentle floating and thought-pulse animation.
 */
export function ThinkingPandaIllustration({ className = "w-40 h-40" }: { className?: string }) {
  return (
    <div className={`relative inline-flex items-center justify-center select-none ${className}`}>
      <style jsx>{`
        @keyframes floatAndGlow {
          0%, 100% {
            transform: translateY(0px) scale(1);
            filter: drop-shadow(0 8px 16px rgba(124, 58, 237, 0.18));
          }
          50% {
            transform: translateY(-5px) scale(1.02);
            filter: drop-shadow(0 14px 24px rgba(124, 58, 237, 0.32));
          }
        }
        .animated-thinking-panda {
          animation: floatAndGlow 2.4s ease-in-out infinite;
        }
      `}</style>
      
      <div className="animated-thinking-panda w-full h-full flex items-center justify-center">
        <img
          src="/images/panda_thinking.png"
          alt="Scanning receipt..."
          width={160}
          height={160}
          className="w-full h-full object-contain"
          style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
          draggable={false}
        />
      </div>
    </div>
  );
}

/**
 * History / Accounting Panda
 * Displayed in the History section holding an abacus / calculator.
 */
export function HistoryPandaIllustration({ className = "w-10 h-10" }: { className?: string }) {
  return (
    <div className={`relative inline-flex items-center justify-center select-none shrink-0 ${className}`}>
      <img
        src="/images/panda_history.png"
        alt="History & Expenses"
        width={48}
        height={48}
        className="w-full h-full object-contain drop-shadow-xs"
        style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
        draggable={false}
      />
    </div>
  );
}

/**
 * Settled Success Panda
 * Displayed in the Bill Split Settled Modal with a green checkmark & celebration animation.
 */
export function SettledPandaIllustration({ className = "w-32 h-32" }: { className?: string }) {
  return (
    <div className={`relative inline-flex items-center justify-center select-none ${className}`}>
      <style jsx>{`
        @keyframes successPop {
          0% {
            transform: scale(0.6) rotate(-6deg);
            opacity: 0;
          }
          60% {
            transform: scale(1.08) rotate(2deg);
            opacity: 1;
          }
          100% {
            transform: scale(1) rotate(0deg);
            opacity: 1;
          }
        }
        .animated-settled-panda {
          animation: successPop 0.6s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards;
        }
      `}</style>
      <div className="animated-settled-panda w-full h-full flex items-center justify-center">
        <img
          src="/images/panda_settled.png"
          alt="Bill Split Settled!"
          width={140}
          height={140}
          className="w-full h-full object-contain drop-shadow-[0_12px_24px_rgba(16,185,129,0.35)]"
          style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
          draggable={false}
        />
      </div>
    </div>
  );
}
