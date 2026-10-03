import type { Metadata } from 'next';
import MetroPanel from '@/components/panels/MetroPanel';
export const metadata: Metadata = { title: 'Metro' };
export default function Page() { return <MetroPanel />; }
