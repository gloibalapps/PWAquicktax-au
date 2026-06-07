import React from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '@/contexts/ThemeContext';
import { Sun, Moon, FileText, TrendingUp, Calculator, Upload, Shield, Clock } from 'lucide-react';

// REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
const handleGoogleLogin = () => {
  const redirectUrl = window.location.origin + '/dashboard';
  window.location.href = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;
};

const features = [
  { icon: TrendingUp, title: 'Income & Expense Tracking', desc: 'Track all business income and expenses with ATO-compliant categories.' },
  { icon: Upload, title: 'Bank Statement Import', desc: 'Upload CSVs or PDFs from ANZ, CBA, Westpac, NAB and more. AI-powered parsing.' },
  { icon: FileText, title: 'BAS Statement Generator', desc: 'Auto-generate quarterly BAS statements ready for ATO lodgement.' },
  { icon: Calculator, title: 'Tax Estimates', desc: 'Real-time estimated tax liability based on your net profit.' },
  { icon: Clock, title: '7-Year History', desc: 'Access and manage all financial records for the past 7 financial years.' },
  { icon: Shield, title: 'Property Investment', desc: 'Track rental income, expenses and negative gearing (Premium).' },
];

export default function Landing() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const { isDark, toggleTheme } = useTheme();

  if (!loading && user) {
    navigate(user.onboarding_complete ? '/dashboard' : '/onboarding');
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Navbar */}
      <nav className="sticky top-0 z-50 backdrop-blur-xl bg-white/80 dark:bg-slate-950/80 border-b border-slate-200 dark:border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between h-16">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
              <FileText className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold text-lg text-slate-900 dark:text-white" style={{ fontFamily: 'Outfit, sans-serif' }}>
              TaxTrack AU
            </span>
          </div>
          <div className="flex items-center gap-3">
            <button
              data-testid="theme-toggle-landing"
              onClick={toggleTheme}
              className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              {isDark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </button>
            <button
              data-testid="login-btn-landing"
              onClick={handleGoogleLogin}
              className="bg-blue-600 hover:bg-blue-700 text-white rounded-lg px-5 py-2 font-medium text-sm transition-colors shadow-sm"
            >
              Sign in with Google
            </button>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <div
        className="relative py-24 sm:py-32 overflow-hidden"
        style={{
          backgroundImage: `linear-gradient(to right, rgba(30, 58, 138, 0.92), rgba(30, 58, 138, 0.6)), url('https://images.unsplash.com/photo-1758261785723-fce85a1b4871?crop=entropy&cs=srgb&fm=jpg&q=85&w=1920')`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl fade-in">
            <div className="inline-flex items-center gap-2 bg-blue-500/20 border border-blue-400/30 rounded-full px-4 py-1.5 mb-6">
              <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
              <span className="text-blue-200 text-xs font-semibold uppercase tracking-wider">ATO Compliant</span>
            </div>
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-white mb-6 leading-tight" style={{ fontFamily: 'Outfit, sans-serif' }}>
              Tax tracking made simple for Australian businesses
            </h1>
            <p className="text-lg text-blue-100 mb-8 leading-relaxed">
              Designed for sole traders, contractors and small businesses. Manage income, expenses,
              BAS statements and more — all in one place.
            </p>
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                data-testid="hero-login-btn"
                onClick={handleGoogleLogin}
                className="bg-white hover:bg-blue-50 text-blue-900 rounded-xl px-8 py-3.5 font-semibold text-base transition-colors shadow-lg"
              >
                Get Started Free
              </button>
              <button
                className="border border-white/40 text-white hover:bg-white/10 rounded-xl px-8 py-3.5 font-semibold text-base transition-colors"
                onClick={handleGoogleLogin}
              >
                View Demo
              </button>
            </div>
            <p className="text-blue-200 text-sm mt-4">No credit card required • Free for sole traders</p>
          </div>
        </div>
      </div>

      {/* Features */}
      <div className="py-20 bg-slate-50 dark:bg-slate-900">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-14">
            <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 dark:text-white mb-4" style={{ fontFamily: 'Outfit, sans-serif' }}>
              Everything you need for Australian tax compliance
            </h2>
            <p className="text-slate-500 dark:text-slate-400 text-lg max-w-2xl mx-auto">
              Built around ATO guidelines, designed for how Australian businesses actually work.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((f, i) => (
              <div
                key={f.title}
                data-testid={`feature-card-${i}`}
                className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-8 card-hover fade-in"
                style={{ animationDelay: `${i * 0.05}s` }}
              >
                <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/50 rounded-lg flex items-center justify-center mb-4">
                  <f.icon className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                </div>
                <h3 className="font-semibold text-slate-900 dark:text-white mb-2" style={{ fontFamily: 'Outfit, sans-serif' }}>
                  {f.title}
                </h3>
                <p className="text-slate-500 dark:text-slate-400 text-sm leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Pricing */}
      <div className="py-20 bg-white dark:bg-slate-950">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-14">
            <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 dark:text-white mb-4" style={{ fontFamily: 'Outfit, sans-serif' }}>
              Simple, transparent pricing
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-3xl mx-auto">
            <div className="border border-slate-200 dark:border-slate-700 rounded-2xl p-8">
              <div className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-2">Free</div>
              <div className="text-4xl font-bold text-slate-900 dark:text-white mb-1" style={{ fontFamily: 'Outfit, sans-serif' }}>$0</div>
              <div className="text-slate-500 text-sm mb-6">Forever free</div>
              <ul className="space-y-3 text-sm text-slate-600 dark:text-slate-300">
                {['Income & expense tracking', 'CSV & PDF bank import', 'BAS statement generator', '7-year history', 'Dark/light mode'].map(f => (
                  <li key={f} className="flex items-center gap-2">
                    <span className="text-green-500">✓</span> {f}
                  </li>
                ))}
              </ul>
              <button data-testid="free-cta" onClick={handleGoogleLogin}
                className="mt-6 w-full border border-blue-600 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-lg py-2.5 font-medium transition-colors">
                Get Started Free
              </button>
            </div>
            <div className="border-2 border-blue-600 rounded-2xl p-8 relative">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-blue-600 text-white text-xs font-bold px-3 py-1 rounded-full">POPULAR</div>
              <div className="text-sm font-semibold text-blue-600 uppercase tracking-wider mb-2">Premium</div>
              <div className="text-4xl font-bold text-slate-900 dark:text-white mb-1" style={{ fontFamily: 'Outfit, sans-serif' }}>$19.99</div>
              <div className="text-slate-500 text-sm mb-6">per month (AUD)</div>
              <ul className="space-y-3 text-sm text-slate-600 dark:text-slate-300">
                {['Everything in Free', 'Property investment tracking', 'Rental income management', 'Negative gearing calculator', 'Priority support'].map(f => (
                  <li key={f} className="flex items-center gap-2">
                    <span className="text-green-500">✓</span> {f}
                  </li>
                ))}
              </ul>
              <button data-testid="premium-cta" onClick={handleGoogleLogin}
                className="mt-6 w-full bg-blue-600 hover:bg-blue-700 text-white rounded-lg py-2.5 font-medium transition-colors shadow-sm">
                Start Premium
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 py-8">
        <div className="max-w-7xl mx-auto px-4 text-center text-sm text-slate-500">
          <p>TaxTrack AU — Built for Australian sole traders & small businesses</p>
          <p className="mt-1">Information based on ATO guidelines. Not financial advice.</p>
        </div>
      </footer>
    </div>
  );
}
