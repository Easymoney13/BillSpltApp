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
      <body className="bg-slate-100/80 text-slate-900 min-h-screen flex items-center justify-center p-0 md:p-6 antialiased">
        <LanguageProvider>
          {/* Main container: Centered phone shell look on desktop, full screen on mobile */}
          <div className="w-full max-w-md min-h-screen md:min-h-[850px] md:max-h-[920px] bg-slate-50 md:rounded-[40px] md:shadow-[0_24px_60px_-15px_rgba(0,0,0,0.12)] md:border-8 md:border-slate-900/90 relative overflow-hidden flex flex-col">
            {/* Main view container */}
            <main className="flex-1 w-full relative z-10 flex flex-col overflow-y-auto pb-24">
              {children}
            </main>
          </div>
        </LanguageProvider>
      </body>
    </html>
  );
}
