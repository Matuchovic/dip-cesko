import { notFound } from 'next/navigation';
import RotationHarness from '@/components/panels/RotationHarness';
import { serverEnv } from '@/server/env';
export default function Page() { if (!serverEnv.demo) notFound(); return <RotationHarness />; }
