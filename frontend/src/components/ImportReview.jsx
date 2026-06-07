import React, { useState, useRef, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Upload, FileText, X, Check, Trash2, AlertCircle, ArrowUpRight, ArrowDownRight, Pencil } from 'lucide-react';

const API = process.env.REACT_APP_BACKEND_URL + '/api';

// ─── Category lists ─────────────────────────────────────────
const INCOME_CATS_BUSINESS = [
  'Services', 'Product Sales', 'Consulting', 'Commission',
  'Rental Income', 'Interest Income', 'Government Payment', 'Other Business Income'
];
const INCOME_CATS_PERSONAL = [
  'Salary/Wages', 'Interest (Personal)', 'Dividends', 'Gifts Received', 'Other Personal Income'
];
const EXPENSE_CATS_BUSINESS = [
  'Advertising & Marketing', 'Bank Charges', 'Business Travel', 'Car & Vehicle',
  'Computer & Technology', 'Insurance', 'Legal & Professional', 'Motor Vehicle',
  'Office Supplies', 'Rent & Utilities', 'Staff & Contractors', 'Superannuation',
  'Telephone & Internet', 'Training & Education', 'Other Business Expenses'
];
const EXPENSE_CATS_PERSONAL = [
  'Groceries & Food', 'Entertainment', 'Personal Travel', 'Health & Medical',
  'Clothing & Personal Care', 'Home & Garden', 'Personal Insurance',
  'Utilities (Personal)', 'Other Personal Expenses'
];

export const ALL_INCOME_CATS = [...INCOME_CATS_BUSINESS, ...INCOME_CATS_PERSONAL];
export const ALL_EXPENSE_CATS = [...EXPENSE_CATS_BUSINESS, ...EXPENSE_CATS_PERSONAL];

function getCats(type, isPersonal) {
  if (type === 'income') return isPersonal ? INCOME_CATS_PERSONAL : INCOME_CATS_BUSINESS;
  return isPersonal ? EXPENSE_CATS_PERSONAL : EXPENSE_CATS_BUSINESS;
}
function defaultCat(type, isPersonal) { return getCats(type, isPersonal)[0]; }

function buildRow(t, idx) {
  // Detect type from original parsed "type" field: credit → income, debit → expense
  const importType = t.type === 'credit' ? 'income' : 'expense';
  const isPersonal = false;
  return {
    _key: idx,
    include: true,
    date: t.date || new Date().toISOString().slice(0, 10),
    description: t.description || '',
    amount: String(t.amount || 0),
    import_type: importType,
    is_personal: isPersonal,
    category: defaultCat(importType, isPersonal),
    gst_included: false,
    gst_free: false,
    gst_claimable: importType === 'expense',
    original_type: t.type,  // debit/credit from bank
  };
}

function RowEditor({ row, onChange, onRemove }) {
  const cats = getCats(row.import_type, row.is_personal);
  // Ensure current category is valid for current type/purpose
  const catValid = cats.includes(row.category);

  const update = (field, val) => {
    let updated = { ...row, [field]: val };
    // When type or purpose changes, reset category
    if (field === 'import_type' || field === 'is_personal') {
      const newCats = getCats(
        field === 'import_type' ? val : row.import_type,
        field === 'is_personal' ? val : row.is_personal
      );
      updated.category = newCats[0];
      // Auto-set GST defaults
      if (field === 'is_personal') {
        updated.gst_claimable = !val;
        if (val) updated.gst_included = false;
      }
      if (field === 'import_type') {
        updated.gst_claimable = val === 'expense';
      }
    }
    onChange(row._key, updated);
  };

  return (
    <tr
      data-testid={`import-row-${row._key}`}
      className={`border-b border-slate-100 dark:border-slate-800 text-xs ${!row.include ? 'opacity-40' : ''}`}
    >
      {/* Include */}
      <td className="pl-3 py-2 pr-1">
        <input
          type="checkbox"
          checked={row.include}
          onChange={e => update('include', e.target.checked)}
          data-testid={`import-row-include-${row._key}`}
          className="rounded"
        />
      </td>

      {/* Date */}
      <td className="px-1 py-1">
        <input
          type="date"
          value={row.date}
          onChange={e => update('date', e.target.value)}
          data-testid={`import-row-date-${row._key}`}
          className="w-28 border border-slate-200 dark:border-slate-600 rounded px-1.5 py-1 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      </td>

      {/* Description */}
      <td className="px-1 py-1">
        <input
          type="text"
          value={row.description}
          onChange={e => update('description', e.target.value)}
          data-testid={`import-row-desc-${row._key}`}
          className="w-full min-w-[140px] border border-slate-200 dark:border-slate-600 rounded px-1.5 py-1 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      </td>

      {/* Amount */}
      <td className="px-1 py-1">
        <input
          type="number"
          min="0"
          step="0.01"
          value={row.amount}
          onChange={e => update('amount', e.target.value)}
          data-testid={`import-row-amount-${row._key}`}
          className="w-24 border border-slate-200 dark:border-slate-600 rounded px-1.5 py-1 text-right bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono"
        />
      </td>

      {/* Type */}
      <td className="px-1 py-1">
        <select
          value={row.import_type}
          onChange={e => update('import_type', e.target.value)}
          data-testid={`import-row-type-${row._key}`}
          className={`border rounded px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500 font-medium ${
            row.import_type === 'income'
              ? 'bg-green-50 dark:bg-green-900/30 border-green-300 dark:border-green-700 text-green-700 dark:text-green-300'
              : 'bg-red-50 dark:bg-red-900/30 border-red-300 dark:border-red-700 text-red-700 dark:text-red-300'
          }`}
        >
          <option value="income">Income</option>
          <option value="expense">Expense</option>
        </select>
      </td>

      {/* Purpose */}
      <td className="px-1 py-1">
        <select
          value={row.is_personal ? 'personal' : 'business'}
          onChange={e => update('is_personal', e.target.value === 'personal')}
          data-testid={`import-row-purpose-${row._key}`}
          className={`border rounded px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500 ${
            row.is_personal
              ? 'bg-purple-50 dark:bg-purple-900/30 border-purple-300 dark:border-purple-700 text-purple-700 dark:text-purple-300'
              : 'bg-blue-50 dark:bg-blue-900/30 border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-300'
          }`}
        >
          <option value="business">Business</option>
          <option value="personal">Personal</option>
        </select>
      </td>

      {/* Category */}
      <td className="px-1 py-1">
        <select
          value={catValid ? row.category : cats[0]}
          onChange={e => update('category', e.target.value)}
          data-testid={`import-row-cat-${row._key}`}
          className="w-40 border border-slate-200 dark:border-slate-600 rounded px-1.5 py-1 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500 text-xs"
        >
          {cats.map(c => <option key={c}>{c}</option>)}
        </select>
      </td>

      {/* GST */}
      <td className="px-2 py-1 text-center">
        <label className="flex items-center gap-1 cursor-pointer justify-center">
          <input
            type="checkbox"
            checked={row.gst_included}
            onChange={e => update('gst_included', e.target.checked)}
            data-testid={`import-row-gst-${row._key}`}
            className="rounded"
          />
          <span className="text-slate-500 dark:text-slate-400 whitespace-nowrap">Incl.</span>
        </label>
      </td>

      {/* Remove */}
      <td className="px-2 py-1">
        <button
          onClick={() => onRemove(row._key)}
          data-testid={`import-row-remove-${row._key}`}
          className="p-1 text-slate-400 hover:text-red-500 rounded transition-colors"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </td>
    </tr>
  );
}

export default function ImportReview({ open, onClose, onComplete }) {
  const [step, setStep] = useState('idle'); // idle | parsing | review | importing
  const [rows, setRows] = useState([]);
  const [parseError, setParseError] = useState('');
  const [importResult, setImportResult] = useState(null);
  const csvRef = useRef();
  const pdfRef = useRef();

  const reset = () => {
    setStep('idle');
    setRows([]);
    setParseError('');
    setImportResult(null);
  };

  const handleClose = () => { reset(); onClose(); };

  const parseFile = async (file, endpoint) => {
    setStep('parsing');
    setParseError('');
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch(`${API}/expenses/${endpoint}`, {
        method: 'POST', credentials: 'include', body: fd,
      });
      if (res.ok) {
        const data = await res.json();
        if (!data.transactions || data.transactions.length === 0) {
          setParseError('No transactions found in the file.');
          setStep('idle');
          return;
        }
        setRows(data.transactions.map((t, i) => buildRow(t, i)));
        setStep('review');
      } else {
        const d = await res.json();
        setParseError(d.detail || 'Failed to parse file');
        setStep('idle');
      }
    } catch {
      setParseError('Network error while parsing. Please try again.');
      setStep('idle');
    }
  };

  const handleCSV = async (e) => {
    const file = e.target.files[0];
    if (file) await parseFile(file, 'upload/csv');
    e.target.value = '';
  };

  const handlePDF = async (e) => {
    const file = e.target.files[0];
    if (file) await parseFile(file, 'upload/pdf');
    e.target.value = '';
  };

  const updateRow = useCallback((key, updated) => {
    setRows(prev => prev.map(r => r._key === key ? updated : r));
  }, []);

  const removeRow = useCallback((key) => {
    setRows(prev => prev.filter(r => r._key !== key));
  }, []);

  const applyAll = (field, value) => {
    setRows(prev => prev.map(r => {
      if (!r.include) return r;
      let updated = { ...r, [field]: value };
      if (field === 'import_type' || field === 'is_personal') {
        const newCats = getCats(
          field === 'import_type' ? value : r.import_type,
          field === 'is_personal' ? value : r.is_personal
        );
        updated.category = newCats[0];
        if (field === 'is_personal') updated.gst_claimable = !value;
      }
      return updated;
    }));
  };

  const handleImport = async () => {
    const selected = rows.filter(r => r.include);
    if (!selected.length) return;
    setStep('importing');
    try {
      const transactions = selected.map(r => ({
        date: r.date,
        description: r.description,
        amount: parseFloat(r.amount) || 0,
        import_type: r.import_type,
        is_personal: r.is_personal,
        category: r.category,
        gst_included: r.gst_included,
        gst_free: r.import_type === 'income' ? r.gst_free : undefined,
        gst_claimable: r.import_type === 'expense' ? r.gst_claimable : undefined,
      }));

      const res = await fetch(`${API}/import/batch`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transactions }),
      });
      if (res.ok) {
        const result = await res.json();
        setImportResult(result);
        setStep('done');
        onComplete();
      } else {
        setParseError('Import failed. Please try again.');
        setStep('review');
      }
    } catch {
      setParseError('Network error during import.');
      setStep('review');
    }
  };

  const selectedCount = rows.filter(r => r.include).length;
  const incomeCount = rows.filter(r => r.include && r.import_type === 'income').length;
  const expenseCount = rows.filter(r => r.include && r.import_type === 'expense').length;
  const fmt = v => new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(v || 0);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-[95vw] xl:max-w-6xl max-h-[90vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 pt-5 pb-0">
          <DialogTitle style={{ fontFamily: 'Outfit, sans-serif' }} className="text-lg">
            Import from Bank Statement or CSV
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 pb-6 pt-4">
          {/* Upload area */}
          {step === 'idle' && (
            <div className="space-y-4">
              {parseError && (
                <div className="flex items-center gap-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4 text-sm text-red-700 dark:text-red-300">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />{parseError}
                </div>
              )}
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Upload a CSV export or PDF bank statement. All transactions will be shown for review — you can edit each line, assign them as income or expense, and mark personal or business before importing.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <input ref={csvRef} type="file" accept=".csv,.CSV" className="hidden" onChange={handleCSV} data-testid="import-csv-input" />
                <button data-testid="import-csv-btn" onClick={() => csvRef.current?.click()}
                  className="flex flex-col items-center gap-3 p-8 rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-600 hover:border-blue-400 dark:hover:border-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-all group">
                  <Upload className="w-8 h-8 text-slate-400 group-hover:text-blue-500 transition-colors" />
                  <div>
                    <div className="font-semibold text-slate-700 dark:text-slate-300 group-hover:text-blue-700 dark:group-hover:text-blue-300">Upload CSV</div>
                    <div className="text-xs text-slate-400 mt-1">ANZ, CBA, Westpac, NAB, Macquarie, St George, Bendigo</div>
                  </div>
                </button>

                <input ref={pdfRef} type="file" accept=".pdf,.PDF" className="hidden" onChange={handlePDF} data-testid="import-pdf-input" />
                <button data-testid="import-pdf-btn" onClick={() => pdfRef.current?.click()}
                  className="flex flex-col items-center gap-3 p-8 rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-600 hover:border-blue-400 dark:hover:border-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-all group">
                  <FileText className="w-8 h-8 text-slate-400 group-hover:text-blue-500 transition-colors" />
                  <div>
                    <div className="font-semibold text-slate-700 dark:text-slate-300 group-hover:text-blue-700 dark:group-hover:text-blue-300">Upload PDF Statement</div>
                    <div className="text-xs text-slate-400 mt-1">AI-powered parsing for all major Australian banks</div>
                  </div>
                </button>
              </div>
            </div>
          )}

          {/* Parsing */}
          {step === 'parsing' && (
            <div className="flex flex-col items-center py-16 gap-4 text-slate-500 dark:text-slate-400">
              <div className="w-10 h-10 border-3 border-blue-600 border-t-transparent rounded-full animate-spin" style={{ borderWidth: '3px' }} />
              <div className="text-center">
                <div className="font-medium text-slate-700 dark:text-slate-300">Parsing your file...</div>
                <div className="text-sm mt-1">AI is extracting transactions from your bank statement</div>
              </div>
            </div>
          )}

          {/* Review */}
          {step === 'review' && (
            <div>
              {parseError && (
                <div className="mb-3 flex items-center gap-2 text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />{parseError}
                </div>
              )}

              {/* Summary bar */}
              <div className="flex flex-wrap items-center gap-3 mb-3 p-3 bg-slate-50 dark:bg-slate-800 rounded-xl text-xs">
                <span className="font-medium text-slate-700 dark:text-slate-300">
                  {selectedCount} of {rows.length} selected
                </span>
                <span className="text-green-600 dark:text-green-400 flex items-center gap-1">
                  <ArrowUpRight className="w-3.5 h-3.5" /> {incomeCount} income
                </span>
                <span className="text-red-600 dark:text-red-400 flex items-center gap-1">
                  <ArrowDownRight className="w-3.5 h-3.5" /> {expenseCount} expense
                </span>
                <span className="ml-auto flex gap-2">
                  <button onClick={() => setRows(prev => prev.map(r => ({ ...r, include: true })))}
                    className="text-blue-600 dark:text-blue-400 hover:underline">Select all</button>
                  <span className="text-slate-400">·</span>
                  <button onClick={() => setRows(prev => prev.map(r => ({ ...r, include: false })))}
                    className="text-slate-500 hover:underline">None</button>
                </span>
              </div>

              {/* Bulk actions */}
              <div className="flex flex-wrap gap-2 mb-3 text-xs">
                <span className="text-slate-500 dark:text-slate-400 self-center">Apply to selected:</span>
                <button onClick={() => applyAll('import_type', 'income')}
                  data-testid="bulk-set-income"
                  className="px-2.5 py-1 rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 hover:bg-green-200 dark:hover:bg-green-900/50 font-medium border border-green-200 dark:border-green-700">
                  All Income
                </button>
                <button onClick={() => applyAll('import_type', 'expense')}
                  data-testid="bulk-set-expense"
                  className="px-2.5 py-1 rounded-full bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 hover:bg-red-200 dark:hover:bg-red-900/50 font-medium border border-red-200 dark:border-red-700">
                  All Expense
                </button>
                <button onClick={() => applyAll('is_personal', false)}
                  data-testid="bulk-set-business"
                  className="px-2.5 py-1 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 hover:bg-blue-200 dark:hover:bg-blue-900/50 font-medium border border-blue-200 dark:border-blue-700">
                  All Business
                </button>
                <button onClick={() => applyAll('is_personal', true)}
                  data-testid="bulk-set-personal"
                  className="px-2.5 py-1 rounded-full bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 hover:bg-purple-200 dark:hover:bg-purple-900/50 font-medium border border-purple-200 dark:border-purple-700">
                  All Personal
                </button>
              </div>

              {/* Table */}
              <div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
                <div className="overflow-x-auto max-h-96 overflow-y-auto">
                  <table className="w-full text-xs" data-testid="import-review-table">
                    <thead className="sticky top-0 bg-slate-50 dark:bg-slate-800 z-10">
                      <tr className="border-b border-slate-200 dark:border-slate-700">
                        <th className="pl-3 pr-1 py-2 text-left text-slate-500">✓</th>
                        <th className="px-1 py-2 text-left text-slate-500 whitespace-nowrap">Date</th>
                        <th className="px-1 py-2 text-left text-slate-500">Description</th>
                        <th className="px-1 py-2 text-right text-slate-500 whitespace-nowrap">Amount (AUD)</th>
                        <th className="px-1 py-2 text-left text-slate-500">Type</th>
                        <th className="px-1 py-2 text-left text-slate-500">Purpose</th>
                        <th className="px-1 py-2 text-left text-slate-500">Category</th>
                        <th className="px-2 py-2 text-center text-slate-500">GST</th>
                        <th className="px-2 py-2"></th>
                      </tr>
                    </thead>
                    <tbody className="bg-white dark:bg-slate-900">
                      {rows.map(row => (
                        <RowEditor key={row._key} row={row} onChange={updateRow} onRemove={removeRow} />
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* Done */}
          {step === 'done' && importResult && (
            <div className="text-center py-12">
              <div className="w-14 h-14 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
                <Check className="w-7 h-7 text-green-600 dark:text-green-400" />
              </div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2" style={{ fontFamily: 'Outfit, sans-serif' }}>
                Import Complete!
              </h3>
              <div className="flex justify-center gap-6 text-sm text-slate-600 dark:text-slate-400 mb-6">
                <div className="flex items-center gap-1.5 text-green-600 dark:text-green-400">
                  <ArrowUpRight className="w-4 h-4" />
                  <span className="font-semibold">{importResult.income_imported}</span> income entries
                </div>
                <div className="flex items-center gap-1.5 text-red-600 dark:text-red-400">
                  <ArrowDownRight className="w-4 h-4" />
                  <span className="font-semibold">{importResult.expense_imported}</span> expense entries
                </div>
              </div>
              <button onClick={handleClose}
                className="bg-blue-600 hover:bg-blue-700 text-white rounded-lg px-8 py-2.5 font-medium text-sm transition-colors">
                Done
              </button>
            </div>
          )}
        </div>

        {/* Footer actions */}
        {step === 'review' && (
          <div className="border-t border-slate-200 dark:border-slate-700 px-6 py-4 flex items-center justify-between gap-3 bg-white dark:bg-slate-900 rounded-b-lg">
            <button onClick={() => { setStep('idle'); setRows([]); }}
              className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300">
              <X className="w-4 h-4" /> Start over
            </button>
            <div className="flex gap-3">
              <button onClick={handleClose}
                className="px-4 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded-lg text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                Cancel
              </button>
              <button
                data-testid="confirm-import-btn"
                onClick={handleImport}
                disabled={!selectedCount}
                className="flex items-center gap-2 px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-40 shadow-sm"
              >
                <Check className="w-4 h-4" />
                Import {selectedCount} transaction{selectedCount !== 1 ? 's' : ''}
              </button>
            </div>
          </div>
        )}

        {step === 'importing' && (
          <div className="border-t border-slate-200 dark:border-slate-700 px-6 py-4 flex items-center justify-center gap-3 bg-white dark:bg-slate-900">
            <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
            <span className="text-sm text-slate-600 dark:text-slate-400">Importing transactions...</span>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
