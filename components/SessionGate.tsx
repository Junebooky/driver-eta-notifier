'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ensureClientAuth, logoutClientSession, type ClientSessionInfo } from '@/utils/cockpitClientAuth';

export function SessionGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [checked, setChecked] = useState<{ path: string; session: ClientSessionInfo } | null>(null);
  useEffect(() => {
    let active = true;
    ensureClientAuth().then(session => { if (active) setChecked({ path: pathname, session }); });
    return () => { active = false; };
  }, [pathname]);
  if (pathname === '/login') return children;
  if (checked?.path !== pathname) return <div role="status" className="m-auto p-8 text-slate-500">로그인을 확인하고 있습니다.</div>;
  const hq = pathname.startsWith('/hq');
  if (!checked.session.authenticated || (hq && checked.session.role !== 'hq_admin')) {
    return <main className="m-auto w-full max-w-md p-8 text-center">
      <p className="mb-3 text-xs font-bold tracking-widest text-[#1E60F3]">VIP LIMOUSINE KOREA</p>
      <h1 className="mb-3 text-2xl font-bold">{hq ? '관리자 로그인이 필요합니다' : '로그인이 필요합니다'}</h1>
      <p className="mb-6 text-sm text-slate-500">담당 계정으로 로그인해 주세요.</p>
      <Link href={`/login?next=${encodeURIComponent(pathname)}`} className="inline-block rounded-xl bg-[#1E60F3] px-8 py-3 font-bold text-white">로그인</Link>
    </main>;
  }
  return <>
    <div className="flex justify-end gap-3 px-4 py-1 text-xs text-slate-500 bg-white">
      <span>{checked.session.displayName || checked.session.driverName || '로그인됨'}</span>
      <button type="button" onClick={async () => { await logoutClientSession(); window.location.assign('/login'); }} className="underline">로그아웃</button>
    </div>
    {children}
  </>;
}
