'use client';

import React, { useState } from 'react';
import { X, Users, ArrowRight, Sparkles } from 'lucide-react';
import { useLanguage } from './LanguageContext';

interface CreateGroupModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreateGroup: (groupData: { name: string; currency: string }) => void;
}

export const CreateGroupModal: React.FC<CreateGroupModalProps> = ({
  isOpen,
  onClose,
  onCreateGroup
}) => {
  const { t, currency, isRtl } = useLanguage();

  const [groupName, setGroupName] = useState('');
  const [selectedCurrency, setSelectedCurrency] = useState<string>(currency || 'NIS');

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const finalName = groupName.trim() || 'Trip Group';
    onCreateGroup({
      name: finalName,
      currency: selectedCurrency
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn text-slate-900 dark:text-white">
      <div role="dialog" aria-modal="true" aria-label={t('createGroupTitle', undefined, 'Create Group')} className="w-full max-w-sm photo-card p-6 bg-white dark:bg-[#0E131F] border border-slate-200 dark:border-slate-800 space-y-5 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800/80 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white">
              <Users className="w-5 h-5 stroke-[2.2]" />
            </div>
            <div>
              <h3 className="font-extrabold text-base leading-tight">
                {t('createGroupTitle', undefined, 'Create Trip / Expense Group')}
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                {t('createGroupSub', undefined, 'Share bills with friends & minimize debts')}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-200"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              {t('groupNameLabel', undefined, 'Group Name')}
            </label>
            <input
              type="text"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              placeholder={t('groupNamePlaceholder', undefined, 'e.g. Eilat Trip 🌴 or Roommates')}
              className="w-full py-2.5 px-3.5 rounded-xl photo-input text-xs font-semibold bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800"
              required
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              {t('preferredCurrencyLabel', undefined, 'Group Currency')}
            </label>
            <select
              value={selectedCurrency}
              onChange={(e) => setSelectedCurrency(e.target.value)}
              className="w-full py-2.5 px-3 rounded-xl photo-input text-xs font-bold bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800"
            >
              <option value="NIS">NIS ₪</option>
              <option value="USD">USD $</option>
              <option value="EUR">EUR €</option>
              <option value="GBP">GBP £</option>
            </select>
          </div>

          <div className="pt-2 flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="py-2.5 px-4 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-extrabold"
            >
              {t('cancelBtn', undefined, 'Cancel')}
            </button>

            <button
              type="submit"
              className="flex-1 py-2.5 rounded-full bg-slate-950 dark:bg-white text-white dark:text-slate-950 font-black text-xs hover:bg-slate-900 dark:hover:bg-slate-200 flex items-center justify-center gap-1.5 shadow-md active:scale-95"
            >
              <span>{t('createGroupBtn', undefined, 'Create Group ✨')}</span>
              <ArrowRight className={`w-3.5 h-3.5 ${isRtl ? 'rotate-180' : ''}`} />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
