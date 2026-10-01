import type { Metadata } from 'next';
import StatusPanel from '@/components/panels/StatusPanel';
export const metadata: Metadata = { title: 'Stav dat' };
export default function Page() { return <StatusPanel />; }
