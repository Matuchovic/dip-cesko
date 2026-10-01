import type { Locale } from '../locales';
import { cs, type Messages } from './cs';
import { en } from './en';
import { de } from './de';
import { ar } from './ar';
import { es } from './es';
import { it } from './it';
import { uk } from './uk';

export const MESSAGES: Record<Locale, Messages> = { cs, en, de, ar, es, it, uk };
export type { MessageKey, Messages, P } from './cs';
