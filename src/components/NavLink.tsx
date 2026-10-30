'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

export function NavLink({ href, className, children, ariaLabel, exact = false }: { href: string; className?: string; children: ReactNode; ariaLabel?: string; exact?: boolean }) {
  const path = usePathname();
  const active = path === href || (!exact && href !== '/home' && path.startsWith(href + '/'));
  return <Link href={href} className={className} aria-current={active ? 'page' : undefined} aria-label={ariaLabel}>{children}</Link>;
}
