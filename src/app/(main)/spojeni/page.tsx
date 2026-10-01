import type { Metadata } from 'next';
import PlannerPanel from '@/components/panels/PlannerPanel';
export const metadata: Metadata = { title: 'Spojení' };
export default function Page() { return <PlannerPanel />; }
