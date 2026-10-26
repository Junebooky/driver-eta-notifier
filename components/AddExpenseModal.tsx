'use client';

import React, { useState, useRef, useEffect } from 'react';
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
  Loader2,
  RotateCw,
  RotateCcw,
  CheckCircle2,
} from 'lucide-react';
import { rotateImageDataUrl } from '@/utils/imageRotate';
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
  const isSampleFuelReceipt = !editingItem && initialPhotoUrl === '/images/receipt_sample_fuel.jpg';

  const [category, setCategory] = useState<ExpenseCategoryKey>(
    () => editingItem?.category || 'fuel'
  );

  const [date, setDate] = useState<string>(() => {
    if (editingItem?.date) return editingItem.date;
    if (isSampleFuelReceipt) return '2026-10-24';
    if (defaultDate) return defaultDate;
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  });

  const [time, setTime] = useState<string>(() => {
    if (editingItem?.time) return editingItem.time;
    if (isSampleFuelReceipt) return '11:32';
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    return `${hh}:${mm}`;
  });

  const [merchant, setMerchant] = useState<string>(
    () => editingItem?.merchant || (isSampleFuelReceipt ? '서울주유소' : '')
  );
  const [address, setAddress] = useState<string>(
    () => editingItem?.address || (isSampleFuelReceipt ? '서울 강남구 테헤란로 123' : '')
  );
  const [amountRaw, setAmountRaw] = useState<string>(() => {
    if (editingItem) return formatKRW(editingItem.amount, false);
    if (isSampleFuelReceipt) return '72,000';
    return '';
  });
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(
    () => editingItem?.paymentMethod || 'company_card'
  );
  const [memo, setMemo] = useState<string>(
    () => editingItem?.memo || (isSampleFuelReceipt ? '서울 강남구 테헤란로 주유' : '')
  );
  const [receiptUrl, setReceiptUrl] = useState<string | undefined>(
    () => editingItem?.receiptUrl || initialPhotoUrl
  );

  // Modal selectors & overlays
  const [isCategoryPickerOpen, setIsCategoryPickerOpen] = useState(false);
  const [isDateTimePickerOpen, setIsDateTimePickerOpen] = useState(false);
  const [isPhotoZoomOpen, setIsPhotoZoomOpen] = useState(false);

  // Image rotation state
  const [isRotating, setIsRotating] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 2500);
  };

  // Rotate receipt photo (+90 clockwise, -90 counter-clockwise)
  const handleRotateImage = async (degrees: number = 90) => {
    if (!receiptUrl || isRotating) return;
    haptics.selection();
    setIsRotating(true);
    try {
      const rotated = await rotateImageDataUrl(receiptUrl, degrees);
      setReceiptUrl(rotated);
      showToast(degrees > 0 ? '영수증을 90° 시계방향으로 회전했습니다.' : '영수증을 90° 반시계방향으로 회전했습니다.');
    } catch (err) {
      console.error('Failed to rotate receipt image:', err);
      showToast('이미지 회전에 실패했습니다.');
    } finally {
      setIsRotating(false);
    }
  };

  // Validation & saving state
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);

  // Temp date/time picker state
  const [tempDate, setTempDate] = useState(date);
  const [tempHour, setTempHour] = useState(time.split(':')[0] || '11');
  const [tempMinute, setTempMinute] = useState(time.split(':')[1] || '32');

  // Handle image upload from camera or gallery
  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    haptics.selection();
    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result as string;
      setReceiptUrl(result);

      // If fields are empty and user selected sample receipt, suggest fields
      if (!merchant) {
        if (file.name.includes('fuel') || file.name.includes('주유')) {
          setMerchant('서울 만남의광장 주유소');
          setCategory('fuel');
          if (!amountRaw) setAmountRaw('72,000');
        }
      }
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

  // Submit handler
  const handleSave = () => {
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
    };

    onSave(finalItem);
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
              <span className="text-xs font-bold text-slate-700">영수증 사진</span>
              {receiptUrl && (
                <div className="flex items-center gap-1.5 sm:gap-2">
                  <button
                    type="button"
                    onClick={() => handleRotateImage(90)}
                    disabled={isRotating}
                    className="text-[11px] text-[#1E60F3] hover:text-blue-700 bg-blue-50 hover:bg-blue-100 disabled:opacity-50 px-2.5 py-1 rounded-full font-semibold flex items-center gap-1 transition-all active:scale-95 cursor-pointer"
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
                    className="bg-[#1E60F3]/90 hover:bg-[#1E60F3] text-white text-xs font-bold px-3 py-1.5 rounded-full flex items-center gap-1.5 backdrop-blur-xs shadow-md transition-all active:scale-95 disabled:opacity-40 cursor-pointer"
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

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handlePhotoUpload}
            />
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
        </div>

        {/* Sticky Footer */}
        <div className="p-4 border-t border-slate-100 bg-white shrink-0">
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            className="w-full py-4 bg-[#1E60F3] hover:bg-blue-600 active:scale-98 disabled:opacity-50 text-white font-bold rounded-xl text-base shadow-[0_4px_16px_rgba(30,96,243,0.3)] transition-all flex items-center justify-center gap-2 cursor-pointer"
          >
            {isSaving ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>저장 중...</span>
              </>
            ) : (
              <span>저장하기</span>
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
