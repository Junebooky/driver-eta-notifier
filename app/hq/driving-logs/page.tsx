import { redirect } from 'next/navigation';

export default function HqDrivingLogsRedirectPage() {
  redirect('/hq?tab=driving_logs');
}
