'use client';

import React, { useState, useEffect, useRef, useMemo, Suspense, Component, ErrorInfo, ReactNode } from 'react';
import { useParams, useRouter } from 'next/navigation';
import confetti from 'canvas-confetti';
import {
  QrCode,
  Users,
  Plus,
  Zap,
  CheckCircle2,
  ChevronLeft,
  Sparkles,
  UserPlus,
  X,
  Sun,
  Moon,
  Utensils,
  GlassWater,
  Tag,
  ShoppingBag,
  Cookie,
  Check,
  RefreshCw,
  Pencil,
  Trash2,
  Link2,
  Share2,
  CreditCard
} from 'lucide-react';
import { useLanguage } from '../../../components/LanguageContext';
import { QRCodeModal } from '../../../components/QRCodeModal';
import { AttachToGroupModal } from '../../../components/AttachToGroupModal';
import { ReceiptSkeleton } from '../../../components/SkeletonLoader';
import { getCookie, setCookie } from '../../../../lib/cookies';
import { isValidIsraeliPhone, triggerBitPayment } from '../../../../lib/bitDeepLink';
import { triggerHaptic } from '../../../../lib/haptics';
import { getRoomMemberId, getRoomToken, roomHeaders, saveRoomCredentials } from '../../../../lib/roomTokens';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

class SessionErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  public state: ErrorBoundaryState = {
    hasError: false
  };

  public static getDerivedStateFromError(_: Error): ErrorBoundaryState {
    return { hasError: true };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Session ErrorBoundary caught an exception:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center min-h-screen p-6 bg-slate-50 dark:bg-[#0A0E17] text-slate-900 dark:text-white text-center space-y-4">
          <div className="p-4 rounded-full bg-indigo-100 dark:bg-slate-800 text-indigo-600 dark:text-indigo-400">
            <Sparkles className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-bold">Session Workspace Ready</h2>
          <p className="text-xs text-slate-500 max-w-xs">
            Connecting to real-time session room... Click refresh to load workspace.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="py-3 px-6 photo-btn-indigo text-xs font-bold flex items-center gap-2"
          >
            <RefreshCw className="w-4 h-4" />
            <span>Reload Session</span>
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

function SessionWorkspaceInner() {
  const params = useParams();
  const router = useRouter();
  const sessionId = (params?.id as string) || '';

  const langCtx = useLanguage();
  const t = langCtx?.t || ((k: string, p?: any, d?: string) => d || k);
  const formatPrice = langCtx?.formatPrice || ((a: number) => `${a || 0}`);
  const formatDual = langCtx?.formatDual || ((a: number) => ({ primary: `${a || 0}` }));
  const profile = langCtx?.profile || { displayName: 'User', avatarColor: '#7C3AED' };
  const isRtl = langCtx?.isRtl || false;
  const theme = langCtx?.theme || 'light';
  const setTheme = langCtx?.setTheme || (() => {});

  // Connection & state management
  const [session, setSession] = useState<any>(null);
  const [currentMemberId, setCurrentMemberId] = useState<string>('');
  
  // Modals & Triggers
  const [showAddItemModal, setShowAddItemModal] = useState<boolean>(false);
  const [showEditItemModal, setShowEditItemModal] = useState<boolean>(false);
  const [showSettleModal, setShowSettleModal] = useState<boolean>(false);
  const [isRounded, setIsRounded] = useState<boolean>(false);
  const [showQrModal, setShowQrModal] = useState<boolean>(false);
  const [showAttachGroupModal, setShowAttachGroupModal] = useState<boolean>(false);
  const [userGroups, setUserGroups] = useState<any[]>([]);

  // Input states
  const [newItemName, setNewItemName] = useState('');
  const [newItemPrice, setNewItemPrice] = useState('');
  const [newItemCategory, setNewItemCategory] = useState('Food');

  const [editingItemId, setEditingItemId] = useState('');
  const [editItemName, setEditItemName] = useState('');
  const [editItemPrice, setEditItemPrice] = useState('');
  const [editItemCategory, setEditItemCategory] = useState('Food');
  const [tipPercentage, setTipPercentage] = useState<number>(0);
  const [customTipInput, setCustomTipInput] = useState<string>('');

  useEffect(() => {
    setTipPercentage(Number(session?.tipPercentage || 0));
  }, [session?.tipPercentage]);

  const handleBackNavigation = () => {
    const urlParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
    const targetGroupId = urlParams?.get('groupId') || session?.groupId;
    if (targetGroupId) {
      router.push(`/group/${targetGroupId}`);
    } else {
      router.push('/');
    }
  };

  const socketRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!sessionId || !profile.displayName) return;
    let disposed = false;
    let pollInterval: ReturnType<typeof setInterval> | null = null;

    const initializeSession = async () => {
      try {
        const initialRes = await fetch(`/api/session/${sessionId}`);
        if (initialRes.status === 404) {
          if (!disposed) setSessionNotFound(true);
          return;
        }
        const initialData = await initialRes.json();
        if (!initialRes.ok || !initialData.session) throw new Error(initialData.error || 'Could not load session');

        const resolvedId = initialData.session.id;
        const urlParams = new URLSearchParams(window.location.search);
        const linkedGroupId = urlParams.get('groupId') || initialData.session.groupId;
        const existingToken = getRoomToken('session', resolvedId)
          || (linkedGroupId ? getRoomToken('group', linkedGroupId) : '');
        if (existingToken && !getRoomToken('session', resolvedId)) {
          saveRoomCredentials('session', resolvedId, '', existingToken);
        }

        if (initialData.session.status === 'settled') {
          if (!disposed) setSession(initialData.session);
          return;
        }

        const joinRes = await fetch(`/api/session/${resolvedId}/join`, {
          method: 'POST',
          headers: roomHeaders('session', resolvedId),
          body: JSON.stringify({ name: profile?.displayName || 'Guest' }),
        });
        const joined = await joinRes.json();
        if (!joinRes.ok || !joined.session || !joined.accessToken) {
          throw new Error(joined.error || 'Could not join session');
        }
        saveRoomCredentials('session', resolvedId, joined.memberId, joined.accessToken);
        if (resolvedId !== sessionId) saveRoomCredentials('session', sessionId, joined.memberId, joined.accessToken);

        if (!disposed) {
          setCurrentMemberId(joined.memberId);
          setSession(joined.session);
          setSessionNotFound(false);
          connectWebSocket(resolvedId, joined.accessToken);
          pollInterval = setInterval(() => fetchSessionData(resolvedId), 15_000);
        }
      } catch (err) {
        console.error('Error initializing session:', err);
        if (!disposed) setSessionNotFound(true);
      }
    };

    initializeSession();

    // Load user groups from Cookie / LocalStorage
    const cookieGroups = getCookie('billsplit_user_groups');
    const localGroups = localStorage.getItem('billsplit_user_groups');
    const rawGroups = cookieGroups || (localGroups ? JSON.parse(localGroups) : []);
    if (Array.isArray(rawGroups)) {
      setUserGroups(rawGroups);
    }

    return () => {
      disposed = true;
      if (pollInterval) clearInterval(pollInterval);
      if (socketRef.current) {
        socketRef.current.close();
      }
    };
  }, [sessionId, profile.displayName]);

  useEffect(() => {
    if (!profile.displayName) {
      setUserGroups([]);
      return;
    }

    const queryParams = new URLSearchParams({
      userName: profile.displayName || '',
      phone: ''
    }).toString();

    fetch(`/api/user/groups?${queryParams}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.groups) {
          setUserGroups(data.groups);
        }
      })
      .catch((err) => {
        console.error('Error fetching user groups:', err);
        // Fallback to local storage if offline/error
        const cookieGroups = getCookie('billsplit_user_groups');
        const localGroups = localStorage.getItem('billsplit_user_groups');
        const rawGroups = cookieGroups || (localGroups ? JSON.parse(localGroups) : []);
        if (Array.isArray(rawGroups)) {
          setUserGroups(rawGroups);
        }
      });
  }, [profile.displayName]);

  const handleAttachToGroup = async (targetGroupId: string) => {
    if (!session) return;
    try {
      const groupRes = await fetch(`/api/groups/${targetGroupId}`);
      const groupData = await groupRes.json();
      if (!groupRes.ok || !groupData.group) throw new Error(groupData.error || 'Group not found');
      const resolvedGroupId = groupData.group.id;
      if (!getRoomToken('group', resolvedGroupId)) {
        const joinRes = await fetch('/api/groups/join', {
          method: 'POST',
          headers: roomHeaders('group', targetGroupId),
          body: JSON.stringify({ groupId: resolvedGroupId, name: profile.displayName || 'Member' }),
        });
        const joined = await joinRes.json();
        if (!joinRes.ok || !joined.accessToken) throw new Error(joined.error || 'Could not join group');
        saveRoomCredentials('group', resolvedGroupId, joined.memberId, joined.accessToken);
      }
      const res = await fetch('/api/groups/bill', {
        method: 'POST',
        headers: roomHeaders('group', resolvedGroupId),
        body: JSON.stringify({
          groupId: resolvedGroupId,
          bill: {
            id: session.billId || session.id,
            title: session.storeName || 'Uploaded Bill',
            currency: session.currency || 'NIS',
            payerId: getRoomMemberId('group', resolvedGroupId) || groupData.group.members?.[0]?.id,
            sourceSessionId: session.id,
            sourceSessionToken: getRoomToken('session', session.id),
            amount: session.items?.reduce((acc: number, i: any) => acc + (i.price || 0), 0) || 0,
            items: session.items || []
          }
        })
      });

      const data = await res.json();
      if (data.success) {
        saveRoomCredentials('session', session.id, getRoomMemberId('group', resolvedGroupId), getRoomToken('group', resolvedGroupId));
        setSession((prev: any) => ({ ...prev, groupId: resolvedGroupId }));
        setShowAttachGroupModal(false);
        alert(`Bill successfully attached to group! 🔗`);
      } else {
        alert(data.error || 'Could not attach bill to group.');
      }
    } catch (err) {
      console.error(err);
      alert('Error attaching bill to group.');
    }
  };

  // Persist active session in local storage for re-entry ONLY IF session is active and NOT settled/group bill
  useEffect(() => {
    if (session && session.id) {
      if (session.status === 'settled' || session.groupId) {
        localStorage.removeItem('billsplit_active_session');
      } else {
        const validMembers = Array.isArray(session.members) ? session.members : [];
        const isHost = validMembers.find((m: any) => m?.id === currentMemberId)?.isHost;
        localStorage.setItem(
          'billsplit_active_session',
          JSON.stringify({
            id: session.id,
            code: session.code,
            storeName: session.storeName,
            isHost: !!isHost,
            memberId: currentMemberId
          })
        );
      }
    }
  }, [session, currentMemberId]);

  // Auto-add group to user's saved active groups ONLY IF user hasn't explicitly left/deleted it
  useEffect(() => {
    const targetGroupId = session?.groupId;
    if (targetGroupId) {
      const localDeleted = localStorage.getItem('billsplit_deleted_group_ids');
      const deletedIds = localDeleted ? JSON.parse(localDeleted) : [];
      if (deletedIds.includes(targetGroupId)) return;

      fetch(`/api/groups/${targetGroupId}`)
        .then((res) => res.json())
        .then((data) => {
          if (data.success && data.group) {
            const cookieGroups = getCookie('billsplit_user_groups');
            const localGroups = localStorage.getItem('billsplit_user_groups');
            const rawGroups = cookieGroups || (localGroups ? JSON.parse(localGroups) : []);
            const groupList = Array.isArray(rawGroups) ? rawGroups : [];
            const exists = groupList.some((g: any) => g.id === data.group.id);
            if (!exists) {
              const updated = [...groupList, data.group];
              setCookie('billsplit_user_groups', updated);
              localStorage.setItem('billsplit_user_groups', JSON.stringify(updated));
            }
          }
        })
        .catch(() => {});
    }
  }, [session?.groupId]);

  useEffect(() => {
    if (session?.status === 'settled') {
      localStorage.removeItem('billsplit_active_session');
    }
  }, [session?.status]);

  const [sessionNotFound, setSessionNotFound] = useState(false);

  const fetchSessionData = async (id: string) => {
    try {
      const res = await fetch(`/api/session/${id}`);
      if (res.ok) {
        const data = await res.json();
        if (data.session) {
          setSession(data.session);
          setSessionNotFound(false);
        }
      } else if (res.status === 404) {
        setSessionNotFound(true);
      }
    } catch (err) {
      console.error('Error fetching session:', err);
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
            type: 'SUBSCRIBE',
            sessionId: id,
            accessToken,
          })
        );
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'SESSION_UPDATE' && data.session) {
            setSession(data.session);
          }
        } catch (e) {
          console.error(e);
        }
      };
    } catch (err) {
      console.error('WebSocket connection error:', err);
    }
  };

  const sendAction = async (action: string, payload: any = {}) => {
    triggerHaptic(action === 'SETTLE_ALL' ? 'success' : action === 'SPLIT_EVERYONE' ? 'medium' : 'light');
    try {
      const res = await fetch('/api/session/action', {
        method: 'POST',
        headers: roomHeaders('session', session?.id || sessionId),
        body: JSON.stringify({
          sessionId: session?.id || sessionId,
          action,
          payload: { ...payload, memberId: currentMemberId },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Action failed');
      if (data.session) setSession(data.session);
      return true;
    } catch (err) {
      console.error('Session action failed:', err);
      alert(err instanceof Error ? err.message : 'Could not update the session.');
      return false;
    }
  };

  const handleAddItemSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItemName || !newItemPrice) return;

    sendAction('ADD_ITEM', {
      name: newItemName,
      price: parseFloat(newItemPrice) || 0,
      category: newItemCategory,
    });
    setNewItemName('');
    setNewItemPrice('');
    setShowAddItemModal(false);
  };

  const handleOpenEditModal = (item: any, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingItemId(item.id);
    setEditItemName(item.name || '');
    setEditItemPrice(item.price ? String(item.price) : '');
    setEditItemCategory(item.category || 'Food');
    setShowEditItemModal(true);
  };

  const handleEditItemSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingItemId || !editItemName || !editItemPrice) return;

    sendAction('EDIT_ITEM', {
      itemId: editingItemId,
      name: editItemName,
      price: parseFloat(editItemPrice) || 0,
      category: editItemCategory,
    });
    setShowEditItemModal(false);
  };

  const handleDeleteItem = (itemId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm(t('confirmDeleteItem', undefined, 'Delete this item from receipt?'))) {
      sendAction('DELETE_ITEM', { itemId });
      setShowEditItemModal(false);
    }
  };

  // Category Icon Resolver
  const getItemIcon = (category: string) => {
    const catLower = (category || '').toLowerCase();
    if (catLower.includes('drink') || catLower.includes('beverage') || catLower.includes('coke') || catLower.includes('beer')) {
      return <GlassWater className="w-4 h-4 text-emerald-500 shrink-0" />;
    } else if (catLower.includes('dessert') || catLower.includes('sweet') || catLower.includes('ice')) {
      return <Cookie className="w-4 h-4 text-amber-500 shrink-0" />;
    } else if (catLower.includes('service') || catLower.includes('tax') || catLower.includes('tip')) {
      return <Tag className="w-4 h-4 text-indigo-500 shrink-0" />;
    } else if (catLower.includes('food') || catLower.includes('main') || catLower.includes('appetizer')) {
      return <Utensils className="w-4 h-4 text-indigo-400 shrink-0" />;
    }
    return <ShoppingBag className="w-4 h-4 text-slate-400 shrink-0" />;
  };

  const validMembers = Array.isArray(session?.members) ? session.members : [];
  const validItems = Array.isArray(session?.items) ? session.items : [];

  // Bulletproof Calculations
  const memberCalculations = useMemo(() => {
    if (!session || !validItems.length) {
      return { myShare: 0, subtotal: 0, totalSubtotal: 0, grandTotal: 0, itemsCount: 0 };
    }

    let mySubtotal = 0;
    let totalSubtotal = 0;

    validItems.forEach((item: any) => {
      const price = typeof item?.price === 'number' ? item.price : parseFloat(item?.price) || 0;
      totalSubtotal += price;
      const claimants = Array.isArray(item?.claimedBy) ? item.claimedBy : [];
      if (claimants.includes(currentMemberId)) {
        mySubtotal += price / (claimants.length || 1);
      }
    });

    const tipMultiplier = 1 + (tipPercentage || 0) / 100;
    const myShareWithTip = mySubtotal * tipMultiplier;

    return {
      myShare: myShareWithTip,
      subtotal: mySubtotal,
      totalSubtotal,
      grandTotal: totalSubtotal * tipMultiplier,
      itemsCount: validItems.length,
    };
  }, [session, validItems, currentMemberId, tipPercentage]);

  const currentMember = validMembers.find((m: any) => m?.id === currentMemberId);
  const hostMember = validMembers.find((m: any) => m?.isHost) || validMembers[0];
  const isCurrentUserHost = Boolean(currentMember?.isHost);
  const isSessionClosed = session?.status === 'settled';

  const activePayerId = session?.payerId || 'each';
  const isEachPaid = activePayerId === 'each';
  const payerMember = !isEachPaid ? validMembers.find((m: any) => m?.id === activePayerId) : null;
  const activePayerName = payerMember?.name || (isEachPaid ? t('eachPaidShare', undefined, 'Each paid their own share') : (session?.hostName || hostMember?.name || 'Host'));
  const activePayerPhone = payerMember?.phone || (payerMember?.isHost ? session?.hostPhone : (hostMember?.phone || ''));
  const isMePayer = !isEachPaid && activePayerId === currentMemberId;
  const canPayPayer = isValidIsraeliPhone(activePayerPhone);

  const triggerCelebration = () => {
    try {
      confetti({
        particleCount: 120,
        spread: 70,
        origin: { y: 0.6 }
      });
    } catch (e) {
      // ignore
    }
  };

  if (!session) {
    if (sessionNotFound) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-50 p-6 text-center text-slate-900 dark:bg-[#0A0E17] dark:text-white">
          <h2 className="text-xl font-extrabold">{t('sessionNotFoundTitle', undefined, 'Session not found')}</h2>
          <p className="max-w-sm text-sm text-slate-500">{t('sessionNotFoundText', undefined, 'This link or code is invalid, expired, or the room was deleted.')}</p>
          <button onClick={() => router.push('/')} className="photo-btn-indigo px-6 py-3 text-sm font-bold">
            {t('backToHomeBtn', undefined, 'Back to Home')}
          </button>
        </div>
      );
    }
    return (
      <div className="flex flex-col min-h-screen p-5 bg-slate-50 dark:bg-[#0A0E17]">
        <ReceiptSkeleton />
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen p-5 text-slate-900 dark:text-slate-100 bg-slate-50 dark:bg-[#121212] space-y-6 transition-colors duration-300 pb-28">
      {/* Header Bar */}
      <header className="flex items-center justify-between py-2 border-b border-slate-200/80 dark:border-slate-800">
        <button
          onClick={handleBackNavigation}
          className="w-10 h-10 rounded-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 flex items-center justify-center transition-colors shadow-sm active:scale-95"
        >
          <ChevronLeft className={`w-5 h-5 ${isRtl ? 'rotate-180' : ''}`} />
        </button>

        <div className="text-center">
          <h1 className="font-extrabold text-base text-slate-900 dark:text-white">{session.storeName || 'Bill Session'}</h1>
          <p className="text-xs font-mono text-slate-600 dark:text-slate-400 font-bold mt-0.5">
            {t('codeLabel', undefined, 'Code')}: #{session.code || ''}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            className="w-10 h-10 rounded-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-700 dark:text-slate-200 hover:bg-slate-100 transition-colors shadow-sm"
            title="Toggle Theme"
          >
            {theme === 'dark' ? <Sun className="w-5 h-5 text-amber-400" /> : <Moon className="w-5 h-5 text-slate-700" />}
          </button>

          <button
            onClick={() => setShowQrModal(true)}
            className="w-10 h-10 rounded-full bg-[#7C3AED] text-white flex items-center justify-center hover:bg-indigo-700 transition-colors shadow-sm font-bold active:scale-95"
            title="Share & Invite"
          >
            <Share2 className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* Share / QR Modal */}
      <QRCodeModal
        isOpen={showQrModal}
        onClose={() => setShowQrModal(false)}
        sessionCode={session.code || ''}
        sessionId={session.id || ''}
      />

      {/* Real-Time Members List - Compact & Classic Design */}
      <div className="photo-card p-4 bg-white dark:bg-[#121824] border border-slate-200/80 dark:border-[#222C3D] shadow-soft space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-slate-900 dark:text-white" />
            <h3 className="font-bold text-sm text-slate-900 dark:text-white">{t('roomMembersTitle', undefined, 'Room Members')}</h3>
            <span className="px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-xs font-bold text-slate-700 dark:text-slate-300">
              {validMembers.length}
            </span>
          </div>

          <button
            onClick={() => setShowQrModal(true)}
            className="py-1 px-3 rounded-full bg-[#7C3AED] hover:bg-indigo-700 text-white text-xs font-extrabold flex items-center gap-1 transition-all shadow-sm active:scale-95"
          >
            <UserPlus className="w-3.5 h-3.5" />
            <span>{t('inviteBtn', undefined, 'Invite')}</span>
          </button>
        </div>

        {/* Member Avatars Horizontal Scroll */}
        <div className="flex items-center gap-3 overflow-x-auto pb-1 pt-1 scrollbar-none">
          {validMembers.map((member: any) => {
            const isMe = member?.id === currentMemberId;
            const validName = member?.name && member?.name.trim() !== '?' ? member.name.trim() : 'Guest';
            const initials = validName.substring(0, 2).toUpperCase();

            return (
              <div
                key={member?.id}
                className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-100 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700/60 shrink-0 text-xs font-semibold text-slate-800 dark:text-slate-200"
              >
                <div
                  className="w-5 h-5 rounded-full flex items-center justify-center font-bold text-[10px] text-slate-950 shadow-sm overflow-hidden"
                  style={{ backgroundColor: (isMe && profile?.avatarUrl) ? 'transparent' : (member?.avatarColor || '#FFFFFF') }}
                >
                  {isMe && profile?.avatarUrl ? (
                    <img
                      src={profile.avatarUrl}
                      alt={validName}
                      className="w-full h-full object-cover rounded-full"
                    />
                  ) : (
                    initials
                  )}
                </div>

                <span>{validName} {isMe ? t('youSuffix', undefined, '(You)') : ''}</span>

                {member?.isHost && (
                  <span className="px-1.5 py-0.5 rounded-full bg-[#7C3AED] text-[9px] font-extrabold text-white">
                    {t('hostBadge', undefined, 'HOST')}
                  </span>
                )}
                {member?.settled && (
                  <span className="text-[#7C3AED] text-xs font-bold">✓</span>
                )}
              </div>
            );
          })}
        </div>

        {/* Dedicated Clean Attach to Group Bar */}
        {session.groupId ? (
          <div className="flex items-center justify-between px-3.5 py-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 text-emerald-700 dark:text-emerald-300 text-xs font-extrabold">
            <span className="flex items-center gap-2">
              <Link2 className="w-4 h-4 text-emerald-500" />
              <span>{t('billAttachedToGroup', undefined, 'Bill Attached to Group')}</span>
            </span>
            <span className="text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full bg-emerald-200 dark:bg-emerald-800 text-emerald-900 dark:text-emerald-100 shadow-sm">
              {t('linkedBadge', undefined, 'LINKED ✓')}
            </span>
          </div>
        ) : (
          <button
            onClick={() => setShowAttachGroupModal(true)}
            className="w-full py-2 px-3 rounded-xl bg-slate-50 dark:bg-slate-900/60 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-extrabold flex items-center justify-center gap-2 transition-all border border-dashed border-slate-300 dark:border-slate-700 active:scale-95 shadow-sm"
          >
            <Link2 className="w-4 h-4 text-[#7C3AED]" />
            <span>{t('attachBillTitle', undefined, 'Attach Bill to Group')} 🔗</span>
          </button>
        )}

        {/* Dedicated "Who paid for the bill?" Selector Bar */}
        <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200/80 dark:border-slate-800 text-xs">
          <div className="flex items-center gap-2">
            <CreditCard className="w-4 h-4 text-[#7C3AED] shrink-0" />
            <div>
              <span className="font-extrabold text-slate-900 dark:text-white block leading-tight text-[11px]">
                {t('whoPaidLabel', undefined, 'Who paid the bill?')}
              </span>
              <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium leading-none">
                {isEachPaid
                  ? t('eachPaidShareSub', undefined, 'Each pays their own share directly')
                  : t('singlePayerSub', { name: activePayerName }, `${activePayerName} paid upfront`)}
              </span>
            </div>
          </div>

          <select
            value={activePayerId}
            onChange={(e) => sendAction('SET_PAYER', { payerId: e.target.value })}
            disabled={isSessionClosed}
            className="py-1 px-2.5 rounded-lg bg-white dark:bg-slate-800 text-xs font-bold border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white shadow-xs focus:ring-1 focus:ring-purple-500 cursor-pointer max-w-[170px]"
          >
            <option value="each">👥 {t('eachPaidShareOption', undefined, 'Each paid their share')}</option>
            {validMembers.map((m: any) => (
              <option key={m.id} value={m.id}>
                👤 {m.name} {m.id === currentMemberId ? t('youSuffix', undefined, '(You)') : ''} {m.isHost ? `[${t('hostBadge', undefined, 'HOST')}]` : ''}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Shared Receipt Items Section */}
      <div className="flex-1 space-y-4">
        {isSessionClosed && (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-center text-sm font-bold text-emerald-800 dark:border-emerald-800/60 dark:bg-emerald-950/30 dark:text-emerald-200">
            {t('sessionClosedNotice', undefined, 'This session is settled and is now read-only.')}
          </div>
        )}
        {session?.reconciliation?.status === 'mismatch' && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-800/60 dark:bg-amber-950/30 dark:text-amber-100">
            <p className="font-extrabold">{t('receiptNeedsReviewTitle', undefined, 'Please review the scanned prices')}</p>
            <p className="mt-1 text-[11px] opacity-80">
              {t('receiptNeedsReviewText', undefined, `The scanned items total ${session.reconciliation.calculatedTotal?.toFixed?.(2) || session.reconciliation.itemTotal?.toFixed?.(2)}, while the receipt shows ${session.reconciliation.receiptTotal?.toFixed?.(2)}. Edit any OCR mistakes before splitting.`)}
            </p>
          </div>
        )}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-bold text-lg text-slate-900 dark:text-white">{t('receiptItemsTitle', undefined, 'Receipt Items')}</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">{t('tapItemToClaim', undefined, 'Tap item to claim & split cost')}</p>
          </div>

          {isCurrentUserHost && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowAddItemModal(true)}
                className="py-1.5 px-3 rounded-full bg-slate-100 dark:bg-zinc-800 hover:bg-slate-200 dark:hover:bg-zinc-700 text-slate-800 dark:text-slate-200 text-xs font-extrabold flex items-center gap-1 transition-all border border-slate-200 dark:border-white/5 active:scale-95"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{t('addItemBtn', undefined, 'Add Item')}</span>
              </button>

              <button
                onClick={() => sendAction('SPLIT_EVERYONE', {})}
                className="py-1.5 px-3.5 rounded-full bg-[#7C3AED] hover:bg-indigo-700 text-white text-xs font-extrabold flex items-center gap-1.5 transition-all shadow-sm active:scale-95"
              >
                <Zap className="w-3.5 h-3.5 fill-white" />
                <span>{t('splitAllBtn', undefined, 'Split All')}</span>
              </button>
            </div>
          )}
        </div>

        {/* Item Cards List grouped inside a single container with low-opacity dividers */}
        <div className="bg-white dark:bg-[#1A1A1A] rounded-2xl border border-slate-150 dark:border-white/5 divide-y divide-slate-100 dark:divide-white/5 overflow-hidden shadow-soft">
          {validItems.map((item: any) => {
            const claimants = Array.isArray(item?.claimedBy) ? item.claimedBy : [];
            const isClaimedByMe = claimants.includes(currentMemberId);
            const splitCount = claimants.length;
            const itemPrice = typeof item?.price === 'number' ? item.price : parseFloat(item?.price) || 0;
            const splitPrice = splitCount > 0 ? itemPrice / splitCount : itemPrice;
            const activeCurr = session?.currency || langCtx?.currency || 'NIS';

            return (
              <div
                key={item?.id}
                onClick={isSessionClosed ? undefined : () => sendAction('TOGGLE_CLAIM', { itemId: item?.id, memberId: currentMemberId })}
                className={`relative p-5 transition-all flex flex-col ${isSessionClosed ? '' : 'cursor-pointer'} ${
                  isClaimedByMe
                    ? 'bg-indigo-50/20 dark:bg-purple-950/10'
                    : 'hover:bg-slate-50/50 dark:hover:bg-white/[0.01]'
                }`}
              >
                {/* Visual left accent bar when claimed */}
                {isClaimedByMe && (
                  <div className="absolute top-0 bottom-0 w-1 bg-[#7C3AED] ltr:left-0 rtl:right-0" />
                )}

                <div className="flex items-start justify-between mb-1">
                  <div className="flex items-center gap-3">
                    {/* Item Category Icon on the Left */}
                    <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-zinc-800/80 text-slate-700 dark:text-zinc-300 border border-slate-100 dark:border-white/5 shrink-0">
                      {getItemIcon(item?.category)}
                    </div>

                    <div>
                      <div className="flex items-center gap-1.5">
                        <h3 className="font-bold text-slate-900 dark:text-white text-sm md:text-base leading-tight">
                          {item?.name || 'Item'}
                        </h3>

                        {/* Edit Item Pencil Button */}
                        {isCurrentUserHost && (
                          <button
                            type="button"
                            onClick={(e) => handleOpenEditModal(item, e)}
                            className="p-1 rounded-full text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors"
                            title={t('editItemTitle', undefined, 'Edit Item')}
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>

                      <span className="text-[10px] text-slate-500 dark:text-zinc-400 font-semibold px-2 py-0.5 rounded bg-slate-50 dark:bg-zinc-800/40 border border-slate-150 dark:border-white/5 inline-block mt-1">
                        {t(`cat${item?.category}`, undefined, item?.category || 'General')}
                      </span>
                    </div>
                  </div>

                  <div className="text-right">
                    {(() => {
                      type DualPriceResult = { primary: string; secondary?: string };
                      const itemDual: DualPriceResult = formatDual ? formatDual(itemPrice, activeCurr) : { primary: `${itemPrice}` };
                      return (
                        <>
                          <div className="flex flex-col items-end">
                            <span className="text-sm md:text-base font-bold text-slate-900 dark:text-white">
                              {itemDual?.primary || `${itemPrice}`}
                            </span>
                            {itemDual?.secondary && (
                              <span className="text-[11px] font-semibold text-slate-500 dark:text-zinc-400 block mt-0.5">
                                ({itemDual.secondary})
                              </span>
                            )}
                          </div>
                        </>
                      );
                    })()}
                  </div>
                </div>

                {/* Claimants list: neatly aligned */}
                <div className="flex items-center justify-between pt-3 mt-3 border-t border-slate-100 dark:border-white/5">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {claimants.length === 0 ? (
                      <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 dark:text-zinc-500">
                        {t('availableLabel', undefined, 'Available')}
                      </span>
                    ) : (
                      claimants.map((cId: string) => {
                        const m = validMembers.find((mem: any) => mem?.id === cId);
                        const isMeClaimant = cId === currentMemberId;
                        const fullName = m?.name && m?.name.trim() !== '?' ? m.name.trim() : (isMeClaimant ? (profile?.displayName || 'User') : 'Member');
                        const initials = fullName.substring(0, 2).toUpperCase();

                        return (
                          <div
                            key={cId}
                            className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold transition-all ${
                              isMeClaimant
                                ? 'bg-[#7C3AED] text-white shadow-sm'
                                : 'bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-zinc-300 border border-slate-200/50 dark:border-white/5'
                            }`}
                          >
                            <div
                              className="w-3.5 h-3.5 rounded-full flex items-center justify-center font-bold text-[8px] text-slate-950 shrink-0 overflow-hidden"
                              style={{ backgroundColor: (isMeClaimant && profile?.avatarUrl) ? 'transparent' : (m?.avatarColor || profile?.avatarColor || '#FFFFFF') }}
                            >
                              {isMeClaimant && profile?.avatarUrl ? (
                                <img
                                  src={profile.avatarUrl}
                                  alt={fullName}
                                  className="w-full h-full object-cover rounded-full"
                                />
                              ) : (
                                initials
                              )}
                            </div>

                            <span>{fullName}</span>
                            {isMeClaimant && <Check className="w-2.5 h-2.5 text-white stroke-[3]" />}
                          </div>
                        );
                      })
                    )}
                  </div>

                  {splitCount > 1 && (
                    <span className="text-xs font-semibold text-slate-500 dark:text-zinc-400 shrink-0 pl-2">
                      {(() => {
                        type DualPriceResult = { primary: string; secondary?: string };
                        const splitDual: DualPriceResult = formatDual ? formatDual(splitPrice, activeCurr) : { primary: `${splitPrice}` };
                        return `${splitDual?.primary} ${splitDual?.secondary ? `(${splitDual.secondary}) ` : ''}${t('eachLabel', undefined, 'each')}`;
                      })()}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Floating Add Item Button */}
      {isCurrentUserHost && !isSessionClosed && <button
        onClick={() => setShowAddItemModal(true)}
        aria-label={t('addItemBtn', undefined, 'Add Item')}
        className="fixed bottom-24 ltr:right-6 rtl:left-6 z-30 w-14 h-14 rounded-full bg-[#7C3AED] text-white font-extrabold shadow-float flex items-center justify-center hover:scale-105 transition-all active:scale-95"
      >
        <Plus className="w-7 h-7" />
      </button>}

      {/* Bottom Floating Settlement Banner */}
      {!isSessionClosed && <div className="fixed bottom-0 left-0 right-0 max-w-md mx-auto z-40 p-5 bg-white/95 dark:bg-[#121212]/90 border-t border-slate-100 dark:border-white/5 backdrop-blur-xl flex items-center justify-between shadow-2xl">
        <div>
          <span className="text-xs text-slate-500 dark:text-slate-400 block">{t('yourShareLabel', undefined, 'Your Share')}</span>
          {(() => {
            type DualPriceResult = { primary: string; secondary?: string };
            const shareDual: DualPriceResult = formatDual ? formatDual(memberCalculations.myShare || 0, session?.currency || 'NIS') : { primary: `${memberCalculations.myShare || 0}` };
            return (
              <div className="flex items-baseline gap-1.5">
                <span className="text-xl font-bold text-slate-900 dark:text-white">
                  {shareDual?.primary || '0.00'}
                </span>
                {shareDual?.secondary && (
                  <span className="text-xs font-semibold text-[#7C3AED] dark:text-[#7C3AED]">
                    ({shareDual.secondary})
                  </span>
                )}
              </div>
            );
          })()}
        </div>

        <button
          onClick={() => setShowSettleModal(true)}
          className="py-3.5 px-6 rounded-xl bg-[#7C3AED] hover:bg-indigo-700 text-white font-bold shadow-lg shadow-indigo-600/30 text-sm transition-all active:scale-95"
        >
          {t('settleAndPayBtn', undefined, 'Settle & Pay')}
        </button>
      </div>}



      {/* --- MODAL 3: ADD CUSTOM ITEM MODAL --- */}
      {showAddItemModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-fadeIn">
          <div className="w-full max-w-sm photo-card p-6 bg-white dark:bg-[#121824] border border-slate-200 dark:border-[#222C3D] text-slate-900 dark:text-white space-y-4 shadow-float">
            <h3 className="text-lg font-bold text-center">{t('addCustomItemTitle', undefined, 'Add Custom Item')}</h3>

            <form onSubmit={handleAddItemSubmit} className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 block mb-1">
                  {t('itemNameLabel', undefined, 'Item Name')}
                </label>
                <input
                  type="text"
                  value={newItemName}
                  onChange={(e) => setNewItemName(e.target.value)}
                  placeholder="e.g. Extra Dessert"
                  className="w-full py-2.5 px-3 rounded-xl photo-input text-xs font-medium"
                  required
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 block mb-1">
                  {t('priceLabel', undefined, 'Price')}
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={newItemPrice}
                  onChange={(e) => setNewItemPrice(e.target.value)}
                  placeholder="0.00"
                  className="w-full py-2.5 px-3 rounded-xl photo-input text-xs font-medium font-mono"
                  required
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 block mb-1">
                  {t('categoryLabel', undefined, 'Category')}
                </label>
                <select
                  value={newItemCategory}
                  onChange={(e) => setNewItemCategory(e.target.value)}
                  className="w-full py-2.5 px-3 rounded-xl photo-input text-xs font-medium"
                >
                  <option value="Food">Food 🍕</option>
                  <option value="Beverages">Beverages 🥤</option>
                  <option value="Dessert">Dessert 🍰</option>
                  <option value="Service">Service / Tip 🏷️</option>
                  <option value="Other">Other 📦</option>
                </select>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddItemModal(false)}
                  className="flex-1 py-3 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-bold"
                >
                  {t('cancelBtn', undefined, 'Cancel')}
                </button>

                <button
                  type="submit"
                  className="flex-1 py-3 photo-btn-indigo text-xs shadow-md"
                >
                  {t('addItemBtn', undefined, 'Add Item')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- MODAL 4: EDIT / DELETE CUSTOM ITEM MODAL --- */}
      {showEditItemModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-fadeIn">
          <div className="w-full max-w-sm photo-card p-6 bg-white dark:bg-[#121824] border border-slate-200 dark:border-[#222C3D] text-slate-900 dark:text-white space-y-4 shadow-float">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold">{t('editItemTitle', undefined, 'Edit Receipt Item')}</h3>
              <button
                type="button"
                onClick={(e) => handleDeleteItem(editingItemId, e)}
                className="p-2 rounded-full text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors"
                title={t('deleteItemBtn', undefined, 'Delete Item')}
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleEditItemSubmit} className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 block mb-1">
                  {t('itemNameLabel', undefined, 'Item Name')}
                </label>
                <input
                  type="text"
                  value={editItemName}
                  onChange={(e) => setEditItemName(e.target.value)}
                  className="w-full py-2.5 px-3 rounded-xl photo-input text-xs font-medium"
                  required
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 block mb-1">
                  {t('priceLabel', undefined, 'Price')}
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={editItemPrice}
                  onChange={(e) => setEditItemPrice(e.target.value)}
                  className="w-full py-2.5 px-3 rounded-xl photo-input text-xs font-medium font-mono"
                  required
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 block mb-1">
                  {t('categoryLabel', undefined, 'Category')}
                </label>
                <select
                  value={editItemCategory}
                  onChange={(e) => setEditItemCategory(e.target.value)}
                  className="w-full py-2.5 px-3 rounded-xl photo-input text-xs font-medium"
                >
                  <option value="Food">Food 🍕</option>
                  <option value="Beverages">Beverages 🥤</option>
                  <option value="Dessert">Dessert 🍰</option>
                  <option value="Service">Service / Tip 🏷️</option>
                  <option value="Other">Other 📦</option>
                </select>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowEditItemModal(false)}
                  className="flex-1 py-3 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-bold"
                >
                  {t('cancelBtn', undefined, 'Cancel')}
                </button>

                <button
                  type="submit"
                  className="flex-1 py-3 photo-btn-indigo text-xs shadow-md"
                >
                  {t('updateItemBtn', undefined, 'Update Item')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- MODAL 4: SETTLE BREAKDOWN --- */}
      {showSettleModal && (() => {
        type DualRes = { primary: string; secondary?: string };
        const rawSub = typeof memberCalculations.subtotal === 'number' ? memberCalculations.subtotal : parseFloat(memberCalculations.subtotal as any) || 0;
        const subVal = Math.round((rawSub + Number.EPSILON) * 100) / 100;
        const tipVal = Math.round(((subVal * tipPercentage) / 100 + Number.EPSILON) * 100) / 100;
        const dueVal = Math.round(((subVal + tipVal) + Number.EPSILON) * 100) / 100;
        const finalDueVal = isRounded ? Math.round(dueVal) : dueVal;

        const subDual: DualRes = formatDual ? formatDual(subVal, session.currency || 'NIS') : { primary: `${subVal.toFixed(2)} ${session.currency || 'NIS'}` };
        const tipDual: DualRes = formatDual ? formatDual(tipVal, session.currency || 'NIS') : { primary: `${tipVal.toFixed(2)} ${session.currency || 'NIS'}` };
        const dueDual: DualRes = formatDual ? formatDual(finalDueVal, session.currency || 'NIS') : { primary: `${finalDueVal.toFixed(2)} ${session.currency || 'NIS'}` };

        return (
          <div className="fixed inset-0 z-50 flex flex-col justify-end bg-slate-950/60 backdrop-blur-sm animate-fadeIn">
            <div className="w-full max-w-md mx-auto rounded-t-[32px] p-6 bg-white dark:bg-[#121824] text-slate-900 dark:text-white space-y-5 max-h-[90vh] overflow-y-auto shadow-2xl">
              {/* Header */}
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
                <div>
                  <h2 className="text-xl font-extrabold text-slate-900 dark:text-white">{t('finalSettlementTitle', undefined, 'Final Settlement')}</h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{session.storeName || ''}</p>
                </div>

                <button
                  onClick={() => {
                    setShowSettleModal(false);
                    setIsRounded(false);
                  }}
                  className="p-1.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Tip Selector */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 block">
                  {t('selectTipLabel', undefined, 'Select Tip Percentage')}
                </label>
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
                  <div className="grid grid-cols-4 gap-2 flex-1">
                    {[0, 10, 12, 15].map((pct) => (
                      <button
                        key={pct}
                        type="button"
                        onClick={() => {
                          setTipPercentage(pct);
                          setCustomTipInput('');
                          sendAction('SET_TIP', { tipPercentage: pct });
                        }}
                        className={`py-2 rounded-full text-xs font-extrabold transition-all border active:scale-95 duration-100 ${
                          tipPercentage === pct && !customTipInput
                            ? 'bg-[#7C3AED] text-white border-[#7C3AED] shadow-sm'
                            : 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                        }`}
                      >
                        {pct}%
                      </button>
                    ))}
                  </div>

                  <div className="relative w-full sm:w-28 shrink-0">
                    <input
                      type="number"
                      placeholder="Custom %"
                      value={customTipInput}
                      onChange={(e) => {
                        const val = e.target.value;
                        setCustomTipInput(val);
                        const parsed = parseFloat(val);
                        setTipPercentage(isNaN(parsed) ? 0 : parsed);
                      }}
                      onBlur={() => sendAction('SET_TIP', { tipPercentage })}
                      min="0"
                      max="100"
                      className="w-full py-2 pl-3 pr-7 rounded-full text-xs text-center font-bold bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-750 text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-[#7C3AED] [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                    <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-extrabold text-slate-400 pointer-events-none">%</span>
                  </div>
                </div>
              </div>

              {/* Breakdown summary */}
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200/80 dark:border-slate-800 space-y-2 text-xs">
                <div className="flex justify-between text-slate-500 dark:text-slate-400">
                  <span>{t('itemsSubtotalLabel', undefined, 'Items Subtotal')}</span>
                  <span>
                    {subDual.primary} {subDual.secondary || ''}
                  </span>
                </div>
                <div className="flex justify-between text-slate-500 dark:text-slate-400">
                  <span>{t('tipAmountLabel', { pct: tipPercentage }, `Tip (${tipPercentage}%)`)}</span>
                  <span>
                    {tipDual.primary}
                  </span>
                </div>
                <div className="flex justify-between pt-2 border-t border-slate-200 dark:border-slate-800 text-base font-black text-slate-900 dark:text-white items-center">
                  <div className="flex items-center gap-2">
                    <span>{t('yourTotalDueLabel', undefined, 'Your Total Due')}</span>
                    {dueVal % 1 !== 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          setIsRounded(!isRounded);
                          triggerHaptic('light');
                        }}
                        className={`py-0.5 px-2 rounded-full text-[10px] font-extrabold transition-all border ${
                          isRounded
                            ? 'bg-indigo-600 border-indigo-600 text-white shadow-xs'
                            : 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-750 text-slate-700 dark:text-slate-300 hover:bg-slate-200'
                        }`}
                      >
                        {isRounded ? t('roundedBadge', undefined, 'Rounded ✓') : t('roundBtn', undefined, 'Round')}
                      </button>
                    )}
                  </div>
                  <span>
                    {dueDual.primary} {dueDual.secondary || ''}
                  </span>
                </div>
              </div>

              {/* Who Paid Selector inside Settle Modal */}
              <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200/80 dark:border-slate-800 space-y-1.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CreditCard className="w-4 h-4 text-[#7C3AED]" />
                    <span className="text-xs font-bold text-slate-900 dark:text-white">
                      {t('whoPaidLabel', undefined, 'Who paid the bill?')}
                    </span>
                  </div>
                  <select
                    value={activePayerId}
                    onChange={(e) => sendAction('SET_PAYER', { payerId: e.target.value })}
                    className="py-1 px-2.5 rounded-lg bg-white dark:bg-slate-800 text-xs font-bold border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white cursor-pointer"
                  >
                    <option value="each">👥 {t('eachPaidShareOption', undefined, 'Each paid their share')}</option>
                    {validMembers.map((m: any) => (
                      <option key={m.id} value={m.id}>
                        👤 {m.name} {m.id === currentMemberId ? t('youSuffix', undefined, '(You)') : ''}
                      </option>
                    ))}
                  </select>
                </div>
                <p className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">
                  {isEachPaid
                    ? t('eachPaidShareModalNote', undefined, 'Everyone pays the vendor directly. Mark your share once paid.')
                    : isMePayer
                    ? t('youArePayerNote', undefined, 'You paid upfront! Other room members will settle their shares with you.')
                    : t('settleWithPayerNote', { name: activePayerName }, `Please send your share to ${activePayerName}.`)}
                </p>
              </div>

              {/* Instant Payment Transfer Options to Payer (when someone specific paid upfront) */}
              {!isEachPaid && !isMePayer && (
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 block">
                    {t('payPayerTitle', { name: activePayerName }, `Pay ${activePayerName}`)}
                  </label>
                  {canPayPayer ? (
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        type="button"
                        onClick={() => {
                          triggerBitPayment({
                            phone: activePayerPhone,
                            amount: finalDueVal,
                            storeName: session?.storeName || 'BillSplit Room'
                          });
                        }}
                        className="py-3 px-4 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-xs shadow-md flex items-center justify-center gap-2 transition-all active:scale-95 text-center"
                      >
                        <span>{t('payWithBitBtn', undefined, 'Pay with Bit 📲')}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const phone = activePayerPhone.replace(/\D/g, '');
                          const amount = finalDueVal.toFixed(2);
                          try {
                            navigator.clipboard.writeText(`${phone} ${amount}`);
                          } catch (e) {}
                          const isMobile = typeof window !== 'undefined' && /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
                          if (isMobile) {
                            window.location.href = `paybox://pay?phone=${phone}&amount=${amount}`;
                            setTimeout(() => {
                              window.open(`https://payboxapp.page.link/pay?phone=${phone}&amount=${amount}`, '_blank');
                            }, 800);
                          } else {
                            window.open(`https://payboxapp.page.link/pay?phone=${phone}&amount=${amount}`, '_blank');
                          }
                        }}
                        className="py-3 px-4 rounded-2xl bg-sky-500 hover:bg-sky-600 text-white font-extrabold text-xs shadow-md flex items-center justify-center gap-2 transition-all active:scale-95 text-center"
                      >
                        <span>{t('payWithPayboxBtn', undefined, 'Pay with Paybox 📦')}</span>
                      </button>
                    </div>
                  ) : (
                    <p className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
                      {t('paymentPhoneMissingPayer', { name: activePayerName }, `Bit and PayBox will become available after ${activePayerName} adds a valid payment phone number.`)}
                    </p>
                  )}
                </div>
              )}

              {/* Settle Action Buttons */}
              <div className="pt-3">
                <button
                  onClick={async () => {
                    const success = await sendAction('SETTLE_ALL', {});
                    if (!success) return;

                    // Immediately record into local history for instant display in History page
                    try {
                      const userKey = (profile?.displayName || '').trim().toLowerCase();
                      const existingLocal = localStorage.getItem(`billsplit_history_${userKey}`);
                      const localList = existingLocal ? JSON.parse(existingLocal) : [];
                      const histRecord = {
                        id: session.id,
                        storeName: session.storeName || 'Bill Session',
                        date: session.date || new Date().toISOString().split('T')[0],
                        totalAmount: memberCalculations.grandTotal || 0,
                        userShare: finalDueVal || memberCalculations.myShare || 0,
                        currency: session.currency || 'NIS',
                        membersCount: validMembers.length,
                        groupId: session.groupId,
                        payerName: activePayerName,
                        createdAt: Date.now(),
                      };
                      const filteredLocal = Array.isArray(localList) ? localList.filter((h: any) => h.id !== session.id) : [];
                      filteredLocal.unshift(histRecord);
                      localStorage.setItem(`billsplit_history_${userKey}`, JSON.stringify(filteredLocal));
                    } catch (e) {
                      console.error('Error saving local history:', e);
                    }

                    triggerCelebration();
                    setShowSettleModal(false);
                    localStorage.removeItem('billsplit_active_session');
                    setTimeout(() => router.push('/?tab=history'), 1200);
                  }}
                  className="w-full py-4 rounded-full bg-gradient-to-r from-[#7C3AED] via-[#6366F1] to-[#4F46E5] text-white font-extrabold text-sm shadow-[0_8px_24px_rgba(124,58,237,0.3)] hover:shadow-[0_8px_24px_rgba(124,58,237,0.5)] flex items-center justify-center gap-2 transition-all active:scale-95 text-center"
                >
                  <CheckCircle2 className="w-5 h-5 text-white" />
                  <span>
                    {isCurrentUserHost
                      ? t('settleAndCloseSessionBtn', undefined, 'Settle Payment & Close Session')
                      : t('markPaidBtn', undefined, 'Mark My Share as Paid')}
                  </span>
                </button>
              </div>
            </div>
          </div>
        );
      })()}
      {/* Attach to Group Modal */}
      <AttachToGroupModal
        isOpen={showAttachGroupModal}
        onClose={() => setShowAttachGroupModal(false)}
        userGroups={userGroups}
        onAttach={handleAttachToGroup}
      />
    </div>
  );
}

export default function WorkspacePage() {
  return (
    <SessionErrorBoundary>
      <Suspense
        fallback={
          <div className="flex flex-col min-h-screen p-5 bg-slate-50 dark:bg-[#0A0E17]">
            <ReceiptSkeleton />
          </div>
        }
      >
        <SessionWorkspaceInner />
      </Suspense>
    </SessionErrorBoundary>
  );
}
