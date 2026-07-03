/**
 * PostHog Provider — wraps the app for client-side analytics
 * Initializes PostHog on mount and captures pageviews on route change.
 *
 * Next.js 14 requires any component using `useSearchParams()` to be wrapped
 * in <Suspense> — otherwise every page that mounts this provider opts out
 * of static prerendering. We isolate the search-params usage in a tiny
 * child component so the rest of the app keeps its static rendering.
 */
'use client';

import { Suspense, useEffect } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { initPostHog, posthog } from '@/lib/posthog';

function PostHogPageviewTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (!pathname) return;
    const url =
      window.origin + pathname + (searchParams?.toString() ? `?${searchParams.toString()}` : '');
    posthog.capture('$pageview', { $current_url: url });
  }, [pathname, searchParams]);

  return null;
}

export default function PostHogProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    initPostHog();
  }, []);

  return (
    <>
      <Suspense fallback={null}>
        <PostHogPageviewTracker />
      </Suspense>
      {children}
    </>
  );
}
