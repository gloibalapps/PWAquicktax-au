import React, { useState, useEffect, useCallback } from 'react';
import Layout from '@/components/Layout';
import ImportReview, { ALL_INCOME_CATS } from '@/components/ImportReview';
import { Plus, Pencil, Trash2, Calendar, Search, X, Check, ArrowUpRight, Upload, Download } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const API = process.env.REACT_APP_BACKEND_URL + '/api';
const CURRENT_FY = (() => { const n = new Date(); return n.getMonth() >= 6 ? n.getFullYear() + 1 : n.getFullYear(); })();
const FY_OPTIONS = Array.from({ length: 7 }, (_, i) => CURRENT_FY - i);
const fmt = v => new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(v || 0);

const INCOME_CATS_BUSINESS = [
  'Services', 'Product Sales', 'Consulting', 'Commission',
  'Rental Income', 'Interest Income', 'Government Payment', 'Other Business Income'
];
const INCOME_CATS_PERSONAL = [
  'Salary/Wages', 'Interest (Personal)', 'Dividends', 'Gifts Received', 'Other Personal Income'
];

const EMPTY_FORM = {
  date: new Date().toISOString().slice(0, 10),
  description: '', amount: '', gst_included: false, gst_free: false,
  category: 'Services', is_personal: false, notes: '',
};

export default function Income() {
  const [items, setItems] = useState([]);
  const [fy, setFy] = useState(CURRENT_FY);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [deleteId, setDeleteId] = useState(null);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/income?fy=${fy}`, { credentials: 'include' });
      if (res.ok) setItems(await res.json());
    } catch (_e) { /* ignore */ }
    setLoading(false);
  }, [fy]);

  const openAdd = () => { setEditItem(null); setForm(EMPTY_FORM); setError(''); setShowModal(true); };
  const openEdit = useCallback((item) => {
    setEditItem(item);
    setForm({ date: item.date, description: item.description, amount: String(item.amount),
      gst_included: item.gst_included, gst_free: item.gst_free, category: item.category,
      is_personal: item.is_personal || false, notes: item.notes || '' });
    setError('');
    setShowModal(true);
  }, []);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  const onSaveClick = () => {
    const validationErr = (!form.date || !form.description || !form.amount) ? 'Date, description and amount are required.' : '';
    setError(validationErr);
    if (validationErr) return;
    setSaving(true);
    const payload = { ...form, amount: parseFloat(form.amount) };
    const url = editItem ? `${API}/income/${editItem.income_id}` : `${API}/income`;
    const method = editItem ? 'PUT' : 'POST';
    fetch(url, { method, credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      .then(res => {
        if (res.ok) { setShowModal(false); fetchItems(); }
        else return res.json().then(d => setError(d.detail || 'Error saving'));
      })
      .catch(() => setError('Network error'))
      .finally(() => setSaving(false));
  };

  const handleDelete = async (id) => {
    try {
      await fetch(`${API}/income/${id}`, { method: 'DELETE', credentials: 'include' });
      setItems(prev => prev.filter(i => i.income_id !== id));
    } catch (_e) { /* ignore */ }
    setDeleteId(null);
  };

  const filtered = items.filter(i =>
    !search || i.description.toLowerCase().includes(search.toLowerCase()) || i.category.toLowerCase().includes(search.toLowerCase())
  );
  const total = filtered.reduce((sum, i) => sum + i.amount, 0);
  const gstTotal = filtered.filter(i => i.gst_included && !i.gst_free).reduce((sum, i) => sum + i.amount / 11, 0);

  return (
    <Layout>
      <div className="max-w-5xl mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-bold text-slate-900 dark:text-white" style={{ fontFamily: 'Outfit, sans-serif' }}>Income</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Track all business & personal income entries</p>
          </div>
          <div className="flex gap-2">
            <button data-testid="import-income-btn" onClick={() => setShowImport(true)}
              className="flex items-center gap-2 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors">
              <Upload className="w-4 h-4" /> Import
            </button>
            <a href={`${API}/income/export?fy=${fy}`} data-testid="export-income-btn"
              className="flex items-center gap-2 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors">
              <Download className="w-4 h-4" /> Export CSV
            </a>
            <button data-testid="add-income-btn" onClick={openAdd}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg px-5 py-2.5 text-sm font-medium shadow-sm transition-colors">
              <Plus className="w-4 h-4" /> Add Income
            </button>
          </div>
        </div>

        {/* Filters + Summary */}
        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <div className="flex items-center gap-2 flex-1 border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 bg-white dark:bg-slate-800">
            <Search className="w-4 h-4 text-slate-400 flex-shrink-0" />
            <input
              data-testid="income-search"
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search income..." className="flex-1 text-sm outline-none bg-transparent text-slate-900 dark:text-white placeholder:text-slate-400"
            />
            {search && <button onClick={() => setSearch('')}><X className="w-3.5 h-3.5 text-slate-400" /></button>}
          </div>
          <Select value={String(fy)} onValueChange={v => setFy(Number(v))}>
            <SelectTrigger data-testid="income-fy-select" className="w-auto min-w-[160px] bg-white dark:bg-slate-800">
              <Calendar className="w-4 h-4 mr-2 text-slate-400" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FY_OPTIONS.map(y => <SelectItem key={y} value={String(y)}>FY{y}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {/* Summary row */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-6">
          <div data-testid="income-total" className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl p-4">
            <div className="text-xs font-medium text-green-700 dark:text-green-400 uppercase tracking-wider mb-1">Total Income</div>
            <div className="number-display text-xl font-bold text-green-800 dark:text-green-300">{fmt(total)}</div>
          </div>
          <div data-testid="income-count" className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-4">
            <div className="text-xs font-medium text-blue-700 dark:text-blue-400 uppercase tracking-wider mb-1">Entries</div>
            <div className="number-display text-xl font-bold text-blue-800 dark:text-blue-300">{filtered.length}</div>
          </div>
          <div data-testid="income-gst" className="bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-xl p-4">
            <div className="text-xs font-medium text-purple-700 dark:text-purple-400 uppercase tracking-wider mb-1">GST Collected</div>
            <div className="number-display text-xl font-bold text-purple-800 dark:text-purple-300">{fmt(gstTotal)}</div>
          </div>
        </div>

        {/* Table */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-slate-400">
              <div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin mr-3" style={{ borderWidth: '3px' }} />
              Loading income...
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16">
              <ArrowUpRight className="w-10 h-10 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
              <p className="text-slate-500 dark:text-slate-400 font-medium">No income entries found</p>
              <p className="text-sm text-slate-400 mt-1">Add your first income entry to get started</p>
              <button onClick={openAdd} className="mt-4 bg-blue-600 hover:bg-blue-700 text-white rounded-lg px-5 py-2 text-sm font-medium">
                Add Income
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm" data-testid="income-table">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-700">
                    <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Date</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Description</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Category</th>
                    <th className="text-center px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Purpose</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Amount</th>
                    <th className="text-center px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500">GST</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(item => (
                    <tr key={item.income_id} data-testid={`income-row-${item.income_id}`}
                      className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-300 whitespace-nowrap">{item.date}</td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-900 dark:text-white">{item.description}</div>
                        {item.notes && <div className="text-xs text-slate-400 truncate max-w-[200px]">{item.notes}</div>}
                      </td>
                      <td className="px-4 py-3 text-slate-500 dark:text-slate-400 text-xs">{item.category}</td>
                      <td className="px-4 py-3 text-center">
                        {item.is_personal ? (
                          <span className="text-xs bg-purple-50 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 px-2 py-0.5 rounded font-medium">Personal</span>
                        ) : (
                          <span className="text-xs bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 px-2 py-0.5 rounded font-medium">Business</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right number-display font-semibold text-green-700 dark:text-green-400">{fmt(item.amount)}</td>
                      <td className="px-4 py-3 text-center">
                        {item.gst_free ? (
                          <span className="text-xs bg-slate-100 dark:bg-slate-700 text-slate-500 px-2 py-0.5 rounded">GST Free</span>
                        ) : item.gst_included ? (
                          <span className="text-xs bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 px-2 py-0.5 rounded">GST Incl.</span>
                        ) : (
                          <span className="text-xs text-slate-300 dark:text-slate-600">–</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1 justify-end">
                          <button data-testid={`edit-income-${item.income_id}`} onClick={() => openEdit(item)}
                            className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded transition-colors">
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button data-testid={`delete-income-${item.income_id}`} onClick={() => setDeleteId(item.income_id)}
                            className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Add/Edit Modal */}
      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle style={{ fontFamily: 'Outfit, sans-serif' }}>
              {editItem ? 'Edit Income' : 'Add Income'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            {/* Purpose toggle */}
            <div className="flex gap-2 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
              {[{ val: false, label: 'Business' }, { val: true, label: 'Personal' }].map(opt => (
                <button key={String(opt.val)} data-testid={`income-purpose-${opt.val ? 'personal' : 'business'}`}
                  onClick={() => setForm(f => ({ ...f, is_personal: opt.val, category: (opt.val ? INCOME_CATS_PERSONAL : INCOME_CATS_BUSINESS)[0] }))}
                  className={`flex-1 py-1.5 rounded-md text-sm font-medium transition-all ${form.is_personal === opt.val ? (opt.val ? 'bg-purple-600 text-white shadow-sm' : 'bg-blue-600 text-white shadow-sm') : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'}`}>
                  {opt.label}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Date *</label>
                <input data-testid="income-form-date" type="date" value={form.date}
                  onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                  className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Amount (AUD) *</label>
                <input data-testid="income-form-amount" type="number" min="0" step="0.01" value={form.amount}
                  onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} placeholder="0.00"
                  className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Description *</label>
              <input data-testid="income-form-description" type="text" value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="e.g. Invoice #123"
                className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Category</label>
              <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                data-testid="income-form-category"
                className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                <optgroup label="Business Income">
                  {INCOME_CATS_BUSINESS.map(c => <option key={c}>{c}</option>)}
                </optgroup>
                <optgroup label="Personal Income">
                  {INCOME_CATS_PERSONAL.map(c => <option key={c}>{c}</option>)}
                </optgroup>
              </select>
            </div>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.gst_included} onChange={e => setForm(f => ({ ...f, gst_included: e.target.checked }))}
                  data-testid="income-form-gst-included" className="rounded" />
                <span className="text-sm text-slate-700 dark:text-slate-300">GST Included</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.gst_free} onChange={e => setForm(f => ({ ...f, gst_free: e.target.checked }))}
                  data-testid="income-form-gst-free" className="rounded" />
                <span className="text-sm text-slate-700 dark:text-slate-300">GST Free</span>
              </label>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Notes (optional)</label>
              <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2}
                placeholder="Additional notes..." data-testid="income-form-notes"
                className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
            </div>
            {error && <p className="text-sm text-red-500">{error}</p>}
            <div className="flex justify-end gap-3 pt-2">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 text-sm text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white border border-slate-300 dark:border-slate-600 rounded-lg transition-colors">Cancel</button>
              <button data-testid="income-save-btn" onClick={onSaveClick} disabled={saving}
                className="flex items-center gap-2 px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium disabled:opacity-50 transition-colors">
                {saving ? 'Saving...' : <><Check className="w-4 h-4" /> Save</>}
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Import Review Modal */}
      <ImportReview
        open={showImport}
        onClose={() => setShowImport(false)}
        onComplete={() => { setShowImport(false); fetchItems(); }}
      />

      {/* Delete confirm */}
      <Dialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Delete Income Entry?</DialogTitle></DialogHeader>
          <p className="text-sm text-slate-500 dark:text-slate-400">This action cannot be undone.</p>
          <div className="flex justify-end gap-3 mt-4">
            <button onClick={() => setDeleteId(null)} className="px-4 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded-lg text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800">Cancel</button>
            <button data-testid="confirm-delete-income" onClick={() => handleDelete(deleteId)}
              className="px-4 py-2 text-sm bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium">
              Delete
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
