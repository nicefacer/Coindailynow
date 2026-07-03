/**
 * /<lang>/search — language-scoped search (P5.B1).
 *
 * The route param is named `country` to share the existing [country] dynamic
 * segment, but here we treat it as a language code. Locks the language filter
 * to the URL prefix so a reader on /sw/search only sees Swahili-language
 * results. They can escape into cross-language search via ?lang=any.
 */

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Header } from '@/components/landing';
import Footer from '@/components/footer/Footer';
import SearchClient from '../../search/SearchClient';

const SUPPORTED_LANGS = new Set([
  'en', 'sw', 'fr', 'pt', 'ar', 'ha', 'ig', 'yo', 'zu', 'af', 'am', 'so', 'rw', 'es', 'ht', 'pcm',
]);

interface PageProps {
  params: { country: string };
  searchParams?: { q?: string; category?: string; country?: string; lang?: string; page?: string };
}

export const metadata: Metadata = {
  title: 'Search | CoinDaily',
  description: 'Search across articles, factsheets, regulations, and market data on CoinDaily.',
  robots: { index: false },
};

export default function LangSearchPage({ params, searchParams }: PageProps) {
  const code = params.country?.toLowerCase();
  if (!SUPPORTED_LANGS.has(code)) notFound();
  const sp = searchParams || {};

  return (
    <div className="min-h-screen bg-[#0d1117] text-gray-100">
      <Header />
      <SearchClient
        initialQuery={sp.q || ''}
        initialCategory={sp.category || ''}
        initialCountry={sp.country || ''}
        initialLang={code}
        initialPage={parseInt(sp.page || '1') || 1}
      />
      <Footer />
    </div>
  );
}
