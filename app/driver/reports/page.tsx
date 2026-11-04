import {cookies} from 'next/headers';
import {redirect} from 'next/navigation';
import {parseAndVerifyToken} from '@/lib/auth/serverAuth';
import {DriverReportChat} from '@/components/driver-reports/DriverReportChat';
export const dynamic='force-dynamic';
export default async function DriverReportsPage() {
 const store=await cookies(),token=store.get('cockpit_session')?.value;
 const session=token?await parseAndVerifyToken(token):null;
 if(!session)redirect('/login?next=%2Fdriver%2Freports');
 if(session.role!=='driver'||!session.driverId)redirect('/hq?tab=excel_import');
 return <DriverReportChat key={session.driverId} driverId={session.driverId} driverName={session.driverName}/>;
}
