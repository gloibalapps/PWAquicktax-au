import React, { useState, useEffect, useCallback, useRef } from 'react';
import Layout from '@/components/Layout';
import { Plus, Pencil, Trash2, Calendar, Search, X, Check, Upload, FileText, ArrowDownRight, AlertCircle } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';

const API = process.env.REACT_APP_BACKEND_URL + '/api';
const CURRENT_FY = (() => { const n = new Date(); return n.getMonth() >= 6 ? n.getFullYear() + 1 : n.getFullYear(); })();
const FY_OPTIONS = Array.from({ length: 7 }, (_, i) => CURRENT_FY - i);
const fmt = v => new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(v || 0);

const CATEGORIES = [
  'Advertising & Marketing', 'Bank Charges', 'Business Travel', 'Car & Vehicle',
  'Computer & Technology', 'Insurance', 'Legal & Professional', 'Motor Vehicle',
  'Office Supplies', 'Rent & Utilities', 'Staff & Contractors', 'Superannuation',
  'Telephone & Internet', 'Training & Education', 'Other Business Expenses'
];

const EMPTY_FORM = {
  date: new Date().toISOString().slice(0, 10),
  description: '', amount: '', gst_included: false, gst_claimable: true,
  category: 'Other Business Expenses', notes: '',
};

export default function Expenses() {
  const [items, setItems] = useState([]);
  const [fy, setFy] = useState(CURRENT_FY);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [deleteId, setDeleteId] = useState(null);
  const [uploadState, setUploadState] = useState({ loading: false, error: '', parsed: [], step: 'idle' });
  const csvRef = useRef();
  const pdfRef = useRef();

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/expenses?fy=${fy}`, { credentials: 'include' });
      if (res.ok) setItems(await res.json());
    } catch {}
    setLoading(false);
  }, [fy]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  const openAdd = () => { setEditItem(null); setForm(EMPTY_FORM); setError(''); setShowModal(true); };
  const openEdit = (item) => {
    setEditItem(item);
    setForm({ date: item.date, description: item.description, amount: String(item.amount),
      gst_included: item.gst_included, gst_claimable: item.gst_claimable, category: item.category, notes: item.notes || '' });
    setError(''); setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.date || !form.description || !form.amount) { setError('Date, description and amount are required.'); return; }
    setSaving(true); setError('');
    try {
      const payload = { ...form, amount: parseFloat(form.amount) };
      const url = editItem ? `${API}/expenses/${editItem.expense_id}` : `${API}/expenses`;
      const method = editItem ? 'PUT' : 'POST';
      const res = await fetch(url, { method, credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      if (res.ok) { setShowModal(false); fetchItems(); }
      else { const d = await res.json(); setError(d.detail || 'Error saving'); }
    } catch { setError('Network error'); }
    setSaving(false);
  };

  const handleDelete = async (id) => {
    try {
      await fetch(`${API}/expenses/${id}`, { method: 'DELETE', credentials: 'include' });
      setItems(prev => prev.filter(i => i.expense_id !== id));
    } catch {}
    setDeleteId(null);
  };

  const handleCSVUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploadState({ loading: true, error: '', parsed: [], step: 'parsing' });
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch(`${API}/expenses/upload/csv`, { method: 'POST', credentials: 'include', body: fd });
      if (res.ok) {
        const data = await res.json();
        setUploadState({ loading: false, error: '', parsed: data.transactions, step: 'review' });
      } else {
        const d = await res.json();
        setUploadState({ loading: false, error: d.detail || 'Failed to parse CSV', parsed: [], step: 'error' });
      }
    } catch { setUploadState({ loading: false, error: 'Network error', parsed: [], step: 'error' }); }
    e.target.value = '';
  };

  const handlePDFUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploadState({ loading: true, error: '', parsed: [], step: 'parsing' });
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch(`${API}/expenses/upload/pdf`, { method: 'POST', credentials: 'include', body: fd });
      if (res.ok) {
        const data = await res.json();
        setUploadState({ loading: false, error: '', parsed: data.transactions, step: 'review' });
      } else {
        const d = await res.json();
        setUploadState({ loading: false, error: d.detail || 'Failed to parse PDF', parsed: [], step: 'error' });
      }
    } catch { setUploadState({ loading: false, error: 'Network error', parsed: [], step: 'error' }); }
    e.target.value = '';
  };

  const [selectedTxns, setSelectedTxns] = useState({});

  const handleImportConfirm = async () => {
    const toImport = uploadState.parsed.filter((_, i) => selectedTxns[i] !== false);
    if (!toImport.length) return;
    setUploadState(prev => ({ ...prev, loading: true }));
    try {
      const res = await fetch(`${API}/expenses/import`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transactions: toImport })
      });
      if (res.ok) {
        setUploadState({ loading: false, error: '', parsed: [], step: 'idle' });
        setSelectedTxns({});
        fetchItems();
      }
    } catch {}
  };

  const filtered = items.filter(i =>
    !search || i.description.toLowerCase().includes(search.toLowerCase()) || i.category.toLowerCase().includes(search.toLowerCase())
  );
  const total = filtered.reduce((sum, i) => sum + i.amount, 0);
  const gstCredits = filtered.filter(i => i.gst_included && i.gst_claimable).reduce((sum, i) => sum + i.amount / 11, 0);

  return (
    <Layout>
      <div className="max-w-5xl mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-bold text-slate-900 dark:text-white" style={{ fontFamily: 'Outfit, sans-serif' }}>Expenses</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Track all business expenses</p>
          </div>
          <div className="flex gap-2">
            <div className="relative">
              <input ref={csvRef} type="file" accept=".csv" className="hidden" onChange={handleCSVUpload} data-testid="csv-file-input" />
              <button data-testid="upload-csv-btn" onClick={() => csvRef.current?.click()}
                className="flex items-center gap-2 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors">
                <Upload className="w-4 h-4" /> CSV
              </button>
            </div>
            <div className="relative">
              <input ref={pdfRef} type="file" accept=".pdf" className="hidden" onChange={handlePDFUpload} data-testid="pdf-file-input" />
              <button data-testid="upload-pdf-btn" onClick={() => pdfRef.current?.click()}
                className="flex items-center gap-2 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors">
                <FileText className="w-4 h-4" /> Bank PDF
              </button>
            </div>
            <button data-testid="add-expense-btn" onClick={openAdd}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg px-5 py-2.5 text-sm font-medium shadow-sm transition-colors">
              <Plus className="w-4 h-4" /> Add
            </button>
          </div>
        </div>

        {/* Upload state */}
        {uploadState.step === 'parsing' && (
          <div data-testid="upload-parsing" className="mb-6 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-4 flex items-center gap-3">
            <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
            <span className="text-sm text-blue-800 dark:text-blue-200">Parsing your bank statement with AI...</span>
          </div>
        )}
        {uploadState.step === 'error' && (
          <div data-testid="upload-error" className="mb-6 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4 flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
            <span className="text-sm text-red-800 dark:text-red-200">{uploadState.error}</span>
            <button onClick={() => setUploadState({ loading: false, error: '', parsed: [], step: 'idle' })} className="ml-auto text-red-500 hover:text-red-700"><X className="w-4 h-4" /></button>
          </div>
        )}
        {uploadState.step === 'review' && (
          <div data-testid="upload-review" className="mb-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-slate-900 dark:text-white" style={{ fontFamily: 'Outfit, sans-serif' }}>
                Review Parsed Transactions ({uploadState.parsed.length} found)
              </h3>
              <button onClick={() => { setUploadState({ loading: false, error: '', parsed: [], step: 'idle' }); setSelectedTxns({}); }}
                className="text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>
            </div>
            <p className="text-xs text-slate-500 mb-3">Debit transactions only will be imported as expenses. Uncheck any you don't want to import.</p>
            <div className="max-h-64 overflow-y-auto space-y-1.5 mb-4">
              {uploadState.parsed.map((t, i) => (
                <label key={i} data-testid={`parsed-txn-${i}`} className={`flex items-center gap-3 p-2.5 rounded-lg cursor-pointer border text-sm ${t.type === 'debit' ? 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800' : 'border-transparent opacity-50'}`}>
                  <input type="checkbox"
                    checked={t.type === 'debit' && selectedTxns[i] !== false}
                    disabled={t.type === 'credit'}
                    onChange={e => setSelectedTxns(prev => ({ ...prev, [i]: e.target.checked }))}
                    className="rounded" />
                  <span className="flex-1 text-slate-900 dark:text-white truncate">{t.description}</span>
                  <span className="text-slate-500 dark:text-slate-400 text-xs">{t.date}</span>
                  <span className={`number-display font-medium ${t.type === 'debit' ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>
                    {t.type === 'credit' ? '+' : '-'}{fmt(t.amount)}
                  </span>
                </label>
              ))}
            </div>
            <div className="flex gap-3">
              <button data-testid="import-confirm-btn" onClick={handleImportConfirm} disabled={uploadState.loading}
                className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg px-5 py-2 text-sm font-medium disabled:opacity-50">
                {uploadState.loading ? 'Importing...' : <><Check className="w-4 h-4" /> Import Selected</>}
              </button>
              <button onClick={() => { setUploadState({ loading: false, error: '', parsed: [], step: 'idle' }); setSelectedTxns({}); }}
                className="px-4 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded-lg text-slate-600 dark:text-slate-400">Cancel</button>
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <div className="flex items-center gap-2 flex-1 border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 bg-white dark:bg-slate-800">
            <Search className="w-4 h-4 text-slate-400 flex-shrink-0" />
            <input data-testid="expense-search" value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search expenses..." className="flex-1 text-sm outline-none bg-transparent text-slate-900 dark:text-white placeholder:text-slate-400" />
            {search && <button onClick={() => setSearch('')}><X className="w-3.5 h-3.5 text-slate-400" /></button>}
          </div>
          <Select value={String(fy)} onValueChange={v => setFy(Number(v))}>
            <SelectTrigger data-testid="expense-fy-select" className="w-auto min-w-[160px] bg-white dark:bg-slate-800">
              <Calendar className="w-4 h-4 mr-2 text-slate-400" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FY_OPTIONS.map(y => <SelectItem key={y} value={String(y)}>FY{y}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {/* Summary */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-6">
          <div data-testid="expense-total" className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4">
            <div className="text-xs font-medium text-red-700 dark:text-red-400 uppercase tracking-wider mb-1">Total Expenses</div>
            <div className="number-display text-xl font-bold text-red-800 dark:text-red-300">{fmt(total)}</div>
          </div>
          <div data-testid="expense-count" className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-4">
            <div className="text-xs font-medium text-blue-700 dark:text-blue-400 uppercase tracking-wider mb-1">Entries</div>
            <div className="number-display text-xl font-bold text-blue-800 dark:text-blue-300">{filtered.length}</div>
          </div>
          <div data-testid="expense-gst-credits" className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl p-4">
            <div className="text-xs font-medium text-green-700 dark:text-green-400 uppercase tracking-wider mb-1">GST Credits</div>
            <div className="number-display text-xl font-bold text-green-800 dark:text-green-300">{fmt(gstCredits)}</div>
          </div>
        </div>

        {/* Table */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-slate-400">
              <div className="w-8 h-8 border-t-2 border-blue-600 rounded-full animate-spin mr-3" />
              Loading expenses...
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16">
              <ArrowDownRight className="w-10 h-10 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
              <p className="text-slate-500 dark:text-slate-400 font-medium">No expenses found</p>
              <p className="text-sm text-slate-400 mt-1">Add manually or upload a bank statement</p>
              <button onClick={openAdd} className="mt-4 bg-blue-600 hover:bg-blue-700 text-white rounded-lg px-5 py-2 text-sm font-medium">Add Expense</button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm" data-testid="expense-table">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-700">
                    <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Date</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Description</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Category</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Amount</th>
                    <th className="text-center px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500">GST</th>
                    <th className="text-center px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Source</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(item => (
                    <tr key={item.expense_id} data-testid={`expense-row-${item.expense_id}`}
                      className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-300 whitespace-nowrap">{item.date}</td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-900 dark:text-white">{item.description}</div>
                        {item.notes && <div className="text-xs text-slate-400 truncate max-w-[180px]">{item.notes}</div>}
                      </td>
                      <td className="px-4 py-3 text-slate-500 dark:text-slate-400 text-xs">{item.category}</td>
                      <td className="px-4 py-3 text-right number-display font-semibold text-red-700 dark:text-red-400">{fmt(item.amount)}</td>
                      <td className="px-4 py-3 text-center">
                        {item.gst_included && item.gst_claimable ? (
                          <span className="text-xs bg-green-50 dark:bg-green-900/30 text-green-600 dark:text-green-400 px-1.5 py-0.5 rounded">Claimable</span>
                        ) : item.gst_included ? (
                          <span className="text-xs bg-slate-100 dark:bg-slate-700 text-slate-500 px-1.5 py-0.5 rounded">GST Incl.</span>
                        ) : <span className="text-xs text-slate-300 dark:text-slate-600">–</span>}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`text-xs px-1.5 py-0.5 rounded ${item.source === 'import' ? 'bg-purple-50 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400' : 'bg-slate-100 dark:bg-slate-700 text-slate-500'}`}>
                          {item.source}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1 justify-end">
                          <button data-testid={`edit-expense-${item.expense_id}`} onClick={() => openEdit(item)}
                            className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded transition-colors">
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button data-testid={`delete-expense-${item.expense_id}`} onClick={() => setDeleteId(item.expense_id)}
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
          <DialogHeader><DialogTitle style={{ fontFamily: 'Outfit, sans-serif' }}>{editItem ? 'Edit Expense' : 'Add Expense'}</DialogTitle></DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Date *</label>
                <input type="date" data-testid="expense-form-date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                  className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Amount (AUD) *</label>
                <input type="number" data-testid="expense-form-amount" min="0" step="0.01" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} placeholder="0.00"
                  className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Description *</label>
              <input type="text" data-testid="expense-form-description" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="e.g. Office supplies"
                className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Category</label>
              <select data-testid="expense-form-category" value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                {CATEGORIES.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" data-testid="expense-form-gst-included" checked={form.gst_included} onChange={e => setForm(f => ({ ...f, gst_included: e.target.checked }))} className="rounded" />
                <span className="text-sm text-slate-700 dark:text-slate-300">GST Included</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" data-testid="expense-form-gst-claimable" checked={form.gst_claimable} onChange={e => setForm(f => ({ ...f, gst_claimable: e.target.checked }))} className="rounded" />
                <span className="text-sm text-slate-700 dark:text-slate-300">GST Claimable</span>
              </label>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Notes (optional)</label>
              <textarea data-testid="expense-form-notes" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} placeholder="Additional notes..."
                className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
            </div>
            {error && <p className="text-sm text-red-500">{error}</p>}
            <div className="flex justify-end gap-3 pt-2">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 text-sm text-slate-600 dark:text-slate-400 border border-slate-300 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">Cancel</button>
              <button data-testid="expense-save-btn" onClick={handleSave} disabled={saving}
                className="flex items-center gap-2 px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium disabled:opacity-50 transition-colors">
                {saving ? 'Saving...' : <><Check className="w-4 h-4" /> Save</>}
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Delete Expense?</DialogTitle></DialogHeader>
          <p className="text-sm text-slate-500 dark:text-slate-400">This action cannot be undone.</p>
          <div className="flex justify-end gap-3 mt-4">
            <button onClick={() => setDeleteId(null)} className="px-4 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded-lg text-slate-600 dark:text-slate-400">Cancel</button>
            <button data-testid="confirm-delete-expense" onClick={() => handleDelete(deleteId)}
              className="px-4 py-2 text-sm bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium">Delete</button>
          </div>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
