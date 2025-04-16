'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

interface NavigationLinkProps {
  href: string;
  className?: string;
  children: React.ReactNode;
}

/**
 * クエリパラメータを保持したまま遷移するナビゲーションリンク
 * 特に userId クエリパラメータを保持して遷移する
 */
export default function NavigationLink({ href, className, children }: NavigationLinkProps) {
  const searchParams = useSearchParams();
  const userId = searchParams.get('userId');

  // userId が存在する場合、指定された href に userId を付与する
  const finalHref = userId ? `${href}?userId=${userId}` : href;

  return (
    <Link href={finalHref} className={className}>
      {children}
    </Link>
  );
}
