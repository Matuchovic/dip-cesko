import { Suspense } from 'react';
import type { Metadata } from 'next';
import PlannerPanel from '@/components/panels/PlannerPanel';
export const metadata: Metadata = { title: 'Spojení' };
export default function Page() { return <Suspense fallback={<div className="skeleton" />}><PlannerPanel /></Suspense>; }
