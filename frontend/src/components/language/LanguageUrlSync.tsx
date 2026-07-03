'use client';

/**
 * LanguageUrlSync (P5.B4) — bridges the existing LanguageContext.setLanguage
 * dropdown to URL navigation, so picking a language from the header dropdown
 * also navigates to the /<lang>/... equivalent of the current page.
 *
 * Mounted ONCE near the root of the app (in layout.tsx). The actual hook
 * usage (which calls useSearchParams) is isolated inside a <Suspense>
 * boundary so it doesn't break static prerendering of pages elsewhere.
 *
 * On currentLanguage change:
 *   - If the path already has a /<lang>/... prefix → swap the prefix
 *   - If the path is /news/<slug> or /search (or a child of those) →
 *     prepend the new lang
 *   - Otherwise → no-op (other pages don't have lang-prefix variants yet)
 */

import { Suspense, useEffect, useRef } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useLanguage } from '@/contexts/LanguageContext';

const SUPPORTED_LANGS = new Set([
  'en', 'sw', 'fr', 'pt', 'ar', 'ha', 'ig', 'yo', 'zu', 'af', 'am', 'so', 'rw', 'es', 'ht', 'pcm',
]);

const LANG_AWARE_BARE_PREFIXES = ['/news', '/search'];

function LanguageUrlSyncInner() {
  const { currentLanguage } = useLanguage();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const previousLang = useRef<string | null>(null);

  useEffect(() => {
    if (previousLang.current === null) {
      previousLang.current = currentLanguage;
      return;
    }
    if (previousLang.current === currentLanguage) return;
    previousLang.current = currentLanguage;

    if (!currentLanguage || !SUPPORTED_LANGS.has(currentLanguage)) return;
    if (!pathname) return;

    const search = searchParams?.toString() ? `?${searchParams.toString()}` : '';
    const parts = pathname.split('/').filter(Boolean);

    if (parts[0] && SUPPORTED_LANGS.has(parts[0])) {
      if (parts[0] === currentLanguage) return;
      parts[0] = currentLanguage;
      router.push(`/${parts.join('/')}${search}`);
      return;
    }

    if (LANG_AWARE_BARE_PREFIXES.some(p => pathname === p || pathname.startsWith(`${p}/`))) {
      router.push(`/${currentLanguage}${pathname}${search}`);
      return;
    }
  }, [currentLanguage, pathname, searchParams, router]);

  return null;
}

export default function LanguageUrlSync() {
  return (
    <Suspense fallback={null}>
      <LanguageUrlSyncInner />
    </Suspense>
  );
}
