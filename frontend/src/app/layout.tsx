import type { Metadata, Viewport } from 'next';
import { Inter, Poppins, JetBrains_Mono } from 'next/font/google';
import './globals.css';
import { AuthProvider } from '../hooks/useAuth';
import { LanguageProvider } from '../contexts/LanguageContext';
import TrafficCopClient from '@/components/security/TrafficCopClient';
import CookieConsentBanner from '@/components/legal/CookieConsentBanner';
import AppInstallAndOfflinePrompt from '@/components/pwa/AppInstallAndOfflinePrompt';
import PostHogProvider from '@/components/providers/PostHogProvider';
import { GeoProvider } from '@/lib/GeoContext';
import LanguageUrlSync from '@/components/language/LanguageUrlSync';
import CriticalCSS from '@/components/performance/CriticalCSS';
import KeyboardShortcuts from '@/components/shortcuts/KeyboardShortcuts';
import { DensityProvider } from '@/components/ui/DensityToggle';

// Font configurations
const inter = Inter({ 
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

const poppins = Poppins({
  weight: ['300', '400', '500', '600', '700'],
  subsets: ['latin'],
  variable: '--font-poppins',
  display: 'swap',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains-mono',
  display: 'swap',
});

// SEO and PWA Metadata
export const metadata: Metadata = {
  metadataBase: new URL('https://sygn.live'),
  title: {
    default: 'CoinDaily Africa - Premier Cryptocurrency News Platform',
    template: '%s | CoinDaily Africa'
  },
  description: 'Africa\'s premier cryptocurrency and memecoin news platform with AI-driven content generation, real-time market data from African exchanges, and community features. Stay informed with the latest crypto news from Nigeria, Kenya, South Africa, and Ghana.',
  keywords: [
    'cryptocurrency', 
    'bitcoin', 
    'ethereum', 
    'crypto news', 
    'africa', 
    'blockchain', 
    'memecoin',
    'binance africa',
    'luno',
    'quidax',
    'nigerian crypto',
    'kenyan crypto',
    'south african crypto',
    'ghanaian crypto',
    'm-pesa crypto',
    'mobile money cryptocurrency'
  ],
  authors: [{ name: 'CoinDaily Africa Team', url: 'https://sygn.live' }],
  creator: 'CoinDaily Africa',
  publisher: 'CoinDaily Africa',
  applicationName: 'CoinDaily Africa',
  category: 'Finance',
  classification: 'Cryptocurrency News Platform',
  
  // Open Graph
  openGraph: {
    type: 'website',
    siteName: 'CoinDaily Africa',
    title: 'CoinDaily Africa - Premier Cryptocurrency News Platform',
    description: 'Africa\'s premier cryptocurrency news platform with real-time market data and AI-driven content',
    url: 'https://sygn.live',
    countryName: 'Nigeria',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'CoinDaily Africa - Cryptocurrency News Platform',
      }
    ],
    locale: 'en_US',
    alternateLocale: ['sw_KE', 'fr_SN', 'pt_AO', 'ar_EG'],
  },
  
  // Twitter
  twitter: {
    card: 'summary_large_image',
    site: '@coindailyafrica',
    creator: '@coindailyafrica',
    title: 'CoinDaily Africa - Premier Cryptocurrency News Platform',
    description: 'Africa\'s premier cryptocurrency news platform with real-time market data and AI-driven content',
    images: ['/twitter-image.png'],
  },
  
  alternates: {
    canonical: '/',
  },
  
  // PWA Configuration
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'CoinDaily Africa',
    startupImage: [
      {
        url: '/apple-splash-2048-2732.jpg',
        media: '(device-width: 1024px) and (device-height: 1366px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)',
      },
      {
        url: '/apple-splash-1668-2224.jpg',
        media: '(device-width: 834px) and (device-height: 1112px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)',
      },
      {
        url: '/apple-splash-1536-2048.jpg',
        media: '(device-width: 768px) and (device-height: 1024px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)',
      }
    ],
  },
  
  // Additional meta tags
  other: {
    'mobile-web-app-capable': 'yes',
    'apple-mobile-web-app-capable': 'yes',
    'apple-mobile-web-app-status-bar-style': 'default',
    'apple-mobile-web-app-title': 'CoinDaily',
    'msapplication-TileColor': '#f97316',
    'msapplication-config': '/browserconfig.xml',
    'theme-color': '#f97316',
  },
  
  // Robots and indexing
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  
  // Verification
  verification: {
    google: 'your-google-verification-code',
    yandex: 'your-yandex-verification-code',
  },
};

// Viewport configuration
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f97316' },
    { media: '(prefers-color-scheme: dark)', color: '#ea580c' },
  ],
  colorScheme: 'light dark',
  viewportFit: 'cover',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html 
      lang="en" 
      className={`${inter.variable} ${poppins.variable}`}
      suppressHydrationWarning
    >
      <head>
        <CriticalCSS pagePath="/" />
        {/* Preconnect to important domains for performance */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="preconnect" href="https://api.sygn.live" />
        
        {/* PWA Icons */}
        <link rel="icon" type="image/x-icon" href="/favicon.ico" />
        <link rel="icon" type="image/svg+xml" sizes="16x16" href="/icons/favicon-16x16.svg" />
        <link rel="icon" type="image/svg+xml" sizes="32x32" href="/icons/favicon-32x32.svg" />
        <link rel="apple-touch-icon" sizes="180x180" href="/icons/apple-icon-180.png" />
        <link rel="mask-icon" href="/icons/safari-pinned-tab.svg" color="#f97316" />
        
        {/* Microsoft Tile */}
        <meta name="msapplication-TileColor" content="#f97316" />
        <meta name="msapplication-TileImage" content="/icons/ms-icon-144x144.png" />
        
        {/* Performance hints */}
        <link rel="dns-prefetch" href="https://api.sygn.live" />
        <link rel="dns-prefetch" href="https://cdn.sygn.live" />
        
        {/* Structured data for search engines */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'WebSite',
              name: 'CoinDaily',
              alternateName: ['CoinDaily Africa', 'CoinDaily Online'],
              url: 'https://sygn.live',
              description: 'Africa\'s premier cryptocurrency news platform with AI-powered content in 15+ African languages',
              inLanguage: ['en', 'sw', 'ha', 'yo', 'am', 'zu', 'ig', 'af', 'so', 'rw', 'sn', 'lg', 'wo', 'om', 'ti'],
              isAccessibleForFree: true,
              publisher: {
                '@type': 'Organization',
                name: 'CoinDaily',
                url: 'https://sygn.live',
                logo: {
                  '@type': 'ImageObject',
                  url: 'https://sygn.live/images/logo.svg'
                },
                sameAs: [
                  'https://twitter.com/coindailyafrica',
                  'https://t.me/coindaily',
                  'https://www.facebook.com/coindailyafrica',
                  'https://www.linkedin.com/company/coindaily',
                  'https://www.youtube.com/@coindaily'
                ],
                contactPoint: {
                  '@type': 'ContactPoint',
                  contactType: 'customer support',
                  availableLanguage: ['English', 'Swahili', 'Hausa', 'Yoruba']
                }
              },
              potentialAction: {
                '@type': 'SearchAction',
                target: {
                  '@type': 'EntryPoint',
                  urlTemplate: 'https://sygn.live/search?q={search_term_string}'
                },
                'query-input': 'required name=search_term_string'
              }
            })
          }}
        />
      </head>
      <body 
        className={`${inter.className} ${jetbrainsMono.variable} font-sans antialiased bg-background text-neutral-900 selection:bg-primary-100 selection:text-primary-800`}
        suppressHydrationWarning
      >
        {/* Skip to main content for accessibility */}
        <a 
          href="#main-content" 
          className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 bg-primary-500 text-white px-3 py-2 rounded-md z-50 focus:outline-none focus:ring-2 focus:ring-primary-600"
        >
          Skip to main content
        </a>
        
        {/* Main app content */}
        <LanguageProvider>
          <GeoProvider>
            <AuthProvider>
              <PostHogProvider>
              <DensityProvider>
              {/* P5.B4 — bridges header language dropdown → URL navigation */}
              <LanguageUrlSync />
              <div id="main-content" role="main" className="min-h-screen">
                {children}
              </div>
              <AppInstallAndOfflinePrompt />
              <TrafficCopClient />
              <CookieConsentBanner position="bottom" theme="dark" showDeclineButton={true} />
              <KeyboardShortcuts />
              </DensityProvider>
              </PostHogProvider>
            </AuthProvider>
          </GeoProvider>
        </LanguageProvider>
        
        {/* Service Worker Registration (production only) */}
        {process.env.NODE_ENV === 'production' && (
          <script
            dangerouslySetInnerHTML={{
              __html: `
                if ('serviceWorker' in navigator && 'PushManager' in window) {
                  window.addEventListener('load', function() {
                    navigator.serviceWorker.register('/sw.js').then(function(registration) {
                      console.log('SW registered: ', registration);
                    }).catch(function(registrationError) {
                      console.log('SW registration failed: ', registrationError);
                    });
                  });
                }
              `
            }}
          />
        )}
        
        {/* Performance monitoring */}
        {process.env.NODE_ENV === 'production' && (
          <script
            dangerouslySetInnerHTML={{
              __html: `
                // Core Web Vitals monitoring
                function sendToAnalytics(metric) {
                  // Send to your analytics endpoint
                  console.log('Web Vital:', metric.name, metric.value);
                }
                
                if ('web-vitals' in window) {
                  import('web-vitals').then(({ getCLS, getFID, getFCP, getLCP, getTTFB }) => {
                    getCLS(sendToAnalytics);
                    getFID(sendToAnalytics);
                    getFCP(sendToAnalytics);
                    getLCP(sendToAnalytics);
                    getTTFB(sendToAnalytics);
                  });
                }
              `
            }}
          />
        )}
      </body>
    </html>
  );
}
