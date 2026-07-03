import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { countryCodeToRoute } from '@/lib/geo';

/**
 * Next.js Middleware — Server-side route protection
 * 
 * Protects authenticated routes (/user/*, /dashboard/*) and premium content
 * by checking for auth token before rendering. Redirects to login if missing.
 */

// Routes that require authentication
const PROTECTED_ROUTES = [
  '/user',
  '/dashboard',
  '/settings',
  '/profile',
  '/wallet',
  '/notifications',
  '/subscriptions',
];

// Routes that should redirect authenticated users away (e.g., login page)
const AUTH_ROUTES = [
  '/auth/login',
  '/auth/register',
  '/login',
  '/register',
];

// Public routes that never need auth checks
const PUBLIC_ROUTES = [
  '/',
  '/about',
  '/contact',
  '/privacy',
  '/terms',
  '/api/',
  '/_next/',
  '/static/',
  '/favicon.ico',
  '/manifest.json',
  '/sw.js',
];

// P5.B2 — languages we serve per-locale routes for. Must match the SUPPORTED_LANGS
// set in /[country]/news/[slug] and /[country]/search pages.
const SUPPORTED_LANGS = new Set([
  'en', 'sw', 'fr', 'pt', 'ar', 'ha', 'ig', 'yo', 'zu', 'af', 'am', 'so', 'rw', 'es', 'ht', 'pcm',
]);

/** Resolve the reader's preferred language from cookie / Accept-Language / fallback. */
function detectLang(request: NextRequest): string {
  const cookieLang = request.cookies.get('lang')?.value;
  if (cookieLang && SUPPORTED_LANGS.has(cookieLang)) return cookieLang;

  const accept = request.headers.get('accept-language') || '';
  for (const part of accept.split(',')) {
    const code = part.split(';')[0].trim().slice(0, 2).toLowerCase();
    if (SUPPORTED_LANGS.has(code)) return code;
  }
  return 'en';
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // P5.B2 — bare /news/<slug> → /<lang>/news/<slug> for SEO canonicalisation.
  // Skip if the URL already begins with a known language prefix (handled by
  // [country]/news/[slug] page).
  const bareNewsMatch = pathname.match(/^\/news\/([^/]+)\/?$/);
  if (bareNewsMatch) {
    const lang = detectLang(request);
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = `/${lang}/news/${bareNewsMatch[1]}`;
    return NextResponse.redirect(redirectUrl, 301);
  }

  if (pathname === '/' || pathname === '/news') {
    const headerCountry =
      request.headers.get('x-vercel-ip-country') ||
      request.headers.get('cf-ipcountry') ||
      request.cookies.get('country')?.value ||
      'NG';
    const routeCountry = countryCodeToRoute(headerCountry);
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = `/${routeCountry}/news`;
    return NextResponse.redirect(redirectUrl);
  }

  const countryNewsMatch = pathname.match(/^\/([a-z]{2})\/news(?:\/|$)/i);
  if (countryNewsMatch) {
    const response = NextResponse.next();
    response.cookies.set('country', countryNewsMatch[1].toUpperCase(), {
      path: '/',
      maxAge: 60 * 60 * 24 * 365,
    });
    return response;
  }

  // Skip middleware for public/static/API routes
  if (PUBLIC_ROUTES.some(route => route !== '/' && pathname.startsWith(route))) {
    return NextResponse.next();
  }

  // Check for auth token in cookies or Authorization header
  const rawToken = request.cookies.get('authToken')?.value 
    || request.headers.get('authorization')?.replace('Bearer ', '');
  const authToken = (rawToken && rawToken !== 'null' && rawToken !== 'undefined') ? rawToken : null;

  const isProtectedRoute = PROTECTED_ROUTES.some(route => pathname.startsWith(route));
  const isAuthRoute = AUTH_ROUTES.some(route => pathname.startsWith(route));

  // Redirect unauthenticated users away from protected routes
  if (isProtectedRoute && !authToken) {
    const loginUrl = new URL('/auth/login', request.url);
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Redirect authenticated users away from login/register pages
  if (isAuthRoute && authToken) {
    return NextResponse.redirect(new URL('/user', request.url));
  }

  // Add security headers to all responses
  const response = NextResponse.next();
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'origin-when-cross-origin');

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public files (images, etc.)
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
