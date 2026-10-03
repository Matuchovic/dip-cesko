import type { Metadata } from 'next';
import FamilyPanel from '@/components/panels/FamilyPanel';
export const metadata: Metadata = { title: 'Rodičovská kontrola' };
export default function Page() { return <FamilyPanel />; }
