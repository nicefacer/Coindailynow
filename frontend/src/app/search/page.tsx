import type { Metadata } from 'next';
import { cookies, headers } from 'next/headers';
import { Header } from '@/components/landing';
import Footer from '@/components/footer/Footer';
import SearchClient from './SearchClient';

export const metadata: Metadata = {
  title: 'Search | CoinDaily Africa',
  description:
    'Search across articles, factsheets, regulations, and market data on CoinDaily Africa.',
  robots: { index: false }, // search results pages shouldn't be indexed
};

const SUPPORTED_LANGS = new Set([
  'en', 'sw', 'fr', 'pt', 'ar', 'ha', 'ig', 'yo', 'zu', 'af', 'am', 'so', 'rw', 'es', 'ht', 'pcm',
]);

/**
 * P5.A6 — figure out the reader's preferred language for the default
 * search filter. Resolution order:
 *   1. ?lang= in the URL (explicit)
 *   2. `lang` cookie (set by language switcher / middleware)
 *   3. Accept-Language header (best match against SUPPORTED_LANGS)
 *   4. 'en' as the last-resort default
 *
 * Reader can always switch to "all languages" in the SearchClient UI by
 * passing ?lang=any.
 */
function detectDefaultLang(urlLang?: string): string {
  if (urlLang && SUPPORTED_LANGS.has(urlLang)) return urlLang;
  if (urlLang === 'any') return 'any';

  const cookieStore = cookies();
  const cookieLang = cookieStore.get('lang')?.value;
  if (cookieLang && SUPPORTED_LANGS.has(cookieLang)) return cookieLang;

  const accept = headers().get('accept-language') || '';
  for (const part of accept.split(',')) {
    const code = part.split(';')[0].trim().slice(0, 2).toLowerCase();
    if (SUPPORTED_LANGS.has(code)) return code;
  }
  return 'en';
}

export default function SearchPage({
  searchParams,
}: {
  searchParams?: { q?: string; category?: string; country?: string; lang?: string; page?: string };
}) {
  const params = searchParams || {};
  const defaultLang = detectDefaultLang(params.lang);

  return (
    <div className="min-h-screen bg-[#0d1117] text-gray-100">
      <Header />
      <SearchClient
        initialQuery={params.q || ''}
        initialCategory={params.category || ''}
        initialCountry={params.country || ''}
        initialLang={defaultLang}
        initialPage={parseInt(params.page || '1') || 1}
      />
      <Footer />
    </div>
  );
}
