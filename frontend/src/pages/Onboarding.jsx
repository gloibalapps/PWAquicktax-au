import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Building2, Briefcase, Users, ChevronRight, ChevronLeft, Check, Info } from 'lucide-react';

const API = process.env.REACT_APP_BACKEND_URL + '/api';

const BUSINESS_TYPES = [
  { id: 'sole_trader', label: 'Sole Trader', icon: Briefcase, desc: 'You run the business as an individual' },
  { id: 'contractor', label: 'Contractor/Freelancer', icon: Users, desc: 'You provide services to clients' },
  { id: 'small_business', label: 'Small Business', icon: Building2, desc: 'You have a registered business entity' },
];

const INDUSTRIES = [
  'Accounting & Finance', 'Agriculture', 'Construction', 'Consulting', 'Design & Creative',
  'Education', 'Engineering', 'Healthcare', 'Hospitality', 'IT & Technology',
  'Legal', 'Manufacturing', 'Marketing', 'Property', 'Retail', 'Transport', 'Other',
];

export default function Onboarding() {
  const [step, setStep] = useState(1);
  const totalSteps = 3;
  const [form, setForm] = useState({
    business_type: '',
    business_name: '',
    abn: '',
    gst_registered: false,
    industry: '',
    business_start_date: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { user, refreshUser } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (user?.onboarding_complete) navigate('/dashboard');
  }, [user, navigate]);

  const handleSubmit = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API}/onboarding`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(form),
      });
      if (res.ok) {
        await refreshUser();
        navigate('/dashboard');
      } else {
        const data = await res.json();
        setError(data.detail || 'Error saving onboarding data');
      }
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const canNext = () => {
    if (step === 1) return !!form.business_type;
    if (step === 2) return !!form.business_name;
    return true;
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        {/* Progress */}
        <div className="mb-8">
          <div className="flex justify-between text-xs text-slate-500 mb-2">
            <span>Step {step} of {totalSteps}</span>
            <span>{Math.round((step / totalSteps) * 100)}% complete</span>
          </div>
          <div className="h-2 bg-slate-200 dark:bg-slate-700 rounded-full">
            <div
              className="h-full bg-blue-600 rounded-full transition-all duration-500"
              style={{ width: `${(step / totalSteps) * 100}%` }}
            />
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 p-8 fade-in">
          {/* Step 1: Business Type */}
          {step === 1 && (
            <div>
              <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-2" style={{ fontFamily: 'Outfit, sans-serif' }}>
                What type of business are you?
              </h1>
              <p className="text-slate-500 dark:text-slate-400 text-sm mb-6">
                This helps us tailor your BAS statements and tax calculations to ATO requirements.
              </p>
              <div className="space-y-3">
                {BUSINESS_TYPES.map(bt => (
                  <button
                    key={bt.id}
                    data-testid={`business-type-${bt.id}`}
                    onClick={() => setForm(f => ({ ...f, business_type: bt.id }))}
                    className={`w-full flex items-center gap-4 p-4 rounded-xl border-2 transition-all ${
                      form.business_type === bt.id
                        ? 'border-blue-600 bg-blue-50 dark:bg-blue-900/30'
                        : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
                    }`}
                  >
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                      form.business_type === bt.id ? 'bg-blue-600' : 'bg-slate-100 dark:bg-slate-800'
                    }`}>
                      <bt.icon className={`w-5 h-5 ${form.business_type === bt.id ? 'text-white' : 'text-slate-500 dark:text-slate-400'}`} />
                    </div>
                    <div className="text-left">
                      <div className="font-medium text-slate-900 dark:text-white">{bt.label}</div>
                      <div className="text-sm text-slate-500 dark:text-slate-400">{bt.desc}</div>
                    </div>
                    {form.business_type === bt.id && (
                      <Check className="w-5 h-5 text-blue-600 ml-auto" />
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Step 2: Business Details */}
          {step === 2 && (
            <div>
              <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-2" style={{ fontFamily: 'Outfit, sans-serif' }}>
                Tell us about your business
              </h1>
              <p className="text-slate-500 dark:text-slate-400 text-sm mb-6">
                Your ABN and business details help generate accurate BAS statements.
              </p>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    Business / Trading Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    data-testid="business-name-input"
                    type="text"
                    value={form.business_name}
                    onChange={e => setForm(f => ({ ...f, business_name: e.target.value }))}
                    placeholder="e.g. John Smith Consulting"
                    className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2.5 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    ABN (Australian Business Number)
                  </label>
                  <input
                    data-testid="abn-input"
                    type="text"
                    value={form.abn}
                    onChange={e => setForm(f => ({ ...f, abn: e.target.value.replace(/\D/g, '').slice(0, 11) }))}
                    placeholder="11 digit ABN (e.g. 12345678901)"
                    className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2.5 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <p className="text-xs text-slate-400 mt-1">Register at <a href="https://abr.business.gov.au" target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">abr.business.gov.au</a> if you haven't already</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Industry</label>
                  <select
                    data-testid="industry-select"
                    value={form.industry}
                    onChange={e => setForm(f => ({ ...f, industry: e.target.value }))}
                    className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2.5 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Select your industry</option>
                    {INDUSTRIES.map(i => <option key={i} value={i}>{i}</option>)}
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* Step 3: GST & Tax */}
          {step === 3 && (
            <div>
              <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-2" style={{ fontFamily: 'Outfit, sans-serif' }}>
                GST Registration
              </h1>
              <p className="text-slate-500 dark:text-slate-400 text-sm mb-6">
                You must register for GST if your annual turnover is $75,000 or more (ATO requirement).
              </p>
              <div className="space-y-4">
                <div className="flex items-start gap-4 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl">
                  <Info className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
                  <div className="text-sm text-blue-800 dark:text-blue-200">
                    <strong>ATO GST Threshold:</strong> If your gross income is $75,000+ per year, you must register for GST and charge 10% on taxable sales.
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">
                    Are you registered for GST?
                  </label>
                  <div className="flex gap-3">
                    {[{ val: true, label: 'Yes, registered' }, { val: false, label: 'No, not registered' }].map(opt => (
                      <button
                        key={String(opt.val)}
                        data-testid={`gst-${opt.val ? 'yes' : 'no'}`}
                        onClick={() => setForm(f => ({ ...f, gst_registered: opt.val }))}
                        className={`flex-1 py-3 rounded-xl border-2 text-sm font-medium transition-all ${
                          form.gst_registered === opt.val
                            ? 'border-blue-600 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                            : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-slate-300'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    Business Start Date
                  </label>
                  <input
                    data-testid="start-date-input"
                    type="date"
                    value={form.business_start_date}
                    onChange={e => setForm(f => ({ ...f, business_start_date: e.target.value }))}
                    className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2.5 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
            </div>
          )}

          {error && <p className="mt-4 text-sm text-red-500">{error}</p>}

          {/* Navigation */}
          <div className="flex justify-between mt-8">
            <button
              data-testid="onboarding-back"
              onClick={() => setStep(s => s - 1)}
              disabled={step === 1}
              className="flex items-center gap-2 px-4 py-2 text-sm text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft className="w-4 h-4" /> Back
            </button>
            {step < totalSteps ? (
              <button
                data-testid="onboarding-next"
                onClick={() => setStep(s => s + 1)}
                disabled={!canNext()}
                className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed shadow-sm"
              >
                Next <ChevronRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                data-testid="onboarding-submit"
                onClick={handleSubmit}
                disabled={loading}
                className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 shadow-sm"
              >
                {loading ? 'Saving...' : 'Complete Setup'}
                <Check className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        <p className="text-center text-xs text-slate-400 mt-4">
          You can update these details anytime in Settings
        </p>
      </div>
    </div>
  );
}
