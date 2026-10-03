import type { Metadata } from 'next';
import LandmarksPanel from '@/components/panels/LandmarksPanel';
export const metadata: Metadata = { title: 'Památky' };
export default function Page() { return <LandmarksPanel />; }
