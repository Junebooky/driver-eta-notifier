'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { HqAssignmentInboxLink } from './HqAssignmentInboxLink';
import { accountHome, canAccessPortal } from '@/utils/loginPortal';
import { usePathname } from 'next/navigation';
import { ensureClientAuth, logoutClientSession, type ClientSessionInfo } from '@/utils/cockpitClientAuth';

export function SessionGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [checked, setChecked] = useState<{ path: string; session: ClientSessionInfo } | null>(null);
  useEffect(() => {
    let active = true;
    const check=()=>ensureClientAuth(undefined, undefined, {force:true}).then(session => { if (active) setChecked({ path: pathname, session }); });
    void check();
    const visibleCheck = () => { if (document.visibilityState !== 'hidden') void check(); };
    const timer=setInterval(visibleCheck,60_000);
    window.addEventListener('pageshow',visibleCheck);
    window.addEventListener('focus',visibleCheck);
    window.addEventListener('online',visibleCheck);
    document.addEventListener('visibilitychange',visibleCheck);
    return () => {
      active = false; clearInterval(timer);
      window.removeEventListener('pageshow',visibleCheck);
      window.removeEventListener('focus',visibleCheck);
      window.removeEventListener('online',visibleCheck);
      document.removeEventListener('visibilitychange',visibleCheck);
    };
  }, [pathname]);
  const destination = checked?.path === pathname && checked.session.authenticated && pathname === '/'
    ? accountHome(checked.session) : '/';
  useEffect(() => { if (destination !== '/') window.location.replace(destination); }, [destination]);
  if (pathname === '/login' || pathname === '/representative/login') return children;
  if (checked?.path !== pathname) return <div role="status" className="m-auto p-8 text-slate-500">로그인을 확인하고 있습니다.</div>;
  if (destination !== '/') return <div role="status" className="m-auto p-8 text-slate-500">전용 화면으로 이동하고 있습니다.</div>;
  const hq = pathname.startsWith('/hq');
  const representative = pathname === '/representative' || pathname.startsWith('/representative/');
  const loginPath = representative ? '/representative/login' : '/login';
  if (!checked.session.authenticated || (hq && !canAccessPortal(checked.session, 'hq')) || (representative && !canAccessPortal(checked.session, 'representative'))) {
    return <main className="m-auto w-full max-w-md p-8 text-center">
      <p className="mb-3 text-xs font-bold tracking-widest text-[#1E60F3]">VIP LIMOUSINE KOREA</p>
      <h1 className="mb-3 text-2xl font-bold">{representative ? '대표 계정 로그인이 필요합니다' : hq ? '관리자 로그인이 필요합니다' : '로그인이 필요합니다'}</h1>
      <p className="mb-6 text-sm text-slate-500">담당 계정으로 로그인해 주세요.</p>
      <Link href={`${loginPath}?next=${encodeURIComponent(pathname)}`} className="inline-block rounded-xl bg-[#1E60F3] px-8 py-3 font-bold text-white">로그인</Link>
    </main>;
  }
  return <>
    <div className="flex flex-wrap justify-end gap-3 px-4 py-1 text-xs text-slate-500 bg-white">
      {checked.session.isRepresentative && <Link href="/representative" className="font-bold text-[#1E60F3]">대표 관제</Link>}
      {checked.session.role==='hq_admin' && <HqAssignmentInboxLink representative={checked.session.isRepresentative} />}
      <span>{checked.session.displayName || checked.session.driverName || '로그인됨'}</span>
      <button type="button" onClick={async () => { const confirmed=await logoutClientSession(); if (!confirmed) window.alert('서버 로그아웃을 확인하지 못했습니다. 계정 관리자에게 세션 종료를 요청해 주세요.'); window.location.assign('/login'); }} className="underline">로그아웃</button>
    </div>
    {children}
  </>;
}
