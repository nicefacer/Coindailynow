/**
 * /<code>/news — dual-purpose listing (P5.B3).
 *
 *   - language code (en, sw, fr, ...) → render per-language news listing
 *     by fetching /api/v1/search/by-language and showing each available
 *     article in that language.
 *   - country code (ng, ke, za, ...) → preserve legacy behaviour: forward
 *     to HomePage with country=<code>.
 */

import Link from 'next/link';
import { Metadata } from 'next';
import HomePage from '@/app/page';
import { Header } from '@/components/landing';
import Footer from '@/components/footer/Footer';

const SUPPORTED_LANGS = new Set([
  'en', 'sw', 'fr', 'pt', 'ar', 'ha', 'ig', 'yo', 'zu', 'af', 'am', 'so', 'rw', 'es', 'ht', 'pcm',
]);

const LANG_NAMES: Record<string, string> = {
  en: 'English', sw: 'Kiswahili', fr: 'Français', pt: 'Português', ar: 'العربية',
  ha: 'Hausa', ig: 'Igbo', yo: 'Yorùbá', zu: 'isiZulu', af: 'Afrikaans',
  am: 'አማርኛ', so: 'Soomaali', rw: 'Kinyarwanda', es: 'Español', ht: 'Kreyòl',
  pcm: 'Pidgin',
};

interface Hit {
  articleId: string;
  translationId: string | null;
  isOriginal: boolean;
  slug: string;
  title: string;
  excerpt: string;
  featuredImageUrl?: string | null;
  publishedAt?: string | null;
}

interface ListResponse {
  hits: Hit[];
  total: number;
  page: number;
  totalPages: number;
  language: string;
}

async function fetchLangList(lang: string, page: number): Promise<ListResponse | null> {
  const backendUrl =
    process.env.NEXT_PUBLIC_API_URL || process.env.BACKEND_URL || 'http://localhost:4000';
  try {
    const res = await fetch(
      `${backendUrl}/api/v1/search/by-language?lang=${encodeURIComponent(lang)}&page=${page}`,
      { next: { revalidate: 60 } },
    );
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: { params: { country: string } }): Promise<Metadata> {
  const code = params.country?.toLowerCase();
  if (!SUPPORTED_LANGS.has(code)) return {};
  const langName = LANG_NAMES[code] || code.toUpperCase();
  return {
    title: `${langName} news | CoinDaily`,
    description: `Latest crypto, AI, and finance news in ${langName}.`,
    alternates: {
      canonical: `https://sygn.live/${code}/news`,
      languages: Object.fromEntries(
        [...SUPPORTED_LANGS].map(l => [l, `https://sygn.live/${l}/news`]),
      ),
    },
  };
}

export default async function NewsListingPage({
  params,
  searchParams,
}: {
  params: { country: string };
  searchParams?: { lang?: string; page?: string };
}) {
  const code = params.country?.toLowerCase();

  // Language path → language-scoped listing
  if (SUPPORTED_LANGS.has(code)) {
    const page = Math.max(1, parseInt(searchParams?.page || '1', 10) || 1);
    const data = await fetchLangList(code, page);
    const langName = LANG_NAMES[code] || code.toUpperCase();

    return (
      <div className="min-h-screen bg-[#0d1117] text-gray-100">
        <Header />
        <main className="container mx-auto max-w-5xl px-4 py-8">
          <header className="mb-6 space-y-1">
            <p className="text-xs uppercase tracking-wide text-gray-400">{langName}</p>
            <h1 className="text-3xl font-bold">News in {langName}</h1>
            {data && (
              <p className="text-sm text-gray-400">
                {data.total} article{data.total === 1 ? '' : 's'} available
              </p>
            )}
          </header>

          {!data || data.hits.length === 0 ? (
            <div className="rounded-xl border border-gray-700 bg-gray-800/40 p-6 text-center text-sm text-gray-400">
              No articles in {langName} yet. Try{' '}
              <Link href="/en/news" className="text-indigo-400 underline">English</Link>{' '}
              or{' '}
              <Link href="/search" className="text-indigo-400 underline">search across all languages</Link>.
            </div>
          ) : (
            <ul className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {data.hits.map(h => (
                <li key={h.articleId} className="overflow-hidden rounded-xl border border-gray-800 bg-gray-900/40 transition hover:border-indigo-700/60">
                  <Link href={`/${code}/news/${h.slug}`} className="block">
                    {h.featuredImageUrl && (
                      <img src={h.featuredImageUrl} alt={h.title} className="aspect-video w-full object-cover" />
                    )}
                    <div className="p-4">
                      <div className="mb-1 flex items-center gap-2 text-[10px] uppercase tracking-wide text-gray-500">
                        {h.isOriginal ? (
                          <span className="rounded bg-indigo-900/50 px-1.5 py-0.5 text-indigo-300">native</span>
                        ) : (
                          <span className="rounded bg-gray-700/50 px-1.5 py-0.5 text-gray-300">translated</span>
                        )}
                        {h.publishedAt && <span>{new Date(h.publishedAt).toLocaleDateString()}</span>}
                      </div>
                      <h2 className="line-clamp-2 text-lg font-semibold text-gray-100">{h.title}</h2>
                      {h.excerpt && <p className="mt-1 line-clamp-3 text-sm text-gray-400">{h.excerpt}</p>}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}

          {data && data.totalPages > 1 && (
            <nav className="mt-8 flex items-center justify-center gap-2 text-sm">
              {data.page > 1 && (
                <Link href={`/${code}/news?page=${data.page - 1}`} className="rounded border border-gray-700 px-3 py-1 hover:bg-gray-800">
                  ← Prev
                </Link>
              )}
              <span className="text-gray-400">Page {data.page} of {data.totalPages}</span>
              {data.page < data.totalPages && (
                <Link href={`/${code}/news?page=${data.page + 1}`} className="rounded border border-gray-700 px-3 py-1 hover:bg-gray-800">
                  Next →
                </Link>
              )}
            </nav>
          )}
        </main>
        <Footer />
      </div>
    );
  }

  // Country path → legacy HomePage forward
  const query = searchParams || {};
  return HomePage({
    searchParams: {
      country: code,
      lang: query.lang,
    },
  } as any);
}
