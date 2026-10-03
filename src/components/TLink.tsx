'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { ComponentProps, MouseEvent } from 'react';
import { navigateWithTransition } from '@/lib/transitions';

/** Odkaz s plynulým přechodem; se zmáčknutou klávesou (nová karta) se chová jako běžný odkaz. */
export default function TLink({ href, onClick, ...rest }: ComponentProps<typeof Link> & { href: string }) {
  const router = useRouter();
  const handle = (e: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(e);
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    navigateWithTransition(() => router.push(href));
  };
  return <Link href={href} onClick={handle} {...rest} />;
}
