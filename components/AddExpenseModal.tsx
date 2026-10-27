'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import Image from 'next/image';
import {
  X,
  Camera,
  ZoomIn,
  Building2,
  MapPin,
  FileText,
  ChevronDown,
  Utensils,
  Car,
  ParkingSquare,
  Bed,
  Milestone,
  Sparkles,
  Bus,
  MoreHorizontal,
  HelpCircle,
  Calendar as CalendarIcon,
  Check,
  AlertCircle,
  AlertTriangle,
  Loader2,
  RotateCw,
  RotateCcw,
  CheckCircle2,
  Send,
} from 'lucide-react';
import {
  rotateImageDataUrl,
  checkImageOrientation,
  autoEnsureUprightReceipt,
} from '@/utils/imageRotate';
import { submitSingleExpenseToHq } from '@/utils/expenseHqStorage';
import {
  ExpenseItem,
  ExpenseCategoryKey,
  PaymentMethod,
  EXPENSE_CATEGORIES,
  PAYMENT_METHODS,
  formatKRW,
  parseKRW,
  formatPickerDateTime,
  validateExpenseInput,
} from '@/utils/expense';
import { haptics } from '@/utils/haptics';

interface CachedOcrResult {
  merchant?: string;
  address?: string | null;
  amount?: number | null;
  category?: string;
  date?: string | null;
  time?: string | null;
  paymentMethod?: PaymentMethod;
  summary?: string;
  modelUsed?: string;
}

// In-memory client cache for OCR results to avoid calling Gemini API repeatedly
const clientOcrCache = new Map<string, CachedOcrResult>();

// Predefined sample receipt fixture presets (Zero Gemini API fees, instant 0ms load)
export const SAMPLE_RECEIPT_PRESETS: Record<
  string,
  {
    merchant: string;
    address: string;
    amount: number;
    category: ExpenseCategoryKey;
    date: string;
    time: string;
    summary: string;
    memo: string;
  }
> = {
  '/images/receipt_sample_hangang.jpg': {
    merchant: '한강주유소',
    address: '경기도 고양시 덕양구 행주로 57-28',
    amount: 48000,
    category: 'fuel',
    date: '2026-10-26',
    time: '12:36',
    summary: '한강주유소에서 휘발유 48,000원 결제 영수증으로 판독되었습니다.',
    memo: 'VIP 의전 배차 전 주유',
  },
  '/images/receipt_sample_fuel.jpg': {
    merchant: '서울 만남의광장 주유소',
    address: '서울 서초구 양재대로12길 73-71',
    amount: 72000,
    category: 'fuel',
    date: '2026-10-24',
    time: '11:32',
    summary: '서울 만남의광장 주유소에서 경유 72,000원 결제 영수증으로 인식되었습니다.',
    memo: '서울 서초구 양재대로 주유',
  },
  '/images/receipt_sample_cu.jpg': {
    merchant: 'CU 고양강매점',
    address: '경기도 고양시 덕양구 강매로247 (강매동 521-7)',
    amount: 9500,
    category: 'meal',
    date: '2024-10-26',
    time: '19:22',
    summary: 'CU 고양강매점에서 식음료 9,500원 결제 영수증으로 판독되었습니다.',
    memo: '야간 대기 식대',
  },
};

interface AddExpenseModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (item: ExpenseItem) => void;
  editingItem?: ExpenseItem | null;
  initialPhotoUrl?: string;
  defaultDate?: string; // YYYY-MM-DD
}

// Helper to render category icon component
export const renderCategoryIcon = (iconName: string, className = 'w-5 h-5') => {
  switch (iconName) {
    case 'utensils':
      return <Utensils className={className} />;
    case 'car':
      return <Car className={className} />;
    case 'parking':
      return <ParkingSquare className={className} />;
    case 'bed':
      return <Bed className={className} />;
    case 'milestone':
      return <Milestone className={className} />;
    case 'sparkles':
      return <Sparkles className={className} />;
    case 'bus':
      return <Bus className={className} />;
    case 'more':
      return <MoreHorizontal className={className} />;
    default:
      return <HelpCircle className={className} />;
  }
};

const AddExpenseModalContent: React.FC<{
  onClose: () => void;
  onSave: (item: ExpenseItem) => void;
  editingItem?: ExpenseItem | null;
  initialPhotoUrl?: string;
  defaultDate?: string;
}> = ({ onClose, onSave, editingItem, initialPhotoUrl, defaultDate }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Form states initialized purely
  const initialPreset = initialPhotoUrl ? SAMPLE_RECEIPT_PRESETS[initialPhotoUrl] : null;

  const [category, setCategory] = useState<ExpenseCategoryKey>(
    () => editingItem?.category || initialPreset?.category || 'fuel'
  );

  const [date, setDate] = useState<string>(() => {
    if (editingItem?.date) return editingItem.date;
    if (initialPreset?.date) return initialPreset.date;
    if (defaultDate) return defaultDate;
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  });

  const [time, setTime] = useState<string>(() => {
    if (editingItem?.time) return editingItem.time;
    if (initialPreset?.time) return initialPreset.time;
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    return `${hh}:${mm}`;
  });

  const [merchant, setMerchant] = useState<string>(
    () => editingItem?.merchant || initialPreset?.merchant || ''
  );
  const [address, setAddress] = useState<string>(
    () => editingItem?.address || initialPreset?.address || ''
  );
  const [amountRaw, setAmountRaw] = useState<string>(() => {
    if (editingItem) return formatKRW(editingItem.amount, false);
    if (initialPreset) return formatKRW(initialPreset.amount, false);
    return '';
  });
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(
    () => editingItem?.paymentMethod || 'company_card'
  );
  const [memo, setMemo] = useState<string>(
    () => editingItem?.memo || initialPreset?.memo || ''
  );
  const [receiptUrl, setReceiptUrl] = useState<string | undefined>(
    () => editingItem?.receiptUrl || initialPhotoUrl
  );

  // Modal selectors & overlays
  const [isCategoryPickerOpen, setIsCategoryPickerOpen] = useState(false);
  const [isDateTimePickerOpen, setIsDateTimePickerOpen] = useState(false);
  const [isPhotoZoomOpen, setIsPhotoZoomOpen] = useState(false);

  // Orientation state to enforce vertical receipts
  const [isReceiptLyingDown, setIsReceiptLyingDown] = useState<boolean>(false);
  const [isOrientationModalOpen, setIsOrientationModalOpen] = useState<boolean>(false);

  // Image rotation & Vision AI state
  const [isRotating, setIsRotating] = useState(false);
  const [isAiScanning, setIsAiScanning] = useState(false);
  const [ocrBannerInfo, setOcrBannerInfo] = useState<{
    merchant: string;
    amount: number | null;
    category: string;
    summary: string;
    isZeroCost?: boolean;
  } | null>(() => {
    if (initialPreset) {
      return {
        merchant: initialPreset.merchant,
        amount: initialPreset.amount,
        category: EXPENSE_CATEGORIES[initialPreset.category]?.label || '주유비',
        summary: initialPreset.summary,
        isZeroCost: true,
      };
    }
    return null;
  });
  const [autoSubmitToHq, setAutoSubmitToHq] = useState(true);
  const hasAutoScannedRef = useRef(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Validation & saving state
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  // Inspect image orientation in real time whenever receiptUrl changes
  useEffect(() => {
    let isMounted = true;
    if (!receiptUrl) {
      queueMicrotask(() => {
        if (isMounted) setIsReceiptLyingDown(false);
      });
      return () => {
        isMounted = false;
      };
    }
    checkImageOrientation(receiptUrl).then(({ isLandscape }) => {
      if (!isMounted) return;
      setIsReceiptLyingDown(isLandscape);
      if (!isLandscape) {
        setErrors((prev) => {
          const next = { ...prev };
          delete next.receiptOrientation;
          return next;
        });
      }
    });
    return () => {
      isMounted = false;
    };
  }, [receiptUrl]);

  // Vision AI Receipt Scanner with intelligent sample & client caching (Zero Fee Waste)
  const runVisionAiScan = useCallback(async (imageUrl: string) => {
    if (!imageUrl) return;

    // Step 1: Check known sample presets (Zero Gemini API call)
    if (SAMPLE_RECEIPT_PRESETS[imageUrl]) {
      const p = SAMPLE_RECEIPT_PRESETS[imageUrl];
      setMerchant(p.merchant);
      setAddress(p.address);
      setAmountRaw(formatKRW(p.amount, false));
      setCategory(p.category);
      setDate(p.date);
      setTime(p.time);
      setMemo(p.memo);
      setOcrBannerInfo({
        merchant: p.merchant,
        amount: p.amount,
        category: EXPENSE_CATEGORIES[p.category]?.label || '기타',
        summary: p.summary,
        isZeroCost: true,
      });
      haptics.success();
      showToast('✨ 샘플 영수증 정보가 즉시 적용되었습니다. (API 비용 0원)');
      return;
    }

    // Step 2: Check client-side cache (Zero Gemini API call)
    const cacheKey = imageUrl.length > 200 ? `${imageUrl.slice(0, 50)}_${imageUrl.length}` : imageUrl;
    const cached = clientOcrCache.get(cacheKey);
    if (cached) {
      if (cached.merchant) setMerchant(cached.merchant);
      if (cached.address) setAddress(cached.address);
      if (typeof cached.amount === 'number' && cached.amount > 0) {
        setAmountRaw(formatKRW(cached.amount, false));
        setErrors((prev) => ({ ...prev, amount: '' }));
      }
      if (cached.category && EXPENSE_CATEGORIES[cached.category as ExpenseCategoryKey]) {
        setCategory(cached.category as ExpenseCategoryKey);
      }
      if (cached.date) setDate(cached.date);
      if (cached.time) setTime(cached.time);
      if (cached.paymentMethod) setPaymentMethod(cached.paymentMethod);
      setOcrBannerInfo({
        merchant: cached.merchant || '상호 미확인 가맹점',
        amount: cached.amount ?? null,
        category: EXPENSE_CATEGORIES[cached.category as ExpenseCategoryKey]?.label || '기타',
        summary: cached.summary || '캐시된 영수증 정보입니다.',
        isZeroCost: true,
      });
      haptics.success();
      showToast('✨ 캐시된 영수증 판독 정보를 즉시 불러왔습니다. (API 비용 0원)');
      return;
    }

    setIsAiScanning(true);
    setOcrBannerInfo(null);
    try {
      const res = await fetch('/api/receipt/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image: imageUrl,
          driverName: '윤태준',
          carModel: '116허 1514',
        }),
      });
      const data = await res.json();
      if (data && data.success) {
        clientOcrCache.set(cacheKey, data);
        if (data.merchant) setMerchant(data.merchant);
        if (data.address) setAddress(data.address);
        if (typeof data.amount === 'number' && data.amount > 0) {
          setAmountRaw(formatKRW(data.amount, false));
          setErrors((prev) => ({ ...prev, amount: '' }));
        }
        if (data.category && EXPENSE_CATEGORIES[data.category as ExpenseCategoryKey]) {
          setCategory(data.category as ExpenseCategoryKey);
        }
        if (data.date) setDate(data.date);
        if (data.time) setTime(data.time);
        if (data.paymentMethod) setPaymentMethod(data.paymentMethod);

        const isZeroFee = Boolean(data.modelUsed?.includes('0원') || data.modelUsed?.includes('샘플') || data.modelUsed?.includes('캐시'));
        setOcrBannerInfo({
          merchant: data.merchant,
          amount: data.amount,
          category: EXPENSE_CATEGORIES[data.category as ExpenseCategoryKey]?.label || '기타',
          summary: data.summary,
          isZeroCost: isZeroFee,
        });

        haptics.success();
        showToast(isZeroFee
          ? '✨ 샘플/캐시 영수증 정보가 즉시 적용되었습니다. (API 비용 0원)'
          : '✨ Vision AI가 영수증 정보를 자동 판독하여 입력했습니다!');
      } else {
        showToast('영수증 분석을 완료하지 못했습니다. 직접 입력해 주세요.');
      }
    } catch (err) {
      console.warn('Vision AI Scan Error:', err);
      showToast('영수증 분석 중 오류가 발생했습니다.');
    } finally {
      setIsAiScanning(false);
    }
  }, []);

  // Auto scan sample receipt or initial photo once on load (Skips Gemini if already a sample preset)
  useEffect(() => {
    if (initialPhotoUrl && !editingItem && !hasAutoScannedRef.current) {
      hasAutoScannedRef.current = true;
      if (SAMPLE_RECEIPT_PRESETS[initialPhotoUrl]) {
        console.log('[AddExpenseModal] Loaded sample preset without Gemini API call.');
        return;
      }
      const timer = setTimeout(() => {
        runVisionAiScan(initialPhotoUrl);
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [initialPhotoUrl, editingItem, runVisionAiScan]);

  // Rotate receipt photo (+90 clockwise, -90 counter-clockwise)
  const handleRotateImage = async (degrees: number = 90) => {
    if (!receiptUrl || isRotating) return;
    haptics.selection();
    setIsRotating(true);
    try {
      const rotated = await rotateImageDataUrl(receiptUrl, degrees);
      setReceiptUrl(rotated);
      const { isLandscape } = await checkImageOrientation(rotated);
      setIsReceiptLyingDown(isLandscape);
      if (!isLandscape) {
        setErrors((prev) => {
          const next = { ...prev };
          delete next.receiptOrientation;
          return next;
        });
        showToast('영수증이 바르게 세워졌습니다.');
      } else {
        showToast(degrees > 0 ? '영수증을 90° 시계방향으로 회전했습니다.' : '영수증을 90° 반시계방향으로 회전했습니다.');
      }
    } catch (err) {
      console.error('Failed to rotate receipt image:', err);
      showToast('이미지 회전에 실패했습니다.');
    } finally {
      setIsRotating(false);
    }
  };

  // Temp date/time picker state
  const [tempDate, setTempDate] = useState(date);
  const [tempHour, setTempHour] = useState(time.split(':')[0] || '11');
  const [tempMinute, setTempMinute] = useState(time.split(':')[1] || '32');

  // Handle image upload from camera or gallery (Forces upright orientation & detects sample/cache)
  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    haptics.selection();
    const reader = new FileReader();
    reader.onload = async (event) => {
      const result = event.target?.result as string;

      // 1. Force photo to stand upright: auto-detect and rotate if lying down
      const { url: uprightUrl, wasRotated } = await autoEnsureUprightReceipt(result);
      setReceiptUrl(uprightUrl);
      setIsReceiptLyingDown(false);

      if (wasRotated) {
        showToast('🔄 영수증이 가로로 누워있어 바르게(90° 세우기) 자동 회전했습니다.');
      }

      // 2. Check if file matches known sample receipt (Zero Gemini API call)
      const lowerName = file.name.toLowerCase();
      let matchedPresetKey: string | null = null;
      if (lowerName.includes('hangang') || lowerName.includes('한강') || file.size === 22307) {
        matchedPresetKey = '/images/receipt_sample_hangang.jpg';
      } else if (lowerName.includes('fuel') || lowerName.includes('만남의광장') || file.size === 25451) {
        matchedPresetKey = '/images/receipt_sample_fuel.jpg';
      } else if (lowerName.includes('cu') || lowerName.includes('고양강매') || file.size === 22426) {
        matchedPresetKey = '/images/receipt_sample_cu.jpg';
      }

      if (matchedPresetKey && SAMPLE_RECEIPT_PRESETS[matchedPresetKey]) {
        const p = SAMPLE_RECEIPT_PRESETS[matchedPresetKey];
        setMerchant(p.merchant);
        setAddress(p.address);
        setAmountRaw(formatKRW(p.amount, false));
        setCategory(p.category);
        setDate(p.date);
        setTime(p.time);
        setMemo(p.memo);
        setOcrBannerInfo({
          merchant: p.merchant,
          amount: p.amount,
          category: EXPENSE_CATEGORIES[p.category]?.label || '기타',
          summary: p.summary,
          isZeroCost: true,
        });
        haptics.success();
        showToast('✨ 샘플 영수증이 감지되어 자동 적용되었습니다. (API 비용 0원)');
        return;
      }

      // 3. Otherwise run Vision AI scan
      runVisionAiScan(uprightUrl);
    };
    reader.readAsDataURL(file);
  };

  // Amount input handler with live comma formatting
  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    const num = parseKRW(raw);
    if (num === 0 && raw.trim() === '') {
      setAmountRaw('');
    } else {
      setAmountRaw(formatKRW(num, false));
    }
    if (errors.amount) {
      setErrors((prev) => ({ ...prev, amount: '' }));
    }
  };

  // Submit handler (Enforces upright receipt orientation)
  const handleSave = () => {
    // 1. Enforce upright orientation for receipt photo: block if lying down
    if (receiptUrl && isReceiptLyingDown) {
      haptics.warningPulse();
      setErrors((prev) => ({
        ...prev,
        receiptOrientation: '영수증이 가로로 누워 있어 본사 제출이 불가능합니다. [90° 세우기] 버튼을 눌러 똑바로 세워주세요.',
      }));
      setIsOrientationModalOpen(true);
      return;
    }

    const amountNum = parseKRW(amountRaw);
    const validation = validateExpenseInput({
      category,
      date,
      time,
      merchant,
      amount: amountNum,
    });

    if (!validation.isValid) {
      setErrors(validation.errors);
      haptics.warningPulse();
      return;
    }

    if (isSaving) return; // prevent duplicate rapid clicks
    setIsSaving(true);
    haptics.mediumTap();

    const nowIso = new Date().toISOString();
    const finalItem: ExpenseItem = {
      id: editingItem?.id || `exp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      category,
      date,
      time,
      merchant: merchant.trim(),
      address: address.trim() || undefined,
      amount: amountNum,
      paymentMethod,
      memo: memo.trim() || undefined,
      receiptUrl,
      createdAt: editingItem?.createdAt || nowIso,
      updatedAt: nowIso,
      hqStatus: autoSubmitToHq ? '검수 대기' : (editingItem?.hqStatus || '미제출'),
      submittedToHqAt: autoSubmitToHq ? nowIso : editingItem?.submittedToHqAt,
    };

    if (autoSubmitToHq) {
      submitSingleExpenseToHq(finalItem, '윤태준', '116허 1514', '현대 스타리아 리무진');
    }

    onSave(finalItem);
  };

  // One-click Auto Fix Orientation and immediately save to HQ
  const handleFixOrientationAndSave = async () => {
    if (!receiptUrl || isRotating) return;
    setIsRotating(true);
    try {
      const rotated = await rotateImageDataUrl(receiptUrl, 90);
      setReceiptUrl(rotated);
      setIsReceiptLyingDown(false);
      setIsOrientationModalOpen(false);

      const amountNum = parseKRW(amountRaw);
      const validation = validateExpenseInput({
        category,
        date,
        time,
        merchant,
        amount: amountNum,
      });

      if (!validation.isValid) {
        setErrors(validation.errors);
        haptics.warningPulse();
        setIsRotating(false);
        return;
      }

      setIsSaving(true);
      haptics.success();
      const nowIso = new Date().toISOString();
      const finalItem: ExpenseItem = {
        id: editingItem?.id || `exp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        category,
        date,
        time,
        merchant: merchant.trim(),
        address: address.trim() || undefined,
        amount: amountNum,
        paymentMethod,
        memo: memo.trim() || undefined,
        receiptUrl: rotated,
        createdAt: editingItem?.createdAt || nowIso,
        updatedAt: nowIso,
        hqStatus: autoSubmitToHq ? '검수 대기' : (editingItem?.hqStatus || '미제출'),
        submittedToHqAt: autoSubmitToHq ? nowIso : editingItem?.submittedToHqAt,
      };

      if (autoSubmitToHq) {
        submitSingleExpenseToHq(finalItem, '윤태준', '116허 1514', '현대 스타리아 리무진');
      }

      onSave(finalItem);
    } catch (err) {
      console.error('Failed to auto-rotate and save:', err);
      showToast('이미지 회전에 실패했습니다.');
    } finally {
      setIsRotating(false);
    }
  };

  const selectedCategoryMeta = EXPENSE_CATEGORIES[category] || EXPENSE_CATEGORIES.fuel;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-xs transition-opacity animate-in fade-in duration-200">
      <div className="absolute inset-0" onClick={onClose} />

      <div
        className="relative w-full max-w-lg bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl z-10 flex flex-col max-h-[92vh] overflow-hidden animate-in slide-in-from-bottom duration-300"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drag handle for mobile */}
        <div className="w-12 h-1.5 bg-slate-200 rounded-full mx-auto mt-2.5 mb-1 sm:hidden shrink-0" />

        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-3 pb-3 border-b border-slate-100 shrink-0">
          <h2 className="text-lg font-bold text-slate-900 tracking-tight">
            {editingItem ? '지출 수정' : '지출 추가'}
          </h2>
          <button
            type="button"
            onClick={() => {
              haptics.lightTap();
              onClose();
            }}
            className="p-1.5 -mr-1.5 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100 transition-colors"
            aria-label="닫기"
          >
            <X className="w-5 h-5 stroke-[2.2]" />
          </button>
        </div>

        {/* Main Form Scrollable Area */}
        <div className="p-4 sm:p-5 space-y-4 overflow-y-auto flex-1">
          {/* 1. Receipt Photograph Preview Area */}
          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-bold text-slate-700">영수증 사진</span>
                {isAiScanning && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-100 text-[#1E60F3] text-[10px] font-bold animate-pulse">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    <span>AI 판독 중</span>
                  </span>
                )}
              </div>
              {receiptUrl && (
                <div className="flex items-center gap-1.5 sm:gap-2">
                  <button
                    type="button"
                    onClick={() => runVisionAiScan(receiptUrl)}
                    disabled={isAiScanning || isRotating}
                    className="text-[11px] text-indigo-600 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 disabled:opacity-50 px-2.5 py-1 rounded-full font-bold flex items-center gap-1 transition-all active:scale-95 cursor-pointer"
                    title="Vision AI 영수증 재분석"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                    <span>AI 재스캔</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRotateImage(90)}
                    disabled={isRotating || isAiScanning}
                    className={`text-[11px] px-2.5 py-1 rounded-full font-bold flex items-center gap-1 transition-all active:scale-95 cursor-pointer ${
                      isReceiptLyingDown
                        ? 'bg-[#1E60F3] text-white hover:bg-blue-600 shadow-sm ring-2 ring-blue-300 animate-pulse'
                        : 'text-[#1E60F3] hover:text-blue-700 bg-blue-50 hover:bg-blue-100'
                    }`}
                    title="영수증 90° 시계방향 세우기"
                  >
                    {isRotating ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <RotateCw className="w-3.5 h-3.5" />
                    )}
                    <span>90° 세우기</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsPhotoZoomOpen(true)}
                    className="text-[11px] text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 px-2.5 py-1 rounded-full font-semibold flex items-center gap-1 transition-colors"
                  >
                    <ZoomIn className="w-3.5 h-3.5" />
                    <span>확대보기</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      haptics.lightTap();
                      setReceiptUrl(undefined);
                      setOcrBannerInfo(null);
                      setIsReceiptLyingDown(false);
                      setErrors((prev) => {
                        const next = { ...prev };
                        delete next.receiptOrientation;
                        return next;
                      });
                    }}
                    className="text-[11px] text-red-500 hover:text-red-600 hover:bg-red-50 px-2 py-1 rounded-full font-semibold transition-colors"
                  >
                    사진 삭제
                  </button>
                </div>
              )}
            </div>

            {receiptUrl ? (
              <div className="relative w-full h-48 sm:h-56 bg-slate-900/5 rounded-2xl overflow-hidden border border-slate-200 flex items-center justify-center group shadow-2xs">
                {/* Image */}
                <Image
                  src={receiptUrl}
                  alt="영수증 사진 미리보기"
                  fill
                  sizes="(max-width: 768px) 100vw, 500px"
                  className="object-contain p-2 cursor-pointer transition-transform duration-200 group-hover:scale-[1.01]"
                  onClick={() => setIsPhotoZoomOpen(true)}
                />

                {/* AI Scanning Radar Beam Overlay */}
                {isAiScanning && (
                  <div className="absolute inset-0 bg-blue-950/70 backdrop-blur-2xs flex flex-col items-center justify-center gap-2.5 z-25 text-white animate-in fade-in duration-200 overflow-hidden">
                    <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-transparent via-cyan-400 to-transparent shadow-[0_0_16px_#22d3ee] animate-[pulse_1.5s_infinite]" />
                    <div className="w-11 h-11 rounded-2xl bg-blue-600/80 border border-blue-400/50 flex items-center justify-center shadow-lg animate-pulse">
                      <Sparkles className="w-6 h-6 text-cyan-200" />
                    </div>
                    <div className="text-center px-4">
                      <span className="text-xs font-black tracking-tight text-white block">
                        Gemini Vision AI 영수증 분석 중...
                      </span>
                      <span className="text-[10px] text-cyan-200/90 block mt-0.5">
                        상호명, 총 결제금액, 거래일시, 카테고리를 자동 추출하고 있습니다
                      </span>
                    </div>
                  </div>
                )}

                {/* Rotating Loading Overlay */}
                {isRotating && (
                  <div className="absolute inset-0 bg-white/75 backdrop-blur-xs flex flex-col items-center justify-center gap-2 z-20 animate-in fade-in duration-150">
                    <Loader2 className="w-6 h-6 text-[#1E60F3] animate-spin" />
                    <span className="text-xs font-bold text-slate-700">영수증 세우는 중...</span>
                  </div>
                )}

                {/* Floating quick rotation pill controls on bottom-left */}
                <div className="absolute bottom-2.5 left-2.5 flex items-center gap-1.5 z-10">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRotateImage(-90);
                    }}
                    disabled={isRotating}
                    className="bg-black/70 hover:bg-black text-white text-xs font-semibold px-2.5 py-1.5 rounded-full flex items-center gap-1 backdrop-blur-xs shadow-md transition-all active:scale-95 disabled:opacity-40 cursor-pointer"
                    title="반시계방향 90° 회전"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span className="text-[11px]">좌회전</span>
                  </button>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRotateImage(90);
                    }}
                    disabled={isRotating}
                    className={`text-white text-xs font-bold px-3 py-1.5 rounded-full flex items-center gap-1.5 backdrop-blur-xs shadow-md transition-all active:scale-95 disabled:opacity-40 cursor-pointer ${
                      isReceiptLyingDown
                        ? 'bg-[#1E60F3] hover:bg-blue-600 ring-4 ring-blue-300 ring-offset-1 animate-pulse'
                        : 'bg-[#1E60F3]/90 hover:bg-[#1E60F3]'
                    }`}
                    title="시계방향 90° 회전 (세우기)"
                  >
                    {isRotating ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <RotateCw className="w-3.5 h-3.5" />
                    )}
                    <span className="text-[11px]">90° 세우기</span>
                  </button>
                </div>

                {/* Floating change button on bottom-right */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    fileInputRef.current?.click();
                  }}
                  className="absolute bottom-2.5 right-2.5 bg-black/70 hover:bg-black text-white text-xs font-semibold px-3 py-1.5 rounded-full flex items-center gap-1.5 backdrop-blur-xs shadow-md transition-all active:scale-95 z-10"
                >
                  <Camera className="w-3.5 h-3.5" />
                  <span className="text-[11px]">사진 변경</span>
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full h-32 border-2 border-dashed border-slate-200 hover:border-[#1E60F3]/60 bg-slate-50/70 hover:bg-blue-50/30 rounded-2xl flex flex-col items-center justify-center gap-2 transition-all group cursor-pointer"
              >
                <div className="w-10 h-10 rounded-full bg-white border border-slate-200 flex items-center justify-center text-slate-500 group-hover:text-[#1E60F3] group-hover:border-blue-200 shadow-2xs transition-colors">
                  <Camera className="w-5 h-5 stroke-[2]" />
                </div>
                <div className="text-center">
                  <span className="text-xs font-bold text-slate-700 group-hover:text-[#1E60F3] block">
                    영수증 사진 추가하기
                  </span>
                  <span className="text-[11px] text-slate-400 mt-0.5 block">
                    카메라 촬영 또는 갤러리 이미지 선택 (선택 사항)
                  </span>
                </div>
              </button>
            )}

            {/* Lying down orientation warning banner */}
            {receiptUrl && isReceiptLyingDown && (
              <div className="bg-gradient-to-r from-amber-50 to-orange-50 border-2 border-amber-300 rounded-2xl p-3 flex items-start gap-2.5 shadow-xs animate-in fade-in slide-in-from-top-1 duration-200">
                <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5 animate-bounce" />
                <div className="flex-1 min-w-0 text-xs">
                  <div className="font-extrabold text-amber-900 flex items-center gap-1.5">
                    <span>영수증 사진이 가로로 누워 있습니다!</span>
                    <span className="text-[10px] bg-amber-200 text-amber-900 px-1.5 py-0.5 rounded-md font-bold">
                      회전 필수
                    </span>
                  </div>
                  <p className="text-[11px] text-amber-700 mt-0.5 leading-relaxed">
                    본사 관리자가 금액과 거래처를 정확히 검수할 수 있도록 <b>[90° 세우기]</b>를 눌러 똑바로 세워주세요. 누운 상태로는 제출할 수 없습니다.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleRotateImage(90)}
                  disabled={isRotating}
                  className="px-3 py-1.5 bg-[#1E60F3] hover:bg-blue-600 text-white rounded-xl text-xs font-bold shrink-0 shadow-sm transition-all active:scale-95 flex items-center gap-1 cursor-pointer"
                >
                  <RotateCw className="w-3.5 h-3.5" />
                  <span>90° 세우기</span>
                </button>
              </div>
            )}

            {errors.receiptOrientation && (
              <p className="text-[11px] text-red-500 font-bold flex items-center gap-1 px-1">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                <span>{errors.receiptOrientation}</span>
              </p>
            )}

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handlePhotoUpload}
            />

            {/* AI OCR Recognition Result Banner */}
            {ocrBannerInfo && (
              <div className="bg-gradient-to-r from-blue-50/90 via-indigo-50/40 to-blue-50/90 border border-blue-200/90 rounded-2xl p-3.5 flex items-start gap-3 animate-in fade-in slide-in-from-top-1 duration-200 shadow-2xs">
                <div className="w-7 h-7 rounded-xl bg-[#1E60F3] text-white flex items-center justify-center shrink-0 mt-0.5 shadow-xs">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0 text-xs">
                  <div className="flex items-center justify-between gap-1">
                    <span className="font-extrabold text-[#1E60F3] tracking-tight">
                      Vision AI 자동 인식 및 분류 완료
                    </span>
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded-full font-bold flex items-center gap-1 ${
                        ocrBannerInfo.isZeroCost
                          ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                          : 'bg-blue-100 text-[#1E60F3]'
                      }`}
                    >
                      {ocrBannerInfo.isZeroCost ? (
                        <>
                          <Sparkles className="w-2.5 h-2.5 text-emerald-600" />
                          <span>Gemini 3.8 Flash (비용 0원 · 캐시)</span>
                        </>
                      ) : (
                        <span>Gemini 3.8 Flash</span>
                      )}
                    </span>
                  </div>
                  <div className="text-slate-900 font-bold mt-1 text-xs truncate">
                    {ocrBannerInfo.merchant} · {formatKRW(ocrBannerInfo.amount || 0)} ({ocrBannerInfo.category})
                  </div>
                  <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
                    {ocrBannerInfo.summary}
                  </p>
                </div>
              </div>
            )}
          </section>

          {/* 2. 지출 항목 (Category Selector) */}
          <section>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              지출 항목 <span className="text-red-500">*</span>
            </label>
            <button
              type="button"
              onClick={() => {
                haptics.selection();
                setIsCategoryPickerOpen(true);
              }}
              className="w-full bg-white border border-slate-200 hover:border-[#1E60F3] rounded-xl px-3.5 py-3 flex items-center justify-between text-left transition-all shadow-2xs group"
            >
              <div className="flex items-center gap-3">
                <div
                  className={`w-8 h-8 rounded-full ${selectedCategoryMeta.badgeBg} ${selectedCategoryMeta.badgeTextColor} border ${selectedCategoryMeta.badgeBorder} flex items-center justify-center shrink-0`}
                >
                  {renderCategoryIcon(selectedCategoryMeta.iconName, 'w-4 h-4')}
                </div>
                <span className="text-sm font-bold text-slate-800">
                  {selectedCategoryMeta.label}
                </span>
              </div>
              <ChevronDown className="w-4 h-4 text-slate-400 group-hover:text-slate-600 transition-colors" />
            </button>
            {errors.category && (
              <p className="text-[11px] text-red-500 mt-1 flex items-center gap-1">
                <AlertCircle className="w-3.5 h-3.5" />
                <span>{errors.category}</span>
              </p>
            )}
          </section>

          {/* 3. 지출 일시 (Date & Time Picker) */}
          <section>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              지출 일시 <span className="text-red-500">*</span>
            </label>
            <button
              type="button"
              onClick={() => {
                haptics.selection();
                setTempDate(date);
                setTempHour(time.split(':')[0] || '11');
                setTempMinute(time.split(':')[1] || '32');
                setIsDateTimePickerOpen(true);
              }}
              className="w-full bg-white border border-slate-200 hover:border-[#1E60F3] rounded-xl px-3.5 py-3 flex items-center justify-between text-left transition-all shadow-2xs group"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-slate-50 border border-slate-200 flex items-center justify-center text-slate-600 shrink-0">
                  <CalendarIcon className="w-4 h-4" />
                </div>
                <span className="text-sm font-semibold text-slate-800">
                  {formatPickerDateTime(date, time)}
                </span>
              </div>
              <ChevronDown className="w-4 h-4 text-slate-400 group-hover:text-slate-600 transition-colors" />
            </button>
          </section>

          {/* 4. 거래처 / 장소 */}
          <section>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              거래처 / 장소 <span className="text-red-500">*</span>
            </label>
            <div className="relative flex items-center">
              <div className="absolute left-3.5 text-slate-400 pointer-events-none">
                <Building2 className="w-4 h-4" />
              </div>
              <input
                type="text"
                value={merchant}
                onChange={(e) => {
                  setMerchant(e.target.value);
                  if (errors.merchant) setErrors((prev) => ({ ...prev, merchant: '' }));
                }}
                placeholder="예: 서울주유소, 만남의광장"
                className="w-full pl-10 pr-9 py-3 bg-white border border-slate-200 hover:border-slate-300 focus:border-[#1E60F3] focus:ring-2 focus:ring-[#1E60F3]/20 rounded-xl text-sm font-semibold text-slate-800 placeholder-slate-400 outline-hidden transition-all shadow-2xs"
              />
              {merchant && (
                <button
                  type="button"
                  onClick={() => setMerchant('')}
                  className="absolute right-3 p-1 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100"
                  aria-label="내용 지우기"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            {errors.merchant && (
              <p className="text-[11px] text-red-500 mt-1 flex items-center gap-1">
                <AlertCircle className="w-3.5 h-3.5" />
                <span>{errors.merchant}</span>
              </p>
            )}
          </section>

          {/* 5. 상세 주소 */}
          <section>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">상세 주소</label>
            <div className="relative flex items-center">
              <div className="absolute left-3.5 text-slate-400 pointer-events-none">
                <MapPin className="w-4 h-4" />
              </div>
              <input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="예: 서울 강남구 테헤란로 123"
                className="w-full pl-10 pr-9 py-3 bg-white border border-slate-200 hover:border-slate-300 focus:border-[#1E60F3] focus:ring-2 focus:ring-[#1E60F3]/20 rounded-xl text-sm font-semibold text-slate-800 placeholder-slate-400 outline-hidden transition-all shadow-2xs"
              />
              {address && (
                <button
                  type="button"
                  onClick={() => setAddress('')}
                  className="absolute right-3 p-1 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100"
                  aria-label="내용 지우기"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </section>

          {/* 6. 지출 금액 (원화) */}
          <section>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              지출 금액 (원화) <span className="text-red-500">*</span>
            </label>
            <div className="relative flex items-center">
              <div className="absolute left-4 text-sm font-extrabold text-slate-800 pointer-events-none">
                ₩
              </div>
              <input
                type="text"
                inputMode="numeric"
                value={amountRaw}
                onChange={handleAmountChange}
                placeholder="0"
                className="w-full pl-10 pr-4 py-3 bg-white border border-slate-200 hover:border-slate-300 focus:border-[#1E60F3] focus:ring-2 focus:ring-[#1E60F3]/20 rounded-xl text-base font-extrabold text-slate-900 placeholder-slate-400 outline-hidden transition-all shadow-2xs"
              />
            </div>
            {errors.amount && (
              <p className="text-[11px] text-red-500 mt-1 flex items-center gap-1">
                <AlertCircle className="w-3.5 h-3.5" />
                <span>{errors.amount}</span>
              </p>
            )}
          </section>

          {/* 7. 결제수단 / 지불 주체 */}
          <section>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              결제수단 / 지불 주체
            </label>
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-1.5">
              {PAYMENT_METHODS.map((pm) => {
                const isSelected = paymentMethod === pm.key;
                return (
                  <button
                    key={pm.key}
                    type="button"
                    onClick={() => {
                      haptics.selection();
                      setPaymentMethod(pm.key);
                    }}
                    className={`py-2 px-2 text-xs font-bold rounded-xl border text-center transition-all ${
                      isSelected
                        ? 'bg-blue-50/90 border-[#1E60F3] text-[#1E60F3] shadow-2xs'
                        : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    {pm.label}
                  </button>
                );
              })}
            </div>
          </section>

          {/* 8. 메모 (선택) */}
          <section>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-bold text-slate-700">메모 (선택)</label>
              <span className="text-[11px] text-slate-400 font-medium">{memo.length}/200</span>
            </div>
            <div className="relative">
              <div className="absolute top-3.5 left-3.5 text-slate-400 pointer-events-none">
                <FileText className="w-4 h-4" />
              </div>
              <textarea
                value={memo}
                maxLength={200}
                rows={2}
                onChange={(e) => setMemo(e.target.value)}
                placeholder="특이사항이나 세부 목적을 남겨주세요."
                className="w-full pl-10 pr-3.5 py-3 bg-white border border-slate-200 hover:border-slate-300 focus:border-[#1E60F3] focus:ring-2 focus:ring-[#1E60F3]/20 rounded-xl text-xs sm:text-sm text-slate-800 placeholder-slate-400 outline-hidden transition-all shadow-2xs resize-none"
              />
            </div>
          </section>

          {/* 9. Direct HQ Dashboard Submission Toggle */}
          <section className="pt-1">
            <label className="flex items-start gap-3 p-3.5 rounded-2xl bg-blue-50/70 border border-blue-200 hover:bg-blue-50/90 transition-all cursor-pointer">
              <input
                type="checkbox"
                checked={autoSubmitToHq}
                onChange={(e) => setAutoSubmitToHq(e.target.checked)}
                className="w-4 h-4 mt-0.5 text-[#1E60F3] rounded border-slate-300 focus:ring-blue-500 cursor-pointer"
              />
              <div className="flex-1 text-xs">
                <div className="flex items-center gap-1.5">
                  <span className="font-extrabold text-slate-900">본사(HQ) 대시보드로 즉시 전송</span>
                  <span className="text-[10px] font-bold bg-[#1E60F3] text-white px-1.5 py-0.2 rounded">
                    권장
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  저장과 동시에 본사 경비 검수 시스템에 &apos;검수 대기&apos;로 즉시 등록되어 관리자에게 제출됩니다.
                </p>
              </div>
              <Send className="w-4 h-4 text-[#1E60F3] shrink-0 mt-0.5" />
            </label>
          </section>
        </div>

        {/* Sticky Footer */}
        <div className="p-4 border-t border-slate-100 bg-white shrink-0 space-y-2">
          {receiptUrl && isReceiptLyingDown && (
            <div className="px-3.5 py-2.5 bg-amber-50 border border-amber-300 rounded-xl flex items-center justify-between text-xs text-amber-800 animate-in fade-in">
              <div className="flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                <span className="font-bold">영수증이 누워 있어 제출이 차단됩니다.</span>
              </div>
              <button
                type="button"
                onClick={() => handleRotateImage(90)}
                disabled={isRotating}
                className="text-[11px] font-extrabold text-[#1E60F3] hover:underline flex items-center gap-1 cursor-pointer"
              >
                <RotateCw className="w-3.5 h-3.5" />
                <span>90° 세우기</span>
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving || isAiScanning}
            className={`w-full py-4 font-bold rounded-xl text-base shadow-[0_4px_16px_rgba(30,96,243,0.3)] transition-all flex items-center justify-center gap-2 cursor-pointer ${
              receiptUrl && isReceiptLyingDown
                ? 'bg-amber-600 hover:bg-amber-700 text-white'
                : 'bg-[#1E60F3] hover:bg-blue-600 text-white active:scale-98 disabled:opacity-50'
            }`}
          >
            {isSaving ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>저장 및 본사 전송 중...</span>
              </>
            ) : receiptUrl && isReceiptLyingDown ? (
              <>
                <RotateCw className="w-5 h-5" />
                <span>영수증 90° 세우기 후 제출 가능</span>
              </>
            ) : autoSubmitToHq ? (
              <>
                <Send className="w-5 h-5" />
                <span>{editingItem ? '수정 후 본사 제출' : '지출 저장 및 본사 제출'}</span>
              </>
            ) : (
              <>
                <Check className="w-5 h-5" />
                <span>{editingItem ? '지출 수정 완료' : '기기 내 저장'}</span>
              </>
            )}
          </button>
        </div>

        {/* Modal: Category Picker */}
        {isCategoryPickerOpen && (
          <div className="fixed inset-0 z-60 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-2xs animate-in fade-in duration-150">
            <div className="absolute inset-0" onClick={() => setIsCategoryPickerOpen(false)} />
            <div
              className="relative w-full max-w-sm bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl p-5 z-10 max-h-[80vh] overflow-y-auto space-y-3"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <h3 className="text-base font-bold text-slate-900">지출 항목 선택</h3>
                <button
                  type="button"
                  onClick={() => setIsCategoryPickerOpen(false)}
                  className="p-1 text-slate-400 hover:text-slate-600 rounded-full"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-1.5">
                {(Object.keys(EXPENSE_CATEGORIES) as ExpenseCategoryKey[]).map((catKey) => {
                  const itemMeta = EXPENSE_CATEGORIES[catKey];
                  const isCurrent = category === catKey;
                  return (
                    <button
                      key={catKey}
                      type="button"
                      onClick={() => {
                        haptics.selection();
                        setCategory(catKey);
                        setIsCategoryPickerOpen(false);
                      }}
                      className={`w-full p-3 rounded-xl flex items-center justify-between text-left transition-all ${
                        isCurrent
                          ? 'bg-blue-50/90 border border-blue-200 text-[#1E60F3]'
                          : 'hover:bg-slate-50 border border-transparent text-slate-700'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-9 h-9 rounded-full ${itemMeta.badgeBg} ${itemMeta.badgeTextColor} border ${itemMeta.badgeBorder} flex items-center justify-center shrink-0`}
                        >
                          {renderCategoryIcon(itemMeta.iconName, 'w-4 h-4')}
                        </div>
                        <div>
                          <div className="font-bold text-sm text-slate-900">{itemMeta.label}</div>
                          <div className="text-[11px] text-slate-400">{itemMeta.desc}</div>
                        </div>
                      </div>
                      {isCurrent && <Check className="w-5 h-5 text-[#1E60F3]" />}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Modal: Date & Time Picker */}
        {isDateTimePickerOpen && (
          <div className="fixed inset-0 z-60 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-2xs animate-in fade-in duration-150">
            <div className="absolute inset-0" onClick={() => setIsDateTimePickerOpen(false)} />
            <div
              className="relative w-full max-w-sm bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl p-5 z-10 space-y-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <h3 className="text-base font-bold text-slate-900">지출 일시 변경</h3>
                <button
                  type="button"
                  onClick={() => setIsDateTimePickerOpen(false)}
                  className="p-1 text-slate-400 hover:text-slate-600 rounded-full"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Date Input */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700">날짜 선택</label>
                <input
                  type="date"
                  value={tempDate}
                  onChange={(e) => setTempDate(e.target.value)}
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-800"
                />
              </div>

              {/* Time Hour / Minute Select */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700">시간 선택 (24시간제)</label>
                <div className="grid grid-cols-2 gap-2">
                  <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
                    <span className="text-xs text-slate-400">시:</span>
                    <input
                      type="number"
                      min={0}
                      max={23}
                      value={tempHour}
                      onChange={(e) => {
                        const val = Math.min(23, Math.max(0, parseInt(e.target.value || '0', 10)));
                        setTempHour(String(val).padStart(2, '0'));
                      }}
                      className="w-full bg-transparent text-sm font-bold text-slate-800 outline-hidden"
                    />
                  </div>
                  <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
                    <span className="text-xs text-slate-400">분:</span>
                    <input
                      type="number"
                      min={0}
                      max={59}
                      value={tempMinute}
                      onChange={(e) => {
                        const val = Math.min(59, Math.max(0, parseInt(e.target.value || '0', 10)));
                        setTempMinute(String(val).padStart(2, '0'));
                      }}
                      className="w-full bg-transparent text-sm font-bold text-slate-800 outline-hidden"
                    />
                  </div>
                </div>
              </div>

              <div className="pt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => setIsDateTimePickerOpen(false)}
                  className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-colors"
                >
                  취소
                </button>
                <button
                  type="button"
                  onClick={() => {
                    haptics.lightTap();
                    setDate(tempDate);
                    setTime(`${tempHour}:${tempMinute}`);
                    setIsDateTimePickerOpen(false);
                  }}
                  className="flex-1 py-3 bg-[#1E60F3] hover:bg-blue-600 text-white text-xs font-bold rounded-xl transition-colors"
                >
                  확인
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal: Full Receipt Photo Zoom */}
        {isPhotoZoomOpen && receiptUrl && (
          <div className="fixed inset-0 z-70 flex flex-col items-center justify-between bg-black/95 backdrop-blur-md p-4 animate-in fade-in duration-200">
            {/* Top Toolbar */}
            <div className="w-full max-w-2xl flex items-center justify-between text-white py-2 px-1 z-20">
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold tracking-tight text-white/95">영수증 원본 확대</span>
                <span className="text-xs text-white/50 hidden sm:inline">누운 영수증을 바로 세울 수 있습니다</span>
              </div>
              <div className="flex items-center gap-1.5 sm:gap-2">
                <button
                  type="button"
                  onClick={() => handleRotateImage(-90)}
                  disabled={isRotating}
                  className="bg-white/15 hover:bg-white/25 active:scale-95 disabled:opacity-40 text-white text-xs font-semibold px-3 py-2 rounded-full flex items-center gap-1.5 backdrop-blur-xs transition-all cursor-pointer"
                  title="반시계방향 90° 회전"
                >
                  <RotateCcw className="w-4 h-4" />
                  <span className="hidden sm:inline">좌 90°</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleRotateImage(90)}
                  disabled={isRotating}
                  className="bg-[#1E60F3] hover:bg-blue-600 active:scale-95 disabled:opacity-40 text-white text-xs font-bold px-3.5 py-2 rounded-full flex items-center gap-1.5 shadow-lg transition-all cursor-pointer"
                  title="시계방향 90° 회전 (세우기)"
                >
                  {isRotating ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <RotateCw className="w-4 h-4" />
                  )}
                  <span>90° 세우기</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsPhotoZoomOpen(false)}
                  className="p-2 text-white/80 hover:text-white bg-white/10 hover:bg-white/20 rounded-full transition-colors ml-1"
                  aria-label="닫기"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Centered Image */}
            <div className="relative w-full max-w-2xl flex-1 my-2">
              <Image
                src={receiptUrl}
                alt="영수증 원본 확대보기"
                fill
                sizes="(max-width: 768px) 100vw, 900px"
                className="object-contain"
              />

              {isRotating && (
                <div className="absolute inset-0 bg-black/60 backdrop-blur-xs flex flex-col items-center justify-center gap-2 z-30 animate-in fade-in duration-150">
                  <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
                  <span className="text-sm font-semibold text-white">회전 중...</span>
                </div>
              )}
            </div>

            {/* Bottom Hint */}
            <div className="text-center text-white/50 text-xs py-1">
              가로로 누운 영수증은 상단 &apos;90° 세우기&apos; 버튼으로 바르게 세울 수 있습니다.
            </div>
          </div>
        )}

        {/* Modal: Orientation Enforcement Dialog */}
        {isOrientationModalOpen && receiptUrl && (
          <div className="fixed inset-0 z-80 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-in fade-in duration-200">
            <div
              className="relative w-full max-w-sm bg-white rounded-3xl p-6 shadow-2xl text-center space-y-4 animate-in zoom-in-95 duration-200"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="w-14 h-14 mx-auto rounded-2xl bg-amber-100 border border-amber-200 flex items-center justify-center text-amber-600 shadow-inner">
                <RotateCw className="w-7 h-7" />
              </div>

              <div className="space-y-1.5">
                <h3 className="text-base font-black text-slate-900 tracking-tight">
                  영수증 사진을 바로 세워주세요
                </h3>
                <p className="text-xs text-slate-500 leading-relaxed">
                  영수증 사진이 가로로 누워 있으면 본사 관리자가 금액과 거래처를 정확히 검수하기 어렵습니다.
                  <br />
                  <span className="font-bold text-slate-700">관리자 검수를 위해 영수증을 똑바로 세운 후 제출해야 합니다.</span>
                </p>
              </div>

              {/* Mini Preview */}
              <div className="relative w-40 h-28 mx-auto rounded-xl overflow-hidden border border-amber-300 bg-slate-900/5 shadow-inner">
                <Image
                  src={receiptUrl}
                  alt="누운 영수증 미리보기"
                  fill
                  className="object-contain p-1"
                />
                <div className="absolute top-1.5 left-1.5 bg-amber-500 text-white text-[9px] font-black px-1.5 py-0.5 rounded shadow-xs">
                  현재 누움 (가로)
                </div>
              </div>

              <div className="pt-2 space-y-2">
                <button
                  type="button"
                  onClick={handleFixOrientationAndSave}
                  disabled={isRotating || isSaving}
                  className="w-full py-3.5 bg-[#1E60F3] hover:bg-blue-600 active:scale-98 text-white rounded-xl text-xs font-bold shadow-md flex items-center justify-center gap-2 cursor-pointer transition-all"
                >
                  {isRotating ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <RotateCw className="w-4 h-4" />
                  )}
                  <span>90° 바로 세우고 즉시 제출하기</span>
                </button>

                <button
                  type="button"
                  onClick={() => setIsOrientationModalOpen(false)}
                  className="w-full py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
                >
                  직접 확인 및 수정하기
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Floating Toast Notification */}
        {toastMessage && (
          <div className="absolute bottom-20 left-1/2 -translate-x-1/2 z-60 bg-slate-900/90 text-white text-xs font-semibold px-4 py-2.5 rounded-full shadow-xl flex items-center gap-2 backdrop-blur-sm animate-in fade-in slide-in-from-bottom-2 duration-150 pointer-events-none">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{toastMessage}</span>
          </div>
        )}
      </div>
    </div>
  );
};

export const AddExpenseModal: React.FC<AddExpenseModalProps> = ({
  isOpen,
  onClose,
  onSave,
  editingItem,
  initialPhotoUrl,
  defaultDate,
}) => {
  useEffect(() => {
    if (!isOpen) return;
    const origOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = origOverflow;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <AddExpenseModalContent
      key={editingItem ? editingItem.id : 'new-expense'}
      onClose={onClose}
      onSave={onSave}
      editingItem={editingItem}
      initialPhotoUrl={initialPhotoUrl}
      defaultDate={defaultDate}
    />
  );
};
