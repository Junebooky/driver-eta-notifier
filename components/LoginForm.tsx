'use client';
import { useState } from 'react';
import { canAccessPortal, loginDestination, type LoginPortal } from '@/utils/loginPortal';
import { purgeLocalCaches } from '@/utils/cockpitClientAuth';

export function LoginForm({ initialPortal = 'driver' }: { initialPortal?: LoginPortal }) {
  const isHq = initialPortal === 'hq' || initialPortal === 'representative';
  const role: LoginPortal = isHq ? 'hq' : 'driver';
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [secret, setSecret] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

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
      <h1 className="mb-3 text-3xl font-bold tracking-tight">
        {isHq ? '본사 관리자 로그인' : 'Driver Cockpit'}
      </h1>
      <p className="mb-7 text-sm text-slate-500">
        {isHq
          ? '본사 관리자 및 대표 전용 통합 로그인입니다.'
          : '기사 전용 로그인 — 담당 계정으로 로그인해 주세요.'}
      </p>

      <form onSubmit={submit} className="space-y-5">
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
          {loading ? '로그인 중…' : '로그인'}
        </button>
      </form>
    </main>
  );
}
