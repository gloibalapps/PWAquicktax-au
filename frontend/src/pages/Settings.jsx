import React, { useState, useEffect } from 'react';
import Layout from '@/components/Layout';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { Crown, Sun, Moon, User, Building2, CheckCircle2, AlertCircle } from 'lucide-react';
import { Switch } from '@/components/ui/switch';

const API = process.env.REACT_APP_BACKEND_URL + '/api';

export default function Settings() {
  const { user, refreshUser } = useAuth();
  const { isDark, toggleTheme } = useTheme();
  const [profile, setProfile] = useState({ name: '', business_name: '', abn: '', gst_registered: false, industry: '' });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [paymentResult, setPaymentResult] = useState(null);

  useEffect(() => {
    if (user) {
      setProfile({
        name: user.name || '',
        business_name: user.business_name || '',
        abn: user.abn || '',
        gst_registered: user.gst_registered || false,
        industry: user.industry || '',
      });
    }
  }, [user]);

  // Check for Stripe redirect
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get('session_id');
    if (sessionId) {
      const checkPayment = async () => {
        try {
          const res = await fetch(`${API}/payments/status/${sessionId}`, { credentials: 'include' });
          if (res.ok) {
            const data = await res.json();
            if (data.is_paid) {
              setPaymentResult('success');
              await refreshUser();
            } else {
              setPaymentResult('pending');
            }
          }
        } catch {}
        // Clean up URL
        window.history.replaceState({}, '', '/settings');
      };
      checkPayment();
    }
  }, [refreshUser]);

  const handleSaveProfile = async () => {
    setSaving(true); setSaved(false); setError('');
    try {
      const res = await fetch(`${API}/users/profile`, {
        method: 'PUT', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(profile),
      });
      if (res.ok) {
        await refreshUser();
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      } else {
        const d = await res.json();
        setError(d.detail || 'Error saving profile');
      }
    } catch { setError('Network error'); }
    setSaving(false);
  };

  const handleUpgrade = async () => {
    setCheckoutLoading(true);
    try {
      const res = await fetch(`${API}/payments/checkout`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ origin_url: window.location.origin })
      });
      if (res.ok) {
        const data = await res.json();
        window.location.href = data.url;
      }
    } catch {}
    setCheckoutLoading(false);
  };

  const isPremium = user?.subscription_tier === 'premium';

  return (
    <Layout>
      <div className="max-w-2xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white" style={{ fontFamily: 'Outfit, sans-serif' }}>Settings</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Manage your account and preferences</p>
        </div>

        {paymentResult === 'success' && (
          <div data-testid="payment-success" className="mb-6 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl p-4 flex items-center gap-3">
            <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0" />
            <div>
              <div className="font-medium text-green-800 dark:text-green-200 text-sm">Payment successful!</div>
              <div className="text-xs text-green-700 dark:text-green-300">You now have access to Premium features including Property Tracking.</div>
            </div>
          </div>
        )}

        {/* Appearance */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-6 mb-6">
          <h2 className="font-semibold text-slate-900 dark:text-white mb-4" style={{ fontFamily: 'Outfit, sans-serif' }}>Appearance</h2>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {isDark ? <Moon className="w-5 h-5 text-slate-500" /> : <Sun className="w-5 h-5 text-amber-500" />}
              <div>
                <div className="text-sm font-medium text-slate-700 dark:text-slate-300">Dark Mode</div>
                <div className="text-xs text-slate-400">{isDark ? 'Dark theme active' : 'Light theme active'}</div>
              </div>
            </div>
            <Switch data-testid="dark-mode-toggle" checked={isDark} onCheckedChange={toggleTheme} />
          </div>
        </div>

        {/* Subscription */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-slate-900 dark:text-white" style={{ fontFamily: 'Outfit, sans-serif' }}>Subscription</h2>
            {isPremium && (
              <div data-testid="premium-badge" className="flex items-center gap-1.5 text-xs font-bold text-amber-600 bg-amber-100 dark:bg-amber-900/30 px-2.5 py-1 rounded-full">
                <Crown className="w-3.5 h-3.5" /> PREMIUM
              </div>
            )}
          </div>
          {isPremium ? (
            <div>
              <p className="text-sm text-slate-600 dark:text-slate-400 mb-2">
                You have access to all Premium features including Property Tracking.
              </p>
              <div className="grid grid-cols-2 gap-2 text-xs">
                {['Property tracking', 'Rental income management', 'Property expense categories', 'Priority support'].map(f => (
                  <div key={f} className="flex items-center gap-1.5 text-slate-600 dark:text-slate-400">
                    <CheckCircle2 className="w-3.5 h-3.5 text-green-500 flex-shrink-0" /> {f}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div>
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
                Upgrade to Premium to unlock Property Tracking and more.
              </p>
              <button data-testid="upgrade-btn" onClick={handleUpgrade} disabled={checkoutLoading}
                className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg px-5 py-2.5 text-sm font-medium shadow-sm transition-colors disabled:opacity-50">
                <Crown className="w-4 h-4" />
                {checkoutLoading ? 'Redirecting...' : 'Upgrade to Premium — $19.99/month'}
              </button>
              <p className="text-xs text-slate-400 mt-2">Secure payment via Stripe. Cancel anytime.</p>
            </div>
          )}
        </div>

        {/* Profile */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-6 mb-6">
          <h2 className="font-semibold text-slate-900 dark:text-white mb-4" style={{ fontFamily: 'Outfit, sans-serif' }}>Business Profile</h2>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Display Name</label>
                <input data-testid="settings-name" value={profile.name} onChange={e => setProfile(p => ({ ...p, name: e.target.value }))}
                  className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Business Name</label>
                <input data-testid="settings-business-name" value={profile.business_name} onChange={e => setProfile(p => ({ ...p, business_name: e.target.value }))} placeholder="Your business name"
                  className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">ABN</label>
              <input data-testid="settings-abn" value={profile.abn} onChange={e => setProfile(p => ({ ...p, abn: e.target.value.replace(/\D/g, '').slice(0, 11) }))} placeholder="11-digit ABN"
                className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800 rounded-lg">
              <div>
                <div className="text-sm font-medium text-slate-700 dark:text-slate-300">GST Registered</div>
                <div className="text-xs text-slate-400">Required if annual turnover ≥ $75,000 (ATO)</div>
              </div>
              <Switch data-testid="settings-gst-toggle" checked={profile.gst_registered} onCheckedChange={v => setProfile(p => ({ ...p, gst_registered: v }))} />
            </div>
            {error && <p className="text-sm text-red-500">{error}</p>}
            {saved && (
              <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
                <CheckCircle2 className="w-4 h-4" /> Profile saved successfully
              </div>
            )}
            <button data-testid="save-profile-btn" onClick={handleSaveProfile} disabled={saving}
              className="bg-blue-600 hover:bg-blue-700 text-white rounded-lg px-5 py-2.5 text-sm font-medium transition-colors disabled:opacity-50 shadow-sm">
              {saving ? 'Saving...' : 'Save Profile'}
            </button>
          </div>
        </div>

        {/* Account info */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-6">
          <h2 className="font-semibold text-slate-900 dark:text-white mb-4" style={{ fontFamily: 'Outfit, sans-serif' }}>Account</h2>
          <div className="flex items-center gap-3">
            {user?.picture ? (
              <img src={user.picture} alt={user.name} className="w-10 h-10 rounded-full" />
            ) : (
              <div className="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center text-white font-bold">
                {user?.name?.[0]?.toUpperCase()}
              </div>
            )}
            <div>
              <div data-testid="account-name" className="font-medium text-slate-900 dark:text-white">{user?.name}</div>
              <div data-testid="account-email" className="text-sm text-slate-500 dark:text-slate-400">{user?.email}</div>
            </div>
          </div>
          <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg text-xs text-blue-700 dark:text-blue-300">
            <strong>ATO Note:</strong> Information in TaxTrack AU is for your records only. Always consult a registered tax agent for official lodgements. Visit <a href="https://www.ato.gov.au" target="_blank" rel="noopener noreferrer" className="underline font-medium">ato.gov.au</a> for official guidance.
          </div>
        </div>
      </div>
    </Layout>
  );
}
