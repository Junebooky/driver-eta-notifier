'use client';

import React from 'react';

export interface HqOfficialQuoteDocumentProps {
  quoteNo: string;
  issuedDate?: string;
  customerName: string;
  contactPerson: string;
  contactPhone: string;
  notes?: string;
  date: string;
  serviceStartTime: string;
  serviceEndTime: string;
  serviceHours: number;
  origin: string;
  destination: string;
  vehicleModel: string;
  vehicleCount: number;
  serviceCategoryLabel: string;
  englishOption: 'basic_included' | 'fluent_upgrade';
  baseFareTotal: number | null;
  overtimeHours?: number;
  overtimeFareTotal?: number;
  excessKm?: number;
  excessDistanceTotal?: number;
  englishSurchargeTotal?: number;
  supplyPriceTotal: number | null;
  vatAmount: number | null;
  estimatedGrandTotal: number | null;
  quoteRequired?: boolean;
}

/**
 * VIP LIMOUSINE KOREA Official Estimate (공식 견적 영수증) Document
 * Designed precisely after the luxury executive chauffeur quote specification:
 * - English font: Playfair Display
 * - Korean font: Pretendard
 * - Assets: /images/receipt/header.png (Chauffeur logo) & /images/receipt/bg.png (Hero banner)
 * - Formatted strictly for seamless 1-page A4 PDF printing
 */
export const HqOfficialQuoteDocument: React.FC<HqOfficialQuoteDocumentProps> = ({
  quoteNo,
  issuedDate,
  customerName,
  contactPerson,
  contactPhone,
  notes,
  date,
  serviceStartTime,
  serviceEndTime,
  serviceHours,
  origin,
  destination,
  vehicleModel,
  vehicleCount,
  serviceCategoryLabel,
  englishOption,
  baseFareTotal,
  overtimeHours = 0,
  overtimeFareTotal = 0,
  excessKm = 0,
  excessDistanceTotal = 0,
  englishSurchargeTotal = 0,
  supplyPriceTotal,
  vatAmount,
  estimatedGrandTotal,
  quoteRequired = false,
}) => {
  const displayDate = issuedDate || new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  }).format(new Date());

  const driverServiceLabel = englishOption === 'fluent_upgrade' ? '영어 (추가 비용)' : '한국어';

  return (
    <div
      id="quote-receipt-card"
      className="official-quote-sheet"
      style={{
        boxSizing: 'border-box',
        width: '100%',
        maxWidth: '700px',
        margin: '0 auto',
        backgroundColor: '#ffffff',
        color: '#111827',
        fontFamily: 'Pretendard, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        padding: '30px 32px 24px 32px',
        border: '1px solid #e2e8f0',
        borderRadius: '12px',
        boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.05)',
      }}
    >
      {/* 1. Top Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '8px' }}>
        {/* Top Left */}
        <div style={{ width: '130px', textAlign: 'left' }}>
          <div style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: '8.5px', color: '#475569', letterSpacing: '0.12em', lineHeight: 1.3, textTransform: 'uppercase' }}>
            PREMIUM
          </div>
          <div style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: '8.5px', color: '#475569', letterSpacing: '0.12em', lineHeight: 1.3, textTransform: 'uppercase' }}>
            CHAUFFEUR SERVICE
          </div>
        </div>

        {/* Center Logo & Title */}
        <div style={{ textAlign: 'center', flex: 1 }}>
          <img
            src="/images/receipt/header.png"
            alt="VIP Limousine Emblem"
            style={{ height: '36px', margin: '0 auto', display: 'block', objectFit: 'contain' }}
          />
          <div
            style={{
              fontFamily: "'Playfair Display', Georgia, serif",
              fontSize: '19px',
              fontWeight: 700,
              color: '#111827',
              letterSpacing: '0.08em',
              marginTop: '4px',
              lineHeight: 1.2,
            }}
          >
            VIP LIMOUSINE KOREA
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginTop: '3px' }}>
            <span style={{ width: '32px', height: '1px', backgroundColor: '#9b7a4f', display: 'inline-block' }} />
            <span
              style={{
                fontFamily: "'Playfair Display', Georgia, serif",
                fontSize: '8.5px',
                letterSpacing: '0.22em',
                color: '#9b7a4f',
                textTransform: 'uppercase',
                fontWeight: 600,
              }}
            >
              EXECUTIVE CHAUFFEUR
            </span>
            <span style={{ width: '32px', height: '1px', backgroundColor: '#9b7a4f', display: 'inline-block' }} />
          </div>
        </div>

        {/* Top Right */}
        <div style={{ width: '130px', textAlign: 'right' }}>
          <div style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: '8.5px', color: '#475569', letterSpacing: '0.12em', lineHeight: 1.3, textTransform: 'uppercase' }}>
            COMFORT · SAFETY
          </div>
          <div style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: '8.5px', color: '#475569', letterSpacing: '0.12em', lineHeight: 1.3, textTransform: 'uppercase' }}>
            YOUR PREMIUM JOURNEY
          </div>
        </div>
      </div>

      {/* Thin Gold/Beige Divider Line */}
      <div style={{ width: '100%', height: '1px', backgroundColor: '#e5dec9', margin: '10px 0 14px 0' }} />

      {/* 2. Official Estimate Title & Quote Metadata */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
        {/* Left: Title */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ width: '3.5px', height: '36px', backgroundColor: '#9b7a4f', borderRadius: '1px' }} />
          <div>
            <div style={{ fontSize: '20px', fontWeight: 700, color: '#111827', lineHeight: 1.2, letterSpacing: '-0.02em' }}>
              공식 견적 영수증
            </div>
            <div
              style={{
                fontFamily: "'Playfair Display', Georgia, serif",
                fontSize: '9px',
                letterSpacing: '0.22em',
                color: '#64748b',
                textTransform: 'uppercase',
                marginTop: '1px',
              }}
            >
              OFFICIAL ESTIMATE
            </div>
          </div>
        </div>

        {/* Right: Quote No & Issued Date */}
        <div style={{ fontSize: '11px', textAlign: 'right', lineHeight: 1.6 }}>
          <div>
            <span style={{ color: '#64748b', marginRight: '16px' }}>견적번호</span>
            <span style={{ fontWeight: 700, color: '#0f172a', fontFamily: 'Pretendard, monospace' }}>
              {quoteNo}
            </span>
          </div>
          <div>
            <span style={{ color: '#64748b', marginRight: '16px' }}>발급일시</span>
            <span style={{ fontWeight: 500, color: '#0f172a' }}>
              {displayDate}
            </span>
          </div>
        </div>
      </div>

      {/* 3. Hero Visual Banner (bg.png) */}
      <div style={{ width: '100%', height: '144px', overflow: 'hidden', marginBottom: '16px' }}>
        <img
          src="/images/receipt/bg.png"
          alt="VIP Chauffeur Service Experience"
          style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center', display: 'block' }}
        />
      </div>

      {/* 4. Section 01: 기본 정보 (BASIC INFORMATION) */}
      <div style={{ marginBottom: '16px' }}>
        {/* Section Header */}
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: '6px' }}>
          <span style={{ fontFamily: "'Playfair Display', Georgia, serif", fontStyle: 'italic', fontSize: '19px', fontWeight: 600, color: '#9b7a4f', marginRight: '8px' }}>
            01
          </span>
          <span style={{ color: '#cbd5e1', marginRight: '8px', fontWeight: 300 }}>|</span>
          <span style={{ fontSize: '14px', fontWeight: 700, color: '#111827', marginRight: '8px' }}>
            기본 정보
          </span>
          <span style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: '9px', letterSpacing: '0.16em', color: '#8c7355', textTransform: 'uppercase' }}>
            BASIC INFORMATION
          </span>
        </div>

        {/* Table Content */}
        <div style={{ borderTop: '1px solid #e2e8f0', borderBottom: '1px solid #e2e8f0' }}>
          {/* Row 1 */}
          <div style={{ display: 'flex', alignItems: 'center', padding: '7px 8px', borderBottom: '1px solid #f1f5f9', fontSize: '11px' }}>
            <div style={{ width: '75px', color: '#475569', fontWeight: 500 }}>고객사명</div>
            <div style={{ flex: 1, fontWeight: 700, color: '#0f172a' }}>{customerName || '인터코스'}</div>
            <div style={{ width: '60px', color: '#475569', fontWeight: 500 }}>담당자</div>
            <div style={{ flex: 1, fontWeight: 600, color: '#0f172a' }}>
              {contactPerson || '김지현 팀장'}{contactPhone ? ` (${contactPhone})` : ''}
            </div>
          </div>
          {/* Row 2 */}
          <div style={{ display: 'flex', alignItems: 'center', padding: '7px 8px', borderBottom: '1px solid #f1f5f9', fontSize: '11px' }}>
            <div style={{ width: '75px', color: '#475569', fontWeight: 500 }}>행사 / 목적</div>
            <div style={{ flex: 1, fontWeight: 600, color: '#0f172a' }}>{notes || '비즈니스 투어'}</div>
            <div style={{ width: '60px', color: '#475569', fontWeight: 500 }}>운행 일정</div>
            <div style={{ flex: 1, fontWeight: 600, color: '#0f172a' }}>
              {date} ({serviceStartTime} ~ {serviceEndTime}, {serviceHours}시간)
            </div>
          </div>
          {/* Row 3 */}
          <div style={{ display: 'flex', alignItems: 'center', padding: '7px 8px', fontSize: '11px' }}>
            <div style={{ width: '75px', color: '#475569', fontWeight: 500 }}>운행 구간</div>
            <div style={{ flex: 1, fontWeight: 700, color: '#0f172a' }}>
              {origin} → {destination}
            </div>
          </div>
        </div>
      </div>

      {/* 5. Section 02: 차량 및 서비스 (VEHICLE & SERVICE) */}
      <div style={{ marginBottom: '16px' }}>
        {/* Section Header */}
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: '6px' }}>
          <span style={{ fontFamily: "'Playfair Display', Georgia, serif", fontStyle: 'italic', fontSize: '19px', fontWeight: 600, color: '#9b7a4f', marginRight: '8px' }}>
            02
          </span>
          <span style={{ color: '#cbd5e1', marginRight: '8px', fontWeight: 300 }}>|</span>
          <span style={{ fontSize: '14px', fontWeight: 700, color: '#111827', marginRight: '8px' }}>
            차량 및 서비스
          </span>
          <span style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: '9px', letterSpacing: '0.16em', color: '#8c7355', textTransform: 'uppercase' }}>
            VEHICLE & SERVICE
          </span>
        </div>

        {/* 4-Column Box */}
        <div
          style={{
            backgroundColor: '#f8fafc',
            border: '1px solid #e2e8f0',
            borderRadius: '4px',
            padding: '9px 12px',
            display: 'flex',
            alignItems: 'center',
          }}
        >
          {/* Col 1 */}
          <div style={{ flex: '2.2', paddingRight: '10px' }}>
            <div style={{ fontSize: '10px', color: '#64748b', marginBottom: '3px' }}>선택 차량</div>
            <div style={{ fontSize: '11.5px', fontWeight: 700, color: '#0f172a' }}>
              {vehicleModel || '제네시스 G90 신차 최고급형'}
            </div>
          </div>
          {/* Col 2 */}
          <div style={{ flex: '1', borderLeft: '1px solid #e2e8f0', paddingLeft: '10px', paddingRight: '10px' }}>
            <div style={{ fontSize: '10px', color: '#64748b', marginBottom: '3px' }}>차량 수량</div>
            <div style={{ fontSize: '11.5px', fontWeight: 700, color: '#0f172a' }}>
              {vehicleCount}대
            </div>
          </div>
          {/* Col 3 */}
          <div style={{ flex: '2', borderLeft: '1px solid #e2e8f0', paddingLeft: '10px', paddingRight: '10px' }}>
            <div style={{ fontSize: '10px', color: '#64748b', marginBottom: '3px' }}>서비스 구분</div>
            <div style={{ fontSize: '11.5px', fontWeight: 700, color: '#0f172a' }}>
              {serviceCategoryLabel || '일반 의전 (수도권 9시간)'}
            </div>
          </div>
          {/* Col 4 */}
          <div style={{ flex: '1.4', borderLeft: '1px solid #e2e8f0', paddingLeft: '10px' }}>
            <div style={{ fontSize: '10px', color: '#64748b', marginBottom: '3px' }}>기사 서비스</div>
            <div style={{ fontSize: '11.5px', fontWeight: 700, color: '#0f172a' }}>
              {driverServiceLabel}
            </div>
          </div>
        </div>
      </div>

      {/* 6. Section 03: 요금 상세 (PRICE BREAKDOWN) */}
      <div style={{ marginBottom: '14px' }}>
        {/* Section Header */}
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: '6px' }}>
          <span style={{ fontFamily: "'Playfair Display', Georgia, serif", fontStyle: 'italic', fontSize: '19px', fontWeight: 600, color: '#9b7a4f', marginRight: '8px' }}>
            03
          </span>
          <span style={{ color: '#cbd5e1', marginRight: '8px', fontWeight: 300 }}>|</span>
          <span style={{ fontSize: '14px', fontWeight: 700, color: '#111827', marginRight: '8px' }}>
            요금 상세
          </span>
          <span style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: '9px', letterSpacing: '0.16em', color: '#8c7355', textTransform: 'uppercase' }}>
            PRICE BREAKDOWN
          </span>
        </div>

        {/* Price Breakdown List */}
        <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '6px' }}>
          {/* Base Fare */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0', fontSize: '11px' }}>
            <span style={{ color: '#1e293b' }}>기본 대절료 ({vehicleCount}대 × {serviceHours}시간)</span>
            <span style={{ fontWeight: 600, color: '#0f172a', fontFamily: 'Pretendard, monospace' }}>
              {baseFareTotal !== null ? `${baseFareTotal.toLocaleString()}원` : (quoteRequired ? '상담 후 산정' : '-')}
            </span>
          </div>

          {/* Overtime (if any) */}
          {overtimeHours > 0 && overtimeFareTotal > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0', fontSize: '11px', color: '#92400e' }}>
              <span>초과 시간 요금 ({overtimeHours}시간)</span>
              <span style={{ fontWeight: 600, fontFamily: 'Pretendard, monospace' }}>
                +{overtimeFareTotal.toLocaleString()}원
              </span>
            </div>
          )}

          {/* Excess Km (if any) */}
          {excessKm > 0 && excessDistanceTotal > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0', fontSize: '11px', color: '#92400e' }}>
              <span>초과 거리 요금 ({excessKm}km)</span>
              <span style={{ fontWeight: 600, fontFamily: 'Pretendard, monospace' }}>
                +{excessDistanceTotal.toLocaleString()}원
              </span>
            </div>
          )}

          {/* English Surcharge (if any) */}
          {englishSurchargeTotal > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0', fontSize: '11px', color: '#1e40af' }}>
              <span>의전 기사 영어 수당</span>
              <span style={{ fontWeight: 600, fontFamily: 'Pretendard, monospace' }}>
                +{englishSurchargeTotal.toLocaleString()}원
              </span>
            </div>
          )}

          {/* Subtotal Divider */}
          <div style={{ borderTop: '1px solid #e2e8f0', margin: '6px 0' }} />

          {/* Supply Price Subtotal */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0', fontSize: '12px' }}>
            <span style={{ fontWeight: 700, color: '#0f172a' }}>공급가액 소계</span>
            <span style={{ fontWeight: 700, color: '#0f172a', fontFamily: 'Pretendard, monospace' }}>
              {supplyPriceTotal !== null ? `${supplyPriceTotal.toLocaleString()}원` : (quoteRequired ? '상담 후 산정' : '-')}
            </span>
          </div>

          {/* VAT */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '24px', padding: '2px 0', fontSize: '10.5px' }}>
            <span style={{ color: '#64748b' }}>부가가치세 (10%)</span>
            <span style={{ fontWeight: 500, color: '#0f172a', fontFamily: 'Pretendard, monospace' }}>
              {vatAmount !== null ? `${vatAmount.toLocaleString()}원` : '별도 산정'}
            </span>
          </div>
        </div>
      </div>

      {/* 7. Section 04: 총 청구 예상금액 (GRAND TOTAL BANNER) */}
      <div
        style={{
          backgroundColor: '#f7f4ed',
          border: '1px solid #eadfc9',
          borderRadius: '4px',
          padding: '12px 18px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '14px',
        }}
      >
        {/* Left: 04 and Label */}
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <div style={{ width: '3px', height: '26px', backgroundColor: '#9b7a4f', marginRight: '10px', borderRadius: '1px' }} />
          <span
            style={{
              fontFamily: "'Playfair Display', Georgia, serif",
              fontStyle: 'italic',
              fontSize: '20px',
              fontWeight: 600,
              color: '#9b7a4f',
              marginRight: '10px',
            }}
          >
            04
          </span>
          <span style={{ fontSize: '13px', fontWeight: 700, color: '#1e293b' }}>
            총 청구 예상금액 <span style={{ fontSize: '10.5px', fontWeight: 500, color: '#64748b' }}>(부가가치세 10% 포함)</span>
          </span>
        </div>

        {/* Right: Grand Total Amount */}
        <div
          style={{
            fontSize: '25px',
            fontWeight: 800,
            color: '#614421',
            fontFamily: 'Pretendard, -apple-system, sans-serif',
            letterSpacing: '-0.02em',
          }}
        >
          {estimatedGrandTotal !== null ? `${estimatedGrandTotal.toLocaleString()}원` : (quoteRequired ? '상담 후 산정' : '0원')}
        </div>
      </div>

      {/* 8. Notice text */}
      <div style={{ fontSize: '9.5px', color: '#64748b', lineHeight: 1.5, marginBottom: '16px', paddingLeft: '2px' }}>
        <div>* 본 견적서는 2026 공식 요율표 기준 실시간 산출 견적서입니다.</div>
        <div style={{ paddingLeft: '8px' }}>예약 전환 시 실시간 관제 스케줄에 즉시 등록됩니다.</div>
      </div>

      {/* 9. Bottom Footer */}
      <div
        style={{
          borderTop: '1px solid #e2d8cc',
          paddingTop: '12px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span
            style={{
              fontFamily: "'Playfair Display', Georgia, serif",
              fontSize: '9px',
              fontWeight: 700,
              letterSpacing: '0.12em',
              color: '#475569',
              textTransform: 'uppercase',
            }}
          >
            VIP LIMOUSINE KOREA
          </span>
          <span style={{ color: '#cbd5e1', fontSize: '9px' }}>|</span>
          <span
            style={{
              fontFamily: "'Playfair Display', Georgia, serif",
              fontSize: '8.5px',
              letterSpacing: '0.14em',
              color: '#64748b',
              textTransform: 'uppercase',
            }}
          >
            EXECUTIVE CHAUFFEUR SERVICE
          </span>
        </div>

        {/* Flourish Wave Stroke */}
        <svg
          width="110"
          height="14"
          viewBox="0 0 110 14"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          style={{ display: 'block' }}
        >
          <path
            d="M2 11C28 11 44 4 62 4C80 4 94 9 108 8"
            stroke="#9b7a4f"
            strokeWidth="1.2"
            strokeLinecap="round"
          />
        </svg>
      </div>
    </div>
  );
};

/**
 * Generate full self-contained HTML for isolated 1-page A4 PDF print
 */
export function generateOfficialQuotePrintHtml(props: HqOfficialQuoteDocumentProps): string {
  const displayDate = props.issuedDate || new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  }).format(new Date());

  const driverServiceLabel = props.englishOption === 'fluent_upgrade' ? '영어 (추가 비용)' : '한국어';

  const baseFareFormatted = props.baseFareTotal !== null ? `${props.baseFareTotal.toLocaleString()}원` : (props.quoteRequired ? '상담 후 산정' : '-');
  const overtimeFormatted = props.overtimeHours && props.overtimeFareTotal ? `+${props.overtimeFareTotal.toLocaleString()}원` : null;
  const excessKmFormatted = props.excessKm && props.excessDistanceTotal ? `+${props.excessDistanceTotal.toLocaleString()}원` : null;
  const englishSurchargeFormatted = props.englishSurchargeTotal ? `+${props.englishSurchargeTotal.toLocaleString()}원` : null;
  const supplyPriceFormatted = props.supplyPriceTotal !== null ? `${props.supplyPriceTotal.toLocaleString()}원` : (props.quoteRequired ? '상담 후 산정' : '-');
  const vatFormatted = props.vatAmount !== null ? `${props.vatAmount.toLocaleString()}원` : '별도 산정';
  const grandTotalFormatted = props.estimatedGrandTotal !== null ? `${props.estimatedGrandTotal.toLocaleString()}원` : (props.quoteRequired ? '상담 후 산정' : '0원');

  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <title>VIP_LIMOUSINE_공식견적서_${props.quoteNo}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400..900;1,400..900&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.css" />
  <style>
    @page {
      size: A4 portrait;
      margin: 8mm 10mm;
    }
    * {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    html, body {
      margin: 0 !important;
      padding: 0 !important;
      background: #ffffff !important;
      font-family: Pretendard, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
      color: #111827 !important;
      overflow: hidden !important;
      height: 100% !important;
    }
    .print-sheet {
      width: 100% !important;
      max-width: 680px !important;
      margin: 0 auto !important;
      padding: 24px 28px 18px 28px !important;
      background: #ffffff !important;
      page-break-inside: avoid !important;
      break-inside: avoid !important;
    }
    .header-flourish {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      margin-top: 3px;
    }
  </style>
</head>
<body>
  <div class="print-sheet">
    <!-- 1. Top Header -->
    <div style="display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 8px;">
      <div style="width: 130px; text-align: left;">
        <div style="font-family: 'Playfair Display', Georgia, serif; font-size: 8.5px; color: #475569; letter-spacing: 0.12em; line-height: 1.3; text-transform: uppercase;">
          PREMIUM
        </div>
        <div style="font-family: 'Playfair Display', Georgia, serif; font-size: 8.5px; color: #475569; letter-spacing: 0.12em; line-height: 1.3; text-transform: uppercase;">
          CHAUFFEUR SERVICE
        </div>
      </div>

      <div style="text-align: center; flex: 1;">
        <img src="/images/receipt/header.png" alt="VIP Limousine Emblem" style="height: 36px; margin: 0 auto; display: block; object-fit: contain;" />
        <div style="font-family: 'Playfair Display', Georgia, serif; font-size: 19px; font-weight: 700; color: #111827; letter-spacing: 0.08em; margin-top: 4px; line-height: 1.2;">
          VIP LIMOUSINE KOREA
        </div>
        <div class="header-flourish">
          <span style="width: 32px; height: 1px; background-color: #9b7a4f; display: inline-block;"></span>
          <span style="font-family: 'Playfair Display', Georgia, serif; font-size: 8.5px; letter-spacing: 0.22em; color: #9b7a4f; text-transform: uppercase; font-weight: 600;">
            EXECUTIVE CHAUFFEUR
          </span>
          <span style="width: 32px; height: 1px; background-color: #9b7a4f; display: inline-block;"></span>
        </div>
      </div>

      <div style="width: 130px; text-align: right;">
        <div style="font-family: 'Playfair Display', Georgia, serif; font-size: 8.5px; color: #475569; letter-spacing: 0.12em; line-height: 1.3; text-transform: uppercase;">
          COMFORT · SAFETY
        </div>
        <div style="font-family: 'Playfair Display', Georgia, serif; font-size: 8.5px; color: #475569; letter-spacing: 0.12em; line-height: 1.3; text-transform: uppercase;">
          YOUR PREMIUM JOURNEY
        </div>
      </div>
    </div>

    <!-- Thin Divider -->
    <div style="width: 100%; height: 1px; background-color: #e5dec9; margin: 10px 0 14px 0;"></div>

    <!-- 2. Official Estimate Title & Metadata -->
    <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px;">
      <div style="display: flex; align-items: center; gap: 10px;">
        <div style="width: 3.5px; height: 36px; background-color: #9b7a4f; border-radius: 1px;"></div>
        <div>
          <div style="font-size: 20px; font-weight: 700; color: #111827; line-height: 1.2; letter-spacing: -0.02em;">
            공식 견적 영수증
          </div>
          <div style="font-family: 'Playfair Display', Georgia, serif; font-size: 9px; letter-spacing: 0.22em; color: #64748b; text-transform: uppercase; margin-top: 1px;">
            OFFICIAL ESTIMATE
          </div>
        </div>
      </div>

      <div style="font-size: 11px; text-align: right; line-height: 1.6;">
        <div>
          <span style="color: #64748b; margin-right: 16px;">견적번호</span>
          <span style="font-weight: 700; color: #0f172a; font-family: Pretendard, monospace;">${props.quoteNo}</span>
        </div>
        <div>
          <span style="color: #64748b; margin-right: 16px;">발급일시</span>
          <span style="font-weight: 500; color: #0f172a;">${displayDate}</span>
        </div>
      </div>
    </div>

    <!-- 3. Hero Visual Banner -->
    <div style="width: 100%; height: 144px; overflow: hidden; margin-bottom: 16px;">
      <img src="/images/receipt/bg.png" alt="VIP Chauffeur Service" style="width: 100%; height: 100%; object-fit: cover; object-position: center; display: block;" />
    </div>

    <!-- 4. Section 01: 기본 정보 -->
    <div style="margin-bottom: 16px;">
      <div style="display: flex; align-items: center; margin-bottom: 6px;">
        <span style="font-family: 'Playfair Display', Georgia, serif; font-style: italic; font-size: 19px; font-weight: 600; color: #9b7a4f; margin-right: 8px;">01</span>
        <span style="color: #cbd5e1; margin-right: 8px; font-weight: 300;">|</span>
        <span style="font-size: 14px; font-weight: 700; color: #111827; margin-right: 8px;">기본 정보</span>
        <span style="font-family: 'Playfair Display', Georgia, serif; font-size: 9px; letter-spacing: 0.16em; color: #8c7355; text-transform: uppercase;">BASIC INFORMATION</span>
      </div>

      <div style="border-top: 1px solid #e2e8f0; border-bottom: 1px solid #e2e8f0;">
        <div style="display: flex; align-items: center; padding: 7px 8px; border-bottom: 1px solid #f1f5f9; font-size: 11px;">
          <div style="width: 75px; color: #475569; font-weight: 500;">고객사명</div>
          <div style="flex: 1; font-weight: 700; color: #0f172a;">${props.customerName || '인터코스'}</div>
          <div style="width: 60px; color: #475569; font-weight: 500;">담당자</div>
          <div style="flex: 1; font-weight: 600; color: #0f172a;">${props.contactPerson || '김지현 팀장'}${props.contactPhone ? ` (${props.contactPhone})` : ''}</div>
        </div>
        <div style="display: flex; align-items: center; padding: 7px 8px; border-bottom: 1px solid #f1f5f9; font-size: 11px;">
          <div style="width: 75px; color: #475569; font-weight: 500;">행사 / 목적</div>
          <div style="flex: 1; font-weight: 600; color: #0f172a;">${props.notes || '비즈니스 투어'}</div>
          <div style="width: 60px; color: #475569; font-weight: 500;">운행 일정</div>
          <div style="flex: 1; font-weight: 600; color: #0f172a;">${props.date} (${props.serviceStartTime} ~ ${props.serviceEndTime}, ${props.serviceHours}시간)</div>
        </div>
        <div style="display: flex; align-items: center; padding: 7px 8px; font-size: 11px;">
          <div style="width: 75px; color: #475569; font-weight: 500;">운행 구간</div>
          <div style="flex: 1; font-weight: 700; color: #0f172a;">${props.origin} → ${props.destination}</div>
        </div>
      </div>
    </div>

    <!-- 5. Section 02: 차량 및 서비스 -->
    <div style="margin-bottom: 16px;">
      <div style="display: flex; align-items: center; margin-bottom: 6px;">
        <span style="font-family: 'Playfair Display', Georgia, serif; font-style: italic; font-size: 19px; font-weight: 600; color: #9b7a4f; margin-right: 8px;">02</span>
        <span style="color: #cbd5e1; margin-right: 8px; font-weight: 300;">|</span>
        <span style="font-size: 14px; font-weight: 700; color: #111827; margin-right: 8px;">차량 및 서비스</span>
        <span style="font-family: 'Playfair Display', Georgia, serif; font-size: 9px; letter-spacing: 0.16em; color: #8c7355; text-transform: uppercase;">VEHICLE & SERVICE</span>
      </div>

      <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 4px; padding: 9px 12px; display: flex; align-items: center;">
        <div style="flex: 2.2; padding-right: 10px;">
          <div style="font-size: 10px; color: #64748b; margin-bottom: 3px;">선택 차량</div>
          <div style="font-size: 11.5px; font-weight: 700; color: #0f172a;">${props.vehicleModel || '제네시스 G90 신차 최고급형'}</div>
        </div>
        <div style="flex: 1; border-left: 1px solid #e2e8f0; padding-left: 10px; padding-right: 10px;">
          <div style="font-size: 10px; color: #64748b; margin-bottom: 3px;">차량 수량</div>
          <div style="font-size: 11.5px; font-weight: 700; color: #0f172a;">${props.vehicleCount}대</div>
        </div>
        <div style="flex: 2; border-left: 1px solid #e2e8f0; padding-left: 10px; padding-right: 10px;">
          <div style="font-size: 10px; color: #64748b; margin-bottom: 3px;">서비스 구분</div>
          <div style="font-size: 11.5px; font-weight: 700; color: #0f172a;">${props.serviceCategoryLabel || '일반 의전 (수도권 9시간)'}</div>
        </div>
        <div style="flex: 1.4; border-left: 1px solid #e2e8f0; padding-left: 10px;">
          <div style="font-size: 10px; color: #64748b; margin-bottom: 3px;">기사 서비스</div>
          <div style="font-size: 11.5px; font-weight: 700; color: #0f172a;">${driverServiceLabel}</div>
        </div>
      </div>
    </div>

    <!-- 6. Section 03: 요금 상세 -->
    <div style="margin-bottom: 14px;">
      <div style="display: flex; align-items: center; margin-bottom: 6px;">
        <span style="font-family: 'Playfair Display', Georgia, serif; font-style: italic; font-size: 19px; font-weight: 600; color: #9b7a4f; margin-right: 8px;">03</span>
        <span style="color: #cbd5e1; margin-right: 8px; font-weight: 300;">|</span>
        <span style="font-size: 14px; font-weight: 700; color: #111827; margin-right: 8px;">요금 상세</span>
        <span style="font-family: 'Playfair Display', Georgia, serif; font-size: 9px; letter-spacing: 0.16em; color: #8c7355; text-transform: uppercase;">PRICE BREAKDOWN</span>
      </div>

      <div style="border-top: 1px solid #e2e8f0; padding-top: 6px;">
        <div style="display: flex; justify-content: space-between; align-items: center; padding: 4px 0; font-size: 11px;">
          <span style="color: #1e293b;">기본 대절료 (${props.vehicleCount}대 × ${props.serviceHours}시간)</span>
          <span style="font-weight: 600; color: #0f172a; font-family: Pretendard, monospace;">${baseFareFormatted}</span>
        </div>

        ${overtimeFormatted ? `
        <div style="display: flex; justify-content: space-between; align-items: center; padding: 4px 0; font-size: 11px; color: #92400e;">
          <span>초과 시간 요금 (${props.overtimeHours}시간)</span>
          <span style="font-weight: 600; font-family: Pretendard, monospace;">${overtimeFormatted}</span>
        </div>` : ''}

        ${excessKmFormatted ? `
        <div style="display: flex; justify-content: space-between; align-items: center; padding: 4px 0; font-size: 11px; color: #92400e;">
          <span>초과 거리 요금 (${props.excessKm}km)</span>
          <span style="font-weight: 600; font-family: Pretendard, monospace;">${excessKmFormatted}</span>
        </div>` : ''}

        ${englishSurchargeFormatted ? `
        <div style="display: flex; justify-content: space-between; align-items: center; padding: 4px 0; font-size: 11px; color: #1e40af;">
          <span>의전 기사 영어 수당</span>
          <span style="font-weight: 600; font-family: Pretendard, monospace;">${englishSurchargeFormatted}</span>
        </div>` : ''}

        <div style="border-top: 1px solid #e2e8f0; margin: 6px 0;"></div>

        <div style="display: flex; justify-content: space-between; align-items: center; padding: 4px 0; font-size: 12px;">
          <span style="font-weight: 700; color: #0f172a;">공급가액 소계</span>
          <span style="font-weight: 700; color: #0f172a; font-family: Pretendard, monospace;">${supplyPriceFormatted}</span>
        </div>

        <div style="display: flex; justify-content: flex-end; align-items: center; gap: 24px; padding: 2px 0; font-size: 10.5px;">
          <span style="color: #64748b;">부가가치세 (10%)</span>
          <span style="font-weight: 500; color: #0f172a; font-family: Pretendard, monospace;">${vatFormatted}</span>
        </div>
      </div>
    </div>

    <!-- 7. Section 04: 총 청구 예상금액 -->
    <div style="background-color: #f7f4ed; border: 1px solid #eadfc9; border-radius: 4px; padding: 12px 18px; display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px;">
      <div style="display: flex; align-items: center;">
        <div style="width: 3px; height: 26px; background-color: #9b7a4f; margin-right: 10px; border-radius: 1px;"></div>
        <span style="font-family: 'Playfair Display', Georgia, serif; font-style: italic; font-size: 20px; font-weight: 600; color: #9b7a4f; margin-right: 10px;">04</span>
        <span style="font-size: 13px; font-weight: 700; color: #1e293b;">
          총 청구 예상금액 <span style="font-size: 10.5px; font-weight: 500; color: #64748b;">(부가가치세 10% 포함)</span>
        </span>
      </div>

      <div style="font-size: 25px; font-weight: 800; color: #614421; font-family: Pretendard, -apple-system, sans-serif; letter-spacing: -0.02em;">
        ${grandTotalFormatted}
      </div>
    </div>

    <!-- 8. Notice text -->
    <div style="font-size: 9.5px; color: #64748b; line-height: 1.5; margin-bottom: 16px; padding-left: 2px;">
      <div>* 본 견적서는 2026 공식 요율표 기준 실시간 산출 견적서입니다.</div>
      <div style="padding-left: 8px;">예약 전환 시 실시간 관제 스케줄에 즉시 등록됩니다.</div>
    </div>

    <!-- 9. Bottom Footer -->
    <div style="border-top: 1px solid #e2d8cc; padding-top: 12px; display: flex; align-items: center; justify-content: space-between;">
      <div style="display: flex; align-items: center; gap: 8px;">
        <span style="font-family: 'Playfair Display', Georgia, serif; font-size: 9px; font-weight: 700; letter-spacing: 0.12em; color: #475569; text-transform: uppercase;">
          VIP LIMOUSINE KOREA
        </span>
        <span style="color: #cbd5e1; font-size: 9px;">|</span>
        <span style="font-family: 'Playfair Display', Georgia, serif; font-size: 8.5px; letter-spacing: 0.14em; color: #64748b; text-transform: uppercase;">
          EXECUTIVE CHAUFFEUR SERVICE
        </span>
      </div>

      <svg width="110" height="14" viewBox="0 0 110 14" fill="none" xmlns="http://www.w3.org/2000/svg" style="display: block;">
        <path d="M2 11C28 11 44 4 62 4C80 4 94 9 108 8" stroke="#9b7a4f" stroke-width="1.2" stroke-linecap="round"/>
      </svg>
    </div>
  </div>
</body>
</html>`;
}

