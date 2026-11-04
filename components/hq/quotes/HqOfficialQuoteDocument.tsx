'use client';

import React from 'react';

/**
 * ============================================================================
 * [개발자 도구 (DevTools) 색상 및 검색 안내 - DevTools Color Reference]
 * 브라우저 개발자 도구(Chrome/Safari DevTools)는 요소 검사기(Inspect Element)에서
 * 스타일을 표시할 때 16진수(HEX) 색상을 브라우저 표준 RGB로 자동 변환하여 표시합니다.
 *
 * 개발자 도구에서 포인터로 요소를 찍었을 때 보이는 RGB와 우리 코드베이스의 16진수(HEX) 매핑표:
 * ----------------------------------------------------------------------------
 *  DevTools RGB 표시값              코드베이스 16진수(HEX)  용도 / 대상
 * ----------------------------------------------------------------------------
 *  rgb(15, 23, 42)              =  #0F172A               메인 텍스트 / 본문 값 / 헤더 볼드
 *  rgb(229, 222, 201)           =  #E5DEC9               공식 견적서 테두리 및 모든 구분선
 *  rgb(155, 122, 79)            =  #9B7A4F               골드 포인트 / 넘버링 (01, 02...) / 바
 *  rgb(100, 116, 139)           =  #64748B               보조 라벨 텍스트 / 슬레이트 그레이
 *  rgb(71, 85, 105)             =  #475569               항목 필드명 / 영문 서브타이틀
 *  rgb(17, 24, 39)              =  #111827               최상단 메인 타이틀 (VIP LIMOUSINE)
 *  rgb(248, 250, 252)           =  #F8FAFC               표 배경 연회색
 *  rgb(255, 255, 255)           =  #FFFFFF               문서 카드 배경 순백색
 *  rgb(97, 68, 33)              =  #614421               총 청구 예상금액 볼드 골드브라운
 * ----------------------------------------------------------------------------
 *
 * [수정 및 검색 팁]
 * 1. 각 행과 칸마다 고유한 class (예: quote-val-vehicle) 및 data-field="selected-vehicle"가 지정되어 있습니다.
 *    개발자 도구에서 포인터를 올렸을 때 태그 이름이나 data-field를 보고 검색하시면 바로 해당 위치로 이동합니다.
 * 2. 패딩 값 역시 개발자 도구의 표준 출력 포맷('0px 12px 10px')과 100% 동일하게 맞춰져 있어 부분 복사 검색도 가능합니다.
 * ============================================================================
 */

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
 * Split a service category label like "공항 편도 (인천국제공항 3시간)" or "일반 의전 (수도권 9시간)"
 * into main service line and parenthesized secondary line.
 */
function splitServiceCategory(rawLabel: string): { main: string; sub: string | null } {
  const label = (rawLabel || '수도권 기본 의전 (9시간)').trim();
  const match = label.match(/^(.*?)\s*(\(.*?\))$/);
  if (match) {
    return {
      main: match[1].trim(),
      sub: match[2].trim(),
    };
  }
  return {
    main: label,
    sub: null,
  };
}

/**
 * VIP LIMOUSINE KOREA Official Estimate (공식 견적 영수증) Document
 * Designed precisely after the luxury executive chauffeur quote specification:
 * - English font: Playfair Display
 * - Korean font: Pretendard
 * - Assets: /images/receipt/header.png (Chauffeur logo) & /images/receipt/bg.png (Hero banner)
 * - All structural lines unified to #E5DEC9
 * - Formatted strictly for seamless 1-page A4 PDF printing with zero text collision
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
  const displayDate =
    issuedDate ||
    new Intl.DateTimeFormat('ko-KR', {
      timeZone: 'Asia/Seoul',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
    }).format(new Date());

  const driverServiceLabel = englishOption === 'fluent_upgrade' ? '영어' : '한국어';
  const categorySplit = splitServiceCategory(serviceCategoryLabel);

  return (
    <div
      id="quote-receipt-card"
      className="official-quote-sheet quote-doc-card"
      data-section="quote-document"
      style={{
        boxSizing: 'border-box',
        width: '100%',
        maxWidth: '700px',
        margin: '0 auto',
        backgroundColor: '#FFFFFF',
        color: '#111827',
        fontFamily: 'Pretendard, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        padding: '34px 34px 28px 34px',
        border: '1px solid #E5DEC9',
        borderRadius: '12px',
      }}
    >
      {/* DevTools Direct-Match Styles */}
      <style>{`
        .quote-doc-card {
          box-sizing: border-box;
          background-color: #FFFFFF;
          color: #111827;
        }
        .quote-val-vehicle {
          padding: 0px 12px 10px;
          font-size: 11.5px;
          font-weight: 700;
          color: #0F172A;
          line-height: 1.35;
          vertical-align: top;
          border-right: 1px solid #E5DEC9;
        }
        .quote-val-count {
          padding: 0px 12px 10px;
          font-size: 11.5px;
          font-weight: 700;
          color: #0F172A;
          line-height: 1.35;
          vertical-align: top;
          border-right: 1px solid #E5DEC9;
        }
        .quote-val-category {
          padding: 0px 12px 10px;
          font-size: 11.5px;
          font-weight: 700;
          color: #0F172A;
          line-height: 1.35;
          vertical-align: top;
          border-right: 1px solid #E5DEC9;
        }
        .quote-val-driver {
          padding: 0px 12px 10px;
          font-size: 11.5px;
          font-weight: 700;
          color: #0F172A;
          line-height: 1.35;
          vertical-align: top;
        }
      `}</style>

      {/* 1. Top Header */}
      <div className="quote-header" data-section="00-header" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '14px' }}>
        {/* Top Left */}
        <div style={{ flex: 1, minWidth: '90px', textAlign: 'left' }}>
          <div
            style={{
              fontFamily: "'Playfair Display', Georgia, serif",
              fontSize: '8.5px',
              color: '#475569',
              letterSpacing: '0.12em',
              lineHeight: 1.3,
              textTransform: 'uppercase',
            }}
          >
            PREMIUM
          </div>
          <div
            style={{
              fontFamily: "'Playfair Display', Georgia, serif",
              fontSize: '8.5px',
              color: '#475569',
              letterSpacing: '0.12em',
              lineHeight: 1.3,
              textTransform: 'uppercase',
            }}
          >
            CHAUFFEUR SERVICE
          </div>
        </div>

        {/* Center Logo & Title (Strict Single-Line Layout) */}
        <div style={{ textAlign: 'center', flex: 2, minWidth: '280px' }}>
          <img
            src="/images/receipt/header.png"
            alt="VIP Limousine Emblem"
            style={{ height: '36px', margin: '0 auto', display: 'block', objectFit: 'contain' }}
          />
          <div
            className="quote-brand-title"
            data-field="brand-title"
            style={{
              fontFamily: "'Playfair Display', Georgia, serif",
              fontSize: '20px',
              fontWeight: 300,
              color: '#111827',
              letterSpacing: '0.06em',
              marginTop: '5px',
              lineHeight: 1.2,
              whiteSpace: 'nowrap',
            }}
          >
            VIP LIMOUSINE KOREA
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginTop: '4px' }}>
            <span style={{ width: '32px', height: '1px', backgroundColor: '#E5DEC9', display: 'inline-block' }} />
            <span
              style={{
                fontFamily: "'Playfair Display', Georgia, serif",
                fontSize: '8.5px',
                letterSpacing: '0.22em',
                color: '#9B7A4F',
                textTransform: 'uppercase',
                fontWeight: 600,
                whiteSpace: 'nowrap',
              }}
            >
              EXECUTIVE CHAUFFEUR
            </span>
            <span style={{ width: '32px', height: '1px', backgroundColor: '#E5DEC9', display: 'inline-block' }} />
          </div>
        </div>

        {/* Top Right */}
        <div style={{ flex: 1, minWidth: '90px', textAlign: 'right' }}>
          <div
            style={{
              fontFamily: "'Playfair Display', Georgia, serif",
              fontSize: '8.5px',
              color: '#475569',
              letterSpacing: '0.12em',
              lineHeight: 1.3,
              textTransform: 'uppercase',
            }}
          >
            COMFORT · SAFETY
          </div>
          <div
            style={{
              fontFamily: "'Playfair Display', Georgia, serif",
              fontSize: '8.5px',
              color: '#475569',
              letterSpacing: '0.12em',
              lineHeight: 1.3,
              textTransform: 'uppercase',
            }}
          >
            YOUR PREMIUM JOURNEY
          </div>
        </div>
      </div>

      {/* Thin Gold/Beige Divider Line with spacious breathing room */}
      <div className="quote-divider-header" style={{ width: '100%', height: '1px', backgroundColor: '#E5DEC9', margin: '18px 0 22px 0' }} />

      {/* 2. Official Estimate Title & Quote Metadata (Vertical Grid Aligned) */}
      <div className="quote-title-meta-box" data-section="quote-title-meta" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
        {/* Left: Title */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ width: '3.5px', height: '36px', backgroundColor: '#9B7A4F', borderRadius: '1.5px' }} />
          <div>
            <div style={{ fontSize: '20px', fontWeight: 700, color: '#111827', lineHeight: 1.2, letterSpacing: '-0.02em' }}>
              공식 견적서
            </div>
            <div
              style={{
                fontFamily: "'Playfair Display', Georgia, serif",
                fontSize: '9px',
                letterSpacing: '0.22em',
                color: '#64748B',
                textTransform: 'uppercase',
                marginTop: '1px',
              }}
            >
              OFFICIAL ESTIMATE
            </div>
          </div>
        </div>

        {/* Right: Quote No & Issued Date (Vertical Grid Aligned) */}
        <div
          className="quote-meta-grid"
          style={{
            display: 'grid',
            gridTemplateColumns: 'auto auto',
            columnGap: '16px',
            rowGap: '5px',
            alignItems: 'baseline',
            fontSize: '11px',
          }}
        >
          <span style={{ color: '#64748B', textAlign: 'left', fontWeight: 500 }}>견적 번호 :</span>
          <span className="quote-meta-no" data-field="quote-no" style={{ fontWeight: 700, color: '#0F172A', fontFamily: 'Pretendard, monospace', textAlign: 'right' }}>
            {quoteNo}
          </span>
          <span style={{ color: '#64748B', textAlign: 'left', fontWeight: 500 }}>발급 일시 :</span>
          <span className="quote-meta-date" data-field="issued-date" style={{ fontWeight: 500, color: '#0F172A', textAlign: 'right' }}>
            {displayDate}
          </span>
        </div>
      </div>

      {/* 3. Hero Visual Banner (bg.png) */}
      <div className="quote-banner" data-section="hero-banner" style={{ width: '100%', height: '155px', overflow: 'hidden', marginBottom: '22px', borderRadius: '2px' }}>
        <img
          src="/images/receipt/bg.png"
          alt="VIP Chauffeur Service Experience"
          style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center', display: 'block' }}
        />
      </div>

      {/* 4. Section 01: 기본 정보 (BASIC INFORMATION) */}
      <div className="quote-section-01" data-section="01-basic-info" style={{ marginBottom: '22px' }}>
        {/* Section Header */}
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
          <span
            style={{
              fontFamily: "'Playfair Display', Georgia, serif",
              fontStyle: 'italic',
              fontSize: '19px',
              fontWeight: 600,
              color: '#9B7A4F',
              marginRight: '8px',
            }}
          >
            01
          </span>
          <span style={{ color: '#CBD5E1', marginRight: '8px', fontWeight: 300 }}>|</span>
          <span style={{ fontSize: '14px', fontWeight: 700, color: '#111827', marginRight: '8px' }}>
            기본 정보
          </span>
          <span
            style={{
              fontFamily: "'Playfair Display', Georgia, serif",
              fontSize: '9px',
              letterSpacing: '0.16em',
              color: '#8C7355',
              textTransform: 'uppercase',
            }}
          >
            BASIC INFORMATION
          </span>
        </div>

        {/* Table Content with #E5DEC9 dividers */}
        <div className="quote-info-table" style={{ borderTop: '1px solid #E5DEC9', borderBottom: '1px solid #E5DEC9' }}>
          {/* Row 1 */}
          <div style={{ display: 'flex', alignItems: 'center', padding: '9px 10px', borderBottom: '1px solid #E5DEC9', fontSize: '11px' }}>
            <div style={{ width: '75px', color: '#475569', fontWeight: 500 }}>고객사명</div>
            <div className="quote-val-customer" data-field="customer-name" style={{ flex: 1, fontWeight: 700, color: '#0F172A' }}>{customerName || '인터코스'}</div>
            <div style={{ width: '60px', color: '#475569', fontWeight: 500 }}>담당자</div>
            <div className="quote-val-contact" data-field="contact-person" style={{ flex: 1.2, fontWeight: 600, color: '#0F172A' }}>
              {contactPerson || '김지현 팀장'}{contactPhone ? ` (${contactPhone})` : ''}
            </div>
          </div>
          {/* Row 2 */}
          <div style={{ display: 'flex', alignItems: 'center', padding: '9px 10px', borderBottom: '1px solid #E5DEC9', fontSize: '11px' }}>
            <div style={{ width: '75px', color: '#475569', fontWeight: 500 }}>운행 목적</div>
            <div className="quote-val-purpose" data-field="trip-purpose" style={{ flex: 1, fontWeight: 600, color: '#0F172A' }}>{notes || '비즈니스 투어'}</div>
            <div style={{ width: '60px', color: '#475569', fontWeight: 500 }}>이용 일정</div>
            <div className="quote-val-schedule" data-field="trip-schedule" style={{ flex: 1.2, fontWeight: 600, color: '#0F172A' }}>
              {date} ({serviceStartTime} ~ {serviceEndTime}, {serviceHours}시간)
            </div>
          </div>
          {/* Row 3 */}
          <div style={{ display: 'flex', alignItems: 'center', padding: '9px 10px', fontSize: '11px' }}>
            <div style={{ width: '75px', color: '#475569', fontWeight: 500 }}>이동 경로</div>
            <div className="quote-val-route" data-field="trip-route" style={{ flex: 1, fontWeight: 700, color: '#0F172A' }}>
              {origin} → {destination}
            </div>
          </div>
        </div>
      </div>

      {/* 5. Section 02: 차량 및 서비스 (테이블 구조로 글자 뭉침/충돌 원천 차단) */}
      <div className="quote-section-02" data-section="02-vehicle-service" style={{ marginBottom: '22px' }}>
        {/* Section Header */}
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
          <span
            style={{
              fontFamily: "'Playfair Display', Georgia, serif",
              fontStyle: 'italic',
              fontSize: '19px',
              fontWeight: 600,
              color: '#9B7A4F',
              marginRight: '8px',
            }}
          >
            02
          </span>
          <span style={{ color: '#CBD5E1', marginRight: '8px', fontWeight: 300 }}>|</span>
          <span style={{ fontSize: '14px', fontWeight: 700, color: '#111827', marginRight: '8px' }}>
            차량 및 서비스
          </span>
          <span
            style={{
              fontFamily: "'Playfair Display', Georgia, serif",
              fontSize: '9px',
              letterSpacing: '0.16em',
              color: '#8C7355',
              textTransform: 'uppercase',
            }}
          >
            VEHICLE & SERVICE
          </span>
        </div>

        {/* 4-Column Box: Table Structure (글자 겹침 원천 차단 및 선 색상 #E5DEC9 통일) */}
        <table
          className="quote-table-vehicle"
          data-field="vehicle-service-table"
          style={{
            width: '100%',
            borderCollapse: 'collapse',
            backgroundColor: '#F8FAFC',
            border: '1px solid #E5DEC9',
            borderRadius: '4px',
            overflow: 'hidden',
          }}
        >
          <tbody>
            <tr className="quote-row-labels">
              <td
                className="quote-cell-label quote-label-vehicle"
                data-field="label-selected-vehicle"
                style={{ width: '34%', padding: '10px 12px 4px', fontSize: '10px', color: '#64748B', fontWeight: 500, verticalAlign: 'top', borderRight: '1px solid #E5DEC9' }}
              >
                배정 차량
              </td>
              <td
                className="quote-cell-label quote-label-count"
                data-field="label-vehicle-count"
                style={{ width: '16%', padding: '10px 12px 4px', fontSize: '10px', color: '#64748B', fontWeight: 500, verticalAlign: 'top', borderRight: '1px solid #E5DEC9' }}
              >
                차량 대수
              </td>
              <td
                className="quote-cell-label quote-label-category"
                data-field="label-service-category"
                style={{ width: '28%', padding: '10px 12px 4px', fontSize: '10px', color: '#64748B', fontWeight: 500, verticalAlign: 'top', borderRight: '1px solid #E5DEC9' }}
              >
                이용 서비스
              </td>
              <td
                className="quote-cell-label quote-label-driver"
                data-field="label-driver-service"
                style={{ width: '22%', padding: '10px 12px 4px', fontSize: '10px', color: '#64748B', fontWeight: 500, verticalAlign: 'top' }}
              >
                기사 서비스
              </td>
            </tr>
            <tr className="quote-row-values">
              <td
                className="quote-cell-val quote-val-vehicle"
                data-field="selected-vehicle"
                style={{ padding: '0px 12px 10px', fontSize: '11.5px', fontWeight: 700, color: '#0F172A', lineHeight: 1.35, verticalAlign: 'top', borderRight: '1px solid #E5DEC9' }}
              >
                {vehicleModel || '제네시스 G90 신차 최고급형'}
              </td>
              <td
                className="quote-cell-val quote-val-count"
                data-field="vehicle-count"
                style={{ padding: '0px 12px 10px', fontSize: '11.5px', fontWeight: 700, color: '#0F172A', lineHeight: 1.35, verticalAlign: 'top', borderRight: '1px solid #E5DEC9' }}
              >
                {vehicleCount}대
              </td>
              <td
                className="quote-cell-val quote-val-category"
                data-field="service-category"
                style={{ padding: '0px 12px 10px', fontSize: '11.5px', fontWeight: 700, color: '#0F172A', lineHeight: 1.35, verticalAlign: 'top', borderRight: '1px solid #E5DEC9' }}
              >
                <div>{categorySplit.main}</div>
                {categorySplit.sub && (
                  <div style={{ fontSize: '10px', fontWeight: 500, color: '#475569', marginTop: '2px' }}>
                    {categorySplit.sub}
                  </div>
                )}
              </td>
              <td
                className="quote-cell-val quote-val-driver"
                data-field="driver-service"
                style={{ padding: '0px 12px 10px', fontSize: '11.5px', fontWeight: 700, color: '#0F172A', lineHeight: 1.35, verticalAlign: 'top' }}
              >
                {driverServiceLabel}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* 6. Section 03: 요금 상세 (PRICE BREAKDOWN, 선 색상 #E5DEC9 통일) */}
      <div className="quote-section-03" data-section="03-price-breakdown" style={{ marginBottom: '22px' }}>
        {/* Section Header */}
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
          <span
            style={{
              fontFamily: "'Playfair Display', Georgia, serif",
              fontStyle: 'italic',
              fontSize: '19px',
              fontWeight: 600,
              color: '#9B7A4F',
              marginRight: '8px',
            }}
          >
            03
          </span>
          <span style={{ color: '#CBD5E1', marginRight: '8px', fontWeight: 300 }}>|</span>
          <span style={{ fontSize: '14px', fontWeight: 700, color: '#111827', marginRight: '8px' }}>
            요금 상세
          </span>
          <span
            style={{
              fontFamily: "'Playfair Display', Georgia, serif",
              fontSize: '9px',
              letterSpacing: '0.16em',
              color: '#8C7355',
              textTransform: 'uppercase',
            }}
          >
            PRICE BREAKDOWN
          </span>
        </div>

        {/* Price Breakdown List */}
        <div style={{ borderTop: '1px solid #E5DEC9', paddingTop: '8px' }}>
          {/* Base Fare */}
          <div className="quote-row-basefare" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 0', fontSize: '11px' }}>
            <span style={{ color: '#1E293B' }}>기본 대절료 ({vehicleCount}대 × {serviceHours}시간)</span>
            <span className="quote-val-basefare" data-field="base-fare" style={{ fontWeight: 600, color: '#0F172A', fontFamily: 'Pretendard, monospace' }}>
              {baseFareTotal !== null ? `${baseFareTotal.toLocaleString()}원` : (quoteRequired ? '상담 후 산정' : '-')}
            </span>
          </div>

          {/* Overtime (if any) */}
          {overtimeHours > 0 && overtimeFareTotal > 0 && (
            <div className="quote-row-overtime" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 0', fontSize: '11px', color: '#92400E' }}>
              <span>초과 시간 요금 ({overtimeHours}시간)</span>
              <span className="quote-val-overtime" data-field="overtime-fare" style={{ fontWeight: 600, fontFamily: 'Pretendard, monospace' }}>
                +{overtimeFareTotal.toLocaleString()}원
              </span>
            </div>
          )}

          {/* Excess Km (if any) */}
          {excessKm > 0 && excessDistanceTotal > 0 && (
            <div className="quote-row-excesskm" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 0', fontSize: '11px', color: '#92400E' }}>
              <span>초과 거리 요금 ({excessKm}km)</span>
              <span className="quote-val-excesskm" data-field="excess-km-fare" style={{ fontWeight: 600, fontFamily: 'Pretendard, monospace' }}>
                +{excessDistanceTotal.toLocaleString()}원
              </span>
            </div>
          )}

          {/* English Surcharge (if any) */}
          {englishSurchargeTotal > 0 && (
            <div className="quote-row-english" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 0', fontSize: '11px', color: '#1E293B' }}>
              <span>외국어(영어) 의전 지원비</span>
              <span className="quote-val-english" data-field="english-surcharge" style={{ fontWeight: 600, fontFamily: 'Pretendard, monospace' }}>
                +{englishSurchargeTotal.toLocaleString()}원
              </span>
            </div>
          )}

          {/* Subtotal Divider (#E5DEC9) */}
          <div style={{ borderTop: '1px solid #E5DEC9', margin: '8px 0' }} />

          {/* Supply Price Subtotal */}
          <div className="quote-row-subtotal" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 0', fontSize: '12px' }}>
            <span style={{ fontWeight: 700, color: '#0F172A' }}>공급가액 소계</span>
            <span className="quote-val-subtotal" data-field="supply-price" style={{ fontWeight: 700, color: '#0F172A', fontFamily: 'Pretendard, monospace' }}>
              {supplyPriceTotal !== null ? `${supplyPriceTotal.toLocaleString()}원` : (quoteRequired ? '상담 후 산정' : '-')}
            </span>
          </div>

          {/* VAT */}
          <div className="quote-row-vat" style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '24px', padding: '3px 0', fontSize: '10.5px' }}>
            <span style={{ color: '#64748B' }}>부가세 (10%)</span>
            <span className="quote-val-vat" data-field="vat-amount" style={{ fontWeight: 500, color: '#0F172A', fontFamily: 'Pretendard, monospace' }}>
              {vatAmount !== null ? `${vatAmount.toLocaleString()}원` : '별도 산정'}
            </span>
          </div>
        </div>
      </div>

      {/* 7. 총 청구 예상금액 (배경화면 제거 #FFFFFF, 좌우 완전 정렬, 선 색상 #E5DEC9) */}
      <div
        className="quote-grand-total-box"
        data-section="04-grand-total"
        style={{
          backgroundColor: '#FFFFFF',
          borderTop: '2px solid #E5DEC9',
          borderBottom: '2px solid #E5DEC9',
          padding: '16px 0px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '22px',
          width: '100%',
        }}
      >
        {/* Left: Accent bar & Label without '04' */}
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <div style={{ width: '3.5px', height: '24px', backgroundColor: '#9B7A4F', marginRight: '10px', borderRadius: '1.5px' }} />
          <span className="quote-grand-total-label" data-field="grand-total-label" style={{ fontSize: '15px', fontWeight: 700, color: '#111827' }}>
            최종 견적 금액 <span style={{ fontSize: '11px', fontWeight: 500, color: '#64748B' }}>(부가가치세 10% 포함)</span>
          </span>
        </div>

        {/* Right: Grand Total Amount */}
        <div
          className="quote-grand-total-amount"
          data-field="grand-total-amount"
          style={{
            fontSize: '26px',
            fontWeight: 800,
            color: '#000000',
            fontFamily: 'Pretendard, -apple-system, sans-serif',
            letterSpacing: '-0.02em',
            textAlign: 'right',
          }}
        >
          {estimatedGrandTotal !== null ? `${estimatedGrandTotal.toLocaleString()}원` : (quoteRequired ? '상담 후 산정' : '0원')}
        </div>
      </div>


      {/* 9. Bottom Footer (#E5DEC9 divider line) */}
      <div
        className="quote-footer"
        data-section="footer"
        style={{
          borderTop: '1px solid #E5DEC9',
          paddingTop: '14px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-start',
          gap: '8px',
        }}
      >
        <span
          style={{
            fontFamily: "'Playfair Display', Georgia, serif",
            fontSize: '9.5px',
            fontWeight: 600,
            letterSpacing: '0.12em',
            color: '#475569',
            textTransform: 'uppercase',
          }}
        >
          VIP LIMOUSINE KOREA
        </span>
        <span style={{ color: '#CBD5E1', fontSize: '9px' }}>|</span>
        <span
          style={{
            fontFamily: "'Playfair Display', Georgia, serif",
            fontSize: '9px',
            letterSpacing: '0.14em',
            color: '#64748B',
            textTransform: 'uppercase',
          }}
        >
          EXECUTIVE CHAUFFEUR SERVICE
        </span>
      </div>
    </div>
  );
};

/**
 * Generate full self-contained HTML for isolated 1-page A4 PDF print
 */
export function generateOfficialQuotePrintHtml(props: HqOfficialQuoteDocumentProps): string {
  const displayDate =
    props.issuedDate ||
    new Intl.DateTimeFormat('ko-KR', {
      timeZone: 'Asia/Seoul',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
    }).format(new Date());

  const driverServiceLabel = props.englishOption === 'fluent_upgrade' ? '영어 (추가 비용)' : '한국어';
  const categorySplit = splitServiceCategory(props.serviceCategoryLabel);

  const baseFareFormatted =
    props.baseFareTotal !== null
      ? `${props.baseFareTotal.toLocaleString()}원`
      : props.quoteRequired
        ? '상담 후 산정'
        : '-';

  const overtimeFormatted =
    props.overtimeHours && props.overtimeHours > 0 && props.overtimeFareTotal && props.overtimeFareTotal > 0
      ? `+${props.overtimeFareTotal.toLocaleString()}원`
      : null;

  const excessKmFormatted =
    props.excessKm && props.excessKm > 0 && props.excessDistanceTotal && props.excessDistanceTotal > 0
      ? `+${props.excessDistanceTotal.toLocaleString()}원`
      : null;

  const englishFormatted =
    props.englishSurchargeTotal && props.englishSurchargeTotal > 0
      ? `+${props.englishSurchargeTotal.toLocaleString()}원`
      : null;

  const supplyPriceFormatted =
    props.supplyPriceTotal !== null
      ? `${props.supplyPriceTotal.toLocaleString()}원`
      : props.quoteRequired
        ? '상담 후 산정'
        : '-';

  const vatFormatted =
    props.vatAmount !== null ? `${props.vatAmount.toLocaleString()}원` : '별도 산정';

  const grandTotalFormatted =
    props.estimatedGrandTotal !== null
      ? `${props.estimatedGrandTotal.toLocaleString()}원`
      : props.quoteRequired
        ? '상담 후 산정'
        : '0원';

  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <title>VIP_LIMOUSINE_공식견적서_${props.quoteNo}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,300;0,400;0,600;0,700;1,400;1,600&display=swap" rel="stylesheet">
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
      background: #FFFFFF !important;
      font-family: Pretendard, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
      color: #111827 !important;
      overflow: hidden !important;
      height: 100% !important;
    }
    .print-sheet {
      width: 100% !important;
      max-width: 690px !important;
      margin: 0 auto !important;
      padding: 28px 32px 24px 32px !important;
      background: #FFFFFF !important;
      page-break-inside: avoid !important;
      break-inside: avoid !important;
    }
    .header-flourish {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      margin-top: 4px;
    }
    .quote-val-vehicle {
      padding: 0px 12px 10px;
      font-size: 11.5px;
      font-weight: 700;
      color: #0F172A;
      line-height: 1.35;
      vertical-align: top;
      border-right: 1px solid #E5DEC9;
    }
    .quote-val-count {
      padding: 0px 12px 10px;
      font-size: 11.5px;
      font-weight: 700;
      color: #0F172A;
      line-height: 1.35;
      vertical-align: top;
      border-right: 1px solid #E5DEC9;
    }
    .quote-val-category {
      padding: 0px 12px 10px;
      font-size: 11.5px;
      font-weight: 700;
      color: #0F172A;
      line-height: 1.35;
      vertical-align: top;
      border-right: 1px solid #E5DEC9;
    }
    .quote-val-driver {
      padding: 0px 12px 10px;
      font-size: 11.5px;
      font-weight: 700;
      color: #0F172A;
      line-height: 1.35;
      vertical-align: top;
    }
  </style>
</head>
<body>
  <div class="print-sheet quote-doc-card" data-section="quote-document">
    <!-- 1. Top Header -->
    <div class="quote-header" data-section="00-header" style="display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 14px;">
      <div style="flex: 1; min-width: 90px; text-align: left;">
        <div style="font-family: 'Playfair Display', Georgia, serif; font-size: 8.5px; color: #475569; letter-spacing: 0.12em; line-height: 1.3; text-transform: uppercase;">
          PREMIUM
        </div>
        <div style="font-family: 'Playfair Display', Georgia, serif; font-size: 8.5px; color: #475569; letter-spacing: 0.12em; line-height: 1.3; text-transform: uppercase;">
          CHAUFFEUR SERVICE
        </div>
      </div>

      <div style="text-align: center; flex: 2; min-width: 280px;">
        <img src="/images/receipt/header.png" alt="VIP Limousine Emblem" style="height: 36px; margin: 0 auto; display: block; object-fit: contain;" />
        <div class="quote-brand-title" data-field="brand-title" style="font-family: 'Playfair Display', Georgia, serif; font-size: 20px; font-weight: 300; color: #111827; letter-spacing: 0.06em; margin-top: 5px; line-height: 1.2; white-space: nowrap;">
          VIP LIMOUSINE KOREA
        </div>
        <div class="header-flourish">
          <span style="width: 32px; height: 1px; background-color: #9B7A4F; display: inline-block;"></span>
          <span style="font-family: 'Playfair Display', Georgia, serif; font-size: 8.5px; letter-spacing: 0.22em; color: #9B7A4F; text-transform: uppercase; font-weight: 600; white-space: nowrap;">
            EXECUTIVE CHAUFFEUR
          </span>
          <span style="width: 32px; height: 1px; background-color: #9B7A4F; display: inline-block;"></span>
        </div>
      </div>

      <div style="flex: 1; min-width: 90px; text-align: right;">
        <div style="font-family: 'Playfair Display', Georgia, serif; font-size: 8.5px; color: #475569; letter-spacing: 0.12em; line-height: 1.3; text-transform: uppercase;">
          COMFORT · SAFETY
        </div>
        <div style="font-family: 'Playfair Display', Georgia, serif; font-size: 8.5px; color: #475569; letter-spacing: 0.12em; line-height: 1.3; text-transform: uppercase;">
          YOUR PREMIUM JOURNEY
        </div>
      </div>
    </div>

    <!-- Thin Divider Line with breathing room (#E5DEC9) -->
    <div class="quote-divider-header" style="width: 100%; height: 1px; background-color: #E5DEC9; margin: 18px 0 22px 0;"></div>

    <!-- 2. Official Estimate Title & Metadata (Vertical Grid Aligned) -->
    <div class="quote-title-meta-box" data-section="quote-title-meta" style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px;">
      <div style="display: flex; align-items: center; gap: 10px;">
        <div style="width: 3.5px; height: 36px; background-color: #9B7A4F; border-radius: 1.5px;"></div>
        <div>
          <div style="font-size: 20px; font-weight: 700; color: #111827; line-height: 1.2; letter-spacing: -0.02em;">
            공식 견적 영수증
          </div>
          <div style="font-family: 'Playfair Display', Georgia, serif; font-size: 9px; letter-spacing: 0.22em; color: #64748B; text-transform: uppercase; margin-top: 1px;">
            OFFICIAL ESTIMATE
          </div>
        </div>
      </div>

      <div class="quote-meta-grid" style="display: grid; grid-template-columns: auto auto; column-gap: 16px; row-gap: 5px; align-items: baseline; font-size: 11px;">
        <span style="color: #64748B; text-align: left; font-weight: 500;">견적번호 :</span>
        <span class="quote-meta-no" data-field="quote-no" style="font-weight: 700; color: #0F172A; font-family: Pretendard, monospace; text-align: right;">${props.quoteNo}</span>
        <span style="color: #64748B; text-align: left; font-weight: 500;">발급일시 :</span>
        <span class="quote-meta-date" data-field="issued-date" style="font-weight: 500; color: #0F172A; text-align: right;">${displayDate}</span>
      </div>
    </div>

    <!-- 3. Hero Visual Banner -->
    <div class="quote-banner" data-section="hero-banner" style="width: 100%; height: 155px; overflow: hidden; margin-bottom: 22px; border-radius: 2px;">
      <img src="/images/receipt/bg.png" alt="VIP Chauffeur Service" style="width: 100%; height: 100%; object-fit: cover; object-position: center; display: block;" />
    </div>

    <!-- 4. Section 01: 기본 정보 (#E5DEC9 lines) -->
    <div class="quote-section-01" data-section="01-basic-info" style="margin-bottom: 22px;">
      <div style="display: flex; align-items: center; margin-bottom: 8px;">
        <span style="font-family: 'Playfair Display', Georgia, serif; font-style: italic; font-size: 19px; font-weight: 600; color: #9B7A4F; margin-right: 8px;">01</span>
        <span style="color: #CBD5E1; margin-right: 8px; font-weight: 300;">|</span>
        <span style="font-size: 14px; font-weight: 700; color: #111827; margin-right: 8px;">기본 정보</span>
        <span style="font-family: 'Playfair Display', Georgia, serif; font-size: 9px; letter-spacing: 0.16em; color: #8C7355; text-transform: uppercase;">BASIC INFORMATION</span>
      </div>

      <div class="quote-info-table" style="border-top: 1px solid #E5DEC9; border-bottom: 1px solid #E5DEC9;">
        <div style="display: flex; align-items: center; padding: 9px 10px; border-bottom: 1px solid #E5DEC9; font-size: 11px;">
          <div style="width: 75px; color: #475569; font-weight: 500;">고객사명</div>
          <div class="quote-val-customer" data-field="customer-name" style="flex: 1; font-weight: 700; color: #0F172A;">${props.customerName || '인터코스'}</div>
          <div style="width: 60px; color: #475569; font-weight: 500;">담당자</div>
          <div class="quote-val-contact" data-field="contact-person" style="flex: 1.2; font-weight: 600; color: #0F172A;">${props.contactPerson || '김지현 팀장'}${props.contactPhone ? ` (${props.contactPhone})` : ''}</div>
        </div>
        <div style="display: flex; align-items: center; padding: 9px 10px; border-bottom: 1px solid #E5DEC9; font-size: 11px;">
          <div style="width: 75px; color: #475569; font-weight: 500;">행사 / 목적</div>
          <div class="quote-val-purpose" data-field="trip-purpose" style="flex: 1; font-weight: 600; color: #0F172A;">${props.notes || '비즈니스 투어'}</div>
          <div style="width: 60px; color: #475569; font-weight: 500;">운행 일정</div>
          <div class="quote-val-schedule" data-field="trip-schedule" style="flex: 1.2; font-weight: 600; color: #0F172A;">${props.date} (${props.serviceStartTime} ~ ${props.serviceEndTime}, ${props.serviceHours}시간)</div>
        </div>
        <div style="display: flex; align-items: center; padding: 9px 10px; font-size: 11px;">
          <div style="width: 75px; color: #475569; font-weight: 500;">운행 구간</div>
          <div class="quote-val-route" data-field="trip-route" style="flex: 1; font-weight: 700; color: #0F172A;">${props.origin} → ${props.destination}</div>
        </div>
      </div>
    </div>

    <!-- 5. Section 02: 차량 및 서비스 (테이블 구조로 글자 뭉침/충돌 원천 차단, 선 색상 #E5DEC9) -->
    <div class="quote-section-02" data-section="02-vehicle-service" style="margin-bottom: 22px;">
      <div style="display: flex; align-items: center; margin-bottom: 8px;">
        <span style="font-family: 'Playfair Display', Georgia, serif; font-style: italic; font-size: 19px; font-weight: 600; color: #9B7A4F; margin-right: 8px;">02</span>
        <span style="color: #CBD5E1; margin-right: 8px; font-weight: 300;">|</span>
        <span style="font-size: 14px; font-weight: 700; color: #111827; margin-right: 8px;">차량 및 서비스</span>
        <span style="font-family: 'Playfair Display', Georgia, serif; font-size: 9px; letter-spacing: 0.16em; color: #8C7355; text-transform: uppercase;">VEHICLE & SERVICE</span>
      </div>

      <table class="quote-table-vehicle" data-field="vehicle-service-table" style="width: 100%; border-collapse: collapse; background-color: #F8FAFC; border: 1px solid #E5DEC9; border-radius: 4px; overflow: hidden;">
        <tbody>
          <tr class="quote-row-labels">
            <td class="quote-cell-label quote-label-vehicle" data-field="label-selected-vehicle" style="width: 34%; padding: 10px 12px 4px; font-size: 10px; color: #64748B; font-weight: 500; vertical-align: top; border-right: 1px solid #E5DEC9;">
              선택 차량
            </td>
            <td class="quote-cell-label quote-label-count" data-field="label-vehicle-count" style="width: 16%; padding: 10px 12px 4px; font-size: 10px; color: #64748B; font-weight: 500; vertical-align: top; border-right: 1px solid #E5DEC9;">
              차량 수량
            </td>
            <td class="quote-cell-label quote-label-category" data-field="label-service-category" style="width: 28%; padding: 10px 12px 4px; font-size: 10px; color: #64748B; font-weight: 500; vertical-align: top; border-right: 1px solid #E5DEC9;">
              서비스 구분
            </td>
            <td class="quote-cell-label quote-label-driver" data-field="label-driver-service" style="width: 22%; padding: 10px 12px 4px; font-size: 10px; color: #64748B; font-weight: 500; vertical-align: top;">
              기사 서비스
            </td>
          </tr>
          <tr class="quote-row-values">
            <td class="quote-cell-val quote-val-vehicle" data-field="selected-vehicle" style="padding: 0px 12px 10px; font-size: 11.5px; font-weight: 700; color: #0F172A; line-height: 1.35; vertical-align: top; border-right: 1px solid #E5DEC9;">
              ${props.vehicleModel || '제네시스 G90 신차 최고급형'}
            </td>
            <td class="quote-cell-val quote-val-count" data-field="vehicle-count" style="padding: 0px 12px 10px; font-size: 11.5px; font-weight: 700; color: #0F172A; line-height: 1.35; vertical-align: top; border-right: 1px solid #E5DEC9;">
              ${props.vehicleCount}대
            </td>
            <td class="quote-cell-val quote-val-category" data-field="service-category" style="padding: 0px 12px 10px; font-size: 11.5px; font-weight: 700; color: #0F172A; line-height: 1.35; vertical-align: top; border-right: 1px solid #E5DEC9;">
              <div>${categorySplit.main}</div>
              ${categorySplit.sub ? `<div style="font-size: 10px; font-weight: 500; color: #475569; margin-top: 2px;">${categorySplit.sub}</div>` : ''}
            </td>
            <td class="quote-cell-val quote-val-driver" data-field="driver-service" style="padding: 0px 12px 10px; font-size: 11.5px; font-weight: 700; color: #0F172A; line-height: 1.35; vertical-align: top;">
              ${driverServiceLabel}
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- 6. Section 03: 요금 상세 (선 색상 #E5DEC9) -->
    <div class="quote-section-03" data-section="03-price-breakdown" style="margin-bottom: 22px;">
      <div style="display: flex; align-items: center; margin-bottom: 8px;">
        <span style="font-family: 'Playfair Display', Georgia, serif; font-style: italic; font-size: 19px; font-weight: 600; color: #9B7A4F; margin-right: 8px;">03</span>
        <span style="color: #CBD5E1; margin-right: 8px; font-weight: 300;">|</span>
        <span style="font-size: 14px; font-weight: 700; color: #111827; margin-right: 8px;">요금 상세</span>
        <span style="font-family: 'Playfair Display', Georgia, serif; font-size: 9px; letter-spacing: 0.16em; color: #8C7355; text-transform: uppercase;">PRICE BREAKDOWN</span>
      </div>

      <div style="border-top: 1px solid #E5DEC9; padding-top: 8px;">
        <div class="quote-row-basefare" style="display: flex; justify-content: space-between; align-items: center; padding: 5px 0; font-size: 11px;">
          <span style="color: #1E293B;">기본 대절료 (${props.vehicleCount}대 × ${props.serviceHours}시간)</span>
          <span class="quote-val-basefare" data-field="base-fare" style="font-weight: 600; color: #0F172A; font-family: Pretendard, monospace;">${baseFareFormatted}</span>
        </div>

        ${overtimeFormatted
      ? `
        <div class="quote-row-overtime" style="display: flex; justify-content: space-between; align-items: center; padding: 5px 0; font-size: 11px; color: #92400E;">
          <span>초과 시간 요금 (${props.overtimeHours}시간)</span>
          <span class="quote-val-overtime" data-field="overtime-fare" style="font-weight: 600; font-family: Pretendard, monospace;">${overtimeFormatted}</span>
        </div>`
      : ''
    }

        ${excessKmFormatted
      ? `
        <div class="quote-row-excesskm" style="display: flex; justify-content: space-between; align-items: center; padding: 5px 0; font-size: 11px; color: #92400E;">
          <span>초과 거리 요금 (${props.excessKm}km)</span>
          <span class="quote-val-excesskm" data-field="excess-km-fare" style="font-weight: 600; font-family: Pretendard, monospace;">${excessKmFormatted}</span>
        </div>`
      : ''
    }

        ${englishFormatted
      ? `
        <div class="quote-row-english" style="display: flex; justify-content: space-between; align-items: center; padding: 5px 0; font-size: 11px; color: #1E293B;">
          <span>의전 기사 영어 수당</span>
          <span class="quote-val-english" data-field="english-surcharge" style="font-weight: 600; font-family: Pretendard, monospace;">${englishFormatted}</span>
        </div>`
      : ''
    }

        <div style="border-top: 1px solid #E5DEC9; margin: 8px 0;"></div>

        <div class="quote-row-subtotal" style="display: flex; justify-content: space-between; align-items: center; padding: 5px 0; font-size: 12px;">
          <span style="font-weight: 700; color: #0F172A;">공급가액 소계</span>
          <span class="quote-val-subtotal" data-field="supply-price" style="font-weight: 700; color: #0F172A; font-family: Pretendard, monospace;">${supplyPriceFormatted}</span>
        </div>

        <div class="quote-row-vat" style="display: flex; justify-content: flex-end; align-items: center; gap: 24px; padding: 3px 0; font-size: 10.5px;">
          <span style="color: #64748B;">부가가치세 (10%)</span>
          <span class="quote-val-vat" data-field="vat-amount" style="font-weight: 500; color: #0F172A; font-family: Pretendard, monospace;">${vatFormatted}</span>
        </div>
      </div>
    </div>

    <!-- 7. 총 청구 예상금액 (배경화면 제거 #FFFFFF, 좌우 완전 일치 정렬, 선 색상 #E5DEC9) -->
    <div class="quote-grand-total-box" data-section="04-grand-total" style="background-color: #FFFFFF; border-top: 2px solid #E5DEC9; border-bottom: 2px solid #E5DEC9; padding: 16px 0px; display: flex; align-items: center; justify-content: space-between; margin-bottom: 22px; width: 100%;">
      <div style="display: flex; align-items: center;">
        <div style="width: 3.5px; height: 24px; background-color: #9B7A4F; margin-right: 10px; border-radius: 1.5px;"></div>
        <span class="quote-grand-total-label" data-field="grand-total-label" style="font-size: 15px; font-weight: 700; color: #111827;">
          총 청구 예상금액 <span style="font-size: 11px; font-weight: 500; color: #64748B;">(부가가치세 10% 포함)</span>
        </span>
      </div>

      <div class="quote-grand-total-amount" data-field="grand-total-amount" style="font-size: 26px; font-weight: 800; color: #614421; font-family: Pretendard, -apple-system, sans-serif; letter-spacing: -0.02em; text-align: right;">
        ${grandTotalFormatted}
      </div>
    </div>

    <!-- 8. Notice -->
    <div class="quote-notice-box" data-section="notice" style="font-size: 10px; color: #64748B; line-height: 1.6; margin-bottom: 22px;">
      <div>* 본 견적서는 2026 공식 요율표 기준 실시간 산출 견적서입니다.</div>
      <div style="padding-left: 8px;">예약 전환 시 실시간 관제 스케줄에 즉시 등록됩니다.</div>
    </div>

    <!-- 9. Bottom Footer (#E5DEC9 divider line) -->
    <div class="quote-footer" data-section="footer" style="border-top: 1px solid #E5DEC9; padding-top: 14px; display: flex; align-items: center; justify-content: flex-start; gap: 8px;">
      <span style="font-family: 'Playfair Display', Georgia, serif; font-size: 9.5px; font-weight: 600; letter-spacing: 0.12em; color: #475569; text-transform: uppercase;">
        VIP LIMOUSINE KOREA
      </span>
      <span style="color: #CBD5E1; font-size: 9px;">|</span>
      <span style="font-family: 'Playfair Display', Georgia, serif; font-size: 9px; letter-spacing: 0.14em; color: #64748B; text-transform: uppercase;">
        EXECUTIVE CHAUFFEUR SERVICE
      </span>
    </div>
  </div>
</body>
</html>`;
}
