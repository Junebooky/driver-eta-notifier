import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Protocol Cockpit | VIP 의전 드라이버 스마트 관제 런처',
  description: 'VIP 의전 드라이버를 위한 최소 동선 스마트 관제 런처. TMAP, 카카오내비, 네이버지도 딥링크 및 원터치 단톡방 업무 보고 시스템',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Protocol Cockpit',
  },
  other: {
    'apple-mobile-web-app-capable': 'yes',
    'mobile-web-app-capable': 'yes',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
  themeColor: '#FFFFFF',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko" className="h-full bg-[#F8FAFC] text-slate-900">
      <body className={`${inter.className} min-h-full flex flex-col bg-[#F8FAFC] antialiased select-none`}>
        {children}
      </body>
    </html>
  );
}
