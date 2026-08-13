'use client';

import React, { useEffect, useState } from 'react';
import { X, Plus, Trash2, FileText, ArrowRight } from 'lucide-react';
import { useLanguage } from './LanguageContext';

interface ManualBillModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLaunchSession: (billData: { storeName: string; currency: string; items: any[] }) => void;
  initialData?: { title?: string; storeName?: string; currency?: string; items?: any[] } | null;
}

interface DraftItem {
  id: string;
  name: string;
  price: number | '';
}

export const ManualBillModal: React.FC<ManualBillModalProps> = ({
  isOpen,
  onClose,
  onLaunchSession,
  initialData = null,
}) => {
  const { t, currency, isRtl } = useLanguage();

  const [storeName, setStoreName] = useState('');
  const [selectedCurrency, setSelectedCurrency] = useState<string>(currency || 'NIS');
  const [items, setItems] = useState<DraftItem[]>([
    { id: '1', name: '', price: '' }
  ]);

  useEffect(() => {
    if (!isOpen) return;
    setStoreName(initialData?.storeName || initialData?.title || '');
    setSelectedCurrency(initialData?.currency || currency || 'NIS');
    const initialItems: DraftItem[] = Array.isArray(initialData?.items) && initialData.items.length > 0
      ? initialData.items.map((item, index): DraftItem => {
          const price: number | '' = Number(item.price) > 0 ? Number(item.price) : '';
          return {
            id: item.id || `draft_existing_${index}`,
            name: item.name || '',
            price,
          };
        })
      : [{ id: '1', name: '', price: '' }];
    setItems(initialItems);
  }, [isOpen, initialData, currency]);

  if (!isOpen) return null;

  const handleAddItem = () => {
    setItems((prev) => [
      ...prev,
      {
        id: `draft_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`,
        name: '',
        price: ''
      }
    ]);
  };

  const handleRemoveItem = (id: string) => {
    if (items.length <= 1) {
      setItems([{ id: '1', name: '', price: '' }]);
      return;
    }
    setItems((prev) => prev.filter((i) => i.id !== id));
  };

  const handleItemChange = (id: string, field: keyof DraftItem, value: any) => {
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, [field]: value } : item))
    );
  };

  const calculateSubtotal = () => {
    return items.reduce((acc, item) => {
      const p = typeof item.price === 'number' ? item.price : parseFloat(item.price as string) || 0;
      return acc + p;
    }, 0);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const finalTitle = storeName.trim() || t('manualEntryTitle', undefined, 'Custom Bill Split');

    const validItems = items
      .filter((i) => i.name.trim().length > 0 && Number(i.price) > 0)
      .map((i, idx) => ({
        id: `item_${Date.now()}_${idx}`,
        name: i.name.trim(),
        price: Number(i.price),
        category: 'Item',
        claimedBy: []
      }));

    if (validItems.length === 0) {
      alert(t('couldNotParse', undefined, 'Please add at least one item with a valid name and price.'));
      return;
    }

    onLaunchSession({
      storeName: finalTitle,
      currency: selectedCurrency,
      items: validItems
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn text-slate-900 dark:text-white">
      <div role="dialog" aria-modal="true" aria-label={t('manualEntryTitle', undefined, 'Create Custom Split Bill')} className="w-full max-w-lg photo-card p-6 bg-white dark:bg-[#0E131F] border border-slate-200 dark:border-slate-800 space-y-5 shadow-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800/80 pb-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white shrink-0">
              <FileText className="w-5 h-5 stroke-[2.2]" />
            </div>
            <div>
              <h3 className="font-extrabold text-base leading-tight tracking-tight text-slate-900 dark:text-white">
                {t('manualEntryTitle', undefined, 'Create Custom Split Bill')}
              </h3>
              <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mt-0.5">
                {t('manualEntrySub', undefined, 'Enter title & items before launching room')}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            aria-label={t('closeBtn', undefined, 'Close')}
            className="p-2 rounded-full bg-slate-100 dark:bg-slate-800/80 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto space-y-5 pr-1 scrollbar-thin">
          {/* Bill Info Section */}
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2 space-y-1.5">
              <label className="text-xs font-extrabold text-slate-700 dark:text-slate-300 tracking-wide uppercase text-[10px]">
                {t('billTitleLabel', undefined, 'Bill / Venue Title')}
              </label>
              <input
                type="text"
                value={storeName}
                onChange={(e) => setStoreName(e.target.value)}
                placeholder={t('billTitlePlaceholder', undefined, 'e.g. Italian Bistro Dinner')}
                className="w-full py-2.5 px-3.5 rounded-xl photo-input text-xs font-semibold bg-slate-50 dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white"
                required
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-extrabold text-slate-700 dark:text-slate-300 tracking-wide uppercase text-[10px]">
                {t('preferredCurrencyLabel', undefined, 'Currency')}
              </label>
              <select
                value={selectedCurrency}
                onChange={(e) => setSelectedCurrency(e.target.value)}
                className="w-full py-2.5 px-2.5 rounded-xl photo-input text-xs font-extrabold bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white"
              >
                <option value="NIS">NIS ₪</option>
                <option value="USD">USD $</option>
                <option value="EUR">EUR €</option>
                <option value="GBP">GBP £</option>
              </select>
            </div>
          </div>

          {/* Dynamic Items Builder List */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400 text-[10px]">
                {t('receiptItemsTitle', undefined, 'Receipt Items')} ({items.length})
              </span>
              <span className="text-xs font-mono font-black text-slate-900 dark:text-white bg-slate-100 dark:bg-slate-800 px-2.5 py-1 rounded-full border border-slate-200 dark:border-slate-700">
                Subtotal: {calculateSubtotal().toFixed(2)} {selectedCurrency}
              </span>
            </div>

            <div className="space-y-2.5">
              {items.map((item, index) => (
                <div
                  key={item.id}
                  className="flex items-center gap-2 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800/80"
                >
                  <span className="text-xs font-bold font-mono text-slate-400 dark:text-slate-500 w-4 text-center">
                    {index + 1}
                  </span>

                  <input
                    type="text"
                    placeholder={t('itemNameLabel', undefined, 'Item Name')}
                    value={item.name}
                    onChange={(e) => handleItemChange(item.id, 'name', e.target.value)}
                    className="flex-1 py-2 px-3 rounded-xl photo-input text-xs font-semibold bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white"
                    required
                  />

                  <div className="w-32 relative">
                    <input
                      type="number"
                      step="0.01"
                      placeholder={t('priceLabel', undefined, 'Price')}
                      value={item.price}
                      onChange={(e) =>
                        handleItemChange(item.id, 'price', e.target.value === '' ? '' : parseFloat(e.target.value))
                      }
                      className="w-full py-2 px-2.5 rounded-xl photo-input text-xs font-mono font-bold bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white"
                      required
                    />
                  </div>

                  <button
                    type="button"
                    onClick={() => handleRemoveItem(item.id)}
                    className="p-2 rounded-xl text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={() => handleAddItem()}
              className="w-full py-2.5 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-slate-400 dark:hover:border-slate-500 hover:bg-slate-100/50 dark:hover:bg-slate-800/40 text-xs font-extrabold flex items-center justify-center gap-1.5 transition-all"
            >
              <Plus className="w-4 h-4" />
              <span>{t('addItemBtn', undefined, 'Add Another Item')}</span>
            </button>
          </div>

          {/* Footer Buttons */}
          <div className="pt-3 flex items-center gap-3 border-t border-slate-100 dark:border-slate-800/80">
            <button
              type="button"
              onClick={onClose}
              className="py-3 px-5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-extrabold hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
            >
              {t('cancelBtn', undefined, 'Cancel')}
            </button>

            <button
              type="submit"
              className="flex-1 py-3 rounded-full bg-slate-950 dark:bg-white text-white dark:text-slate-950 font-black text-xs hover:bg-slate-900 dark:hover:bg-slate-200 transition-all flex items-center justify-center gap-2 shadow-md active:scale-95"
            >
              <span>{t('createAndStartSessionBtn', undefined, 'Create & Launch Session')}</span>
              <ArrowRight className={`w-3.5 h-3.5 ${isRtl ? 'rotate-180' : ''}`} />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
