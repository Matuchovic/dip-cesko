import type { Metadata } from 'next';
import FavoritesPanel from '@/components/panels/FavoritesPanel';
export const metadata: Metadata = { title: 'Oblíbené' };
export default function Page() { return <FavoritesPanel />; }
