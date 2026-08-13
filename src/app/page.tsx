'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  Receipt,
  History,
  Settings,
  Camera,
  Upload,
  ArrowRight,
  Sparkles,
  User,
  Trash2,
  Check,
  Globe,
  LogOut,
  QrCode,
  Play,
  Moon,
  Sun,
  FilePlus,
  Users,
  X,
  Share2,
  PieChart,
  TrendingUp,
  Utensils,
  ShoppingCart,
  Plane,
  Wine,
  Box
} from 'lucide-react';
import { useLanguage } from '../components/LanguageContext';
import { CameraViewfinder } from '../components/CameraViewfinder';
import { QRCodeModal } from '../components/QRCodeModal';
import { OCRProgressOverlay } from '../components/OCRProgressOverlay';
import { SwipeableCard } from '../components/SwipeableCard';
import { ManualBillModal } from '../components/ManualBillModal';
import { CreateGroupModal } from '../components/CreateGroupModal';
import { compressReceiptImage, compressAvatarImage } from '../../lib/imageUtils';
import { scanBillImageInBrowser } from '../../lib/ocrScanner';
import { getCookie, setCookie } from '../../lib/cookies';
import { triggerHaptic } from '../../lib/haptics';
import { clearRoomCredentials, roomHeaders, saveRoomCredentials } from '../../lib/roomTokens';

const PASTEL_COLORS = [
  { bg: 'bg-red-100 dark:bg-red-950/60', text: 'text-red-700 dark:text-red-300' },
  { bg: 'bg-amber-100 dark:bg-amber-950/60', text: 'text-amber-700 dark:text-amber-300' },
  { bg: 'bg-emerald-100 dark:bg-emerald-950/60', text: 'text-emerald-700 dark:text-emerald-300' },
  { bg: 'bg-sky-100 dark:bg-sky-950/60', text: 'text-sky-700 dark:text-sky-300' },
  { bg: 'bg-violet-100 dark:bg-violet-950/60', text: 'text-violet-700 dark:text-violet-300' },
  { bg: 'bg-pink-100 dark:bg-pink-950/60', text: 'text-pink-700 dark:text-pink-300' },
  { bg: 'bg-teal-100 dark:bg-teal-950/60', text: 'text-teal-700 dark:text-teal-300' },
];

export default function HomePage() {
  const router = useRouter();
  const {
    t,
    language,
    setLanguage,
    currency,
    setCurrency,
    theme,
    setTheme,
    profile,
    setProfile,
    formatPrice,
    formatDual,
    isRtl,
    firebaseUser,
    logout
  } = useLanguage();

  const [activeTab, setActiveTab] = useState<'history' | 'sessions' | 'settings'>('sessions');
  const [universalJoinCode, setUniversalJoinCode] = useState('');
  const [showCamera, setShowCamera] = useState(false);
  const [showManualModal, setShowManualModal] = useState(false);
  const [showCreateGroupModal, setShowCreateGroupModal] = useState(false);
  const [selectedGroupForModal, setSelectedGroupForModal] = useState<any | null>(null);
  const [groupModalTab, setGroupModalTab] = useState<'options' | 'details'>('options');
  const [userGroups, setUserGroups] = useState<any[]>([]);
  const [activeSession, setActiveSession] = useState<any>(null);
  const [historyList, setHistoryList] = useState<any[]>([]);
  const [showQrModal, setShowQrModal] = useState(false);
  const [showStartSplitModal, setShowStartSplitModal] = useState(false);
  const [showJoinSessionModal, setShowJoinSessionModal] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const avatarFileInputRef = useRef<HTMLInputElement>(null);

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const base64 = await compressAvatarImage(file);
      if (base64) {
        setProfile((prev) => ({
          ...prev,
          avatarUrl: base64
        }));
        triggerHaptic('success');
      }
    } catch (err) {
      console.error('Error uploading avatar:', err);
      alert('Failed to process profile image.');
    }
  };

  const handleResetPhoto = () => {
    setProfile((prev) => {
      const { avatarUrl, ...rest } = prev;
      return rest;
    });
    triggerHaptic('medium');
    if (avatarFileInputRef.current) {
      avatarFileInputRef.current.value = '';
    }
  };

  const handleScanCamera = () => {
    const isMobile = typeof window !== 'undefined' && /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    const hasMediaDevices = typeof navigator !== 'undefined' && navigator.mediaDevices && navigator.mediaDevices.getUserMedia;
    if (isMobile || !hasMediaDevices) {
      if (cameraInputRef.current) {
        cameraInputRef.current.click();
        return;
      }
    }
    setShowCamera(true);
  };

  const [nameInput, setNameInput] = useState(profile.displayName || '');
  const [savedSuccess, setSavedSuccess] = useState(false);

  useEffect(() => {
    setNameInput(profile.displayName || '');
  }, [profile]);

  useEffect(() => {
    const lastSession = localStorage.getItem('billsplit_active_session');
    if (lastSession) {
      try {
        const parsed = JSON.parse(lastSession);
        fetch(`/api/session/${parsed.id}`)
          .then((res) => res.json())
          .then((data) => {
            if (data && data.session && data.session.status !== 'settled' && !data.session.groupId) {
              setActiveSession(parsed);
            } else {
              localStorage.removeItem('billsplit_active_session');
              setActiveSession(null);
            }
          })
          .catch(() => {
            setActiveSession(parsed);
          });
      } catch (e) {
        localStorage.removeItem('billsplit_active_session');
      }
    }

    if (!profile.displayName) {
      setUserGroups([]);
      setHistoryList([]);
      return;
    }

    const userKey = profile.displayName || '';
    const userGroupsKey = `billsplit_user_groups_${userKey}`;
    const savedGroups = localStorage.getItem(userGroupsKey) || localStorage.getItem('billsplit_user_groups');
    if (savedGroups) {
      try {
        setUserGroups(JSON.parse(savedGroups));
      } catch (e) {}
    }

    const queryParams = new URLSearchParams({
      userName: profile.displayName || '',
      phone: ''
    }).toString();

    // Fetch user-specific active groups from server
    fetch(`/api/user/groups?${queryParams}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.groups) {
          setUserGroups(data.groups);
          localStorage.setItem(userGroupsKey, JSON.stringify(data.groups));
        }
      })
      .catch(() => {});

    // Fetch user-specific history from server
    fetch(`/api/history?${queryParams}`)
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data.history)) {
          setHistoryList(data.history);
          localStorage.setItem(`billsplit_history_${userKey}`, JSON.stringify(data.history));
        }
      })
      .catch(() => {
        const localHist = localStorage.getItem(`billsplit_history_${userKey}`);
        if (localHist) setHistoryList(JSON.parse(localHist));
        else setHistoryList([]);
      });
  }, [profile.displayName]);

  const financialStats = useMemo(() => {
    let totalSpent = 0;
    const categories: Record<string, { amount: number; count: number; icon: any; color: string; label: string }> = {
      Dining: { amount: 0, count: 0, icon: Utensils, color: 'bg-amber-500', label: t('catDining', undefined, 'Dining & Drinks') },
      Groceries: { amount: 0, count: 0, icon: ShoppingCart, color: 'bg-emerald-500', label: t('catGroceries', undefined, 'Groceries') },
      Travel: { amount: 0, count: 0, icon: Plane, color: 'bg-sky-500', label: t('catTravel', undefined, 'Travel & Stay') },
      Entertainment: { amount: 0, count: 0, icon: Wine, color: 'bg-purple-500', label: t('catEntertainment', undefined, 'Entertainment') },
      General: { amount: 0, count: 0, icon: Box, color: 'bg-slate-500', label: t('catGeneral', undefined, 'General & Other') }
    };

    historyList.forEach((item: any) => {
      const shareVal = item.userShare !== undefined ? item.userShare : item.totalAmount;
      const amount = typeof shareVal === 'number' ? shareVal : parseFloat(shareVal) || 0;
      totalSpent += amount;

      const titleLower = (item.storeName || '').toLowerCase();
      if (titleLower.includes('pizza') || titleLower.includes('burger') || titleLower.includes('sushi') || titleLower.includes('cafe') || titleLower.includes('dinner') || titleLower.includes('restaurant') || titleLower.includes('food')) {
        categories.Dining.amount += amount;
        categories.Dining.count += 1;
      } else if (titleLower.includes('market') || titleLower.includes('super') || titleLower.includes('grocer') || titleLower.includes('store') || titleLower.includes('shufersal')) {
        categories.Groceries.amount += amount;
        categories.Groceries.count += 1;
      } else if (titleLower.includes('hotel') || titleLower.includes('flight') || titleLower.includes('taxi') || titleLower.includes('uber') || titleLower.includes('trip') || titleLower.includes('vienna') || titleLower.includes('room')) {
        categories.Travel.amount += amount;
        categories.Travel.count += 1;
      } else if (titleLower.includes('bar') || titleLower.includes('beer') || titleLower.includes('pub') || titleLower.includes('movie') || titleLower.includes('cinema') || titleLower.includes('club')) {
        categories.Entertainment.amount += amount;
        categories.Entertainment.count += 1;
      } else {
        categories.General.amount += amount;
        categories.General.count += 1;
      }
    });

    return {
      totalSpent,
      categories,
      splitsCount: historyList.length,
      groupsCount: userGroups.length
    };
  }, [historyList, userGroups, t]);

  const handleClearActiveSession = () => {
    localStorage.removeItem('billsplit_active_session');
    setActiveSession(null);
    return true;
  };

  const handleReenterActiveSession = () => {
    if (!activeSession) return;
    router.push(`/session/${activeSession.id}`);
  };

  const handleUniversalJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    const code = universalJoinCode.trim();
    if (!code || code.length < 4) return;

    setIsUploading(true);
    try {
      // Prefer groups for legacy codes that were previously reused by group bills.
      const grpRes = await fetch(`/api/groups/${code}`);
      const grpData = await grpRes.json();
      if (grpData.group) {
        saveGroupToLocalList({
          id: grpData.group.id,
          code: grpData.group.code,
          name: grpData.group.name
        });
        triggerHaptic('success');
        router.push(`/group/${grpData.group.id}`);
        return;
      }
    } catch (err) {
      // fallback and continue
    }

    try {
      const sessRes = await fetch(`/api/session/${code}`);
      const sessData = await sessRes.json();
      if (sessData.session) {
        localStorage.setItem(
          'billsplit_active_session',
          JSON.stringify({
            id: sessData.session.id,
            code: sessData.session.code,
            storeName: sessData.session.storeName,
            isHost: false
          })
        );
        triggerHaptic('success');
        router.push(`/session/${sessData.session.id}`);
        return;
      }
    } catch (err) {
      // ignore
    } finally {
      setIsUploading(false);
    }

    triggerHaptic('warning');
    alert(t('codeNotFound', undefined, 'Code not found. Please check the 4-digit code.'));
  };

  const handleScanComplete = (scanResult: any) => {
    setShowCamera(false);
    if (scanResult.sessionId) {
      saveRoomCredentials('session', scanResult.sessionId, scanResult.memberId || scanResult.hostId, scanResult.accessToken);
      localStorage.setItem(
        'billsplit_active_session',
        JSON.stringify({
          id: scanResult.sessionId,
          code: scanResult.code,
          storeName: scanResult.session?.storeName || 'New Split',
          isHost: true,
          hostId: scanResult.hostId
        })
      );
      router.push(`/session/${scanResult.sessionId}`);
    }
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      const compressedBase64 = await compressReceiptImage(file);
      // 1. Primary: Try Gemini AI Vision via backend
      let res = await fetch('/api/receipt/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: compressedBase64,
          mimeType: 'image/jpeg',
          hostName: profile.displayName || 'Host'
        })
      });

      let data = await res.json();

      // 2. Fallback: If Gemini returned no items, try local browser Tesseract OCR
      if (!data.success || !data.sessionId) {
        console.log('⚡ Running browser Tesseract OCR fallback...');
        const clientParsed = await scanBillImageInBrowser(compressedBase64);
        if (clientParsed && clientParsed.items && clientParsed.items.length > 0) {
          res = await fetch('/api/receipt/scan', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              parsedBill: clientParsed,
              hostName: profile.displayName || 'Host'
            })
          });
          data = await res.json();
        }
      }
      if (data.success && data.sessionId) {
        saveRoomCredentials('session', data.sessionId, data.memberId || data.hostId, data.accessToken);
        localStorage.setItem(
          'billsplit_active_session',
          JSON.stringify({
            id: data.sessionId,
            code: data.code,
            storeName: data.session?.storeName || 'Uploaded Bill',
            isHost: true,
            hostId: data.hostId
          })
        );
        router.push(`/session/${data.sessionId}`);
      } else {
        const errorMsg = data.isNotBill
          ? "⚠️ Invalid Photo: Image is not a bill or receipt!\n\nNo receipt items or prices were detected in this image. Please take or upload a clear photo of a physical bill or receipt."
          : (data.error || t('couldNotParse', undefined, 'Could not parse receipt image. Please try again.'));
        alert(errorMsg);
      }
    } catch (err) {
      console.error(err);
      alert(t('errorUploading', undefined, 'Error uploading receipt image.'));
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleLaunchManualSession = async (billData: { storeName: string; currency: string; items: any[] }) => {
    try {
      setIsUploading(true);
      const res = await fetch('/api/receipt/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          parsedBill: billData,
          hostName: profile.displayName || 'Host'
        })
      });

      const data = await res.json();
      if (data.success && data.sessionId) {
        saveRoomCredentials('session', data.sessionId, data.memberId || data.hostId, data.accessToken);
        localStorage.setItem(
          'billsplit_active_session',
          JSON.stringify({
            id: data.sessionId,
            code: data.code,
            storeName: data.session?.storeName || billData.storeName,
            isHost: true,
            hostId: data.hostId
          })
        );
        setShowManualModal(false);
        router.push(`/session/${data.sessionId}`);
      } else {
        alert(data.error || 'Failed to create manual session.');
      }
    } catch (err) {
      console.error(err);
      alert('Error creating manual session.');
    } finally {
      setIsUploading(false);
    }
  };

  const saveGroupToLocalList = (newGroup: any) => {
    setUserGroups((prev) => {
      const exists = prev.some((g) => g.id === newGroup.id);
      const updated = exists
        ? prev.map((g) => (g.id === newGroup.id ? { ...g, ...newGroup } : g))
        : [{ id: newGroup.id, code: newGroup.code, name: newGroup.name }, ...prev];
      localStorage.setItem('billsplit_user_groups', JSON.stringify(updated));
      return updated;
    });
  };

  const handleCreateGroup = async (groupData: { name: string; currency: string }) => {
    try {
      setIsUploading(true);
      const res = await fetch('/api/groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: groupData.name,
          currency: groupData.currency,
          hostName: profile.displayName || 'Host'
        })
      });

      const data = await res.json();
      if (data.success && data.groupId) {
        saveRoomCredentials('group', data.groupId, data.memberId || data.hostId, data.accessToken);
        saveGroupToLocalList({
          id: data.groupId,
          code: data.code,
          name: groupData.name
        });
        setShowCreateGroupModal(false);
        router.push(`/group/${data.groupId}`);
      } else {
        alert(data.error || 'Failed to create group.');
      }
    } catch (err) {
      console.error(err);
      alert('Error creating group.');
    } finally {
      setIsUploading(false);
    }
  };



  const handleDeleteHistory = async (id: string) => {
    try {
      const res = await fetch(`/api/history/${id}`, { method: 'DELETE' });
      if (!res.ok) return false;
      setHistoryList((prev) => prev.filter((item) => item.id !== id));
      return true;
    } catch (err) {
      console.error(err);
      return false;
    }
  };

  const handleSaveSettings = (e: React.FormEvent) => {
    e.preventDefault();
    const finalName = nameInput.trim() || 'User';

    setProfile((prev) => ({
      ...prev,
      displayName: finalName,
    }));

    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 2000);
  };

  const handleSignOutClick = async () => {
    try {
      await logout();
      triggerHaptic('medium');
    } catch (err) {
      console.error('Sign-Out error:', err);
    }
  };

  const userInitials = (profile.displayName || 'User').substring(0, 2).toUpperCase();

  // Tab index calculation for LTR / RTL slider
  const activeTabIndex = activeTab === 'history' ? 0 : activeTab === 'sessions' ? 1 : 2;

  return (
    <div className="flex flex-col min-h-screen p-4 transition-colors duration-300 dark:bg-[#0A0E17] dark:text-white pb-28">
      {/* OCR Animated Progress Screen */}
      <OCRProgressOverlay isVisible={isUploading} />

      {/* Hidden File Input */}
      <input
        type="file"
        ref={fileInputRef}
        accept="image/*"
        onChange={handlePhotoUpload}
        className="hidden"
      />

      {/* Compact Top Header */}
      <header className="flex items-center justify-between py-2 mb-3">
        <button
          onClick={() => {
            setActiveTab('sessions');
            triggerHaptic('light');
          }}
          className="flex items-center gap-2.5 text-left rtl:text-right group focus:outline-none hover:opacity-80 active:scale-[0.98] transition-all duration-150"
          title="Go to Sessions"
        >
          <div className="w-14 h-14 rounded-full p-0.5 bg-slate-200 dark:bg-slate-800 border-2 border-slate-350 dark:border-slate-700 flex items-center justify-center overflow-hidden shadow-md">
            {profile.avatarUrl ? (
              <img
                src={profile.avatarUrl}
                alt={profile.displayName || 'User'}
                className="w-full h-full rounded-full object-cover"
              />
            ) : (
              <div
                className="w-full h-full rounded-full flex items-center justify-center font-black text-sm text-white"
                style={{ backgroundColor: profile.avatarColor || '#7C3AED' }}
              >
                {userInitials}
              </div>
            )}
          </div>

          <div>
            <span className="text-xs font-semibold text-slate-400 dark:text-slate-400 block leading-none">{t('welcomeBack', undefined, 'Welcome back')}</span>
            <h1 className="font-black text-lg text-slate-900 dark:text-white leading-tight mt-1 group-hover:text-[#7C3AED] dark:group-hover:text-[#8B5CF6] transition-colors">
              {profile.displayName || 'User'}
            </h1>
          </div>
        </button>

        <button
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          className="w-9 h-9 rounded-full bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 shadow-sm flex items-center justify-center text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
          title="Toggle Light/Dark Theme"
        >
          {theme === 'dark' ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-slate-700" />}
        </button>
      </header>

      {/* Camera Viewfinder Modal */}
      {showCamera && (
        <CameraViewfinder
          onScanComplete={handleScanComplete}
          onCancel={() => setShowCamera(false)}
          hostName={profile.displayName || 'Host'}
        />
      )}

      {/* QR Code Modal */}
      {showQrModal && activeSession && (
        <QRCodeModal
          isOpen={showQrModal}
          onClose={() => setShowQrModal(false)}
          sessionCode={activeSession.code}
          sessionId={activeSession.id}
        />
      )}

      {/* Main Content Area */}
      <div className="flex-1 space-y-6">
        {/* TAB 2: SESSIONS (Middle tab) */}
        {activeTab === 'sessions' && (
          <div className="space-y-6 animate-fadeIn">
            {/* Compact Swipe-To-Delete Active Session Card */}
            {activeSession && (
              <SwipeableCard onDelete={handleClearActiveSession}>
                <div className="photo-card p-3.5 bg-white dark:bg-[#121824] border border-slate-200/80 dark:border-[#222C3D] shadow-sm space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-[#7C3AED] animate-ping" />
                      <span className="text-[10px] font-extrabold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
                        {t('activeSplitTitle', undefined, 'Active Split')}
                      </span>
                    </div>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowQrModal(true);
                      }}
                      className="p-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200"
                      title="Share QR Code"
                    >
                      <QrCode className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-base font-bold text-slate-900 dark:text-white leading-tight">{activeSession.storeName}</h3>
                      <p className="text-[10px] text-slate-500 dark:text-slate-400 font-mono">#{activeSession.code}</p>
                    </div>

                    <button
                      onClick={handleReenterActiveSession}
                      className="py-1.5 px-3 photo-btn-dark text-[11px] flex items-center gap-1 shadow-sm"
                    >
                      <Play className="w-3 h-3 fill-current" />
                      <span>{t('reenterActiveSession', undefined, 'Re-Enter Active Session')}</span>
                    </button>
                  </div>
                </div>
              </SwipeableCard>
            )}

            {/* Consolidated Main Actions */}
            <div className="space-y-4">
              <input
                type="file"
                ref={cameraInputRef}
                accept="image/*"
                capture="environment"
                onChange={handlePhotoUpload}
                className="hidden"
              />

              {/* Start Split Hero Button */}
              <button
                onClick={() => {
                  setShowStartSplitModal(true);
                  triggerHaptic('medium');
                }}
                className="w-full py-4 px-6 bg-gradient-to-br from-[#7C3AED] to-[#4F46E5] text-white font-black text-sm rounded-2xl shadow-md hover:opacity-95 active:scale-[0.98] transition-all flex items-center justify-center gap-2 border border-indigo-400/20"
              >
                <Sparkles className="w-5 h-5 text-white animate-pulse" />
                <span>{t('startSplitBtn', undefined, 'Start Split')}</span>
              </button>

              {/* Join Session & Create Group Sub-actions */}
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => {
                    setShowJoinSessionModal(true);
                    triggerHaptic('light');
                  }}
                  className="flex items-center justify-center gap-2 p-3.5 bg-white dark:bg-[#121824] border border-slate-205 dark:border-[#222C3D] text-slate-800 dark:text-white font-extrabold text-xs rounded-xl hover:bg-slate-50 dark:hover:bg-[#1C2638] active:scale-[0.97] transition-all shadow-xs"
                >
                  <QrCode className="w-4 h-4 text-[#7C3AED] dark:text-[#8B5CF6]" />
                  <span>{t('joinSessionBtnAction', undefined, 'Join Session')}</span>
                </button>

                <button
                  onClick={() => {
                    setShowCreateGroupModal(true);
                    triggerHaptic('light');
                  }}
                  className="flex items-center justify-center gap-2 p-3.5 bg-white dark:bg-[#121824] border border-slate-205 dark:border-[#222C3D] text-slate-800 dark:text-white font-extrabold text-xs rounded-xl hover:bg-slate-50 dark:hover:bg-[#1C2638] active:scale-[0.97] transition-all shadow-xs"
                >
                  <Users className="w-4 h-4 text-[#7C3AED] dark:text-[#8B5CF6]" />
                  <span>{t('createGroupBtn', undefined, 'Create Group')}</span>
                </button>
              </div>
            </div>

            {/* YOUR ACTIVE GROUPS LIST (Enlarged Card Tiles / Skeletons when empty) */}
            {userGroups.length > 0 ? (
              <div className="photo-card p-4 bg-white dark:bg-[#121824] border border-slate-200/80 dark:border-white/10 shadow-[0_8px_30px_rgb(0,0,0,0.06)] dark:shadow-[0_8px_30px_rgb(0,0,0,0.35)] space-y-3">
                <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
                    {t('yourActiveGroups', { n: userGroups.length }, `Your Active Groups (${userGroups.length})`)}
                  </span>
                  <Users className="w-4 h-4 text-slate-400" />
                </div>

                <div className="flex items-center gap-3.5 overflow-x-auto pb-2.5 scrollbar-none pt-1">
                  {userGroups.map((g: any) => {
                    let pressTimer: any = null;

                    const startPress = () => {
                      pressTimer = setTimeout(() => {
                        setSelectedGroupForModal(g);
                        setGroupModalTab('options');
                      }, 450);
                    };

                    const cancelPress = () => {
                      if (pressTimer) clearTimeout(pressTimer);
                    };

                    const codeNum = g.code ? parseInt(g.code.replace(/\D/g, '')) || 0 : 0;
                    const colors = PASTEL_COLORS[codeNum % PASTEL_COLORS.length] || PASTEL_COLORS[0];

                    return (
                      <div key={g.id} className="relative group/item shrink-0">
                        <button
                          onClick={() => router.push(`/group/${g.id}`)}
                          onMouseDown={startPress}
                          onMouseUp={cancelPress}
                          onMouseLeave={cancelPress}
                          onTouchStart={startPress}
                          onTouchEnd={cancelPress}
                          onContextMenu={(e) => {
                            e.preventDefault();
                            setSelectedGroupForModal(g);
                            setGroupModalTab('options');
                          }}
                          className="w-32 py-4 px-3 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800/80 hover:bg-slate-100 dark:hover:bg-[#1A2333] transition-all flex flex-col items-center justify-center text-center select-none active:scale-[0.96] shadow-xs"
                        >
                          <div className={`w-12 h-12 rounded-full flex items-center justify-center font-black text-sm shadow-sm shrink-0 ${colors.bg} ${colors.text}`}>
                            {(g.name || 'G').substring(0, 2).toUpperCase()}
                          </div>
                          
                          <div className="w-full flex flex-col items-center mt-2.5">
                            <h4 className="font-extrabold text-xs text-slate-900 dark:text-white leading-tight line-clamp-2 h-8 flex items-center justify-center w-full px-1">
                              {g.name}
                            </h4>
                            <span className="text-[9px] font-mono font-bold text-slate-450 dark:text-slate-500 mt-0.5 block">
                              #{g.code}
                            </span>
                            <span className="text-[8px] font-extrabold text-[#7C3AED] dark:text-[#8B5CF6] uppercase tracking-wider mt-2 px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950/60 block">
                              👥 {g.membersCount ? `${g.membersCount} members` : t('groupNoMembers', undefined, 'Active Group')}
                            </span>
                          </div>
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="photo-card p-4 bg-white dark:bg-[#121824] border border-slate-200/80 dark:border-white/10 shadow-[0_8px_30px_rgb(0,0,0,0.06)] dark:shadow-[0_8px_30px_rgb(0,0,0,0.35)] space-y-3 animate-fadeIn">
                <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800/80 pb-2">
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
                    {t('yourActiveGroups', { n: 0 }, 'Your Active Groups (0)')}
                  </span>
                  <Users className="w-4 h-4 text-slate-400" />
                </div>

                <div className="flex items-center gap-3.5 overflow-x-auto pb-2.5 scrollbar-none pt-1">
                  {[1, 2, 3].map((i) => (
                    <div
                      key={i}
                      className="w-32 py-4 px-3 rounded-2xl bg-slate-50/50 dark:bg-slate-900/40 border border-slate-200/40 dark:border-slate-800/40 transition-all flex flex-col items-center justify-center text-center select-none opacity-45 animate-pulse shrink-0"
                    >
                      <div className="w-12 h-12 rounded-full bg-slate-200 dark:bg-slate-800 flex items-center justify-center shrink-0" />
                      
                      <div className="w-full flex flex-col items-center mt-2.5 space-y-2">
                        <div className="h-3 bg-slate-200 dark:bg-slate-800 rounded w-16" />
                        <div className="h-2 bg-slate-200 dark:bg-slate-800 rounded w-10" />
                        <div className="h-3 bg-slate-200/70 dark:bg-slate-800/70 rounded-full w-20 mt-1" />
                      </div>
                    </div>
                  ))}
                </div>

                <p className="text-[10px] text-slate-400 dark:text-slate-500 font-bold text-center pt-1 leading-normal">
                  {t('noGroupsYetHint', undefined, '💡 Create a group above to start a shared expense tracker with friends!')}
                </p>
              </div>
            )}
          </div>
        )}

        {/* TAB 1: HISTORY WITH COMPACT DASHBOARD AT BOTTOM */}
        {activeTab === 'history' && (
          <div className="space-y-3 animate-fadeIn">
            <h2 className="text-base font-extrabold text-slate-900 dark:text-white mb-2">{t('pastHistoryTitle', undefined, 'Past Splits History')}</h2>

            {historyList.length === 0 ? (
              <div className="photo-card p-6 bg-white dark:bg-[#121824] text-center text-slate-400 space-y-2">
                <History className="w-10 h-10 mx-auto text-slate-300 dark:text-slate-600 mb-1" />
                <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{t('noHistoryYet', undefined, 'No settled splits yet.')}</p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {historyList.map((item) => {
                  const shareVal = item.userShare !== undefined ? item.userShare : item.totalAmount;
                  const dual = formatDual ? formatDual(shareVal || 0, item.currency || 'NIS') : { primary: `${shareVal || 0}` };
                  const totalDual = formatDual ? formatDual(item.totalAmount || 0, item.currency || 'NIS') : null;
                  const isShareDifferent = item.userShare !== undefined && Math.abs(item.userShare - item.totalAmount) > 0.01;

                  const hash = (item.storeName || '').charCodeAt(0) + (item.storeName || '').charCodeAt((item.storeName || '').length - 1 || 0);
                  const colors = PASTEL_COLORS[hash % PASTEL_COLORS.length] || PASTEL_COLORS[0];

                  return (
                    <SwipeableCard key={item.id} onDelete={() => handleDeleteHistory(item.id)}>
                      <div
                        onClick={() => {
                          if (item.isGroupBill && item.groupId) {
                            router.push(`/group/${item.groupId}`);
                          } else if (item.id) {
                            router.push(`/session/${item.id}`);
                          }
                        }}
                        className="photo-card p-3 bg-white dark:bg-[#121824] border border-slate-200/60 dark:border-white/5 shadow-md shadow-slate-950/20 dark:shadow-black/30 flex items-center justify-between hover:shadow-xs transition-all cursor-pointer"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          {/* Left Icon Indicator */}
                          <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 shadow-xs ${colors.bg} ${colors.text}`}>
                            {item.isGroupBill ? (
                              <Users className="w-4 h-4" />
                            ) : (
                              <FilePlus className="w-4 h-4" />
                            )}
                          </div>

                          <div className="space-y-0.5 min-w-0">
                            <h4 className="font-extrabold text-xs text-slate-900 dark:text-white leading-tight truncate">
                              {item.storeName}
                            </h4>
                            <p className="text-[10px] text-slate-400 font-medium truncate">
                              {item.date} {item.isGroupBill ? `• 👥 ${item.groupName || 'Group'}` : ''}
                            </p>
                          </div>
                        </div>

                        {/* Right side Price */}
                        <div className="text-right shrink-0 flex flex-col items-end">
                          <span className="font-black text-slate-900 dark:text-white text-xs block">
                            {dual.primary}
                          </span>
                          {dual.secondary && (
                            <span className="text-[9px] text-slate-400 font-medium block mt-0.5">
                              {dual.secondary}
                            </span>
                          )}
                          {isShareDifferent && totalDual && (
                            <span className="text-[8px] text-slate-400 font-medium block">
                              (Total: {totalDual.primary})
                            </span>
                          )}
                        </div>
                      </div>
                    </SwipeableCard>
                  );
                })}
              </div>
            )}

            {/* Compact Personal Financial Dashboard Card Below History */}
            <div className="photo-card p-5 bg-white dark:bg-[#121824] border border-slate-200/80 dark:border-white/5 shadow-md shadow-slate-950/15 space-y-4 mt-4">
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
                <div className="flex items-center gap-1.5">
                  <PieChart className="w-3.5 h-3.5 text-[#7C3AED] dark:text-[#8B5CF6]" />
                  <h3 className="font-extrabold text-xs text-slate-850 dark:text-slate-200">
                    {t('personalFinancialSummary', undefined, 'Financial Summary')}
                  </h3>
                </div>
                <span className="px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950/60 text-[#7C3AED] dark:text-[#8B5CF6] font-extrabold text-[9px] uppercase tracking-wider">
                  {t('liveBreakdown', undefined, 'Live Breakdown')}
                </span>
              </div>

              {/* Progress bar displaying category weights */}
              <div className="space-y-2.5">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-400 font-medium">{t('totalSpentLabel', undefined, 'Total Spent')}</span>
                  <span className="font-black text-slate-800 dark:text-slate-200">
                    {formatPrice ? formatPrice(financialStats.totalSpent, currency) : `${financialStats.totalSpent.toFixed(2)} ${currency}`}
                  </span>
                </div>

                <div className="w-full h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden flex">
                  {Object.entries(financialStats.categories).map(([catKey, catData]) => {
                    const pct = financialStats.totalSpent > 0 ? (catData.amount / financialStats.totalSpent) * 100 : 0;
                    if (pct <= 0) return null;
                    return (
                      <div
                        key={catKey}
                        style={{ width: `${pct}%` }}
                        className={`h-full ${catData.color}`}
                        title={`${catData.label}: ${pct.toFixed(0)}%`}
                      />
                    );
                  })}
                </div>

                {/* Legend list */}
                <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 pt-1.5">
                  {Object.entries(financialStats.categories).map(([catKey, catData]) => {
                    const pct = financialStats.totalSpent > 0 ? (catData.amount / financialStats.totalSpent) * 100 : 0;
                    if (catData.amount <= 0 && financialStats.totalSpent > 0) return null;
                    return (
                      <div key={catKey} className="flex items-center justify-between text-[10px] font-bold">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${catData.color}`} />
                          <span className="text-slate-500 dark:text-slate-400 truncate">{catData.label}</span>
                        </div>
                        <span className="font-mono text-slate-800 dark:text-white shrink-0 ml-1">
                          {formatPrice ? formatPrice(catData.amount, currency) : `${catData.amount.toFixed(2)} ${currency}`}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Footer Metric Pills */}
              <div className="flex items-center justify-between pt-2.5 border-t border-slate-100 dark:border-slate-800 text-[10px] text-slate-400 font-medium">
                <span>{t('splitsCountLabel', { n: financialStats.splitsCount }, `${financialStats.splitsCount} Splits`)}</span>
                <span>•</span>
                <span>{t('activeGroupsCountLabel', { n: financialStats.groupsCount }, `${financialStats.groupsCount} Active Groups`)}</span>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: SETTINGS */}
        {activeTab === 'settings' && (
          <div className="space-y-4 animate-fadeIn">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-2">{t('settingsTitle', undefined, 'Account Settings')}</h2>

            <form onSubmit={handleSaveSettings} className="space-y-4">
              <div className="photo-card p-4 bg-white dark:bg-[#121824] border border-slate-200/80 dark:border-white/5 shadow-md shadow-slate-950/10 space-y-3">
                <h3 className="font-bold text-slate-900 dark:text-white text-sm flex items-center gap-1.5">
                  <User className="w-4 h-4 text-slate-700 dark:text-slate-300" />
                  <span>{t('personalInfoSection', undefined, 'Personal Info')}</span>
                </h3>
                       {/* Profile Photo Edit Section (Compact Horizontal) */}
                <div className="flex items-center gap-4 py-2 border-b border-slate-100 dark:border-slate-800/60 pb-3">
                  <div className="relative group cursor-pointer shrink-0" onClick={() => avatarFileInputRef.current?.click()}>
                    <div className="w-14 h-14 rounded-full p-0.5 bg-slate-200 dark:bg-slate-800 border-2 border-slate-350 dark:border-[#222C3D] flex items-center justify-center overflow-hidden shadow-sm transition-all group-hover:scale-105 active:scale-95">
                      {profile.avatarUrl ? (
                        <img
                          src={profile.avatarUrl}
                          alt="Profile Avatar"
                          className="w-full h-full rounded-full object-cover"
                        />
                      ) : (
                        <div
                          className="w-full h-full rounded-full flex items-center justify-center font-black text-sm text-white"
                          style={{ backgroundColor: profile.avatarColor || '#7C3AED' }}
                        >
                          {userInitials}
                        </div>
                      )}
                    </div>
                    {/* Hover Overlay Icon */}
                    <div className="absolute inset-0 bg-black/40 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <Camera className="w-4 h-4" />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <span className="text-[10px] font-bold text-slate-400 block uppercase tracking-wider leading-none">
                      {t('profilePhotoLabel', undefined, 'Profile Picture')}
                    </span>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => avatarFileInputRef.current?.click()}
                        className="py-1 px-2.5 rounded-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-[#222C3D] text-[10px] font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-750 transition-colors"
                      >
                        {t('changePhotoBtn', undefined, 'Change')}
                      </button>
                      {profile.avatarUrl && (
                        <button
                          type="button"
                          onClick={handleResetPhoto}
                          className="py-1 px-2.5 rounded-full bg-rose-50 dark:bg-rose-950/40 border border-rose-100 dark:border-rose-900/40 text-[10px] font-bold text-rose-600 dark:text-rose-400 hover:bg-rose-100 dark:hover:bg-rose-900 transition-colors"
                        >
                          {t('removePhotoBtn', undefined, 'Remove')}
                        </button>
                      )}
                    </div>
                  </div>

                  <input
                    type="file"
                    ref={avatarFileInputRef}
                    accept="image/*"
                    onChange={handleAvatarUpload}
                    className="hidden"
                  />
                </div>

                <div className="pt-1">
                  <div>
                    <div className="flex flex-col justify-end min-h-[40px] mb-1">
                      <label className="text-[10px] font-bold text-slate-450 dark:text-slate-400 block leading-tight">
                        {t('displayNameLabel', undefined, 'Display Name')}
                      </label>
                    </div>
                    <input
                      type="text"
                      value={nameInput}
                      onChange={(e) => setNameInput(e.target.value)}
                      placeholder="e.g. Naor"
                      className="w-full py-1.5 px-3.5 rounded-xl photo-input text-xs font-semibold bg-slate-50 dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700/80 text-slate-900 dark:text-slate-100"
                      required
                    />
                  </div>
                </div>
              </div>

              <div className="photo-card p-4 bg-white dark:bg-[#121824] border border-slate-200/80 dark:border-white/5 shadow-md shadow-slate-950/10 space-y-5">
                <h3 className="font-bold text-slate-900 dark:text-white text-sm flex items-center gap-1.5">
                  <Globe className="w-4 h-4 text-slate-700 dark:text-slate-300" />
                  <span>{t('preferencesSection', undefined, 'Preferences')}</span>
                </h3>

                <div>
                  <label className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 block mb-1.5">
                    {t('themeModeLabel', undefined, 'App Theme Mode')}
                  </label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setTheme('light')}
                      className={`flex-1 py-2 rounded-full border text-[11px] font-extrabold flex items-center justify-center gap-1 transition-all ${
                        theme === 'light'
                          ? 'bg-indigo-50/70 dark:bg-indigo-950/30 border-[#7C3AED] dark:border-[#8B5CF6] text-[#7C3AED] dark:text-[#a78bfa] shadow-sm'
                          : 'bg-slate-100/50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                      }`}
                    >
                      <Sun className="w-3.5 h-3.5" />
                      <span>{t('lightModeBtn', undefined, 'Light')}</span>
                      {theme === 'light' && <Check className="w-3 h-3 text-[#7C3AED] dark:text-[#a78bfa]" />}
                    </button>
                    <button
                      type="button"
                      onClick={() => setTheme('dark')}
                      className={`flex-1 py-2 rounded-full border text-[11px] font-extrabold flex items-center justify-center gap-1 transition-all ${
                        theme === 'dark'
                          ? 'bg-indigo-50/70 dark:bg-indigo-950/30 border-[#7C3AED] dark:border-[#8B5CF6] text-[#7C3AED] dark:text-[#a78bfa] shadow-sm'
                          : 'bg-slate-100/50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                      }`}
                    >
                      <Moon className="w-3.5 h-3.5" />
                      <span>{t('darkModeBtn', undefined, 'Dark Mode')}</span>
                      {theme === 'dark' && <Check className="w-3 h-3 text-[#7C3AED] dark:text-[#a78bfa]" />}
                    </button>
                  </div>
                </div>

                {/* Preferred Currency Selector: USD on LEFT of NIS */}
                <div>
                  <label className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 block mb-1.5">
                    {t('preferredCurrencyLabel', undefined, 'Preferred Currency')}
                  </label>
                  <div className="flex gap-2">
                    {(['USD', 'NIS'] as const).map((curr) => (
                      <button
                        key={curr}
                        type="button"
                        onClick={() => setCurrency(curr)}
                        className={`flex-1 py-2 rounded-full border text-[11px] font-extrabold transition-all flex items-center justify-center gap-1.5 ${
                          currency === curr
                            ? 'bg-indigo-50/70 dark:bg-indigo-950/30 border-[#7C3AED] dark:border-[#8B5CF6] text-[#7C3AED] dark:text-[#a78bfa] shadow-sm'
                            : 'bg-slate-100/50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                        }`}
                      >
                        <span>{curr} ({curr === 'USD' ? '$' : '₪'})</span>
                        {currency === curr && <Check className="w-3 h-3 text-[#7C3AED] dark:text-[#a78bfa]" />}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 block mb-1.5">
                    {t('languageSectionLabel', undefined, 'Language / שפה')}
                  </label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setLanguage('en')}
                      className={`flex-1 py-2 rounded-full border text-[11px] font-bold transition-all flex items-center justify-center gap-1.5 ${
                        language === 'en'
                          ? 'bg-indigo-50/70 dark:bg-indigo-950/30 border-[#7C3AED] dark:border-[#8B5CF6] text-[#7C3AED] dark:text-[#a78bfa] shadow-sm'
                          : 'bg-slate-100/50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                      }`}
                    >
                      <span>{t('englishLangBtn', undefined, 'English')} 🇺🇸</span>
                      {language === 'en' && <Check className="w-3 h-3 text-[#7C3AED] dark:text-[#a78bfa]" />}
                    </button>
                    <button
                      type="button"
                      onClick={() => setLanguage('he')}
                      className={`flex-1 py-2 rounded-full border text-[11px] font-bold transition-all flex items-center justify-center gap-1.5 ${
                        language === 'he'
                          ? 'bg-indigo-50/70 dark:bg-indigo-950/30 border-[#7C3AED] dark:border-[#8B5CF6] text-[#7C3AED] dark:text-[#a78bfa] shadow-sm'
                          : 'bg-slate-100/50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                      }`}
                    >
                      <span>{t('hebrewLangBtn', undefined, 'עברית (Hebrew)')} 🇮🇱</span>
                      {language === 'he' && <Check className="w-3 h-3 text-[#7C3AED] dark:text-[#a78bfa]" />}
                    </button>
                  </div>
                </div>

              </div>

              <button
                type="submit"
                className="w-full py-3 photo-btn-dark text-xs flex items-center justify-center gap-1.5"
              >
                {savedSuccess ? <Check className="w-4 h-4 text-white" /> : null}
                <span>{savedSuccess ? t('settingsSavedMsg', undefined, 'Settings Saved!') : t('saveSettingsBtn', undefined, 'Save Settings')}</span>
              </button>

              {firebaseUser && (
                <button
                  type="button"
                  onClick={handleSignOutClick}
                  className="w-full mt-2 py-3 px-4 rounded-xl border border-rose-200 dark:border-rose-950/40 bg-rose-50/50 dark:bg-rose-950/10 text-rose-600 dark:text-rose-400 text-xs font-bold transition-all hover:bg-rose-100/60 dark:hover:bg-rose-950/20 flex items-center justify-center gap-1.5"
                >
                  <LogOut className="w-4 h-4" />
                  <span>{t('signOutBtn', undefined, 'Sign Out')}</span>
                </button>
              )}
            </form>
          </div>
        )}
      </div>

      {/* Ultra-Smooth LTR & RTL Animated Sliding Electric Indigo Navbar */}
      <nav className="fixed bottom-0 left-0 right-0 max-w-md mx-auto z-40 p-2.5 bg-white/85 dark:bg-[#0A0E17]/85 border-t border-slate-200/80 dark:border-slate-800/80 backdrop-blur-lg shadow-[0_-8px_24px_rgba(0,0,0,0.04)] dark:shadow-[0_-8px_24px_rgba(0,0,0,0.45)]">
        <div className="relative grid grid-cols-3 gap-2 p-1 bg-slate-100/80 dark:bg-[#121824]/90 rounded-full border border-slate-200/60 dark:border-[#222C3D]/80">
          
          {/* Animated Electric Indigo Sliding Pill Indicator */}
          <div
            className="absolute top-1 bottom-1 rounded-full bg-[#7C3AED] shadow-md transition-all duration-350 ease-out nav-slider"
            style={{
              width: 'calc((100% - 16px) / 3)',
              transform: `translateX(calc(${activeTabIndex * (isRtl ? -1 : 1)} * (100% + 8px)))`
            }}
          />
 
          {/* TAB 1: HISTORY */}
          <button
            onClick={() => {
              setActiveTab('history');
              triggerHaptic('light');
            }}
            className={`relative z-10 flex flex-col items-center justify-center py-2 rounded-full transition-colors duration-200 font-bold active:scale-95 ${
              activeTab === 'history'
                ? 'text-white font-extrabold'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
            }`}
          >
            <History className="w-3.5 h-3.5 mb-0.5" />
            <span className="text-[10px]">{t('tabHistory', undefined, 'History')}</span>
          </button>
 
          {/* TAB 2: SESSIONS / SPLIT */}
          <button
            onClick={() => {
              setActiveTab('sessions');
              triggerHaptic('light');
            }}
            className={`relative z-10 flex flex-col items-center justify-center py-2 rounded-full transition-colors duration-200 font-bold active:scale-95 ${
              activeTab === 'sessions'
                ? 'text-white font-extrabold'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
            }`}
          >
            <Receipt className="w-3.5 h-3.5 mb-0.5" />
            <span className="text-[10px]">{t('tabSessions', undefined, 'Sessions')}</span>
          </button>
 
          {/* TAB 3: SETTINGS */}
          <button
            onClick={() => {
              setActiveTab('settings');
              triggerHaptic('light');
            }}
            className={`relative z-10 flex flex-col items-center justify-center py-2 rounded-full transition-colors duration-200 font-bold active:scale-95 ${
              activeTab === 'settings'
                ? 'text-white font-extrabold'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
            }`}
          >
            <Settings className="w-3.5 h-3.5 mb-0.5" />
            <span className="text-[10px]">{t('tabSettings', undefined, 'Settings')}</span>
          </button>
        </div>
      </nav>
      {/* Manual Bill Creation Modal */}
      <ManualBillModal
        isOpen={showManualModal}
        onClose={() => setShowManualModal(false)}
        onLaunchSession={handleLaunchManualSession}
      />

      {/* Create Group Modal */}
      <CreateGroupModal
        isOpen={showCreateGroupModal}
        onClose={() => setShowCreateGroupModal(false)}
        onCreateGroup={handleCreateGroup}
      />

      {/* Start Split Options Popup Modal */}
      {showStartSplitModal && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end bg-slate-950/60 backdrop-blur-xs animate-fadeIn" onClick={() => setShowStartSplitModal(false)}>
          <div 
            className="w-full max-w-md mx-auto rounded-t-[32px] p-6 bg-white dark:bg-[#121824] text-slate-900 dark:text-white space-y-4 shadow-2xl animate-slideUp"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div>
                <h3 className="text-base font-extrabold text-slate-900 dark:text-white">{t('startSplitTitle', undefined, 'Start a New Split')}</h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">{t('startSplitSubtitle', undefined, 'Choose how you want to load the bill')}</p>
              </div>
              <button
                onClick={() => setShowStartSplitModal(false)}
                className="p-1.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Options List */}
            <div className="space-y-2.5 pt-1">
              {/* Option 1: Scan Camera */}
              <button
                onClick={() => {
                  setShowStartSplitModal(false);
                  handleScanCamera();
                }}
                className="w-full p-3 rounded-2xl border border-slate-150 dark:border-[#222C3D] hover:bg-slate-50 dark:hover:bg-[#1A2333] transition-all flex items-center gap-3.5 text-left active:scale-[0.98]"
              >
                <div className="p-2.5 rounded-xl bg-indigo-50 dark:bg-indigo-950/70 text-[#7C3AED] dark:text-[#8B5CF6]">
                  <Camera className="w-5 h-5 stroke-[2.2]" />
                </div>
                <div>
                  <h4 className="font-extrabold text-xs text-slate-900 dark:text-white leading-snug">{t('scanCameraOption', undefined, 'Scan Receipt Camera')}</h4>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 font-medium leading-none mt-0.5">{t('scanCameraDesc', undefined, 'Snap a photo of the bill instantly')}</p>
                </div>
              </button>

              {/* Option 2: Upload Photo */}
              <button
                onClick={() => {
                  setShowStartSplitModal(false);
                  fileInputRef.current?.click();
                }}
                className="w-full p-3 rounded-2xl border border-slate-150 dark:border-[#222C3D] hover:bg-slate-50 dark:hover:bg-[#1A2333] transition-all flex items-center gap-3.5 text-left active:scale-[0.98]"
              >
                <div className="p-2.5 rounded-xl bg-indigo-50 dark:bg-indigo-950/70 text-[#7C3AED] dark:text-[#8B5CF6]">
                  <Upload className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="font-extrabold text-xs text-slate-900 dark:text-white leading-snug">{t('uploadPhotoOption', undefined, 'Upload Image from Gallery')}</h4>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 font-medium leading-none mt-0.5">{t('uploadPhotoDesc', undefined, 'Select a receipt screenshot or photo')}</p>
                </div>
              </button>

              {/* Option 3: Manual Split */}
              <button
                onClick={() => {
                  setShowStartSplitModal(false);
                  setShowManualModal(true);
                }}
                className="w-full p-3 rounded-2xl border border-slate-150 dark:border-[#222C3D] hover:bg-slate-50 dark:hover:bg-[#1A2333] transition-all flex items-center gap-3.5 text-left active:scale-[0.98]"
              >
                <div className="p-2.5 rounded-xl bg-indigo-50 dark:bg-indigo-950/70 text-[#7C3AED] dark:text-[#8B5CF6]">
                  <FilePlus className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="font-extrabold text-xs text-slate-900 dark:text-white leading-snug">{t('manualSplitOption', undefined, 'Create Bill Manually')}</h4>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 font-medium leading-none mt-0.5">{t('manualSplitDesc', undefined, 'Type in the items and prices yourself')}</p>
                </div>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Join Session Modal popup */}
      {showJoinSessionModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-fadeIn" onClick={() => setShowJoinSessionModal(false)}>
          <div 
            className="w-full max-w-sm rounded-3xl p-5 bg-white dark:bg-[#121824] text-slate-900 dark:text-white space-y-4 shadow-2xl animate-scaleUp"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <QrCode className="w-5 h-5 text-[#7C3AED] dark:text-[#8B5CF6]" />
                <h3 className="font-extrabold text-sm text-slate-900 dark:text-white">{t('joinViaCode', undefined, 'Join Split or Group')}</h3>
              </div>
              <button
                onClick={() => setShowJoinSessionModal(false)}
                className="p-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Input Form */}
            <form 
              onSubmit={(e) => {
                setShowJoinSessionModal(false);
                handleUniversalJoin(e);
              }} 
              className="space-y-3"
            >
              <input
                type="text"
                maxLength={4}
                placeholder={t('enterUniversalCodePlaceholder', undefined, 'Enter 4-digit code (e.g. 8492)')}
                value={universalJoinCode}
                onChange={(e) => setUniversalJoinCode(e.target.value.replace(/\D/g, ''))}
                className="w-full py-2 px-3.5 rounded-xl photo-input text-center text-sm font-mono tracking-wider font-extrabold text-slate-900 dark:text-white placeholder:text-slate-400 placeholder:font-sans placeholder:text-xs placeholder:tracking-normal"
              />

              <button
                type="submit"
                disabled={universalJoinCode.length < 4}
                className="w-full py-3 px-4 photo-btn-indigo text-xs flex items-center justify-center gap-1.5 disabled:opacity-40"
              >
                <span>{t('joinSessionBtn', undefined, 'Join')}</span>
                <ArrowRight className={`w-3.5 h-3.5 ${isRtl ? 'rotate-180' : ''}`} />
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Active Group Context Modal */}
      {selectedGroupForModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-md animate-fadeIn text-slate-900 dark:text-white">
          <div className="relative w-full max-w-xs rounded-3xl bg-white dark:bg-[#0E131F] border border-slate-200 dark:border-slate-800 p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-slate-950 dark:bg-white text-white dark:text-slate-950 flex items-center justify-center font-black text-xs">
                  {(selectedGroupForModal.name || 'G').substring(0, 2).toUpperCase()}
                </div>
                <div>
                  <h3 className="font-extrabold text-sm text-slate-900 dark:text-white">{selectedGroupForModal.name}</h3>
                  <span className="text-[10px] font-mono text-slate-400 font-bold">#{selectedGroupForModal.code}</span>
                </div>
              </div>

              <button
                onClick={() => setSelectedGroupForModal(null)}
                className="p-1.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-400 hover:text-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {groupModalTab === 'options' ? (
              <div className="space-y-2">
                <button
                  onClick={async () => {
                    if (confirm(`Are you sure you want to delete group "${selectedGroupForModal.name}"?`)) {
                      try {
                        const groupId = selectedGroupForModal.id;
                        const res = await fetch(`/api/groups/${groupId}`, {
                          method: 'DELETE',
                          headers: roomHeaders('group', groupId, false),
                        });
                        const data = await res.json();
                        if (!res.ok) throw new Error(data.error || 'Could not delete group');
                        const updated = userGroups.filter((g: any) => g.id !== groupId);
                        setUserGroups(updated);
                        setCookie('billsplit_user_groups', updated);
                        localStorage.setItem('billsplit_user_groups', JSON.stringify(updated));
                        clearRoomCredentials('group', groupId);
                        setSelectedGroupForModal(null);
                      } catch (err) {
                        alert(err instanceof Error ? err.message : 'Could not delete group');
                      }
                    }
                  }}
                  className="w-full py-2.5 px-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 text-rose-600 dark:text-rose-400 text-xs font-bold flex items-center justify-between transition-colors"
                >
                  <span className="flex items-center gap-2">
                    <Trash2 className="w-4 h-4 text-rose-500" />
                    <span>1. {t('deleteGroupItem', undefined, 'Delete Group')}</span>
                  </span>
                  <span className="text-[10px]">🗑️</span>
                </button>

                <button
                  onClick={async () => {
                    const groupUrl = `${window.location.origin}/group/${selectedGroupForModal.id}`;
                    if (navigator.share) {
                      try {
                        await navigator.share({
                          title: `Join Group ${selectedGroupForModal.name}`,
                          text: `Join our group ${selectedGroupForModal.name} with code ${selectedGroupForModal.code}!`,
                          url: groupUrl
                        });
                      } catch (e) {}
                    } else {
                      await navigator.clipboard.writeText(groupUrl);
                      alert('Group invite link copied to clipboard! 🔗');
                    }
                    setSelectedGroupForModal(null);
                  }}
                  className="w-full py-2.5 px-3 rounded-xl bg-slate-50 dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-900 dark:text-white text-xs font-bold flex items-center justify-between transition-colors"
                >
                  <span className="flex items-center gap-2">
                    <Share2 className="w-4 h-4 text-indigo-500" />
                    <span>2. {t('shareGroupItem', undefined, 'Share Group')}</span>
                  </span>
                  <span className="text-[10px] text-slate-400">🔗</span>
                </button>

                <button
                  onClick={() => setGroupModalTab('details')}
                  className="w-full py-2.5 px-3 rounded-xl bg-slate-50 dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-900 dark:text-white text-xs font-bold flex items-center justify-between transition-colors"
                >
                  <span className="flex items-center gap-2">
                    <Users className="w-4 h-4 text-emerald-500" />
                    <span>3. {t('seeGroupDetails', undefined, 'See Group Details')}</span>
                  </span>
                  <span className="text-[10px] text-slate-400">📋</span>
                </button>
              </div>
            ) : (
              <div className="space-y-3 text-xs">
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900 space-y-1.5">
                  <div className="flex justify-between">
                    <span className="text-slate-400">{t('codeLabel', undefined, 'Group Code')}:</span>
                    <span className="font-mono font-bold">#{selectedGroupForModal.code}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">{t('preferredCurrencyLabel', undefined, 'Currency')}:</span>
                    <span className="font-bold">{selectedGroupForModal.currency || 'NIS'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">{t('membersCountLabel', { n: selectedGroupForModal.members?.length || 1 }, `${selectedGroupForModal.members?.length || 1} members`)}:</span>
                    <span className="font-bold">{selectedGroupForModal.members?.length || 1}</span>
                  </div>
                </div>

                <button
                  onClick={() => setGroupModalTab('options')}
                  className="w-full py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold text-xs"
                >
                  {t('backToOptions', undefined, 'חזור לאפשרויות')}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
