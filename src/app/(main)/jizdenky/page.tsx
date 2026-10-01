import type { Metadata } from 'next';
import TicketsPanel from '@/components/panels/TicketsPanel';
export const metadata: Metadata = { title: 'Jízdenky' };
export default function Page() { return <TicketsPanel />; }
