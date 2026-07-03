/**
 * Admin Section Layout (jet.sygn.live/admin)
 * Super admin dashboard with full platform management
 */

'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { useSessionTimeout } from '@/hooks/useSessionTimeout';
import SessionTimeoutWarning from '@/components/SessionTimeoutWarning';
import { useAuth } from '@/contexts/AuthContext';
import { getAccessToken, clearSession } from '@/lib/auth';
import {
  LayoutDashboard,
  Users,
  Shield,
  FileText,
  Brain,
  Settings,
  BarChart3,
  LogOut,
  Menu,
  X,
  Bot,
  Search,
  Bell,
  DollarSign,
  MessageSquare,
  Lock,
  Eye,
  Crown,
  ShoppingCart,
  Send,
  Monitor,
  Sparkles,
  Radio,
  Film,
  Share2,
} from 'lucide-react';

// Navigation items with role-based access control (S1-3)
// requiredRoles: if omitted, visible to all authenticated admins
interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  exact?: boolean;
  requiredRoles?: string[];
}

// Role groupings — kept here so the admin shell mirrors backend/src/lib/roles.ts.
const EDITORIAL_ROLES = ['CONTRIBUTOR', 'JOURNALIST', 'EDITOR', 'CEO'] as const;
const PLATFORM_ADMINS = ['ADMIN', 'CONTENT_ADMIN', 'MARKETING_ADMIN', 'TECH_ADMIN', 'SUPER_ADMIN'] as const;
const CONTENT_ROLES = ['JOURNALIST', 'EDITOR', 'CEO', 'CONTENT_ADMIN', 'ADMIN', 'SUPER_ADMIN'];
const MARKETING_ROLES = ['EDITOR', 'CEO', 'MARKETING_ADMIN', 'CONTENT_ADMIN', 'ADMIN', 'SUPER_ADMIN'];
const TECH_ROLES = ['TECH_ADMIN', 'ADMIN', 'SUPER_ADMIN', 'CEO'];

const navItems: NavItem[] = [
  { href: '/admin', label: 'Dashboard', icon: LayoutDashboard, exact: true },
  { href: '/admin/users', label: 'User Management', icon: Users, requiredRoles: ['SUPER_ADMIN', 'ADMIN', 'CEO'] },
  { href: '/admin/content', label: 'Content', icon: FileText, requiredRoles: CONTENT_ROLES },
  { href: '/admin/editorial-pipeline', label: 'Editorial Pipeline', icon: Sparkles, requiredRoles: CONTENT_ROLES },
  { href: '/admin/videos', label: 'Video Pipeline', icon: Film, requiredRoles: CONTENT_ROLES },
  { href: '/admin/distribution', label: 'Distribution', icon: Share2, requiredRoles: CONTENT_ROLES },
  { href: '/admin/gov-alerts', label: 'Gov Wire', icon: Radio, requiredRoles: CONTENT_ROLES },
  { href: '/admin/marquees', label: 'Marquee', icon: Monitor, requiredRoles: CONTENT_ROLES },
  { href: '/admin/moderation/emergency', label: 'Emergency Moderation', icon: Shield, requiredRoles: ['EDITOR', 'CEO', 'CONTENT_ADMIN', 'ADMIN', 'SUPER_ADMIN'] },
  { href: '/admin/ai', label: 'AI Management', icon: Brain, requiredRoles: [...CONTENT_ROLES, 'TECH_ADMIN'] },
  { href: '/admin/analytics', label: 'Analytics', icon: BarChart3, requiredRoles: [...CONTENT_ROLES, 'MARKETING_ADMIN'] },
  { href: '/admin/monetization', label: 'Monetization', icon: DollarSign, requiredRoles: ['CEO', ...MARKETING_ROLES] },
  { href: '/admin/community', label: 'Community', icon: MessageSquare, requiredRoles: MARKETING_ROLES },
  { href: '/admin/seo', label: 'SEO', icon: Search, requiredRoles: MARKETING_ROLES },
  { href: '/admin/distribution', label: 'Distribution', icon: Send, requiredRoles: MARKETING_ROLES },
  { href: '/admin/ecommerce', label: 'E-commerce', icon: ShoppingCart, requiredRoles: ['SUPER_ADMIN', 'ADMIN', 'CEO', 'MARKETING_ADMIN'] },
  { href: '/admin/compliance', label: 'Compliance', icon: Shield, requiredRoles: ['SUPER_ADMIN', 'ADMIN', 'CEO'] },
  { href: '/admin/security', label: 'Security', icon: Lock, requiredRoles: TECH_ROLES },
  { href: '/admin/audit', label: 'Audit Logs', icon: Eye, requiredRoles: ['SUPER_ADMIN', 'ADMIN', 'CEO'] },
  { href: '/admin/system', label: 'System Health', icon: Monitor, requiredRoles: TECH_ROLES },
  { href: '/admin/settings', label: 'Settings', icon: Settings, requiredRoles: ['SUPER_ADMIN', 'ADMIN', 'CEO'] },
  { href: '/admin/settings/pipeline', label: 'Pipeline Settings', icon: Sparkles, requiredRoles: ['EDITOR', 'CEO', 'CONTENT_ADMIN', 'ADMIN', 'SUPER_ADMIN'] },
  { href: '/admin/settings/setup-checklist', label: 'Setup Checklist', icon: Settings, requiredRoles: ['CEO', 'ADMIN', 'SUPER_ADMIN'] },
  { href: '/admin/finance', label: 'CFIS Finance', icon: DollarSign, requiredRoles: ['SUPER_ADMIN', 'ADMIN', 'CEO'] },
  { href: '/admin/fraud-alerts', label: 'Fraud Alerts', icon: Shield, requiredRoles: TECH_ROLES },
];

/** Filter nav items based on user role */
function getVisibleNavItems(role: string | undefined): NavItem[] {
  if (!role) return [];
  return navItems.filter(item => {
    if (!item.requiredRoles) return true; // No restriction = visible to all
    return item.requiredRoles.includes(role);
  });
}

export default function AdminSectionLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [admin, setAdmin] = useState<{ name: string; email: string; role: string } | null>(null);
  const router = useRouter();
  const pathname = usePathname();
  const { logout: authLogout } = useAuth();
  const isAdminLoginRoute = pathname === '/admin/login' || pathname === '/admin/login/';

  useEffect(() => {
    const checkAuth = async () => {
      // Skip auth check for the CEO login page
      if (isAdminLoginRoute) {
        setIsAuthenticated(true);
        setLoading(false);
        return;
      }

      try {
        const token = getAccessToken();
        if (!token) {
          router.push('/login');
          return;
        }

        // Verify token by querying current user via GraphQL
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 10000);
        try {
          const response = await fetch('/graphql', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ query: '{ me { success user { id email role } } }' }),
            signal: controller.signal
          });
          clearTimeout(timer);

          if (response.ok) {
            const data = await response.json();
            const user = data.data?.me?.user;
            if (user) {
              setAdmin({ name: user.email, email: user.email, role: user.role });
              setIsAuthenticated(true);
            } else {
              clearSession();
              authLogout();
              router.push('/login');
            }
          } else {
            clearSession();
            authLogout();
            router.push('/login');
          }
        } catch (fetchErr) {
          clearTimeout(timer);
          // Backend unreachable — deny access, never auto-grant
          console.error('Auth verification failed: backend unreachable');
          clearSession();
          authLogout();
          router.push('/login');
        }
      } catch (error) {
        // Auth check failed — deny access
        console.error('Auth check error:', error);
        clearSession();
        authLogout();
        router.push('/login');
      } finally {
        setLoading(false);
      }
    };
    checkAuth();
  }, [router, pathname, isAdminLoginRoute]);

  const handleLogout = useCallback(() => {
    const role = admin?.role;
    clearSession();
    authLogout();
    if (role === 'SUPER_ADMIN' || role === 'CEO') {
      router.push('/auth/sadmin');
    } else {
      router.push('/login');
    }
  }, [router, authLogout, admin?.role]);

  // Session timeout warning (SPEC-ADM-2) + auto-refresh on 401 (SPEC-ADM-1)
  const { showWarning, secondsRemaining, extendSession, isRefreshing } = useSessionTimeout({
    onLogout: handleLogout,
    enabled: isAuthenticated && !isAdminLoginRoute,
  });

  if (isAdminLoginRoute) {
    return <>{children}</>;
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-dark-950 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-red-500"></div>
      </div>
    );
  }

  if (!isAuthenticated) return null;

  return (
    <div className="min-h-screen bg-dark-950">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 h-16 bg-dark-900 border-b border-dark-700 flex items-center justify-between px-4">
        <div className="flex items-center gap-4">
          <button onClick={() => setSidebarOpen(!sidebarOpen)} className="hidden lg:flex p-2 text-dark-400 hover:text-white hover:bg-dark-800 rounded-lg">
            <Menu className="w-5 h-5" />
          </button>
          <button onClick={() => setMobileSidebarOpen(!mobileSidebarOpen)} className="lg:hidden p-2 text-dark-400 hover:text-white">
            {mobileSidebarOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
          <Link href="/admin" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-red-500 flex items-center justify-center">
              <Shield className="w-5 h-5 text-white" />
            </div>
            <span className="text-xl font-bold text-white hidden sm:inline">CoinDaily <span className="text-red-500">Admin</span></span>
          </Link>
        </div>
        <div className="flex items-center gap-2">
          <button className="p-2 text-dark-400 hover:text-white hover:bg-dark-800 rounded-lg relative">
            <Bell className="w-5 h-5" />
            <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full"></span>
          </button>
          <div className="hidden sm:flex items-center gap-3 px-3 py-1.5 bg-dark-800 rounded-lg">
            <div className="w-8 h-8 rounded-full bg-red-500/20 flex items-center justify-center">
              <Crown className="w-4 h-4 text-red-500" />
            </div>
            <div>
              <p className="text-sm font-medium text-white">{admin?.name}</p>
              <p className="text-xs text-dark-400">{admin?.role}</p>
            </div>
          </div>
          <button onClick={handleLogout} className="p-2 text-dark-400 hover:text-red-500 hover:bg-red-500/10 rounded-lg">
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* Sidebar */}
      <aside className={`fixed top-16 left-0 z-40 h-[calc(100vh-4rem)] bg-dark-900 border-r border-dark-700 transition-all duration-300 overflow-y-auto ${sidebarOpen ? 'w-64' : 'w-16'} ${mobileSidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}>
        <nav className="p-3 space-y-1">
          {getVisibleNavItems(admin?.role).map((item) => {
            const isActive = item.exact ? pathname === item.href : pathname.startsWith(item.href);
            const Icon = item.icon;
            return (
              <Link key={item.href} href={item.href} onClick={() => setMobileSidebarOpen(false)}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${isActive ? 'bg-red-500/10 text-red-500' : 'text-dark-300 hover:text-white hover:bg-dark-800'}`}
                title={!sidebarOpen ? item.label : undefined}>
                <Icon className="w-5 h-5 flex-shrink-0" />
                {sidebarOpen && <span>{item.label}</span>}
              </Link>
            );
          })}
        </nav>
        {sidebarOpen && admin?.role === 'SUPER_ADMIN' && (
          <div className="absolute bottom-0 left-0 right-0 p-3 border-t border-dark-700">
            <Link href="/admin/CEO" className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium bg-gradient-to-r from-yellow-500/10 to-orange-500/10 text-yellow-500 hover:from-yellow-500/20 hover:to-orange-500/20">
              <Crown className="w-5 h-5" />CEO Portal
            </Link>
          </div>
        )}
      </aside>

      {mobileSidebarOpen && <div className="fixed inset-0 bg-black/50 z-30 lg:hidden" onClick={() => setMobileSidebarOpen(false)} />}

      {/* Main Content */}
      <main className={`pt-16 min-h-screen transition-all duration-300 ${sidebarOpen ? 'lg:ml-64' : 'lg:ml-16'}`}>
        <div className="p-6">{children}</div>
      </main>

      {/* Session timeout warning (SPEC-ADM-2) */}
      {showWarning && (
        <SessionTimeoutWarning
          secondsRemaining={secondsRemaining}
          onExtend={extendSession}
          isRefreshing={isRefreshing}
        />
      )}
    </div>
  );
}
