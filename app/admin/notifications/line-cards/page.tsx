import {redirect} from 'next/navigation';
import {readAdminSession} from '@/lib/adminAuth';
import LineNotificationCardStudio from '@/components/admin/LineNotificationCardStudio';
export const dynamic='force-dynamic';
export default async function LineCardsPage(){const session=await readAdminSession();if(!session)redirect('/admin/login');if(session.role!=='owner')redirect('/admin');return <LineNotificationCardStudio/>;}
