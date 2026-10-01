import type { Metadata } from 'next';
import SettingsPanel from '@/components/panels/SettingsPanel';
export const metadata: Metadata = { title: 'Nastavení' };
export default function Page() { return <SettingsPanel />; }
