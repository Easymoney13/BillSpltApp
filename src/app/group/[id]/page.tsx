'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  ChevronLeft,
  Users,
  Plus,
  QrCode,
  ArrowRight,
  Pencil,
  Trash2,
  CheckCircle2,
  FileText,
  Sparkles,
  Camera,
  Upload,
  FilePlus,
  RefreshCw,
  Sun,
  Moon,
  ChevronDown,
  ChevronUp,
  LogOut,
  X,
  Share2,
  Copy,
  Check
} from 'lucide-react';
import { useLanguage } from '../../../components/LanguageContext';
import { QRCodeModal } from '../../../components/QRCodeModal';
import { ManualBillModal } from '../../../components/ManualBillModal';
import { CameraViewfinder } from '../../../components/CameraViewfinder';
import { OCRProgressOverlay } from '../../../components/OCRProgressOverlay';
import { SwipeableCard } from '../../../components/SwipeableCard';
import { createReceiptDraft, receiptConfirmationPayload } from '../../../../lib/receiptScanClient';
import { getCookie, setCookie } from '../../../../lib/cookies';
import { formatCurrency } from '../../../../lib/i18n';
import { isValidIsraeliPhone, triggerBitPayment } from '../../../../lib/bitDeepLink';

import { triggerHaptic } from '../../../../lib/haptics';
import { clearRoomCredentials, getRoomMemberId, getRoomToken, roomHeaders, saveRoomCredentials } from '../../../../lib/roomTokens';

function createClientActionId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `action_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`;
}

export default function GroupWorkspacePage() {
  const params = useParams();
  const router = useRouter();
  const groupId = (params?.id as string) || '';

  const { t, currency, formatPrice, formatDual, isRtl, theme, setTheme, profile } = useLanguage();

  const [group, setGroup] = useState<any>(null);
  const [currentMemberId, setCurrentMemberId] = useState<string>('');
  const [showQrModal, setShowQrModal] = useState(false);
  const [showCreateBillModal, setShowCreateBillModal] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [showStartSplitModal, setShowStartSplitModal] = useState(false);
  const [copiedInvite, setCopiedInvite] = useState(false);

  // Edit Bill State
  const [editingBill, setEditingBill] = useState<any>(null);
  const [pendingReceiptDraft, setPendingReceiptDraft] = useState<any>(null);
  const [pendingScanId, setPendingScanId] = useState('');
  const [expandedBillId, setExpandedBillId] = useState<string | null>(null);
  const [swipedBillId, setSwipedBillId] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const socketRef = useRef<WebSocket | null>(null);

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

  const [fetchError, setFetchError] = useState<string | null>(null);

  useEffect(() => {
    if (!groupId || !profile.displayName) return;
    let disposed = false;
    let interval: ReturnType<typeof setInterval> | null = null;

    const initializeGroup = async () => {
      try {
        const initialRes = await fetch(`/api/groups/${groupId}`, { headers: roomHeaders('group', groupId, false) });
        const initialData = await initialRes.json();
        if (!initialRes.ok || !initialData.group) throw new Error(initialData.error || 'Group not found');
        const resolvedId = initialData.group.id;
        const existingToken = getRoomToken('group', resolvedId) || getRoomToken('group', groupId);
        const persistedMemberId = getRoomMemberId('group', resolvedId) || getRoomMemberId('group', groupId);
        const existingMember = (initialData.group.members || []).find((m: any) => m.id === persistedMemberId);
        if (existingToken && existingMember) {
          saveRoomCredentials('group', resolvedId, existingMember.id, existingToken);
          if (!disposed) {
            setCurrentMemberId(existingMember.id);
            setGroup(initialData.group);
            setFetchError(null);
            connectWebSocket(resolvedId, existingToken);
            interval = setInterval(() => fetchGroupData(resolvedId), 15_000);
            if (resolvedId !== groupId) router.replace(`/group/${resolvedId}`);
          }
          return;
        }

        const joinRes = await fetch('/api/groups/join', {
          method: 'POST',
          headers: roomHeaders('group', resolvedId),
          body: JSON.stringify({
            groupId: resolvedId,
            name: profile.displayName || 'Member',
          }),
        });
        const joined = await joinRes.json();
        if (!joinRes.ok || !joined.group || !joined.accessToken) {
          throw new Error(joined.error || 'Could not join group');
        }
        saveRoomCredentials('group', resolvedId, joined.memberId, joined.accessToken);
        if (resolvedId !== groupId) saveRoomCredentials('group', groupId, joined.memberId, joined.accessToken);

        if (!disposed) {
          setCurrentMemberId(joined.memberId);
          setGroup(joined.group);
          setFetchError(null);
          connectWebSocket(resolvedId, joined.accessToken);
          interval = setInterval(() => fetchGroupData(resolvedId), 15_000);
          if (resolvedId !== groupId) router.replace(`/group/${resolvedId}`);
        }
      } catch (err) {
        console.error('Error initializing group:', err);
        if (!disposed) setFetchError(err instanceof Error ? err.message : 'Could not load group');
      }
    };

    initializeGroup();

    // Timeout safety for group loading
    const timeoutTimer = setTimeout(() => {
      setFetchError((prev) => (prev ? prev : 'Group taking too long to load or code invalid'));
    }, 6000);

    return () => {
      disposed = true;
      if (interval) clearInterval(interval);
      clearTimeout(timeoutTimer);
      if (socketRef.current) socketRef.current.close();
    };
  }, [groupId, profile.displayName]);

  const fetchGroupData = async (id: string) => {
    try {
      const res = await fetch(`/api/groups/${id}`, { headers: roomHeaders('group', id, false) });
      if (res.ok) {
        const data = await res.json();
        if (data.group) {
          setGroup(data.group);
          setFetchError(null);
          // Normalize a shared invite code to the durable group id.
          if (data.group.id && data.group.id !== id) {
            router.replace(`/group/${data.group.id}`);
          }
        }
      } else if (res.status === 404) {
        setFetchError('Group not found or code invalid');
      }
    } catch (err) {
      console.error('Error fetching group:', err);
    }
  };

  const connectWebSocket = (id: string, accessToken: string) => {
    try {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}`;
      const ws = new WebSocket(wsUrl);
      socketRef.current = ws;

      ws.onopen = () => {
        ws.send(
          JSON.stringify({
            type: 'SUBSCRIBE_GROUP',
            groupId: id,
            accessToken,
          })
        );
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'GROUP_UPDATE' && data.group) {
            setGroup(data.group);
          } else if (data.type === 'GROUP_DELETED') {
            clearRoomCredentials('group', id);
            router.push('/');
          }
        } catch (e) {
          console.error(e);
        }
      };
    } catch (err) {
      console.error('WebSocket connection error:', err);
    }
  };

  const handleAddBillToGroup = async (billData: { title: string; currency: string; items: any[]; payerId?: string; amount?: number; id?: string; date?: string; receipt?: any; scanId?: string; confirmedByUser?: boolean }) => {
    if (!group) return;

    try {
      setIsUploading(true);
      const res = await fetch('/api/groups/bill', {
        method: 'POST',
        headers: roomHeaders('group', group.id),
        body: JSON.stringify({
          groupId: group.id,
          bill: {
            id: billData.id || (billData.scanId ? undefined : `bill_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`),
            expectedRevision: editingBill ? Number(editingBill.revision || 0) : undefined,
            title: billData.title,
            date: billData.date || editingBill?.date || new Date().toISOString().split('T')[0],
            payerId: billData.payerId || currentMemberId,
            currency: billData.currency || group.currency || 'NIS',
            amount: billData.amount || billData.items.reduce((acc, i) => acc + (i.price || 0), 0),
            items: billData.items,
            receipt: billData.receipt,
            scanId: billData.scanId,
            confirmedByUser: billData.confirmedByUser,
          }
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save bill to group');
      if (data.group) {
        setGroup(data.group);
        setShowCreateBillModal(false);
        setEditingBill(null);
        setPendingReceiptDraft(null);
        setPendingScanId('');

        // If a new live bill session was created, open the live item-claiming room!
        if (data.sessionId && !billData.id) {
          const groupToken = getRoomToken('group', group.id);
          saveRoomCredentials('session', data.sessionId, currentMemberId, groupToken);
          window.location.href = `/session/${data.sessionId}?groupId=${group.id}`;
        }
      }
    } catch (err) {
      console.error(err);
      alert('Failed to save bill to group.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleDeleteBill = async (billId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!confirm('Are you sure you want to delete this bill from the group?')) return false;

    try {
      const resolvedId = group?.id || groupId;
      const res = await fetch(`/api/groups/bill/${resolvedId}/${billId}`, {
        method: 'DELETE',
        headers: roomHeaders('group', resolvedId, false),
      });
      const data = await res.json();
      if (data.group) {
        setGroup(data.group);
      }
      if (!res.ok) throw new Error(data.error || 'Could not delete bill');
      return true;
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : 'Could not delete bill');
      return false;
    }
  };

  const sendGroupBillAction = async (action: string, payload: Record<string, unknown>) => {
    if (!group) return;
    try {
      const res = await fetch('/api/groups/bill/action', {
        method: 'POST',
        headers: roomHeaders('group', group.id),
        body: JSON.stringify({ groupId: group.id, action, payload, actionId: createClientActionId() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not update bill');
      if (data.group) setGroup(data.group);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Could not update bill');
    }
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      const draft = await createReceiptDraft(file, profile.displayName || 'Member');
      setEditingBill(null);
      setPendingReceiptDraft({ ...draft.receipt, imageQuality: draft.imageQuality, _previewImages: draft.previewImages });
      setPendingScanId(draft.scanId);
      setShowCreateBillModal(true);
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : 'Error uploading receipt image.');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleCameraScanComplete = async (scanResult: any) => {
    setShowCamera(false);
    const parsedReceipt = scanResult.receipt || scanResult.session;
    if (parsedReceipt) {
      setEditingBill(null);
      setPendingReceiptDraft(parsedReceipt);
      setPendingScanId(scanResult.scanId || '');
      setShowCreateBillModal(true);
    }
  };

  const handleCopyInviteLink = () => {
    if (!group) return;
    const url = `${window.location.origin}/group/${group.code || group.id}`;
    try {
      navigator.clipboard.writeText(url);
      setCopiedInvite(true);
      setTimeout(() => setCopiedInvite(false), 2500);
      triggerHaptic('light');
    } catch (e) {}
  };

  const validMembers = useMemo(() => {
    const raw = Array.isArray(group?.members) ? group.members.filter((member: any) => member && member.active !== false) : [];
    const seen = new Set();
    const result: any[] = [];
    for (const m of raw) {
      const key = (m.id || '') + '___' + (m.name || '').trim().toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        result.push(m);
      }
    }
    return result;
  }, [group?.members]);

  const validBills = Array.isArray(group?.bills) ? group.bills : [];
  const minimizedTransactions = Array.isArray(group?.minimizedTransactions) ? group.minimizedTransactions : [];

  const balances = useMemo(() => {
    const raw = Array.isArray(group?.balances) ? group.balances : [];
    const seen = new Set();
    const result: any[] = [];
    for (const b of raw) {
      const key = (b.memberId || '') + '___' + (b.name || '').trim().toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        result.push(b);
      }
    }
    return result;
  }, [group?.balances]);

  const unassignedAmount = Number(group?.unassignedAmount || 0);
  const isGroupHost = Boolean(validMembers.find((member: any) => member.id === currentMemberId)?.isHost);

  if (!group) {
    if (fetchError) {
      return (
        <div className="flex flex-col items-center justify-center min-h-screen p-6 bg-slate-50 dark:bg-[#0A0E17] text-slate-900 dark:text-white text-center space-y-4">
          <div className="p-4 rounded-full bg-rose-100 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400">
            <Users className="w-8 h-8" />
          </div>
          <h2 className="text-lg font-bold">{t('groupNotFoundTitle', undefined, 'Group Not Found')}</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-xs leading-relaxed">
            {t('groupNotFoundSub', undefined, 'The group code or link you entered does not exist or has expired.')}
          </p>
          <button
            onClick={() => router.push('/')}
            className="py-2.5 px-5 photo-btn-dark text-xs font-bold flex items-center justify-center gap-2 shadow-md active:scale-95"
          >
            <span>{t('backToHomeBtn', undefined, 'Back to Home')}</span>
          </button>
        </div>
      );
    }

    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-5 bg-slate-50 dark:bg-[#0A0E17] text-slate-900 dark:text-white">
        <RefreshCw className="w-8 h-8 animate-spin text-emerald-500 mb-2" />
        <p className="text-xs font-bold">Loading Group Workspace...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen p-5 text-slate-900 dark:text-slate-100 bg-slate-50 dark:bg-[#0A0E17] space-y-5 transition-colors duration-300 pb-28">
      <OCRProgressOverlay isVisible={isUploading} />

      <input
        type="file"
        ref={fileInputRef}
        accept="image/*"
        onChange={handlePhotoUpload}
        className="hidden"
      />

      {/* Camera Viewfinder */}
      {showCamera && (
        <CameraViewfinder
          onScanComplete={handleCameraScanComplete}
          onCancel={() => setShowCamera(false)}
          parseOnly
          hostName={profile.displayName || 'Member'}
        />
      )}

      {/* QR Code Modal */}
      {showQrModal && (
        <QRCodeModal
          isOpen={showQrModal}
          onClose={() => setShowQrModal(false)}
          sessionCode={group.code || ''}
          sessionId={group.id || ''}
          isGroup={true}
        />
      )}

      {/* Manual Bill Builder Modal */}
      {showCreateBillModal && (
        <ManualBillModal
          isOpen={showCreateBillModal}
          onClose={() => {
            setShowCreateBillModal(false);
            setEditingBill(null);
            setPendingReceiptDraft(null);
            setPendingScanId('');
          }}
          onLaunchSession={(data) => {
            handleAddBillToGroup({
              id: editingBill?.id,
              title: data.storeName,
              date: data.date || pendingReceiptDraft?.date || editingBill?.date,
              currency: data.currency,
              items: data.items,
              payerId: editingBill?.payerId || currentMemberId,
              receipt: pendingReceiptDraft
                ? { ...receiptConfirmationPayload(pendingReceiptDraft), scanId: pendingScanId, confirmedByUser: true }
                : undefined,
              scanId: pendingScanId || undefined,
              confirmedByUser: Boolean(pendingScanId),
            });
          }}
          initialData={editingBill || pendingReceiptDraft || { currency: group.currency || 'NIS' }}
        />
      )}

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
            <div className="space-y-2.5 pt-1 text-left">
              {/* Option 1: Scan Camera */}
              <button
                onClick={() => {
                  setShowStartSplitModal(false);
                  handleScanCamera();
                }}
                className="w-full p-3 rounded-2xl border border-slate-150 dark:border-[#222C3D] hover:bg-slate-50 dark:hover:bg-[#1A2333] transition-all flex items-center gap-3.5 text-left active:scale-[0.98]"
              >
                <div className="p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="m15.75 10.5 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25h-9A2.25 2.25 0 0 0 2.25 7.5v9a2.25 2.25 0 0 0 2.25 2.25Z" />
                  </svg>
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
                <div className="p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400">
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
                  setPendingReceiptDraft(null);
                  setPendingScanId('');
                  setEditingBill(null);
                  setShowCreateBillModal(true);
                }}
                className="w-full p-3 rounded-2xl border border-slate-150 dark:border-[#222C3D] hover:bg-slate-50 dark:hover:bg-[#1A2333] transition-all flex items-center gap-3.5 text-left active:scale-[0.98]"
              >
                <div className="p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 0 0 2.25-2.25V6.75A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25v10.5A2.25 2.25 0 0 0 4.5 19.5Z" />
                  </svg>
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

      {/* Header Bar */}
      <header className="flex items-center justify-between py-2 border-b border-slate-200/80 dark:border-slate-800">
        <button
          onClick={() => router.push('/')}
          className="w-10 h-10 rounded-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 flex items-center justify-center transition-colors shadow-sm active:scale-95"
        >
          <ChevronLeft className={`w-5 h-5 ${isRtl ? 'rotate-180' : ''}`} />
        </button>

        <div className="text-center">
          <h1 className="font-extrabold text-base text-slate-900 dark:text-white">{group.name}</h1>
          <button
            onClick={() => setShowQrModal(true)}
            className="inline-flex items-center gap-1 text-xs font-mono text-emerald-600 dark:text-emerald-400 font-bold hover:underline"
            title="Tap to Share Group"
          >
            <QrCode className="w-3 h-3" />
            <span>#{group.code}</span>
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            className="w-9 h-9 rounded-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-700 dark:text-slate-200 hover:bg-slate-100 transition-colors shadow-sm"
            title="Toggle Theme"
          >
            {theme === 'dark' ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-slate-700" />}
          </button>

          <button
            onClick={() => setShowQrModal(true)}
            className="py-1.5 px-3 rounded-full bg-slate-900 hover:bg-slate-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 text-white flex items-center gap-1.5 transition-all shadow-sm font-bold text-xs active:scale-95"
            title="Share Group"
          >
            <Share2 className="w-3.5 h-3.5" />
            <span>{t('shareBtn', undefined, 'Share')}</span>
          </button>

          <button
            onClick={async () => {
              const confirmation = isGroupHost
                ? t('confirmDeleteGroup', undefined, 'Delete this group and all of its active bill rooms?')
                : t('confirmLeaveGroup', undefined, 'Are you sure you want to leave this group?');
              if (confirm(confirmation)) {
                try {
                  const res = await fetch(`/api/groups/${group.id}${isGroupHost ? '' : '/leave'}`, {
                    method: isGroupHost ? 'DELETE' : 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                      ...roomHeaders('group', group.id, !isGroupHost),
                    },
                    body: isGroupHost ? undefined : JSON.stringify({
                      memberId: currentMemberId,
                      name: profile?.displayName || '',
                    }),
                  });
                  const data = await res.json();
                  if (!res.ok) throw new Error(data.error || 'Could not leave group');

                  // Add to deleted group IDs so it never re-appears in active groups
                  const localDeleted = localStorage.getItem('billsplit_deleted_group_ids');
                  const deletedIds = localDeleted ? JSON.parse(localDeleted) : [];
                  if (!deletedIds.includes(group.id)) {
                    deletedIds.push(group.id);
                    localStorage.setItem('billsplit_deleted_group_ids', JSON.stringify(deletedIds));
                  }

                  const cookieGroups = getCookie('billsplit_user_groups');
                  const localGroups = localStorage.getItem('billsplit_user_groups');
                  const rawGroups = cookieGroups || (localGroups ? JSON.parse(localGroups) : []);
                  const updated = Array.isArray(rawGroups) ? rawGroups.filter((g: any) => g.id !== group.id) : [];
                  setCookie('billsplit_user_groups', updated);
                  localStorage.setItem('billsplit_user_groups', JSON.stringify(updated));

                  const userKey = (profile?.displayName || '').trim();
                  if (userKey) {
                    localStorage.setItem(`billsplit_user_groups_${userKey}`, JSON.stringify(updated));
                    localStorage.setItem(`billsplit_user_groups_${userKey.toLowerCase()}`, JSON.stringify(updated));
                  }

                  clearRoomCredentials('group', group.id);
                  router.push('/');

                } catch (err) {
                  alert(err instanceof Error ? err.message : 'Could not leave group');
                }
              }
            }}
            className="w-9 h-9 rounded-full bg-rose-50 dark:bg-rose-950/40 text-rose-500 hover:bg-rose-100 dark:hover:bg-rose-900/60 border border-rose-200 dark:border-rose-800/60 flex items-center justify-center transition-colors shadow-sm active:scale-95"
            title={isGroupHost ? 'Delete Group' : 'Leave Group'}
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Action Header Card — Add Bill to Group */}
      <div className="photo-card-indigo p-4 space-y-3 rounded-2xl">
        <div className="flex items-center justify-between">
          <span className="px-2 py-0.5 rounded-full bg-black/30 text-white text-[9px] font-extrabold uppercase tracking-wider backdrop-blur-md">
            {t('tripExpenseTracker', undefined, 'Group Expense Tracker')}
          </span>
          <Sparkles className="w-3.5 h-3.5 text-white" />
        </div>

        <div>
          <h2 className="text-base font-black text-white">{t('addBillsToGroup', { groupName: group.name }, `Add Bills to ${group.name}`)}</h2>
        </div>

        <div className="pt-0.5">
          <input
            type="file"
            ref={cameraInputRef}
            accept="image/*"
            capture="environment"
            onChange={handlePhotoUpload}
            className="hidden"
          />

          <button
            onClick={() => {
              setShowStartSplitModal(true);
              triggerHaptic('medium');
            }}
            className="w-full py-3.5 px-6 rounded-2xl bg-white text-emerald-600 hover:bg-slate-50 font-black text-sm shadow-sm active:scale-[0.98] transition-all flex items-center justify-center gap-2"
          >
            <Sparkles className="w-4 h-4 text-emerald-600 animate-pulse" />
            <span>{t('startSplitBtn', undefined, 'Start Split')}</span>
          </button>
        </div>
      </div>

      {/* SECTION 1: DEBT MINIMIZATION SUMMARY */}
      <div className="photo-card p-3 bg-white dark:bg-[#121824] border border-slate-200/80 dark:border-[#222C3D] shadow-sm space-y-2">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-1.5">
          <div className="flex items-center gap-1.5">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4 text-slate-900 dark:text-white">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
            </svg>
            <h3 className="font-bold text-xs text-slate-900 dark:text-white">{t('debtMinimizationTitle', undefined, 'Debt Minimization Settlement')}</h3>
          </div>
        </div>

        {/* Member Avatars Live Net Balance Badges */}
        <div className="space-y-1">
          <span className="text-[9px] font-extrabold uppercase tracking-wider text-slate-400 block">
            {t('memberNetBalances', undefined, 'MEMBER NET BALANCES')}
          </span>
          <div className="grid grid-cols-2 gap-2.5 pt-1">
            {balances.map((b: any) => {
              const isCreditor = b.netBalance > 0.01;
              const isDebtor = b.netBalance < -0.01;

              return (
                <div
                  key={b.memberId}
                  className="flex items-center gap-2.5 p-3 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs transition-all duration-200"
                >
                  <div className="w-9 h-9 rounded-full flex items-center justify-center bg-slate-200/80 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-300/60 dark:border-slate-700 shrink-0 shadow-xs">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
                    </svg>
                  </div>
                  <div className="flex flex-col min-w-0">
                    <span className="text-xs font-black text-slate-800 dark:text-white leading-tight truncate">
                      {b.name}
                    </span>
                    <span
                      className={`text-[10px] font-extrabold font-mono mt-1 px-1.5 py-0.5 rounded-md leading-none border w-max ${
                        isCreditor
                          ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                          : isDebtor
                          ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-500 border-transparent'
                      }`}
                    >
                      {isCreditor ? `+${formatCurrency(b.netBalance, group.currency || 'NIS')}` : isDebtor ? `-${formatCurrency(Math.abs(b.netBalance), group.currency || 'NIS')}` : formatCurrency(0, group.currency || 'NIS')}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Minimized Transactions List */}
        {minimizedTransactions.length === 0 ? (
          <p className="text-xs text-slate-400 font-medium text-center py-1.5">
            {unassignedAmount > 0
              ? t('assignItemsToCalculate', undefined, 'Claim the remaining items to complete the settlement calculation.')
              : t('allExpensesSettled', undefined, 'All group expenses are settled! No debts owed. 🎉')}
          </p>
        ) : (
          <div className="space-y-1.5 pt-0.5">
            {minimizedTransactions.map((tx: any, idx: number) => {
              const hasPaymentPhone = isValidIsraeliPhone(tx.toPhone || '');
              const handleOpenBit = () => {
                triggerBitPayment({
                  phone: tx.toPhone || '',
                  amount: tx.amount || 0,
                  title: `Settlement to ${tx.toName} (${group.name})`
                });
              };

              const handleOpenPaybox = () => {
                let cleanPhone = (tx.toPhone || '').replace(/\D/g, '');
                if (cleanPhone.startsWith('972')) {
                  cleanPhone = '0' + cleanPhone.substring(3);
                }
                const amt = (tx.amount || 0).toFixed(2);
                try {
                  navigator.clipboard.writeText(`${cleanPhone} ${amt}`);
                } catch (e) {}
                alert(`Opening Paybox!\nRecipient: ${tx.toName} (${cleanPhone})\nAmount: ${formatCurrency(tx.amount || 0, group.currency || 'NIS')}\n(Copied to clipboard 📋)`);
                const isMobile = typeof window !== 'undefined' && /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
                if (isMobile) {
                  window.location.href = `paybox://pay?phone=${cleanPhone}&amount=${amt}`;
                  setTimeout(() => {
                    window.open(`https://payboxapp.page.link/pay?phone=${cleanPhone}&amount=${amt}`, '_blank');
                  }, 800);
                } else {
                  window.open(`https://payboxapp.page.link/pay?phone=${cleanPhone}&amount=${amt}`, '_blank');
                }
              };

              return (
                <div
                  key={idx}
                  className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-between"
                >
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-1.5 text-xs font-bold">
                      <span className="text-rose-500 font-extrabold">{tx.fromName}</span>
                      <ArrowRight className="w-3 h-3 text-slate-400" />
                      <span className="text-emerald-500 font-extrabold">{tx.toName}</span>
                    </div>
                    <span className="text-xs font-mono font-black text-slate-900 dark:text-white block">
                      {formatCurrency(tx.amount || 0, group.currency || 'NIS')}
                    </span>
                  </div>


                  {hasPaymentPhone ? (
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={handleOpenBit}
                        className="px-3.5 py-1.5 text-[10px] font-black text-white rounded-full bg-gradient-to-r from-[#7026FF] to-[#00C2F3] shadow-sm hover:brightness-110 active:scale-95 transition-all text-center"
                      >
                        Bit
                      </button>
                      <button
                        type="button"
                        onClick={handleOpenPaybox}
                        className="px-3.5 py-1.5 text-[10px] font-black text-white rounded-full bg-gradient-to-r from-[#005082] to-[#00C5B4] shadow-sm hover:brightness-110 active:scale-95 transition-all text-center"
                      >
                        Paybox
                      </button>
                    </div>
                  ) : (
                    <span className="max-w-28 text-right text-[9px] font-semibold text-slate-400">
                      {t('paymentPhoneMissingShort', undefined, 'Payment phone not set')}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* SECTION 2: PAST BILLS TIMELINE & INTERACTIVE CLAIMING */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-base text-slate-900 dark:text-white flex items-center gap-2">
            <FileText className="w-4 h-4" />
            <span>{t('groupPastBills', { n: validBills.length }, `Group Past Bills (${validBills.length})`)}</span>
          </h2>
          <span className="text-[11px] text-slate-400 font-medium">{t('tapPastBillNotice', undefined, 'Tap past bill to claim items')}</span>
        </div>

        {validBills.length === 0 ? (
          <div className="photo-card p-6 bg-white dark:bg-[#121824] text-center text-slate-400 space-y-2">
            <FileText className="w-10 h-10 mx-auto text-slate-300 dark:text-slate-600 mb-1" />
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
              {t('noBillsYetGroup', undefined, 'No bills added to this group yet. Use the buttons above to scan or create a bill!')}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {validBills.map((bill: any) => {
              const isExpanded = expandedBillId === bill.id;
              const activePayerMember = validMembers.find((m: any) => 
                m.id === bill.payerId || 
                (m.name && bill.payerId && m.name.trim().toLowerCase() === String(bill.payerId).trim().toLowerCase())
              ) || validMembers[0];
              const payerName = activePayerMember?.name || 'Group Member';
              const itemsList = Array.isArray(bill.items) ? bill.items : [];
              const isPaymentLocked = bill.status === 'settled'
                || (Array.isArray(bill.settledMemberIds) && bill.settledMemberIds.length > 0);
              const canManageBill = !isPaymentLocked && (isGroupHost || bill.createdByMemberId === currentMemberId);

              const handleToggleItemClaim = (itemId: string, memberIdToToggle: string, claimed: boolean) => {
                if (isPaymentLocked || memberIdToToggle !== currentMemberId) return;
                sendGroupBillAction('TOGGLE_CLAIM', { billId: bill.id, itemId, claimed });
              };

              const handleSetPayer = (newPayerId: string) => {
                sendGroupBillAction('SET_PAYER', { billId: bill.id, payerId: newPayerId });
              };

              const handleSplitAllItems = () => {
                sendGroupBillAction('SPLIT_ALL', { billId: bill.id });
              };

              return (
                <SwipeableCard
                  key={bill.id}
                  onDelete={() => isPaymentLocked ? false : handleDeleteBill(bill.id)}
                  className="shadow-sm"
                >
                  <div
                    className="photo-card bg-white dark:bg-[#121824] border border-slate-200/80 dark:border-[#222C3D] overflow-hidden transition-all shadow-xs"
                  >
                    <div
                      onClick={() => setExpandedBillId(isExpanded ? null : bill.id)}
                      className="p-3.5 space-y-2.5 cursor-pointer hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors"
                    >
                      {/* Row 1: Title & Total Amount */}
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-0.5 min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 min-w-0">
                            {isPaymentLocked ? (
                              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-3.5 h-3.5 text-emerald-500 shrink-0" aria-label="Settled">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
                              </svg>
                            ) : (
                              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-3.5 h-3.5 text-amber-500 shrink-0" aria-label="Active">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 10.5V6.75a4.5 4.5 0 1 1 9 0v3.75M3.75 21.75h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H3.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
                              </svg>
                            )}
                            <h4 className="font-extrabold text-slate-900 dark:text-white text-xs leading-tight truncate">
                              {bill.title}
                            </h4>
                          </div>
                          <p className="text-[10px] text-slate-500 dark:text-slate-400 font-medium leading-tight">
                            {bill.date} • {t('paidByLabel', { name: payerName }, `Paid by ${payerName}`)}
                          </p>
                        </div>

                        <div className="shrink-0 text-right">
                          <span className="font-mono font-black text-slate-900 dark:text-white text-xs">
                            {formatCurrency(bill.amount || 0, group.currency || 'NIS')}
                          </span>
                        </div>
                      </div>

                      {/* Row 2: Bigger Centered Live Session Button */}
                      <div className="pt-0.5 flex items-center justify-center">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            const targetSessionId = bill.sessionId || `sess_g_${bill.id}`;
                            saveRoomCredentials('session', targetSessionId, currentMemberId, getRoomToken('group', group.id));
                            router.push(`/session/${targetSessionId}?groupId=${group.id}`);
                          }}
                          className="w-full py-2.5 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 text-white font-extrabold text-xs shadow-md shadow-slate-900/10 transition-all flex items-center justify-center gap-2 active:scale-[0.98]"
                          title="Open Live Claiming Session"
                        >
                          <Sparkles className="w-3.5 h-3.5 text-white animate-pulse" />
                          <span>{t('liveSessionBtn', undefined, 'Live Session')}</span>
                          <ArrowRight className={`w-3.5 h-3.5 text-white/90 ${isRtl ? 'rotate-180' : ''}`} />
                        </button>
                      </div>
                    </div>

                    {/* Expanded Interactive Item Claiming & Payer Selector */}
                    {isExpanded && (
                      <div className="p-3 bg-slate-50/80 dark:bg-slate-900/60 border-t border-slate-100 dark:border-slate-800 space-y-2.5 text-xs">
                        {/* Payer Selector & Edit Action */}
                        <div className="flex items-center justify-between bg-white dark:bg-slate-800 p-2 rounded-xl border border-slate-200/80 dark:border-slate-700">
                          <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400">{t('whoPaidUpfront', undefined, 'Who paid this bill upfront?')}</span>
                          <div className="flex items-center gap-1.5">
                            <select
                              value={activePayerMember?.id || validMembers[0]?.id}
                              onChange={(e) => handleSetPayer(e.target.value)}
                              disabled={!canManageBill}
                              className="py-1 px-2 rounded-lg bg-slate-100 dark:bg-slate-900 text-xs font-bold border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                            >
                              {validMembers.map((m: any) => (
                                <option key={m.id} value={m.id}>
                                  {m.name}
                                </option>
                              ))}
                            </select>

                            {canManageBill && <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setPendingReceiptDraft(null);
                                setPendingScanId('');
                                setEditingBill(bill);
                                setShowCreateBillModal(true);
                              }}
                              className="p-1 rounded-lg text-slate-500 hover:text-indigo-600 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                              title="Edit Bill Details"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>}
                          </div>
                        </div>

                        <div className="flex items-center justify-between">
                          <span className="font-extrabold uppercase text-[10px] text-slate-400 tracking-wider">
                            {t('tapMemberChipNotice', undefined, 'Tap member chip on an item to claim item share:')}
                          </span>
                          {canManageBill && <button
                            onClick={handleSplitAllItems}
                            className="px-2 py-0.5 rounded-full bg-slate-200 dark:bg-slate-800 text-[10px] font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-300 transition-colors"
                          >
                            {t('splitAllEqually', undefined, 'Split All Equally')}
                          </button>}
                        </div>

                        {/* Items List with Interactive Member Claim Chips */}
                        <div className="space-y-2">
                          {itemsList.map((item: any) => {
                            const itemClaimants = Array.isArray(item.claimedBy) ? item.claimedBy : [];

                            return (
                              <div
                                key={item.id}
                                className="p-2.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 space-y-2"
                              >
                                <div className="flex justify-between items-center text-slate-900 dark:text-white">
                                  <span className="font-bold">{item.name}</span>
                                  <span className="font-mono font-extrabold">{formatCurrency(item.price || 0, group.currency || 'NIS')}</span>
                                </div>


                                {/* Member Claim Chips */}
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  {validMembers.map((m: any) => {
                                    const isClaimed = itemClaimants.includes(m.id);
                                    const initials = (m.name || 'M').substring(0, 2).toUpperCase();
                                    const isMe = m.id === currentMemberId;

                                    return (
                                      <button
                                        key={m.id}
                                        onClick={() => handleToggleItemClaim(item.id, m.id, !isClaimed)}
                                        disabled={!isMe || isPaymentLocked}
                                        className={`px-2 py-1 rounded-full text-[10px] font-extrabold flex items-center gap-1 transition-all ${
                                          isClaimed
                                            ? 'bg-slate-950 dark:bg-white text-white dark:text-slate-950 shadow-sm'
                                            : 'bg-slate-100 dark:bg-slate-900 text-slate-500 border border-slate-200 dark:border-slate-700 hover:bg-slate-200'
                                        } ${!isMe ? 'cursor-default opacity-70' : ''}`}
                                      >
                                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-3.5 h-3.5">
                                          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
                                        </svg>
                                        <span>{m.name}</span>
                                        {isClaimed && <CheckCircle2 className="w-3 h-3 text-emerald-400 dark:text-emerald-600" />}
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                </SwipeableCard>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
