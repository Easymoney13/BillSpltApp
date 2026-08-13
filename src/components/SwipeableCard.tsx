'use client';

import React, { useState, useRef } from 'react';
import { Trash2 } from 'lucide-react';

interface SwipeableCardProps {
  children: React.ReactNode;
  onDelete: () => boolean | void | Promise<boolean | void>;
  className?: string;
}

export function SwipeableCard({ children, onDelete, className = '' }: SwipeableCardProps) {
  const [translateX, setTranslateX] = useState(0);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isSwiping, setIsSwiping] = useState(false);
  const startXRef = useRef<number | null>(null);
  const blockClickRef = useRef(false);

  const handleTouchStart = (e: React.TouchEvent | React.MouseEvent) => {
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    startXRef.current = clientX;
    setIsSwiping(true);
    blockClickRef.current = false;
  };

  const handleTouchMove = (e: React.TouchEvent | React.MouseEvent) => {
    if (startXRef.current === null) return;
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const diffX = clientX - startXRef.current;

    if (Math.abs(diffX) > 5) {
      blockClickRef.current = true;
    }

    // Only allow left swiping (negative diffX)
    if (diffX < 0) {
      setTranslateX(Math.max(diffX, -140));
    } else {
      setTranslateX(0);
    }
  };

  const handleTouchEnd = async () => {
    if (startXRef.current === null) return;
    setIsSwiping(false);
    startXRef.current = null;

    if (translateX < -70) {
      const shouldRemove = await onDelete();
      if (shouldRemove === false) {
        setTranslateX(0);
      } else {
        setTranslateX(-400);
        setIsDeleting(true);
      }
    } else {
      setTranslateX(0);
    }
  };

  const handleClickCapture = (e: React.MouseEvent) => {
    if (blockClickRef.current) {
      e.stopPropagation();
      e.preventDefault();
      blockClickRef.current = false;
    }
  };

  return (
    <div
      onClickCapture={handleClickCapture}
      className={`relative overflow-hidden rounded-2xl transition-all duration-300 ease-out ${
        isDeleting ? 'max-h-0 opacity-0 my-0 py-0 overflow-hidden' : 'max-h-[1000px]'
      } ${className}`}
    >
      {/* Red Trash Can Reveal Background (Only Trash Icon) */}
      <div
        className="absolute inset-0 bg-red-600 dark:bg-red-700 rounded-2xl flex items-center justify-end px-5 z-0 transition-opacity duration-200"
        style={{ opacity: Math.min(Math.abs(translateX) / 50, 1) }}
      >
        <div className="p-2 rounded-full bg-red-700/60 text-white flex items-center justify-center shadow-inner">
          <Trash2 className="w-5 h-5 text-white" />
        </div>
      </div>

      {/* Ultra-Smooth Swipeable Content */}
      <div
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onMouseDown={handleTouchStart}
        onMouseMove={handleTouchMove}
        onMouseUp={handleTouchEnd}
        onMouseLeave={handleTouchEnd}
        style={{
          transform: `translateX(${translateX}px)`,
          transition: isSwiping ? 'none' : 'transform 0.3s cubic-bezier(0.2, 0.8, 0.2, 1)'
        }}
        className="relative z-10 w-full touch-pan-y select-none"
      >
        {children}
      </div>
    </div>
  );
}
