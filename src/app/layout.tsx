import './globals.css';
import React from 'react';
import { LanguageProvider } from '../components/LanguageContext';

export const metadata = {
  title: 'BillSplit - Real-Time Multi-User Bill Splitting',
  description: 'Split restaurant and group bills in real-time with friends via receipt scanning, photo uploads, WebSockets, and 1-tap Bit/Paybox transfers.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-slate-900/95 dark:bg-[#05070D] text-slate-900 min-h-screen flex items-center justify-center p-0 md:p-6 antialiased">
        <LanguageProvider>
          {/* Main container: Centered phone shell look on desktop, full screen on mobile */}
          <div className="w-full max-w-md min-h-screen md:min-h-[844px] md:max-h-[92vh] bg-white dark:bg-[#0A0E17] md:rounded-[44px] md:shadow-[0_25px_70px_rgba(0,0,0,0.5)] md:border-[10px] md:border-slate-800 relative overflow-hidden flex flex-col">
            {/* Main view container */}
            <main className="flex-1 w-full relative z-10 flex flex-col overflow-y-auto">
              {children}
            </main>
          </div>
        </LanguageProvider>
      </body>
    </html>
  );
}
