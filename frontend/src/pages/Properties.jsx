import React, { useState, useEffect, useCallback } from 'react';
import Layout from '@/components/Layout';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Crown, Plus, Pencil, Trash2, Building2, DollarSign, TrendingUp, TrendingDown, Check, X } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

const API = process.env.REACT_APP_BACKEND_URL + '/api';
const fmt = v => new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(v || 0);
const CURRENT_FY = (() => { const n = new Date(); return n.getMonth() >= 6 ? n.getFullYear() + 1 : n.getFullYear(); })();

const PROP_EMPTY = { address: '', property_type: 'residential', purchase_date: '', purchase_price: '', loan_amount: '', weekly_rent: '', notes: '' };
const TXN_EMPTY = { date: new Date().toISOString().slice(0, 10), description: '', amount: '', transaction_type: 'expense', category: 'Other', gst_included: false };

const PROP_EXPENSE_CATS = ['Rates & Taxes', 'Insurance', 'Repairs & Maintenance', 'Property Management', 'Loan Interest', 'Depreciation', 'Cleaning', 'Other'];
const PROP_INCOME_CATS = ['Rental Income', 'Bond Refund', 'Insurance Claim', 'Other'];

export default function Properties() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [properties, setProperties] = useState([]);
  const [selectedProp, setSelectedProp] = useState(null);
  const [transactions, setTransactions] = useState([]);
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

  const fetchProperties = useCallback(async () => {
    if (!isPremium) { setLoading(false); return; }
    try {
      const res = await fetch(`${API}/properties`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setProperties(data);
        if (data.length > 0 && !selectedProp) setSelectedProp(data[0]);
      }
    } catch {}
    setLoading(false);
  }, [isPremium, selectedProp]);

  const fetchTransactions = useCallback(async (propId) => {
    try {
      const res = await fetch(`${API}/properties/${propId}/transactions`, { credentials: 'include' });
      if (res.ok) setTransactions(await res.json());
    } catch {}
  }, []);

  useEffect(() => { fetchProperties(); }, [fetchProperties]);
  useEffect(() => { if (selectedProp) fetchTransactions(selectedProp.property_id); }, [selectedProp, fetchTransactions]);

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

  const handleSaveProp = async () => {
    if (!propForm.address || !propForm.purchase_date || !propForm.purchase_price) { setError('Address, purchase date and price are required.'); return; }
    setSaving(true); setError('');
    try {
      const payload = { ...propForm, purchase_price: parseFloat(propForm.purchase_price), loan_amount: propForm.loan_amount ? parseFloat(propForm.loan_amount) : null, weekly_rent: propForm.weekly_rent ? parseFloat(propForm.weekly_rent) : null };
      const url = editProp ? `${API}/properties/${editProp.property_id}` : `${API}/properties`;
      const method = editProp ? 'PUT' : 'POST';
      const res = await fetch(url, { method, credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      if (res.ok) {
        const saved = await res.json();
        setShowPropModal(false);
        if (!editProp) setSelectedProp(saved);
        fetchProperties();
      } else { const d = await res.json(); setError(d.detail || 'Error saving'); }
    } catch { setError('Network error'); }
    setSaving(false);
  };

  const handleDeleteProp = async (id) => {
    await fetch(`${API}/properties/${id}`, { method: 'DELETE', credentials: 'include' });
    setProperties(prev => prev.filter(p => p.property_id !== id));
    setSelectedProp(prev => prev?.property_id === id ? null : prev);
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
      if (res.ok) { setShowTxnModal(false); fetchTransactions(selectedProp.property_id); setTxnForm(TXN_EMPTY); }
      else { const d = await res.json(); setError(d.detail || 'Error'); }
    } catch { setError('Network error'); }
    setSaving(false);
  };

  const handleDeleteTxn = async (txnId) => {
    await fetch(`${API}/properties/${selectedProp.property_id}/transactions/${txnId}`, { method: 'DELETE', credentials: 'include' });
    setTransactions(prev => prev.filter(t => t.transaction_id !== txnId));
  };

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
            Track rental income, property expenses, negative gearing and more. Upgrade to Premium for just $19.99/month AUD.
          </p>
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-6 text-left mb-6 max-w-md mx-auto">
            <div className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">Premium includes:</div>
            <ul className="space-y-2 text-sm text-slate-600 dark:text-slate-400">
              {['Multiple property tracking', 'Rental income management', 'Property expense categories', 'Negative gearing summary', 'Capital gains overview'].map(f => (
                <li key={f} className="flex items-center gap-2"><Check className="w-4 h-4 text-green-500 flex-shrink-0" />{f}</li>
              ))}
            </ul>
          </div>
          <button data-testid="upgrade-premium-btn" onClick={handleUpgrade} disabled={checkoutLoading}
            className="bg-blue-600 hover:bg-blue-700 text-white rounded-xl px-8 py-3.5 font-semibold transition-colors shadow-sm disabled:opacity-50">
            {checkoutLoading ? 'Redirecting to checkout...' : 'Upgrade to Premium — $19.99/month'}
          </button>
          <p className="text-xs text-slate-400 mt-3">Secure payment via Stripe. Cancel anytime.</p>
        </div>
      </Layout>
    );
  }

  const curPropTxns = transactions.filter(t => {
    const year = new Date(t.date).getFullYear();
    const month = new Date(t.date).getMonth() + 1;
    const txnFy = month >= 7 ? year + 1 : year;
    return txnFy === CURRENT_FY;
  });
  const propIncome = curPropTxns.filter(t => t.transaction_type === 'income').reduce((s, t) => s + t.amount, 0);
  const propExpenses = curPropTxns.filter(t => t.transaction_type === 'expense').reduce((s, t) => s + t.amount, 0);
  const netCashflow = propIncome - propExpenses;

  return (
    <Layout>
      <div className="max-w-5xl mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-bold text-slate-900 dark:text-white" style={{ fontFamily: 'Outfit, sans-serif' }}>Properties</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Rental income & property expenses</p>
          </div>
          <button data-testid="add-property-btn" onClick={() => { setEditProp(null); setPropForm(PROP_EMPTY); setError(''); setShowPropModal(true); }}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg px-5 py-2.5 text-sm font-medium shadow-sm transition-colors">
            <Plus className="w-4 h-4" /> Add Property
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Property list */}
          <div className="lg:col-span-1">
            <div className="space-y-3">
              {loading ? (
                <div className="animate-pulse space-y-3">
                  {[1, 2].map(i => <div key={i} className="h-20 bg-slate-200 dark:bg-slate-700 rounded-xl" />)}
                </div>
              ) : properties.length === 0 ? (
                <div className="text-center py-10">
                  <Building2 className="w-10 h-10 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
                  <p className="text-sm text-slate-500 dark:text-slate-400">No properties yet</p>
                  <button onClick={() => { setEditProp(null); setPropForm(PROP_EMPTY); setError(''); setShowPropModal(true); }}
                    className="mt-3 text-sm text-blue-600 hover:text-blue-700">+ Add your first property</button>
                </div>
              ) : properties.map(prop => (
                <div key={prop.property_id} data-testid={`property-card-${prop.property_id}`}
                  onClick={() => setSelectedProp(prop)}
                  className={`p-4 rounded-xl border-2 cursor-pointer transition-all ${selectedProp?.property_id === prop.property_id ? 'border-blue-600 bg-blue-50 dark:bg-blue-900/20' : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 bg-white dark:bg-slate-900'}`}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="font-medium text-slate-900 dark:text-white text-sm">{prop.address}</div>
                      <div className="text-xs text-slate-500 mt-1 capitalize">{prop.property_type} · {fmt(prop.purchase_price)}</div>
                    </div>
                    <div className="flex gap-1">
                      <button data-testid={`edit-prop-${prop.property_id}`} onClick={e => { e.stopPropagation(); setEditProp(prop); setPropForm({ ...prop, purchase_price: String(prop.purchase_price), loan_amount: String(prop.loan_amount || ''), weekly_rent: String(prop.weekly_rent || '') }); setShowPropModal(true); }}
                        className="p-1 text-slate-400 hover:text-blue-600 rounded"><Pencil className="w-3.5 h-3.5" /></button>
                      <button data-testid={`delete-prop-${prop.property_id}`} onClick={e => { e.stopPropagation(); handleDeleteProp(prop.property_id); }}
                        className="p-1 text-slate-400 hover:text-red-600 rounded"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Property details */}
          <div className="lg:col-span-2">
            {selectedProp ? (
              <div>
                {/* Summary */}
                <div className="grid grid-cols-3 gap-3 mb-4">
                  <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl p-4">
                    <div className="text-xs font-medium text-green-700 dark:text-green-400 uppercase tracking-wider mb-1">Income</div>
                    <div className="number-display font-bold text-green-800 dark:text-green-300">{fmt(propIncome)}</div>
                  </div>
                  <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4">
                    <div className="text-xs font-medium text-red-700 dark:text-red-400 uppercase tracking-wider mb-1">Expenses</div>
                    <div className="number-display font-bold text-red-800 dark:text-red-300">{fmt(propExpenses)}</div>
                  </div>
                  <div className={`border rounded-xl p-4 ${netCashflow >= 0 ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800' : 'bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-800'}`}>
                    <div className={`text-xs font-medium uppercase tracking-wider mb-1 ${netCashflow >= 0 ? 'text-blue-700 dark:text-blue-400' : 'text-orange-700 dark:text-orange-400'}`}>Net</div>
                    <div className={`number-display font-bold ${netCashflow >= 0 ? 'text-blue-800 dark:text-blue-300' : 'text-orange-800 dark:text-orange-300'}`}>{fmt(netCashflow)}</div>
                  </div>
                </div>

                {/* Transactions */}
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-5">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-semibold text-slate-900 dark:text-white" style={{ fontFamily: 'Outfit, sans-serif' }}>Transactions</h3>
                    <button data-testid="add-prop-txn-btn" onClick={() => { setTxnForm(TXN_EMPTY); setError(''); setShowTxnModal(true); }}
                      className="flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 font-medium">
                      <Plus className="w-3.5 h-3.5" /> Add
                    </button>
                  </div>
                  {transactions.length === 0 ? (
                    <p className="text-sm text-slate-400 text-center py-6">No transactions for this property</p>
                  ) : (
                    <div className="space-y-2">
                      {transactions.slice(0, 20).map(txn => (
                        <div key={txn.transaction_id} data-testid={`prop-txn-${txn.transaction_id}`}
                          className="flex items-center justify-between py-2 border-b border-slate-100 dark:border-slate-800 last:border-0 text-sm">
                          <div className="flex items-center gap-2">
                            {txn.transaction_type === 'income' ? <TrendingUp className="w-3.5 h-3.5 text-green-500" /> : <TrendingDown className="w-3.5 h-3.5 text-red-500" />}
                            <div>
                              <div className="font-medium text-slate-900 dark:text-white">{txn.description}</div>
                              <div className="text-xs text-slate-400">{txn.date} · {txn.category}</div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={`number-display font-medium ${txn.transaction_type === 'income' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                              {txn.transaction_type === 'income' ? '+' : '-'}{fmt(txn.amount)}
                            </span>
                            <button data-testid={`delete-prop-txn-${txn.transaction_id}`} onClick={() => handleDeleteTxn(txn.transaction_id)}
                              className="p-1 text-slate-400 hover:text-red-500 rounded"><Trash2 className="w-3 h-3" /></button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center h-64 text-slate-400">
                <div className="text-center">
                  <Building2 className="w-10 h-10 mx-auto mb-2 text-slate-300 dark:text-slate-600" />
                  <p className="text-sm">Select a property to view details</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Property Modal */}
      <Dialog open={showPropModal} onOpenChange={setShowPropModal}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle style={{ fontFamily: 'Outfit, sans-serif' }}>{editProp ? 'Edit Property' : 'Add Property'}</DialogTitle></DialogHeader>
          <div className="space-y-3 pt-2">
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Address *</label>
              <input data-testid="prop-form-address" value={propForm.address} onChange={e => setPropForm(f => ({ ...f, address: e.target.value }))} placeholder="123 Main St, Sydney NSW 2000"
                className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Type</label>
                <select value={propForm.property_type} onChange={e => setPropForm(f => ({ ...f, property_type: e.target.value }))}
                  className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                  {['residential', 'commercial', 'industrial', 'vacant_land'].map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Purchase Date *</label>
                <input type="date" value={propForm.purchase_date} onChange={e => setPropForm(f => ({ ...f, purchase_date: e.target.value }))}
                  className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Purchase Price *</label>
                <input data-testid="prop-form-price" type="number" value={propForm.purchase_price} onChange={e => setPropForm(f => ({ ...f, purchase_price: e.target.value }))} placeholder="0.00"
                  className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Weekly Rent</label>
                <input type="number" value={propForm.weekly_rent} onChange={e => setPropForm(f => ({ ...f, weekly_rent: e.target.value }))} placeholder="0.00"
                  className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>
            {error && <p className="text-sm text-red-500">{error}</p>}
            <div className="flex justify-end gap-3 pt-2">
              <button onClick={() => setShowPropModal(false)} className="px-4 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded-lg text-slate-600 dark:text-slate-400">Cancel</button>
              <button data-testid="save-property-btn" onClick={handleSaveProp} disabled={saving}
                className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium disabled:opacity-50">
                {saving ? 'Saving...' : 'Save Property'}
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Transaction Modal */}
      <Dialog open={showTxnModal} onOpenChange={setShowTxnModal}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Add Transaction</DialogTitle></DialogHeader>
          <div className="space-y-3 pt-2">
            <div className="flex gap-2">
              {['expense', 'income'].map(t => (
                <button key={t} onClick={() => setTxnForm(f => ({ ...f, transaction_type: t }))}
                  data-testid={`txn-type-${t}`}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium border-2 transition-colors ${txnForm.transaction_type === t ? (t === 'expense' ? 'border-red-500 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300' : 'border-green-500 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300') : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'}`}>
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Date</label>
                <input type="date" value={txnForm.date} onChange={e => setTxnForm(f => ({ ...f, date: e.target.value }))}
                  className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Amount</label>
                <input data-testid="prop-txn-amount" type="number" min="0" step="0.01" value={txnForm.amount} onChange={e => setTxnForm(f => ({ ...f, amount: e.target.value }))} placeholder="0.00"
                  className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Description</label>
              <input data-testid="prop-txn-desc" value={txnForm.description} onChange={e => setTxnForm(f => ({ ...f, description: e.target.value }))} placeholder="e.g. Monthly rent"
                className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Category</label>
              <select value={txnForm.category} onChange={e => setTxnForm(f => ({ ...f, category: e.target.value }))}
                className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                {(txnForm.transaction_type === 'expense' ? PROP_EXPENSE_CATS : PROP_INCOME_CATS).map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
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
