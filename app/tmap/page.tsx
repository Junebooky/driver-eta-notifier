'use client';

import React, { useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { launchNavigationApp } from '@/utils/navigation';
import { Navigation, ArrowLeft, ExternalLink } from 'lucide-react';
import Link from 'next/link';

function TmapLauncherContent() {
  const searchParams = useSearchParams();
  const name = searchParams.get('name') || '목적지';
  const lat = parseFloat(searchParams.get('lat') || '37.4495');
  const lng = parseFloat(searchParams.get('lng') || '126.4512');

  const sname = searchParams.get('sname') || searchParams.get('startname') || undefined;
  const slat = parseFloat(searchParams.get('slat') || searchParams.get('starty') || '');
  const slng = parseFloat(searchParams.get('slng') || searchParams.get('startx') || '');
  const origin =
    sname && !isNaN(slat) && !isNaN(slng)
      ? { name: sname, lat: slat, lng: slng }
      : undefined;

  useEffect(() => {
    if (name && !isNaN(lat) && !isNaN(lng)) {
      launchNavigationApp('tmap', { name, lat, lng }, origin);
    }
  }, [name, lat, lng, origin]);

  return (
    <div className="min-h-screen bg-black text-zinc-100 flex flex-col items-center justify-center p-6 text-center">
      <div className="w-16 h-16 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 mb-4 animate-pulse shadow-lg shadow-emerald-950/50">
        <Navigation className="w-8 h-8" />
      </div>

      <div className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-bold mb-3">
        <span>VIP PROTOCOL ROUTE</span>
      </div>

      <h1 className="text-xl font-black text-white mb-2 tracking-tight">
        티맵(TMAP) 경로를 실행 중입니다
      </h1>
      <p className="text-sm text-zinc-400 max-w-xs mb-8 leading-relaxed">
        {origin ? (
          <>
            출발지 <span className="text-zinc-200 font-bold">[{origin.name}]</span>에서 목적지{' '}
            <span className="text-zinc-200 font-bold">[{name}]</span>로 바로 안내하기 위해 티맵 앱을 호출하고 있습니다.
          </>
        ) : (
          <>
            목적지 <span className="text-zinc-200 font-bold">[{name}]</span>로 바로 안내하기 위해 티맵 앱을 호출하고 있습니다.
          </>
        )}
      </p>

      <div className="space-y-3 w-full max-w-xs">
        <button
          onClick={() => launchNavigationApp('tmap', { name, lat, lng }, origin)}
          className="w-full py-4 px-4 bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white font-black text-sm rounded-2xl shadow-xl shadow-emerald-950/60 flex items-center justify-center space-x-2 transition-all border border-emerald-400/40"
        >
          <ExternalLink className="w-4 h-4" />
          <span>티맵 앱 다시 열기</span>
        </button>

        <Link
          href="/"
          className="w-full py-3.5 px-4 bg-zinc-900 hover:bg-zinc-850 active:scale-95 text-zinc-300 hover:text-white font-bold text-xs rounded-2xl border border-zinc-800 flex items-center justify-center space-x-2 transition-all"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>웹 관제 상황실로 이동</span>
        </Link>
      </div>

      <footer className="mt-12 text-[11px] text-zinc-600 font-medium">
        PROTOCOL COCKPIT • VIP DRIVER SMART LAUNCHER
      </footer>
    </div>
  );
}

export default function TmapLauncherPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-black flex items-center justify-center text-zinc-500 font-bold text-sm">
          티맵 연결 중...
        </div>
      }
    >
      <TmapLauncherContent />
    </Suspense>
  );
}
