import { LoginForm } from '@/components/LoginForm';

export const metadata = {
  title: 'HQ 관리자 로그인 | VIP Limousine Korea',
  robots: { index: false, follow: false },
};

export default function HqLoginPage() {
  return <LoginForm initialPortal="hq" />;
}
