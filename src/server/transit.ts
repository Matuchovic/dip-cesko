import 'server-only';
import { serverEnv } from './env';
import { sharedCache } from './cache';
import { golemioBucket } from './rateLimit';
import { createPidProvider } from '@/providers/pid/provider';
import { createDemoProvider } from '@/providers/demo/provider';
import type { TransitProvider } from '@/providers/types';

const g = globalThis as unknown as { __transit?: TransitProvider };

/** Aktivní poskytovatel. Ukázková data jen při výslovném DEMO_DATA=1. */
export function transit(): TransitProvider {
  if (!g.__transit) g.__transit = serverEnv.demo ? createDemoProvider() : createPidProvider({ golemioKey: serverEnv.golemioKey, cache: sharedCache, bucket: golemioBucket });
  return g.__transit;
}
