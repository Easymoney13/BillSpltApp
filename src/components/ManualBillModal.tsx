'use client';

import React, { useEffect, useState } from 'react';
import { X, Plus, Trash2, FileText, ArrowRight, AlertTriangle } from 'lucide-react';
import { useLanguage } from './LanguageContext';
import { reconcileReceipt } from '../../lib/receiptMath';

interface ManualBillModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLaunchSession: (billData: { storeName: string; date?: string; currency: string; items: any[] }) => void;
  initialData?: { title?: string; storeName?: string; currency?: string; items?: any[]; [key: string]: any } | null;
}

interface DraftItem {
  id: string;
  name: string;
  price: number | '';
  category?: string;
  claimedBy?: string[];
  quantity?: number;
  unitPrice?: number;
  lineTotal?: number;
}

function receiptDraftSignature(storeName: string, currency: string, items: DraftItem[]) {
  return JSON.stringify({
    storeName: storeName.trim(),
    currency,
    items: items.map((item) => ({ name: item.name.trim(), price: Number(item.price) || 0 })),
  });
}

export const ManualBillModal: React.FC<ManualBillModalProps> = ({
  isOpen,
  onClose,
  onLaunchSession,
  initialData = null,
}) => {
  const { t, currency, isRtl, formatPrice } = useLanguage();


  const [storeName, setStoreName] = useState('');
  const [selectedCurrency, setSelectedCurrency] = useState<string>(currency || 'NIS');
  const [items, setItems] = useState<DraftItem[]>([
    { id: '1', name: '', price: '' }
  ]);
  const [initialReceiptSignature, setInitialReceiptSignature] = useState('');
  const [editedMismatchSignature, setEditedMismatchSignature] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setStoreName(initialData?.storeName || initialData?.title || '');
    setSelectedCurrency(initialData?.currency || currency || 'NIS');
    const initialItems: DraftItem[] = Array.isArray(initialData?.items) && initialData.items.length > 0
      ? initialData.items.map((item, index): DraftItem => {
          const price: number | '' = Number(item.price) > 0 ? Number(item.price) : '';
          return {
            ...item,
            id: item.id || `draft_existing_${index}`,
            name: item.name || '',
            price,
          };
        })
      : [{ id: '1', name: '', price: '' }];
    setItems(initialItems);
    setInitialReceiptSignature(receiptDraftSignature(
      initialData?.storeName || initialData?.title || '',
      initialData?.currency || currency || 'NIS',
      initialItems,
    ));
    setEditedMismatchSignature('');
  }, [isOpen, initialData, currency]);

  if (!isOpen) return null;

  const handleAddItem = () => {
    setEditedMismatchSignature('');
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
    setEditedMismatchSignature('');
    if (items.length <= 1) {
      setItems([{ id: '1', name: '', price: '' }]);
      return;
    }
    setItems((prev) => prev.filter((i) => i.id !== id));
  };

  const handleItemChange = (id: string, field: keyof DraftItem, value: any) => {
    setEditedMismatchSignature('');
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
        ...i,
        id: i.id || `item_${Date.now()}_${idx}`,
        name: i.name.trim(),
        price: Number(i.price),
        lineTotal: Number(i.price),
        unitPrice: Number(i.quantity) > 0
          ? Math.round((Number(i.price) / Number(i.quantity)) * 100) / 100
          : (i.unitPrice || Number(i.price)),
        category: i.category || 'Item',
        claimedBy: Array.isArray(i.claimedBy) ? i.claimedBy : [],
      }));

    if (validItems.length === 0) {
      alert(t('couldNotParse', undefined, 'Please add at least one item with a valid name and price.'));
      return;
    }

    const submissionSignature = receiptDraftSignature(storeName, selectedCurrency, validItems);
    const submissionReconciliation = isReceiptReview
      ? reconcileReceipt({ ...initialData, items: validItems })
      : null;
    if (
      isReceiptReview
      && submissionSignature !== initialReceiptSignature
      && submissionReconciliation?.needsReview
      && editedMismatchSignature !== submissionSignature
    ) {
      setEditedMismatchSignature(submissionSignature);
      return;
    }

    onLaunchSession({
      storeName: finalTitle,
      date: typeof initialData?.date === 'string' ? initialData.date : undefined,
      currency: selectedCurrency,
      items: validItems
    });
  };

  const previewImages = Array.isArray(initialData?._previewImages) ? initialData._previewImages : [];
  const printedTotal = Number(initialData?.receiptTotal);
  const hasPrintedTotal = initialData?.receiptTotal !== null
    && initialData?.receiptTotal !== undefined
    && Number.isFinite(printedTotal)
    && printedTotal >= 0;
  const isReceiptReview = previewImages.length > 0 || Boolean(initialData?.ocr || initialData?.reconciliation);
  const currentSignature = receiptDraftSignature(storeName, selectedCurrency, items);
  const liveReconciliation = isReceiptReview ? reconcileReceipt({ ...initialData, items }) : null;
  const hasEditedReceipt = currentSignature !== initialReceiptSignature;
  const editedReceiptNeedsReview = Boolean(hasEditedReceipt && liveReconciliation?.needsReview);
  const riskLevel = editedReceiptNeedsReview
    ? 'high'
    : (initialData?.assessment?.level || (liveReconciliation?.needsReview ? 'high' : 'low'));
  const reviewReasons = [
    ...(Array.isArray(initialData?.assessment?.reasons) ? initialData.assessment.reasons : []),
    ...(editedReceiptNeedsReview ? ['edited-total-mismatch'] : []),
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn text-slate-900 dark:text-white">
      <div role="dialog" aria-modal="true" aria-label={t('manualEntryTitle', undefined, 'Create Custom Split Bill')} className="w-full max-w-lg photo-card p-6 bg-white dark:bg-[#0E131F] border border-slate-200 dark:border-slate-800 space-y-5 shadow-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800/80 pb-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white shrink-0">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 0 0 2.25-2.25V6.75A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25v10.5A2.25 2.25 0 0 0 4.5 19.5Z" />
              </svg>
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
          {isReceiptReview && (
            <div className={`rounded-2xl border p-3 ${riskLevel === 'high' ? 'border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30' : 'border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-900/70'}`}>
              <div className="flex items-start gap-2.5">
                <AlertTriangle className={`mt-0.5 h-4 w-4 shrink-0 ${riskLevel === 'high' ? 'text-amber-600' : 'text-slate-500'}`} />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-extrabold">
                    {t('receiptReviewTitle', undefined, 'Compare every row with the receipt before confirming')}
                  </p>
                  <p className="mt-1 text-[11px] text-slate-600 dark:text-slate-300">
                    {t('receiptItemsShown', { amount: formatPrice(calculateSubtotal(), selectedCurrency) }, `Items shown: ${formatPrice(calculateSubtotal(), selectedCurrency)}`)}
                    {' · '}
                    {hasPrintedTotal
                      ? t('receiptPrintedTotal', { amount: formatPrice(printedTotal, selectedCurrency) }, `Printed total: ${formatPrice(printedTotal, selectedCurrency)}`)
                      : t('receiptPrintedUnverified', undefined, 'Printed total was not verified')}
                  </p>
                  {reviewReasons.length > 0 && (
                    <p className="mt-1 text-[10px] font-semibold text-amber-700 dark:text-amber-300">
                      {t('receiptReviewFlags', { flags: reviewReasons.join(', ') }, `Review flags: ${reviewReasons.join(', ')}`)}
                    </p>
                  )}
                  {editedReceiptNeedsReview && (
                    <p className="mt-2 rounded-xl bg-amber-100 px-2.5 py-2 text-[10px] font-bold text-amber-900 dark:bg-amber-900/40 dark:text-amber-100">
                      {editedMismatchSignature === currentSignature
                        ? t('receiptEditedMismatchConfirm', undefined, 'The edited rows still do not match the printed total. Click confirm again only if the receipt image supports these values.')
                        : t('receiptEditedMismatchWarning', undefined, 'Your edits no longer match the printed total. Review the changed rows, then click confirm once more to acknowledge the mismatch.')}
                    </p>
                  )}
                  {initialData?.reconciliation?.status === 'matched_adjusted' && (
                    <p className="mt-1 text-[10px] text-slate-600 dark:text-slate-300">
                      {t('receiptAdjustedPolicy', undefined, 'Printed tax, service, or discount is spread proportionally across claimed items. Edit item prices to net amounts if the adjustment belongs to specific rows.')}
                    </p>
                  )}
                </div>
              </div>
              {previewImages.length > 0 && (
                <div className="mt-3 flex max-w-full gap-2 overflow-x-auto pb-1">
                  {previewImages.map((source: string, index: number) => (
                    <img
                      key={`receipt-preview-${index}`}
                      src={source}
                      alt={t('receiptSourceAlt', { index: index + 1 }, `Receipt source ${index + 1}`)}
                      className="h-40 w-auto shrink-0 rounded-xl border border-slate-200 bg-white object-contain dark:border-slate-700"
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Bill Info Section */}
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2 space-y-1.5">
              <label className="text-xs font-extrabold text-slate-700 dark:text-slate-300 tracking-wide uppercase text-[10px]">
                {t('billTitleLabel', undefined, 'Bill / Venue Title')}
              </label>
              <input
                type="text"
                value={storeName}
                onChange={(e) => {
                  setStoreName(e.target.value);
                  setEditedMismatchSignature('');
                }}
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
                onChange={(e) => {
                  setSelectedCurrency(e.target.value);
                  setEditedMismatchSignature('');
                }}
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
                Subtotal: {formatPrice(calculateSubtotal(), selectedCurrency)}
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
              <span>{editedReceiptNeedsReview && editedMismatchSignature !== currentSignature
                ? t('reviewEditedReceiptBtn', undefined, 'Review changed total')
                : (isReceiptReview ? t('confirmReceiptContinue', undefined, 'Confirm receipt & continue') : t('createAndStartSessionBtn', undefined, 'Create & Launch Session'))}</span>
              <ArrowRight className={`w-3.5 h-3.5 ${isRtl ? 'rotate-180' : ''}`} />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
