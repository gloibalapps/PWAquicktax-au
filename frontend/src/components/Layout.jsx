import React, { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import {
  LayoutDashboard, TrendingUp, Receipt, FileText,
  Building2, Settings, LogOut, Sun, Moon, Menu, X,
  ChevronRight, Crown
} from 'lucide-react';

const navItems = [
  { path: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { path: '/income', icon: TrendingUp, label: 'Income' },
  { path: '/expenses', icon: Receipt, label: 'Expenses' },
  { path: '/bas', icon: FileText, label: 'BAS Statement' },
  { path: '/properties', icon: Building2, label: 'Properties', premium: true },
  { path: '/settings', icon: Settings, label: 'Settings' },
];

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const { isDark, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const handleLogout = async () => {
    await logout();
    navigate('/');
  };

  const isPremium = user?.subscription_tier === 'premium';

  return (
    <div className="min-h-screen bg-background flex">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed inset-y-0 left-0 z-50 w-64 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800
        flex flex-col transition-transform duration-300
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
        lg:translate-x-0 lg:static lg:z-auto
      `}>
        {/* Logo */}
        <div className="flex items-center justify-between px-6 h-16 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
              <FileText className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold text-slate-900 dark:text-white" style={{ fontFamily: 'Outfit, sans-serif' }}>
              TaxTrack AU
            </span>
          </div>
          <button className="lg:hidden text-slate-500" onClick={() => setSidebarOpen(false)}>
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 overflow-y-auto">
          <div className="space-y-0.5">
            {navItems.map(item => (
              <NavLink
                key={item.path}
                to={item.path}
                data-testid={`nav-${item.label.toLowerCase().replace(' ', '-')}`}
                onClick={() => setSidebarOpen(false)}
                className={({ isActive }) =>
                  `sidebar-link flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg text-sm font-medium
                  ${isActive
                    ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white'
                  }`
                }
              >
                <div className="flex items-center gap-3">
                  <item.icon className="w-4.5 h-4.5 flex-shrink-0" style={{ width: '18px', height: '18px' }} />
                  <span>{item.label}</span>
                </div>
                {item.premium && !isPremium && (
                  <span className="text-xs bg-amber-100 dark:bg-amber-900/50 text-amber-600 dark:text-amber-400 px-1.5 py-0.5 rounded font-semibold">
                    PRO
                  </span>
                )}
                {item.premium && isPremium && (
                  <Crown className="w-3.5 h-3.5 text-amber-500" />
                )}
              </NavLink>
            ))}
          </div>
        </nav>

        {/* User section */}
        <div className="px-3 py-4 border-t border-slate-200 dark:border-slate-800 space-y-1">
          {user && (
            <div className="flex items-center gap-3 px-3 py-2 mb-2">
              {user.picture ? (
                <img src={user.picture} alt={user.name} className="w-8 h-8 rounded-full" />
              ) : (
                <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-white text-sm font-bold">
                  {user.name?.[0]?.toUpperCase()}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-slate-900 dark:text-white truncate">{user.name}</div>
                <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                  {isPremium ? (
                    <span className="text-amber-500 font-medium flex items-center gap-1">
                      <Crown className="w-3 h-3" /> Premium
                    </span>
                  ) : 'Free Plan'}
                </div>
              </div>
            </div>
          )}
          <button
            data-testid="theme-toggle"
            onClick={toggleTheme}
            className="sidebar-link flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white w-full"
          >
            {isDark ? <Sun className="w-4.5 h-4.5" style={{ width: '18px', height: '18px' }} /> : <Moon className="w-4.5 h-4.5" style={{ width: '18px', height: '18px' }} />}
            <span>{isDark ? 'Light Mode' : 'Dark Mode'}</span>
          </button>
          <button
            data-testid="logout-btn"
            onClick={handleLogout}
            className="sidebar-link flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 w-full"
          >
            <LogOut className="flex-shrink-0" style={{ width: '18px', height: '18px' }} />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 lg:ml-0">
        {/* Top bar (mobile) */}
        <header className="sticky top-0 z-30 lg:hidden bg-white/90 dark:bg-slate-900/90 backdrop-blur border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-3 px-4 h-14">
            <button
              data-testid="mobile-menu-btn"
              onClick={() => setSidebarOpen(true)}
              className="text-slate-600 dark:text-slate-400"
            >
              <Menu className="w-5 h-5" />
            </button>
            <span className="font-bold text-slate-900 dark:text-white" style={{ fontFamily: 'Outfit, sans-serif' }}>
              TaxTrack AU
            </span>
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6 lg:p-8 fade-in">
          {children}
        </main>
      </div>
    </div>
  );
}
