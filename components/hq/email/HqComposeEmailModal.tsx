'use client';

import React, { useState, useRef } from 'react';
import { X, Send, Mail, Sparkles, Check, AlertCircle, Loader2 } from 'lucide-react';
import { haptics } from '@/utils/haptics';

export interface HqComposeEmailModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTo?: string;
  initialSubject?: string;
  initialBody?: string;
  initialCc?: string;
  onSentSuccess?: (result: { to: string; subject: string }) => void;
}

const FREQUENT_CONTACTS = [
  { label: 'A전자 의전팀', email: 'protocol@aelectronics.com' },
  { label: 'B바이오 비서실', email: 'secretary@bbio.co.kr' },
  { label: 'C무역 해외영업', email: 'dispatch@ctrade.com' },
  { label: 'D컨설팅 지원팀', email: 'admin@dconsulting.com' },
  { label: '윤태준 기사', email: 'driver.yoon@viplimousine.kr' },
  { label: '김기사 기사', email: 'driver.kim@viplimousine.kr' },
];

const EMAIL_TEMPLATES = [
  {
    id: 'dispatch_confirmed',
    name: '배차 확정 안내',
    subject: '[VIP LIMOUSINE] 의전 차량 배차 확정 안내',
    body: `안녕하세요, VIP LIMOUSINE KOREA 관제팀입니다.
요청해주신 VIP 의전 차량 배차가 정상적으로 확정되었습니다.

[배차 및 운행 일정 안내]
• 예약 번호: BK-20261026-01
• 고객사 / 승객: 
• 픽업 일시: 2026년 10월 27일 (화) 
• 픽업 장소: 
• 도착 목적지: 
• 배정 기사: 윤태준 기사 (010-8842-1920)
• 배정 차량: 현대 스타리아 리무진 (116허 1514)

기사님이 픽업 예정 시간 20분 전 현장에 도착하여 대기할 예정이며, 차량 내부에는 VIP 전용 생수 및 편의용품이 완비되어 있습니다.
일정 변경 또는 추가 요청사항이 있으실 경우 언제든지 본 메일 또는 관제센터로 연락 부탁드립니다.

감사합니다.
VIP LIMOUSINE KOREA 종합관제팀 드림`,
  },
  {
    id: 'booking_received',
    name: '예약 접수 확인',
    subject: '[VIP LIMOUSINE] 예약 요청 접수 및 배차 진행 안내',
    body: `안녕하세요, VIP LIMOUSINE KOREA 관제팀입니다.
보내주신 의전 차량 예약 요청이 정상적으로 접수되었습니다.

현재 담당 관제관이 요청 일정과 최적 경로를 검토 중이며, 적임 기사 및 차량 배정 완료 즉시 상세 안내 메일을 발송해 드리겠습니다.

[접수된 일정]
• 요청 일시: 
• 이동 경로: 
• 승객 정보: 

신속하고 안전한 VIP 의전 서비스를 제공해 드리겠습니다.
감사합니다.
VIP LIMOUSINE KOREA 드림`,
  },
  {
    id: 'quote_proposal',
    name: '견적 및 제안서',
    subject: '[VIP LIMOUSINE] VIP 의전 서비스 견적서 및 서비스 안내',
    body: `안녕하세요, VIP LIMOUSINE KOREA 관제팀입니다.
요청하신 VIP 의전 차량 서비스 관련 견적 및 이용 안내를 송부드립니다.

[서비스 견적 안내]
• 이용 차종: 카니발 하이리무진 / 제네시스 G90 LWB
• 서비스 유형: 공항 영접(Meet & Greet) 및 전용 일정 수행
• 포함 사항: 유류비, 통행료, 전문 의전 드라이버, 차량 내 VIP 어메니티 일체

상세 견적서 파일 및 제안서는 첨부 내용을 확인해 주시기 바라며, 추가 일정 조율이 필요하신 경우 언제든 회신 부탁드립니다.
감사합니다.
VIP LIMOUSINE KOREA 영업관제본부`,
  },
  {
    id: 'schedule_change',
    name: '일정 변경 확인',
    subject: '[VIP LIMOUSINE] 운행 일정 변경 확인 안내',
    body: `안녕하세요, VIP LIMOUSINE KOREA 관제팀입니다.
요청하신 의전 일정 변경사항이 관제 시스템 및 배정 기사에게 정상 반영되었습니다.

[수정된 운행 정보]
• 변경 일시: 
• 변경 위치: 
• 배정 기사: 

안전하고 품격 있는 이동이 되도록 만전을 기하겠습니다.
감사합니다.
VIP LIMOUSINE KOREA 드림`,
  },
];

/**
 * 텍스트에서 이메일 목록을 추출 (쉼표, 세미콜론, 공백, 줄바꿈 모두 지원)
 */
function extractEmails(text: string): string[] {
  if (!text) return [];
  return text
    .split(/[\s,;\n\r]+/)
    .map((s) => s.trim().replace(/^[<"']|[>"']$/g, ''))
    .filter((s) => s.length > 0);
}

/**
 * 기본 이메일 형식 유효성 검사
 */
function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/**
 * 직관적인 이메일 태그(칩) 입력 컴포넌트
 * - Enter, 스페이스, 쉼표(,), 세미콜론(;), 붙여넣기 시 자동으로 독립된 칩으로 변환
 * - 관리자가 여러 명의 수신자를 정확하게 확인하고 개별 삭제할 수 있도록 지원
 */
interface EmailTagInputProps {
  id: string;
  emails: string[];
  onChange: (emails: string[]) => void;
  pendingText: string;
  setPendingText: (val: string) => void;
  placeholder?: string;
  hasError?: boolean;
}

const EmailTagInput: React.FC<EmailTagInputProps> = ({
  id,
  emails,
  onChange,
  pendingText,
  setPendingText,
  placeholder,
  hasError,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);

  const commitEmails = (raw: string) => {
    const list = extractEmails(raw);
    if (list.length > 0) {
      const newItems = list.filter((item) => !emails.includes(item));
      if (newItems.length > 0) {
        onChange([...emails, ...newItems]);
        haptics.lightTap();
      }
      setPendingText('');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // Enter, Comma, Semicolon, Space, Tab 입력 시 칩으로 즉시 확정
    if (e.key === 'Enter' || e.key === ',' || e.key === ';' || e.key === ' ' || e.key === 'Tab') {
      if (pendingText.trim()) {
        e.preventDefault();
        commitEmails(pendingText);
      } else if (e.key === 'Enter') {
        // 빈 입력 상태에서 엔터 입력 시 폼이 바로 제출되는 것 방지
        e.preventDefault();
      }
    } else if (e.key === 'Backspace' && !pendingText && emails.length > 0) {
      // 텍스트가 비어있을 때 백스페이스 누르면 마지막 칩 삭제
      e.preventDefault();
      onChange(emails.slice(0, -1));
      haptics.lightTap();
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    // 구분 기호(쉼표, 세미콜론, 줄바꿈)가 포함되어 있으면 즉시 분리 커밋
    if (val.includes(',') || val.includes(';') || val.includes('\n')) {
      commitEmails(val);
    } else {
      setPendingText(val);
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text');
    commitEmails(pasted);
  };

  const handleBlur = () => {
    if (pendingText.trim()) {
      commitEmails(pendingText);
    }
  };

  const handleRemove = (index: number) => {
    haptics.lightTap();
    onChange(emails.filter((_, idx) => idx !== index));
  };

  return (
    <div
      onClick={() => inputRef.current?.focus()}
      className={`w-full min-h-[42px] px-2.5 py-1.5 rounded-xl border bg-white shadow-2xs flex flex-wrap items-center gap-1.5 cursor-text transition-all ${
        hasError
          ? 'border-red-300 ring-2 ring-red-100'
          : 'border-slate-200 focus-within:border-[#1E60F3] focus-within:ring-2 focus-within:ring-[#1E60F3]/20'
      }`}
    >
      {emails.map((email, idx) => {
        const valid = isValidEmail(email);
        return (
          <span
            key={`${email}-${idx}`}
            className={`inline-flex items-center gap-1.5 pl-2.5 pr-1 py-1 rounded-lg text-xs font-semibold shadow-2xs transition-all animate-in zoom-in-95 duration-100 ${
              valid
                ? 'bg-blue-50/90 text-blue-900 border border-blue-200/90 hover:bg-blue-100/90'
                : 'bg-amber-50 text-amber-900 border border-amber-300 hover:bg-amber-100'
            }`}
          >
            <Mail className={`w-3 h-3 shrink-0 ${valid ? 'text-[#1E60F3]' : 'text-amber-600'}`} />
            <span className="truncate max-w-[240px] select-all font-mono text-[11.5px]">{email}</span>
            {!valid && (
              <span className="text-[9px] font-bold px-1 py-0.5 rounded bg-amber-200/80 text-amber-800">
                형식 확인
              </span>
            )}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleRemove(idx);
              }}
              className="w-4 h-4 rounded-full flex items-center justify-center hover:bg-slate-200/80 text-slate-400 hover:text-slate-700 transition-colors cursor-pointer"
              title="삭제"
            >
              <X className="w-2.5 h-2.5" />
            </button>
          </span>
        );
      })}

      <input
        ref={inputRef}
        id={id}
        type="text"
        value={pendingText}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        onBlur={handleBlur}
        placeholder={emails.length === 0 ? placeholder : '이메일 추가 (스페이스 / Enter)...'}
        className="flex-1 min-w-[170px] text-xs font-medium text-slate-800 placeholder:text-slate-400 focus:outline-none bg-transparent py-1 px-1"
      />
    </div>
  );
};

const HqComposeEmailModalContent: React.FC<HqComposeEmailModalProps> = ({
  onClose,
  initialTo = '',
  initialSubject = '',
  initialBody = '',
  initialCc = '',
  onSentSuccess,
}) => {
  const [toEmails, setToEmails] = useState<string[]>(() => extractEmails(initialTo));
  const [pendingTo, setPendingTo] = useState('');
  const [ccEmails, setCcEmails] = useState<string[]>(() => extractEmails(initialCc));
  const [pendingCc, setPendingCc] = useState('');
  const [showCc, setShowCc] = useState(Boolean(initialCc && initialCc.trim()));
  const [subject, setSubject] = useState(initialSubject);
  const [body, setBody] = useState(initialBody);

  const [isSending, setIsSending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successToast, setSuccessToast] = useState<string | null>(null);

  // Handle template insertion
  const handleApplyTemplate = (tmpl: (typeof EMAIL_TEMPLATES)[0]) => {
    haptics.selection();
    if (!subject || subject === initialSubject) {
      setSubject(tmpl.subject);
    }
    setBody(tmpl.body);
  };

  // Quick recipient insertion (토글 형식: 이미 있으면 제거, 없으면 추가)
  const handleAddRecipient = (email: string) => {
    haptics.lightTap();
    if (toEmails.includes(email)) {
      setToEmails(toEmails.filter((e) => e !== email));
    } else {
      setToEmails([...toEmails, email]);
    }
  };

  // Send Email Handler
  const handleSendEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    // 아직 미확정 상태로 입력창에 남아있는 텍스트가 있다면 즉시 커밋
    let finalTo = [...toEmails];
    if (pendingTo.trim()) {
      const extracted = extractEmails(pendingTo);
      const newItems = extracted.filter((item) => !finalTo.includes(item));
      finalTo = [...finalTo, ...newItems];
      setToEmails(finalTo);
      setPendingTo('');
    }

    let finalCc = [...ccEmails];
    if (pendingCc.trim()) {
      const extracted = extractEmails(pendingCc);
      const newItems = extracted.filter((item) => !finalCc.includes(item));
      finalCc = [...finalCc, ...newItems];
      setCcEmails(finalCc);
      setPendingCc('');
    }

    if (finalTo.length === 0) {
      setErrorMessage('받는 사람(수신인) 이메일 주소를 1개 이상 입력해주세요.');
      return;
    }

    const invalidTo = finalTo.filter((email) => !isValidEmail(email));
    if (invalidTo.length > 0) {
      setErrorMessage(`올바르지 않은 이메일 주소 형식이 포함되어 있습니다: ${invalidTo.join(', ')}`);
      return;
    }

    const invalidCc = finalCc.filter((email) => !isValidEmail(email));
    if (invalidCc.length > 0) {
      setErrorMessage(`올바르지 않은 참조(Cc) 이메일 주소 형식이 포함되어 있습니다: ${invalidCc.join(', ')}`);
      return;
    }

    if (!subject.trim()) {
      setErrorMessage('이메일 제목을 입력해주세요.');
      return;
    }

    if (!body.trim()) {
      setErrorMessage('이메일 본문 내용을 입력해주세요.');
      return;
    }

    setIsSending(true);
    haptics.mediumTap();

    try {
      const cleanTo = finalTo.join(', ');

      const res = await fetch('/api/email/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: finalTo.length === 1 ? finalTo[0] : finalTo,
          cc: showCc && finalCc.length > 0 ? (finalCc.length === 1 ? finalCc[0] : finalCc) : undefined,
          subject: subject.trim(),
          body: body.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || '이메일 전송에 실패했습니다.');
      }

      haptics.success();
      setSuccessToast(
        `성공적으로 발송되었습니다: 총 ${finalTo.length}명 (${finalTo[0]}${
          finalTo.length > 1 ? ` 외 ${finalTo.length - 1}명` : ''
        })`
      );

      if (onSentSuccess) {
        onSentSuccess({ to: cleanTo, subject: subject.trim() });
      }

      // Close modal after short confirmation delay
      setTimeout(() => {
        onClose();
      }, 1200);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('Send email error:', msg);
      setErrorMessage(msg);
      haptics.errorAlert();
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="w-full max-w-3xl bg-white rounded-2xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden max-h-[92vh]">
        {/* Header */}
        <div className="px-6 py-4 bg-gradient-to-r from-[#0B1E48] to-[#123485] text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-500/20 border border-blue-400/30 flex items-center justify-center">
              <Mail className="w-4 h-4 text-blue-300" />
            </div>
            <div>
              <h2 className="text-base font-black tracking-tight">
                {initialSubject?.startsWith('Re:') ? '이메일 회신 (답장)' : '새 이메일 작성'}
              </h2>
              <p className="text-[11px] text-blue-200/80 font-medium">
                VIP LIMOUSINE KOREA 공식 NAVER SMTP 메일 서버를 통해 고객/기사에게 발송됩니다.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-white/10 text-white/80 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSendEmail} className="flex-1 overflow-y-auto p-6 space-y-4">
          {/* Success Banner */}
          {successToast && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-2 text-emerald-800 text-xs font-bold animate-in fade-in">
              <Check className="w-4 h-4 text-emerald-600" />
              <span>{successToast}</span>
            </div>
          )}

          {/* Error Banner */}
          {errorMessage && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2 text-red-800 text-xs font-bold animate-in fade-in">
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Sender (Read-only branding) */}
          <div className="flex items-center gap-3 text-xs">
            <span className="w-16 font-bold text-slate-500 text-right">보낸 사람</span>
            <div className="flex-1 py-1 px-2.5 bg-slate-50 border border-slate-200/80 rounded-lg text-slate-700 font-medium text-xs flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              <span className="font-bold text-slate-900">VIP LIMOUSINE KOREA 관제팀</span>
              <span className="text-slate-400">&lt;gotoward8@naver.com&gt;</span>
            </div>
          </div>

          {/* Recipient Input (To: Anyone) */}
          <div className="space-y-1.5">
            <div className="flex items-start gap-3 text-xs">
              <div className="w-16 pt-2.5 flex flex-col items-end gap-1 shrink-0">
                <label htmlFor="compose-to" className="font-bold text-slate-700 text-right cursor-pointer">
                  받는 사람 *
                </label>
                {toEmails.length > 0 && (
                  <span className="px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 text-[10px] font-bold">
                    총 {toEmails.length}명
                  </span>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <EmailTagInput
                  id="compose-to"
                  emails={toEmails}
                  onChange={setToEmails}
                  pendingText={pendingTo}
                  setPendingText={setPendingTo}
                  placeholder="예: client@company.com (스페이스, Enter, 또는 쉼표로 연속 추가)"
                  hasError={Boolean(errorMessage && toEmails.length === 0)}
                />
              </div>
              <button
                type="button"
                onClick={() => setShowCc(!showCc)}
                className="pt-2 text-[11px] font-bold text-slate-500 hover:text-blue-600 px-2 py-1 rounded hover:bg-slate-100 shrink-0 transition-colors"
              >
                {showCc ? '참조 숨기기' : '+ 참조(Cc)'}
              </button>
            </div>

            {/* Quick Contact Chips */}
            <div className="flex items-center gap-1.5 ml-19 flex-wrap">
              <span className="text-[10px] font-bold text-slate-400">자주 쓰는 연락처:</span>
              {FREQUENT_CONTACTS.map((c) => {
                const isSelected = toEmails.includes(c.email);
                return (
                  <button
                    key={c.email}
                    type="button"
                    onClick={() => handleAddRecipient(c.email)}
                    className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-blue-600 text-white border-blue-600 shadow-2xs'
                        : 'bg-slate-100 hover:bg-blue-50 hover:text-blue-600 text-slate-600 border-slate-200/60'
                    }`}
                  >
                    {isSelected ? '✓ ' : '+ '}
                    {c.label}
                  </button>
                );
              })}
            </div>

            <p className="ml-19 text-[10px] text-slate-400 font-medium">
              💡 쉼표(,), 스페이스, Enter 구분 모두 지원하며, 여러 주소를 한 번에 복사해서 붙여넣어도 자동 등록됩니다.
            </p>
          </div>

          {/* Optional CC */}
          {showCc && (
            <div className="flex items-start gap-3 text-xs animate-in fade-in duration-150">
              <div className="w-16 pt-2.5 flex flex-col items-end gap-1 shrink-0">
                <label htmlFor="compose-cc" className="font-bold text-slate-500 text-right cursor-pointer">
                  참조(Cc)
                </label>
                {ccEmails.length > 0 && (
                  <span className="px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-600 text-[10px] font-bold">
                    총 {ccEmails.length}명
                  </span>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <EmailTagInput
                  id="compose-cc"
                  emails={ccEmails}
                  onChange={setCcEmails}
                  pendingText={pendingCc}
                  setPendingText={setPendingCc}
                  placeholder="참조할 이메일 주소 (스페이스, Enter, 또는 쉼표로 추가)"
                />
              </div>
            </div>
          )}

          {/* Subject */}
          <div className="flex items-center gap-3 text-xs">
            <label htmlFor="compose-subject" className="w-16 font-bold text-slate-700 text-right">
              제목 *
            </label>
            <input
              id="compose-subject"
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="이메일 제목을 입력하세요"
              className="flex-1 px-3 py-2 text-xs font-bold text-slate-900 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-[#1E60F3] focus:border-transparent bg-white shadow-2xs"
              required
            />
          </div>

          {/* Quick Template Selector */}
          <div className="flex items-center gap-2 p-2.5 bg-blue-50/60 border border-blue-100 rounded-xl text-xs">
            <Sparkles className="w-3.5 h-3.5 text-[#1E60F3] shrink-0" />
            <span className="font-bold text-[#1E60F3] text-[11px] shrink-0">추천 서식:</span>
            <div className="flex items-center gap-1.5 flex-wrap">
              {EMAIL_TEMPLATES.map((tmpl) => (
                <button
                  key={tmpl.id}
                  type="button"
                  onClick={() => handleApplyTemplate(tmpl)}
                  className="px-2.5 py-1 rounded-lg bg-white hover:bg-blue-600 hover:text-white text-slate-700 text-[11px] font-bold border border-blue-200/80 shadow-2xs transition-all cursor-pointer"
                >
                  {tmpl.name}
                </button>
              ))}
            </div>
          </div>

          {/* Body Textarea */}
          <div className="space-y-1">
            <label htmlFor="compose-body" className="block text-xs font-bold text-slate-700">
              본문 내용 *
            </label>
            <textarea
              id="compose-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={11}
              placeholder="고객 또는 수신인에게 전달할 메일 본문을 입력하세요..."
              className="w-full p-3.5 text-xs font-medium text-slate-800 leading-relaxed rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-[#1E60F3] focus:border-transparent bg-white shadow-2xs font-sans whitespace-pre-wrap resize-y"
              required
            />
          </div>

          {/* Modal Actions */}
          <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
            <span className="text-[11px] text-slate-400 font-medium">
              💡 발송된 메일은 상대방의 받은편지함으로 즉시 전달되며, 네이버 보낸편지함에도 자동 기록됩니다.
            </span>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={isSending}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition-colors"
              >
                닫기
              </button>

              <button
                type="submit"
                disabled={isSending}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#1E60F3] hover:bg-blue-600 active:scale-95 text-white text-xs font-bold shadow-md shadow-blue-500/20 transition-all cursor-pointer disabled:opacity-50"
              >
                {isSending ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-white" />
                    <span>발송 중...</span>
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4 text-white" />
                    <span>메일 발송</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

export const HqComposeEmailModal: React.FC<HqComposeEmailModalProps> = (props) => {
  if (!props.isOpen) return null;
  // Key forces clean initial state whenever modal opens with new targets
  return (
    <HqComposeEmailModalContent
      key={`${props.initialTo || ''}-${props.initialCc || ''}-${props.initialSubject || ''}-${(props.initialBody || '').slice(0, 30)}`}
      {...props}
    />
  );
};
