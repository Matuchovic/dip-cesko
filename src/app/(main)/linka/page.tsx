import type { Metadata } from 'next';
import { Suspense } from 'react';
import LinePanel from '@/components/panels/LinePanel';
export const metadata: Metadata = { title: 'Linka' };
export default function Page() { return <Suspense fallback={<div className="skeleton" />}><LinePanel /></Suspense>; }
