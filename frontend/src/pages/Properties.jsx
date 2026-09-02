import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Layout from '@/components/Layout';
import { useAuth } from '@/contexts/AuthContext';
import {
  Crown, Plus, Pencil, Trash2, Building2, DollarSign, TrendingUp, TrendingDown,
  Check, ChevronRight, Home, Briefcase, BarChart3, Calculator, Info, Layers
} from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

const API = process.env.REACT_APP_BACKEND_URL + '/api';
const fmt = v => new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 }).format(v || 0);
const fmtDec = v => new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(v || 0);
const CURRENT_FY = (() => { const n = new Date(); return n.getMonth() >= 6 ? n.getFullYear() + 1 : n.getFullYear(); })();

const PROP_EMPTY = {
  address: '', property_type: 'residential', purchase_date: '', purchase_price: '',
  loan_amount: '', weekly_rent: '', construction_cost: '', construction_date: '',
  plant_equipment_value: '', depreciation_method: 'prime_cost', notes: ''
};
const TXN_EMPTY = {
  date: new Date().toISOString().slice(0, 10), description: '', amount: '',
  transaction_type: 'expense', category: 'Other', gst_included: false
};
const PROP_EXPENSE_CATS = ['Rates & Taxes', 'Insurance', 'Repairs & Maintenance', 'Property Management', 'Loan Interest', 'Depreciation', 'Cleaning', 'Other'];
const PROP_INCOME_CATS = ['Rental Income', 'Bond Refund', 'Insurance Claim', 'Other'];

// ─── Depreciation helpers (ATO Div 40 & Div 43) ─────────────────────────────
function calcDiv43(prop) {
  const cc = parseFloat(prop.construction_cost) || 0;
  const cd = prop.construction_date || prop.purchase_date;
  if (!cc || !cd) return { annual: 0, yearsRemaining: 0, cumulativeClaimed: 0, totalDeductible: cc * 40 * 0.025 };
  try {
    const buildDate = new Date(cd);
    const today = new Date();
    const yearsHeld = Math.max(0, (today - buildDate) / (365.25 * 24 * 60 * 60 * 1000));
    const yearsRemaining = Math.max(0, 40 - yearsHeld);
    const annual = cc * 0.025;
    const cumulativeClaimed = Math.min(yearsHeld, 40) * annual;
    return { annual, yearsRemaining, cumulativeClaimed, totalDeductible: cc * 40 * 0.025 };
  } catch {
    return { annual: cc * 0.025, yearsRemaining: 40, cumulativeClaimed: 0, totalDeductible: cc * 40 * 0.025 };
  }
}

function calcDiv40(prop) {
  const pev = parseFloat(prop.plant_equipment_value) || 0;
  if (!pev) return { annual: 0, note: '' };
  const method = prop.depreciation_method || 'prime_cost';
  // Default effective life: 10 years prime cost / 20% diminishing value
  const annual = method === 'prime_cost' ? pev / 10 : pev * 0.2;
  return { annual, note: method === 'prime_cost' ? '10yr effective life' : '20% DV rate' };
}

const PropTypeIcon = ({ type }) => {
  if (type === 'commercial') return <Briefcase className="w-4 h-4" />;
  if (type === 'industrial') return <Layers className="w-4 h-4" />;
  if (type === 'vacant_land') return <BarChart3 className="w-4 h-4" />;
  return <Home className="w-4 h-4" />;
};

// ─── Portfolio Summary Bar ───────────────────────────────────────────────────
function PortfolioSummary({ summary }) {
  if (!summary || summary.property_count === 0) return null;
  const grossYield = summary.total_portfolio_value > 0
    ? ((summary.annual_rental_income / summary.total_portfolio_value) * 100).toFixed(1)
    : '—';
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
      {[
        { label: 'Portfolio Value', value: fmt(summary.total_portfolio_value), sub: `${summary.property_count} propert${summary.property_count > 1 ? 'ies' : 'y'}`, color: 'blue' },
        { label: 'Total Equity', value: fmt(summary.total_equity), sub: summary.total_loans > 0 ? `Loans: ${fmt(summary.total_loans)}` : 'No recorded loans', color: 'green' },
        { label: 'Annual Rent', value: fmt(summary.annual_rental_income), sub: `Gross yield ${grossYield}%`, color: 'indigo' },
        { label: 'Depreciation (FY)', value: fmtDec(summary.total_div43_depreciation), sub: 'Div 43 estimate', color: 'purple' },
      ].map(({ label, value, sub, color }) => (
        <div key={label} className={`bg-${color}-50 dark:bg-${color}-900/20 border border-${color}-100 dark:border-${color}-800 rounded-xl p-4`}>
          <div className={`text-xs font-medium text-${color}-600 dark:text-${color}-400 uppercase tracking-wider mb-1`}>{label}</div>
          <div className={`text-xl font-bold text-${color}-800 dark:text-${color}-200 font-mono`}>{value}</div>
          <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{sub}</div>
        </div>
      ))}
    </div>
  );
}

// ─── Depreciation Tab ────────────────────────────────────────────────────────
function DepreciationTab({ prop }) {
  const div43 = calcDiv43(prop);
  const div40 = calcDiv40(prop);
  const totalAnnual = div43.annual + div40.annual;
  const hasData = div43.annual > 0 || div40.annual > 0;

  const SectionCard = ({ title, badge, children }) => (
    <div className="border border-slate-200 dark:border-slate-700 rounded-xl p-4 mb-4">
      <div className="flex items-center gap-2 mb-3">
        <h4 className="font-semibold text-sm text-slate-800 dark:text-white">{title}</h4>
        <span className="text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded-full">{badge}</span>
      </div>
      {children}
    </div>
  );

  if (!hasData) {
    return (
      <div className="text-center py-10 text-slate-400">
        <Calculator className="w-10 h-10 mx-auto mb-3 opacity-40" />
        <p className="text-sm font-medium text-slate-500 dark:text-slate-400">No depreciation data yet</p>
        <p className="text-xs mt-1 max-w-xs mx-auto">Edit this property and add Construction Cost (for Div 43) or Plant & Equipment value (for Div 40) to see your depreciation estimates.</p>
      </div>
    );
  }

  return (
    <div>
      {div43.annual > 0 && (
        <SectionCard title="Division 43 — Capital Works" badge="2.5% p.a.">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div><div className="text-xs text-slate-500 dark:text-slate-400">Construction Cost</div><div className="font-semibold font-mono text-slate-800 dark:text-white">{fmtDec(prop.construction_cost)}</div></div>
            <div><div className="text-xs text-slate-500 dark:text-slate-400">Annual Deduction</div><div className="font-semibold font-mono text-blue-600 dark:text-blue-400">{fmtDec(div43.annual)}</div></div>
            <div><div className="text-xs text-slate-500 dark:text-slate-400">Years Remaining</div><div className="font-semibold text-slate-800 dark:text-white">{div43.yearsRemaining.toFixed(1)} yrs</div></div>
            <div><div className="text-xs text-slate-500 dark:text-slate-400">Remaining Deductible</div><div className="font-semibold font-mono text-slate-800 dark:text-white">{fmt(div43.yearsRemaining * div43.annual)}</div></div>
          </div>
          {/* Progress bar */}
          <div className="mt-3">
            <div className="flex justify-between text-xs text-slate-400 mb-1">
              <span>Claimed so far</span>
              <span>{fmtDec(div43.cumulativeClaimed)} of {fmtDec(div43.totalDeductible)}</span>
            </div>
            <div className="w-full h-2 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
              <div className="h-full bg-blue-500 rounded-full" style={{ width: `${Math.min(100, (div43.cumulativeClaimed / Math.max(div43.totalDeductible, 1)) * 100)}%` }} />
            </div>
          </div>
        </SectionCard>
      )}

      {div40.annual > 0 && (
        <SectionCard title="Division 40 — Plant & Equipment" badge={div40.note}>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div><div className="text-xs text-slate-500 dark:text-slate-400">Plant & Equipment Value</div><div className="font-semibold font-mono text-slate-800 dark:text-white">{fmtDec(prop.plant_equipment_value)}</div></div>
            <div><div className="text-xs text-slate-500 dark:text-slate-400">Annual Deduction</div><div className="font-semibold font-mono text-purple-600 dark:text-purple-400">{fmtDec(div40.annual)}</div></div>
          </div>
          <p className="text-xs text-slate-400 mt-2">Estimate only. Get a Quantity Surveyor report for accurate Div 40 schedules.</p>
        </SectionCard>
      )}

      {/* Total */}
      <div className="bg-gradient-to-r from-blue-600 to-indigo-600 rounded-xl p-4 text-white">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs font-medium opacity-80 uppercase tracking-wider mb-1">Total Annual Depreciation</div>
            <div className="text-2xl font-bold font-mono">{fmtDec(totalAnnual)}</div>
            <div className="text-xs opacity-70 mt-0.5">Div 43 {fmtDec(div43.annual)} + Div 40 {fmtDec(div40.annual)}</div>
          </div>
          <Calculator className="w-8 h-8 opacity-40" />
        </div>
      </div>

      <p className="text-xs text-slate-400 mt-3 flex items-start gap-1.5">
        <Info className="w-3 h-3 flex-shrink-0 mt-0.5" />
        Estimates only — consult a registered tax agent or quantity surveyor for lodgement. ATO ruling: properties built before 18 Sep 1987 (residential) or 26 Feb 1992 (commercial) are generally not eligible for Div 43.
      </p>
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────
export default function Properties() {
  const { user } = useAuth();
  const [properties, setProperties] = useState([]);
  const [selectedProp, setSelectedProp] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [summary, setSummary] = useState(null);
  const [activeTab, setActiveTab] = useState('transactions');
  const [loading, setLoading] = useState(true);
  const [showPropModal, setShowPropModal] = useState(false);
  const [showTxnModal, setShowTxnModal] = useState(false);
  const [editProp, setEditProp] = useState(null);
  const [propForm, setPropForm] = useState(PROP_EMPTY);
  const [txnForm, setTxnForm] = useState(TXN_EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [checkoutLoading, setCheckoutLoading] = useState(false);

  const isPremium = user?.subscription_tier === 'premium';

  const fetchAll = useCallback(async () => {
    if (!isPremium) { setLoading(false); return; }
    try {
      const [pRes, sRes] = await Promise.all([
        fetch(`${API}/properties`, { credentials: 'include' }),
        fetch(`${API}/properties/summary`, { credentials: 'include' }),
      ]);
      if (pRes.ok) {
        const data = await pRes.json();
        setProperties(data);
        if (data.length > 0) setSelectedProp(p => p || data[0]);
      }
      if (sRes.ok) setSummary(await sRes.json());
    } catch {}
    setLoading(false);
  }, [isPremium]);

  const fetchTransactions = useCallback(async (propId) => {
    try {
      const res = await fetch(`${API}/properties/${propId}/transactions`, { credentials: 'include' });
      if (res.ok) setTransactions(await res.json());
    } catch {}
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);
  useEffect(() => { if (selectedProp) fetchTransactions(selectedProp.property_id); }, [selectedProp, fetchTransactions]);

  const handleUpgrade = async () => {
    setCheckoutLoading(true);
    try {
      const res = await fetch(`${API}/payments/checkout`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ origin_url: window.location.origin })
      });
      if (res.ok) { const d = await res.json(); window.location.href = d.url; }
    } catch {}
    setCheckoutLoading(false);
  };

  const handleSaveProp = async () => {
    if (!propForm.address || !propForm.purchase_date || !propForm.purchase_price) {
      setError('Address, purchase date and price are required.'); return;
    }
    setSaving(true); setError('');
    try {
      const payload = {
        ...propForm,
        purchase_price: parseFloat(propForm.purchase_price) || 0,
        loan_amount: propForm.loan_amount ? parseFloat(propForm.loan_amount) : null,
        weekly_rent: propForm.weekly_rent ? parseFloat(propForm.weekly_rent) : null,
        construction_cost: propForm.construction_cost ? parseFloat(propForm.construction_cost) : null,
        plant_equipment_value: propForm.plant_equipment_value ? parseFloat(propForm.plant_equipment_value) : null,
        construction_date: propForm.construction_date || null,
      };
      const url = editProp ? `${API}/properties/${editProp.property_id}` : `${API}/properties`;
      const method = editProp ? 'PUT' : 'POST';
      const res = await fetch(url, { method, credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      if (res.ok) {
        const saved = await res.json();
        setShowPropModal(false);
        if (!editProp) setSelectedProp(saved);
        fetchAll();
      } else { const d = await res.json(); setError(d.detail || 'Error saving'); }
    } catch { setError('Network error'); }
    setSaving(false);
  };

  const handleDeleteProp = async (id) => {
    if (!window.confirm('Delete this property and all its transactions?')) return;
    await fetch(`${API}/properties/${id}`, { method: 'DELETE', credentials: 'include' });
    setProperties(prev => prev.filter(p => p.property_id !== id));
    setSelectedProp(prev => prev?.property_id === id ? null : prev);
    fetchAll();
  };

  const handleAddTxn = async () => {
    if (!txnForm.date || !txnForm.description || !txnForm.amount) { setError('All fields required.'); return; }
    setSaving(true); setError('');
    try {
      const res = await fetch(`${API}/properties/${selectedProp.property_id}/transactions`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...txnForm, amount: parseFloat(txnForm.amount) })
      });
      if (res.ok) {
        setShowTxnModal(false); setTxnForm(TXN_EMPTY);
        fetchTransactions(selectedProp.property_id); fetchAll();
      } else { const d = await res.json(); setError(d.detail || 'Error'); }
    } catch { setError('Network error'); }
    setSaving(false);
  };

  const handleDeleteTxn = async (txnId) => {
    await fetch(`${API}/properties/${selectedProp.property_id}/transactions/${txnId}`, { method: 'DELETE', credentials: 'include' });
    setTransactions(prev => prev.filter(t => t.transaction_id !== txnId));
    fetchAll();
  };

  // ── FY summaries for selected property ──────────────────────────────────────
  const curPropTxns = useMemo(() => transactions.filter(t => {
    const y = new Date(t.date); const month = y.getMonth() + 1;
    return (month >= 7 ? y.getFullYear() + 1 : y.getFullYear()) === CURRENT_FY;
  }), [transactions]);

  const propIncome = curPropTxns.filter(t => t.transaction_type === 'income').reduce((s, t) => s + t.amount, 0);
  const propExpenses = curPropTxns.filter(t => t.transaction_type === 'expense').reduce((s, t) => s + t.amount, 0);
  const netCashflow = propIncome - propExpenses;

  // ── Premium gate ─────────────────────────────────────────────────────────────
  if (!isPremium) {
    return (
      <Layout>
        <div className="max-w-2xl mx-auto py-16 text-center">
          <div className="w-16 h-16 bg-amber-100 dark:bg-amber-900/30 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <Crown className="w-8 h-8 text-amber-500" />
          </div>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white mb-3" style={{ fontFamily: 'Outfit, sans-serif' }}>
            Property Tracking — Premium Feature
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mb-6 max-w-md mx-auto">
            Track rental income, expenses, depreciation (Div 40 & Div 43) and portfolio performance. Upgrade to Premium for just $19.99/month AUD.
          </p>
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-6 text-left mb-6 max-w-md mx-auto">
            <div className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">Premium includes:</div>
            <ul className="space-y-2 text-sm text-slate-600 dark:text-slate-400">
              {['Multiple property tracking', 'Rental income & expense tracking', 'ATO Div 40 & Div 43 depreciation calculator', 'Negative gearing summary', 'Portfolio value & equity overview'].map(f => (
                <li key={f} className="flex items-center gap-2"><Check className="w-4 h-4 text-green-500 flex-shrink-0" />{f}</li>
              ))}
            </ul>
          </div>
          <button data-testid="upgrade-premium-btn" onClick={handleUpgrade} disabled={checkoutLoading}
            className="bg-blue-600 hover:bg-blue-700 text-white rounded-xl px-8 py-3.5 font-semibold transition-colors shadow-sm disabled:opacity-50">
            {checkoutLoading ? 'Redirecting...' : 'Upgrade to Premium — $19.99/month'}
          </button>
          <p className="text-xs text-slate-400 mt-3">Secure payment via Stripe. Cancel anytime.</p>
        </div>
      </Layout>
    );
  }

  // ── Property form field helper ────────────────────────────────────────────────
  const PF = ({ label, children, required }) => (
    <div>
      <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
  const inputCls = "w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500";

  return (
    <Layout>
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-3xl font-bold text-slate-900 dark:text-white" style={{ fontFamily: 'Outfit, sans-serif' }}>Properties</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Rental income, expenses & depreciation</p>
          </div>
          <button data-testid="add-property-btn"
            onClick={() => { setEditProp(null); setPropForm(PROP_EMPTY); setError(''); setShowPropModal(true); }}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg px-5 py-2.5 text-sm font-medium shadow-sm transition-colors">
            <Plus className="w-4 h-4" /> Add Property
          </button>
        </div>

        {/* Portfolio summary */}
        <PortfolioSummary summary={summary} />

        {loading ? (
          <div className="animate-pulse space-y-3">
            {[1, 2].map(i => <div key={i} className="h-24 bg-slate-200 dark:bg-slate-700 rounded-xl" />)}
          </div>
        ) : properties.length === 0 ? (
          <div className="text-center py-20">
            <Building2 className="w-14 h-14 text-slate-300 dark:text-slate-600 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-slate-700 dark:text-slate-300 mb-2">No properties yet</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">Add your first investment property to start tracking income, expenses and depreciation.</p>
            <button data-testid="add-first-property-btn"
              onClick={() => { setEditProp(null); setPropForm(PROP_EMPTY); setError(''); setShowPropModal(true); }}
              className="bg-blue-600 hover:bg-blue-700 text-white rounded-lg px-6 py-2.5 text-sm font-medium">
              + Add Your First Property
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* ── Property list ──────────────────────────────────────────── */}
            <div className="lg:col-span-1 space-y-3">
              {properties.map(prop => {
                const div43 = calcDiv43(prop);
                const annualRent = (prop.weekly_rent || 0) * 52;
                const isSelected = selectedProp?.property_id === prop.property_id;
                return (
                  <div key={prop.property_id} data-testid={`property-card-${prop.property_id}`}
                    onClick={() => { setSelectedProp(prop); setActiveTab('transactions'); }}
                    className={`p-4 rounded-xl border-2 cursor-pointer transition-all ${isSelected ? 'border-blue-600 bg-blue-50 dark:bg-blue-900/20' : 'border-slate-200 dark:border-slate-700 hover:border-blue-300 bg-white dark:bg-slate-900'}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-start gap-2 min-w-0">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5 ${isSelected ? 'bg-blue-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-500'}`}>
                          <PropTypeIcon type={prop.property_type} />
                        </div>
                        <div className="min-w-0">
                          <div className="font-semibold text-slate-900 dark:text-white text-sm truncate">{prop.address}</div>
                          <div className="text-xs text-slate-500 capitalize mt-0.5">{prop.property_type.replace('_', ' ')}</div>
                        </div>
                      </div>
                      <div className="flex gap-1 flex-shrink-0">
                        <button data-testid={`edit-prop-${prop.property_id}`}
                          onClick={e => { e.stopPropagation(); setEditProp(prop); setPropForm({ ...PROP_EMPTY, ...prop, purchase_price: String(prop.purchase_price), loan_amount: String(prop.loan_amount || ''), weekly_rent: String(prop.weekly_rent || ''), construction_cost: String(prop.construction_cost || ''), plant_equipment_value: String(prop.plant_equipment_value || ''), construction_date: prop.construction_date || '' }); setError(''); setShowPropModal(true); }}
                          className="p-1 text-slate-400 hover:text-blue-600 rounded"><Pencil className="w-3.5 h-3.5" /></button>
                        <button data-testid={`delete-prop-${prop.property_id}`}
                          onClick={e => { e.stopPropagation(); handleDeleteProp(prop.property_id); }}
                          className="p-1 text-slate-400 hover:text-red-600 rounded"><Trash2 className="w-3.5 h-3.5" /></button>
                      </div>
                    </div>
                    <div className="mt-3 flex items-center justify-between text-xs">
                      <span className="text-slate-500">Purchase: <span className="font-semibold text-slate-700 dark:text-slate-300">{fmt(prop.purchase_price)}</span></span>
                      {prop.weekly_rent ? <span className="text-green-600 dark:text-green-400 font-medium">{fmt(annualRent)}/yr</span> : <span className="text-slate-400">No rent set</span>}
                    </div>
                    {div43.annual > 0 && (
                      <div className="mt-1 text-xs text-purple-600 dark:text-purple-400 flex items-center gap-1">
                        <Calculator className="w-3 h-3" /> Dep: {fmtDec(div43.annual + calcDiv40(prop).annual)}/yr
                      </div>
                    )}
                    {isSelected && <ChevronRight className="w-4 h-4 text-blue-600 mx-auto mt-2" />}
                  </div>
                );
              })}
            </div>

            {/* ── Property detail ────────────────────────────────────────── */}
            <div className="lg:col-span-2">
              {selectedProp ? (
                <div>
                  {/* FY summary cards */}
                  <div className="grid grid-cols-3 gap-3 mb-4">
                    <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl p-4">
                      <div className="text-xs font-medium text-green-700 dark:text-green-400 uppercase tracking-wider mb-1">FY Income</div>
                      <div className="text-lg font-bold text-green-800 dark:text-green-300 font-mono">{fmtDec(propIncome)}</div>
                    </div>
                    <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4">
                      <div className="text-xs font-medium text-red-700 dark:text-red-400 uppercase tracking-wider mb-1">FY Expenses</div>
                      <div className="text-lg font-bold text-red-800 dark:text-red-300 font-mono">{fmtDec(propExpenses)}</div>
                    </div>
                    <div className={`border rounded-xl p-4 ${netCashflow >= 0 ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800' : 'bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-800'}`}>
                      <div className={`text-xs font-medium uppercase tracking-wider mb-1 ${netCashflow >= 0 ? 'text-blue-700 dark:text-blue-400' : 'text-orange-700 dark:text-orange-400'}`}>
                        {netCashflow >= 0 ? 'Positive' : 'Neg. Gearing'}
                      </div>
                      <div className={`text-lg font-bold font-mono ${netCashflow >= 0 ? 'text-blue-800 dark:text-blue-300' : 'text-orange-800 dark:text-orange-300'}`}>
                        {fmtDec(Math.abs(netCashflow))}
                      </div>
                    </div>
                  </div>

                  {/* Tabs */}
                  <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
                    <div className="flex border-b border-slate-200 dark:border-slate-700">
                      {[
                        { id: 'transactions', label: 'Transactions' },
                        { id: 'depreciation', label: 'Depreciation' },
                        { id: 'details', label: 'Details' },
                      ].map(tab => (
                        <button key={tab.id} data-testid={`prop-tab-${tab.id}`}
                          onClick={() => setActiveTab(tab.id)}
                          className={`flex-1 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${activeTab === tab.id ? 'border-blue-600 text-blue-600 dark:text-blue-400' : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}>
                          {tab.label}
                        </button>
                      ))}
                    </div>

                    <div className="p-5">
                      {/* Transactions tab */}
                      {activeTab === 'transactions' && (
                        <>
                          <div className="flex items-center justify-between mb-4">
                            <h3 className="font-semibold text-slate-900 dark:text-white text-sm">FY{CURRENT_FY} Transactions</h3>
                            <button data-testid="add-prop-txn-btn"
                              onClick={() => { setTxnForm(TXN_EMPTY); setError(''); setShowTxnModal(true); }}
                              className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-700 dark:text-blue-400 font-medium px-3 py-1.5 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                              <Plus className="w-3 h-3" /> Add Transaction
                            </button>
                          </div>
                          {transactions.length === 0 ? (
                            <p className="text-sm text-slate-400 text-center py-8">No transactions recorded yet</p>
                          ) : (
                            <div className="space-y-1">
                              {transactions.slice(0, 30).map(txn => (
                                <div key={txn.transaction_id} data-testid={`prop-txn-${txn.transaction_id}`}
                                  className="flex items-center justify-between py-2.5 border-b border-slate-100 dark:border-slate-800 last:border-0">
                                  <div className="flex items-center gap-3">
                                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${txn.transaction_type === 'income' ? 'bg-green-100 dark:bg-green-900/30' : 'bg-red-100 dark:bg-red-900/30'}`}>
                                      {txn.transaction_type === 'income'
                                        ? <TrendingUp className="w-3.5 h-3.5 text-green-600 dark:text-green-400" />
                                        : <TrendingDown className="w-3.5 h-3.5 text-red-600 dark:text-red-400" />}
                                    </div>
                                    <div>
                                      <div className="text-sm font-medium text-slate-900 dark:text-white">{txn.description}</div>
                                      <div className="text-xs text-slate-400">{txn.date} · {txn.category}</div>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-3">
                                    <span className={`text-sm font-semibold font-mono ${txn.transaction_type === 'income' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                                      {txn.transaction_type === 'income' ? '+' : '-'}{fmtDec(txn.amount)}
                                    </span>
                                    <button data-testid={`delete-prop-txn-${txn.transaction_id}`}
                                      onClick={() => handleDeleteTxn(txn.transaction_id)}
                                      className="p-1 text-slate-300 hover:text-red-500 rounded"><Trash2 className="w-3 h-3" /></button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </>
                      )}

                      {/* Depreciation tab */}
                      {activeTab === 'depreciation' && <DepreciationTab prop={selectedProp} />}

                      {/* Details tab */}
                      {activeTab === 'details' && (
                        <div className="space-y-3 text-sm">
                          {[
                            { label: 'Address', value: selectedProp.address },
                            { label: 'Property Type', value: selectedProp.property_type?.replace('_', ' ') },
                            { label: 'Purchase Date', value: selectedProp.purchase_date },
                            { label: 'Purchase Price', value: fmtDec(selectedProp.purchase_price) },
                            selectedProp.loan_amount && { label: 'Loan Amount', value: fmtDec(selectedProp.loan_amount) },
                            selectedProp.loan_amount && { label: 'Equity', value: fmtDec((selectedProp.purchase_price || 0) - (selectedProp.loan_amount || 0)) },
                            selectedProp.weekly_rent && { label: 'Weekly Rent', value: fmtDec(selectedProp.weekly_rent) },
                            selectedProp.weekly_rent && { label: 'Annual Rent', value: fmtDec((selectedProp.weekly_rent || 0) * 52) },
                            selectedProp.construction_date && { label: 'Construction Date', value: selectedProp.construction_date },
                            selectedProp.construction_cost && { label: 'Construction Cost', value: fmtDec(selectedProp.construction_cost) },
                            selectedProp.notes && { label: 'Notes', value: selectedProp.notes },
                          ].filter(Boolean).map(({ label, value }) => (
                            <div key={label} className="flex items-start justify-between py-2 border-b border-slate-100 dark:border-slate-800 last:border-0">
                              <span className="text-slate-500 dark:text-slate-400 capitalize">{label}</span>
                              <span className="font-medium text-slate-900 dark:text-white text-right max-w-[60%]">{value}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-center h-64 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-400">
                  <div className="text-center">
                    <Building2 className="w-10 h-10 mx-auto mb-2 text-slate-300 dark:text-slate-600" />
                    <p className="text-sm">Select a property to view details</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Add/Edit Property Modal ─────────────────────────────────────────── */}
      <Dialog open={showPropModal} onOpenChange={setShowPropModal}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle style={{ fontFamily: 'Outfit, sans-serif' }}>
              {editProp ? 'Edit Property' : 'Add Property'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            {/* Core details */}
            <PF label="Address" required>
              <input data-testid="prop-form-address" value={propForm.address}
                onChange={e => setPropForm(f => ({ ...f, address: e.target.value }))}
                placeholder="123 Main St, Sydney NSW 2000" className={inputCls} />
            </PF>
            <div className="grid grid-cols-2 gap-3">
              <PF label="Property Type">
                <select value={propForm.property_type} onChange={e => setPropForm(f => ({ ...f, property_type: e.target.value }))} className={inputCls}>
                  {[['residential', 'Residential'], ['commercial', 'Commercial'], ['industrial', 'Industrial'], ['vacant_land', 'Vacant Land']].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </PF>
              <PF label="Purchase Date" required>
                <input type="date" value={propForm.purchase_date} onChange={e => setPropForm(f => ({ ...f, purchase_date: e.target.value }))} className={inputCls} />
              </PF>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <PF label="Purchase Price ($)" required>
                <input data-testid="prop-form-price" type="number" value={propForm.purchase_price} onChange={e => setPropForm(f => ({ ...f, purchase_price: e.target.value }))} placeholder="0" className={inputCls} />
              </PF>
              <PF label="Loan Amount ($)">
                <input type="number" value={propForm.loan_amount} onChange={e => setPropForm(f => ({ ...f, loan_amount: e.target.value }))} placeholder="0" className={inputCls} />
              </PF>
            </div>
            <PF label="Weekly Rent ($)">
              <input type="number" value={propForm.weekly_rent} onChange={e => setPropForm(f => ({ ...f, weekly_rent: e.target.value }))} placeholder="0" className={inputCls} />
            </PF>

            {/* Depreciation section */}
            <div className="border-t border-slate-200 dark:border-slate-700 pt-4">
              <div className="flex items-center gap-2 mb-3">
                <Calculator className="w-4 h-4 text-purple-500" />
                <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">Depreciation (optional)</span>
                <span className="text-xs text-slate-400">ATO Div 40 & Div 43</span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <PF label="Construction Cost ($)">
                  <input type="number" value={propForm.construction_cost} onChange={e => setPropForm(f => ({ ...f, construction_cost: e.target.value }))} placeholder="0" className={inputCls} />
                </PF>
                <PF label="Construction Date">
                  <input type="date" value={propForm.construction_date} onChange={e => setPropForm(f => ({ ...f, construction_date: e.target.value }))} className={inputCls} />
                </PF>
              </div>
              <div className="grid grid-cols-2 gap-3 mt-3">
                <PF label="Plant & Equipment Value ($)">
                  <input type="number" value={propForm.plant_equipment_value} onChange={e => setPropForm(f => ({ ...f, plant_equipment_value: e.target.value }))} placeholder="0" className={inputCls} />
                </PF>
                <PF label="Depreciation Method">
                  <select value={propForm.depreciation_method} onChange={e => setPropForm(f => ({ ...f, depreciation_method: e.target.value }))} className={inputCls}>
                    <option value="prime_cost">Prime Cost</option>
                    <option value="diminishing_value">Diminishing Value</option>
                  </select>
                </PF>
              </div>
            </div>

            <PF label="Notes">
              <textarea value={propForm.notes} onChange={e => setPropForm(f => ({ ...f, notes: e.target.value }))} rows={2} placeholder="Optional notes..." className={inputCls + ' resize-none'} />
            </PF>

            {error && <p className="text-sm text-red-500">{error}</p>}
            <div className="flex justify-end gap-3 pt-2">
              <button onClick={() => setShowPropModal(false)} className="px-4 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded-lg text-slate-600 dark:text-slate-400">Cancel</button>
              <button data-testid="save-property-btn" onClick={handleSaveProp} disabled={saving}
                className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium disabled:opacity-50">
                {saving ? 'Saving...' : (editProp ? 'Save Changes' : 'Add Property')}
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Add Transaction Modal ───────────────────────────────────────────── */}
      <Dialog open={showTxnModal} onOpenChange={setShowTxnModal}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Add Transaction</DialogTitle></DialogHeader>
          <div className="space-y-3 pt-2">
            <div className="flex gap-2">
              {['expense', 'income'].map(t => (
                <button key={t} data-testid={`txn-type-${t}`}
                  onClick={() => setTxnForm(f => ({ ...f, transaction_type: t, category: t === 'expense' ? 'Other' : 'Rental Income' }))}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium border-2 transition-colors ${txnForm.transaction_type === t ? (t === 'expense' ? 'border-red-500 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300' : 'border-green-500 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300') : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'}`}>
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <PF label="Date">
                <input type="date" value={txnForm.date} onChange={e => setTxnForm(f => ({ ...f, date: e.target.value }))} className={inputCls} />
              </PF>
              <PF label="Amount ($)">
                <input data-testid="prop-txn-amount" type="number" min="0" step="0.01" value={txnForm.amount} onChange={e => setTxnForm(f => ({ ...f, amount: e.target.value }))} placeholder="0.00" className={inputCls} />
              </PF>
            </div>
            <PF label="Description">
              <input data-testid="prop-txn-desc" value={txnForm.description} onChange={e => setTxnForm(f => ({ ...f, description: e.target.value }))} placeholder="e.g. Monthly rent" className={inputCls} />
            </PF>
            <PF label="Category">
              <select value={txnForm.category} onChange={e => setTxnForm(f => ({ ...f, category: e.target.value }))} className={inputCls}>
                {(txnForm.transaction_type === 'expense' ? PROP_EXPENSE_CATS : PROP_INCOME_CATS).map(c => <option key={c}>{c}</option>)}
              </select>
            </PF>
            {error && <p className="text-sm text-red-500">{error}</p>}
            <div className="flex justify-end gap-3 pt-1">
              <button onClick={() => setShowTxnModal(false)} className="px-4 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded-lg text-slate-600 dark:text-slate-400">Cancel</button>
              <button data-testid="save-prop-txn-btn" onClick={handleAddTxn} disabled={saving}
                className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium disabled:opacity-50">
                {saving ? 'Saving...' : 'Add'}
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
