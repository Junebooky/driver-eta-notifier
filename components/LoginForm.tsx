'use client';
import { useState } from 'react';
import { canAccessPortal, loginDestination, type LoginPortal } from '@/utils/loginPortal';
import { purgeLocalCaches } from '@/utils/cockpitClientAuth';

export function LoginForm({ initialPortal = 'driver' }: { initialPortal?: LoginPortal }) {
  const [role, setRole] = useState<LoginPortal>(
    initialPortal === 'hq' || initialPortal === 'representative' ? 'hq' : 'driver'
  );
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [secret, setSecret] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const isHq = role === 'hq' || role === 'representative';

  async function handleQuickLogin(target: 'driver' | 'admin') {
    if (loading) return;
    setLoading(true);
    setError('');
    const targetPortal: LoginPortal = target === 'driver' ? 'driver' : 'hq';
    setRole(targetPortal);
    const targetEmail = target === 'driver' ? 'driver.qa@viplimousine.kr' : 'admin.qa@viplimousine.kr';
    const targetSecret = '123456789';
    setEmail(targetEmail);
    setSecret(targetSecret);

    try {
      let res = await fetch('/api/auth/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: targetEmail, password: targetSecret, portal: targetPortal }),
      });
      let data = await res.json();

      // If password sign-in is unavailable (e.g. offline dev), attempt dev_switch fallback
      if (!res.ok && (data?.error || !data?.ok)) {
        const devRes = await fetch('/api/auth/session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'dev_switch', target }),
        });
        if (devRes.ok) {
          const devData = await devRes.json();
          if (devData.ok) {
            res = devRes;
            data = devData;
          }
        }
      }

      if (!res.ok || !data.ok) throw new Error(data.error || '로그인에 실패했습니다.');
      purgeLocalCaches();
      if (!canAccessPortal(data.session || {}, targetPortal)) {
        throw new Error('선택한 로그인 권한을 확인해 주세요.');
      }
      const next = new URLSearchParams(window.location.search).get('next');
      window.location.assign(loginDestination(data.session, next));
    } catch (err) {
      setError(err instanceof Error ? err.message : '로그인 연결에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/auth/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password: secret, code, portal: role }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || '로그인에 실패했습니다.');
      purgeLocalCaches();
      if (!canAccessPortal(data.session || {}, role)) throw new Error('선택한 로그인 권한을 확인해 주세요.');
      const next = new URLSearchParams(window.location.search).get('next');
      window.location.assign(loginDestination(data.session, next));
    } catch (err) {
      setError(err instanceof Error ? err.message : '로그인 연결에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  }

  const inputClass =
    'mt-2 h-12 w-full rounded-xl border border-slate-200 bg-white px-4 outline-none focus:border-[#1E60F3] focus:ring-2 focus:ring-blue-100';

  return (
    <main className="m-auto w-full max-w-md px-6 py-12">
      <p className="mb-3 text-xs font-bold tracking-widest text-[#1E60F3]">VIP LIMOUSINE KOREA</p>

      {/* 1. 빠른 원클릭 접속 (개발 및 테스트용) */}
      <div className="mb-6 rounded-2xl border border-blue-100 bg-blue-50/70 p-4">
        <div className="mb-2.5 flex items-center justify-between">
          <span className="text-xs font-bold text-[#1E60F3]">⚡ 빠른 선택 로그인 (개발·테스트)</span>
          <span className="text-[11px] font-medium text-slate-500">원클릭 즉시 접속</span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => handleQuickLogin('driver')}
            disabled={loading}
            className="flex items-center justify-center gap-1.5 rounded-xl bg-white py-3 text-xs font-bold text-slate-800 shadow-sm border border-slate-200 hover:border-blue-400 hover:text-[#1E60F3] active:scale-95 transition disabled:opacity-50 cursor-pointer"
          >
            <span>🚗</span>
            <span>기사 바로 로그인</span>
          </button>
          <button
            type="button"
            onClick={() => handleQuickLogin('admin')}
            disabled={loading}
            className="flex items-center justify-center gap-1.5 rounded-xl bg-white py-3 text-xs font-bold text-slate-800 shadow-sm border border-slate-200 hover:border-blue-400 hover:text-[#1E60F3] active:scale-95 transition disabled:opacity-50 cursor-pointer"
          >
            <span>🏢</span>
            <span>관리자 바로 로그인</span>
          </button>
        </div>
      </div>

      {/* 2. 기사 / 관리자 2분할 역할 선택 탭 */}
      <div className="mb-6 grid grid-cols-2 rounded-xl bg-slate-100 p-1">
        <button
          type="button"
          disabled={loading}
          onClick={() => {
            setRole('driver');
            setError('');
          }}
          className={`rounded-lg py-2.5 text-sm font-bold transition cursor-pointer ${
            !isHq ? 'bg-white text-[#1E60F3] shadow-sm' : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          기사 로그인
        </button>
        <button
          type="button"
          disabled={loading}
          onClick={() => {
            setRole('hq');
            setError('');
          }}
          className={`rounded-lg py-2.5 text-sm font-bold transition cursor-pointer ${
            isHq ? 'bg-white text-[#1E60F3] shadow-sm' : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          본사 관리자 로그인
        </button>
      </div>

      <h1 className="mb-2 text-2xl font-bold tracking-tight">
        {isHq ? '본사 관리자 로그인' : 'Driver Cockpit'}
      </h1>
      <p className="mb-6 text-sm text-slate-500">
        {isHq
          ? '본사 관리자 전용 통합 로그인입니다.'
          : '기사 전용 로그인 — 담당 계정으로 로그인해 주세요.'}
      </p>

      {/* 3. 계정 직접 입력 폼 */}
      <form onSubmit={submit} className="space-y-4">
        <label className="block text-sm font-bold">
          계정 이메일
          <input
            type="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className={inputClass}
          />
        </label>
        <label className="block text-sm font-bold">
          비밀번호
          <input
            type="password"
            autoComplete="current-password"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            required
            className={inputClass}
          />
        </label>
        <label className="block text-sm font-bold">
          인증 앱 번호 (설정된 경우)
          <input
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            className={inputClass}
          />
        </label>
        {error && (
          <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={loading}
          className="h-12 w-full rounded-xl bg-[#1E60F3] text-sm font-bold text-white disabled:opacity-50 cursor-pointer"
        >
          {loading ? '로그인 중…' : `${isHq ? '관리자' : '기사'} 로그인`}
        </button>
      </form>
    </main>
  );
}
