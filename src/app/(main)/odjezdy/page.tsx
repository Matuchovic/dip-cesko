import type { Metadata } from 'next';
import { Suspense } from 'react';
import DeparturesPanel from '@/components/panels/DeparturesPanel';
export const metadata: Metadata = { title: 'Odjezdy' };
export default function Page() { return <Suspense fallback={<div className="skeleton" />}><DeparturesPanel /></Suspense>; }
