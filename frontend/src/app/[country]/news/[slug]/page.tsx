/**
 * /<code>/news/<slug>  — language-aware (P5.B1) + country-aware (legacy)
 *
 * The route param `country` may be either a language code or a country code.
 *   - language code (en, sw, fr, ar, ha, ...) → render translated article via
 *     per-language ES index lookup.
 *   - country code (ng, ke, za, ...) → preserve legacy behavior: redirect to
 *     /news/<slug>?country=<normalized>.
 *   - anything else → 404.
 */

import { notFound, redirect } from 'next/navigation';
import { Metadata } from 'next';
import Link from 'next/link';
import { routeToCountryCode, countryCodeToRoute } from '@/lib/geo';

const SUPPORTED_LANGS = new Set([
  'en', 'sw', 'fr', 'pt', 'ar', 'ha', 'ig', 'yo', 'zu', 'af', 'am', 'so', 'rw', 'es', 'ht', 'pcm',
]);

const LANG_NAMES: Record<string, string> = {
  en: 'English', sw: 'Kiswahili', fr: 'Français', pt: 'Português', ar: 'العربية',
  ha: 'Hausa', ig: 'Igbo', yo: 'Yorùbá', zu: 'isiZulu', af: 'Afrikaans',
  am: 'አማርኛ', so: 'Soomaali', rw: 'Kinyarwanda', es: 'Español', ht: 'Kreyòl',
  pcm: 'Pidgin',
};

interface PageProps {
  params: { country: string; slug: string };
}

interface ArticlePayload {
  articleId: string;
  translationId: string | null;
  isOriginal: boolean;
  slug: string;
  title: string;
  excerpt: string;
  content: string;
  featuredImageUrl?: string | null;
  publishedAt?: string | null;
}

async function fetchArticleInLanguage(slug: string, lang: string): Promise<ArticlePayload | null> {
  const backendUrl =
    process.env.NEXT_PUBLIC_API_URL ||
    process.env.BACKEND_URL ||
    'http://localhost:4000';
  try {
    const res = await fetch(
      `${backendUrl}/api/v1/search/by-slug?slug=${encodeURIComponent(slug)}&lang=${encodeURIComponent(lang)}`,
      { next: { revalidate: 60 } },
    );
    if (!res.ok) return null;
    const data = await res.json();
    return data?.article ?? null;
  } catch {
    return null;
  }
}

/** Country-code path → legacy redirect; lets the existing /news/[slug] handle it. */
function tryCountryRedirect(country: string, slug: string): boolean {
  try {
    const normalizedCountry = countryCodeToRoute(routeToCountryCode(country));
    if (normalizedCountry && normalizedCountry !== country) {
      redirect(`/news/${slug}?country=${normalizedCountry}`);
    }
    // Same code returned — treat as a valid country route
    if (normalizedCountry) {
      redirect(`/news/${slug}?country=${normalizedCountry}`);
    }
  } catch {
    return false;
  }
  return false;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const code = params.country?.toLowerCase();
  const slug = params.slug;
  if (!SUPPORTED_LANGS.has(code)) return { title: 'Not found' };

  const article = await fetchArticleInLanguage(slug, code);
  if (!article) return { title: 'Article not found' };

  const siteUrl = 'https://sygn.live';
  const articleUrl = `${siteUrl}/${code}/news/${slug}`;

  const languages: Record<string, string> = {};
  for (const lc of SUPPORTED_LANGS) {
    languages[lc] = `${siteUrl}/${lc}/news/${slug}`;
  }

  return {
    title: `${article.title} | CoinDaily`,
    description: article.excerpt,
    alternates: { canonical: articleUrl, languages },
    openGraph: {
      type: 'article',
      title: article.title,
      description: article.excerpt,
      url: articleUrl,
      siteName: 'CoinDaily',
      locale: code,
      images: article.featuredImageUrl ? [{ url: article.featuredImageUrl, alt: article.title }] : [],
      publishedTime: article.publishedAt || undefined,
    },
    twitter: {
      card: 'summary_large_image',
      title: article.title,
      description: article.excerpt,
      images: article.featuredImageUrl ? [article.featuredImageUrl] : [],
      site: '@coindailyafrica',
    },
  };
}

export default async function CodedNewsPage({ params }: PageProps) {
  const code = params.country?.toLowerCase();
  const slug = params.slug;

  // 1. Language-coded path — render translated article
  if (SUPPORTED_LANGS.has(code)) {
    const article = await fetchArticleInLanguage(slug, code);
    if (!article) notFound();

    const showFallbackNotice = code !== 'en' && article.isOriginal;
    const langName = LANG_NAMES[code] || code.toUpperCase();

    return (
      <article className="container mx-auto max-w-3xl px-4 py-8">
        <header className="mb-6 space-y-2">
          <div className="text-xs uppercase tracking-wide text-gray-500">
            <Link href={`/${code}`} className="hover:text-indigo-600">{langName}</Link>
            <span className="mx-2">·</span>
            <Link href={`/${code}/news`} className="hover:text-indigo-600">News</Link>
          </div>
          <h1 className="text-3xl font-bold text-gray-900">{article.title}</h1>
          {article.publishedAt && (
            <p className="text-sm text-gray-500">{new Date(article.publishedAt).toLocaleDateString()}</p>
          )}
        </header>

        {showFallbackNotice && (
          <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            A translation in {langName} is not yet available. Showing the English original.
          </div>
        )}

        {article.featuredImageUrl && (
          <img src={article.featuredImageUrl} alt={article.title} className="mb-6 w-full rounded-xl" />
        )}

        <div
          className="prose prose-slate max-w-none"
          dangerouslySetInnerHTML={{ __html: simpleMarkdown(article.content) }}
        />

        <footer className="mt-10 border-t pt-6 text-xs text-gray-500">
          Available in other languages:{' '}
          {[...SUPPORTED_LANGS].filter(l => l !== code).map(l => (
            <Link key={l} href={`/${l}/news/${slug}`} className="mr-2 underline hover:text-indigo-600">
              {LANG_NAMES[l] || l}
            </Link>
          ))}
        </footer>
      </article>
    );
  }

  // 2. Country-coded path — preserve legacy behaviour
  tryCountryRedirect(code, slug);

  // 3. Unknown code
  notFound();
}

/**
 * Bare-bones markdown → HTML so we don't pull a renderer dep into this route.
 * Articles published by the AI pipeline use a small subset (headings, paragraphs,
 * bold, italic, images, links). Anything fancier falls through as plain.
 */
function simpleMarkdown(md: string): string {
  if (!md) return '';
  const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
  let out = esc(md);
  out = out.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" class="my-4 rounded-lg" />');
  out = out.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" class="text-indigo-600 underline">$1</a>');
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  out = out.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  out = out.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  out = out.replace(/^# (.+)$/gm, '<h1>$1</h1>');
  out = out.split(/\n{2,}/).map(p => p.startsWith('<') ? p : `<p>${p.replace(/\n/g, '<br/>')}</p>`).join('\n');
  return out;
}
