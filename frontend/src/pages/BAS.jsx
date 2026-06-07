import React, { useState, useEffect } from 'react';
import Layout from '@/components/Layout';
import { FileText, Calendar, Info, Printer, AlertCircle, CheckCircle2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const API = process.env.REACT_APP_BACKEND_URL + '/api';
const CURRENT_FY = (() => { const n = new Date(); return n.getMonth() >= 6 ? n.getFullYear() + 1 : n.getFullYear(); })();
const FY_OPTIONS = Array.from({ length: 7 }, (_, i) => CURRENT_FY - i);
const fmt = v => new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(v || 0);

const QUARTER_LABELS = {
  1: { name: 'Q1 — July to September', abbr: 'Jul–Sep' },
  2: { name: 'Q2 — October to December', abbr: 'Oct–Dec' },
  3: { name: 'Q3 — January to March', abbr: 'Jan–Mar' },
  4: { name: 'Q4 — April to June', abbr: 'Apr–Jun' },
};

function BASField({ label, code, value, description, highlight }) {
  return (
    <div data-testid={`bas-field-${code}`} className={`flex items-start justify-between py-3 border-b border-slate-100 dark:border-slate-800 ${highlight ? 'bg-blue-50 dark:bg-blue-900/20 -mx-4 px-4 rounded-lg' : ''}`}>
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/40 px-1.5 py-0.5 rounded">{code}</span>
          <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{label}</span>
        </div>
        {description && <p className="text-xs text-slate-400 mt-0.5 ml-8">{description}</p>}
      </div>
      <div className="number-display text-sm font-bold text-slate-900 dark:text-white ml-4">{fmt(value)}</div>
    </div>
  );
}

export default function BAS() {
  const { user } = useAuth();
  const [fy, setFy] = useState(CURRENT_FY);
  const [quarter, setQuarter] = useState(() => {
    const m = new Date().getMonth() + 1;
    if (m >= 7 && m <= 9) return 1;
    if (m >= 10 && m <= 12) return 2;
    if (m >= 1 && m <= 3) return 3;
    return 4;
  });
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetch_ = async () => {
      setLoading(true);
      try {
        const res = await fetch(`${API}/bas/${fy}/${quarter}`, { credentials: 'include' });
        if (res.ok) setData(await res.json());
      } catch {}
      setLoading(false);
    };
    fetch_();
  }, [fy, quarter]);

  const bas = data?.bas;
  const netGstPayable = bas?.net_gst > 0;

  return (
    <Layout>
      <div className="max-w-3xl mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-bold text-slate-900 dark:text-white" style={{ fontFamily: 'Outfit, sans-serif' }}>BAS Statement</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Business Activity Statement — ATO quarterly lodgement</p>
          </div>
          <button data-testid="print-bas-btn" onClick={() => window.print()}
            className="flex items-center gap-2 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors">
            <Printer className="w-4 h-4" /> Print / Export
          </button>
        </div>

        {/* Period Selector */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-5 mb-6 flex flex-wrap gap-4 items-center">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-slate-400" />
            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Financial Year:</span>
          </div>
          <Select value={String(fy)} onValueChange={v => setFy(Number(v))}>
            <SelectTrigger data-testid="bas-fy-select" className="w-auto min-w-[160px] bg-white dark:bg-slate-800">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FY_OPTIONS.map(y => <SelectItem key={y} value={String(y)}>FY{y}</SelectItem>)}
            </SelectContent>
          </Select>
          <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Quarter:</span>
          <div className="flex gap-2">
            {[1, 2, 3, 4].map(q => (
              <button
                key={q}
                data-testid={`bas-quarter-${q}`}
                onClick={() => setQuarter(q)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${quarter === q ? 'bg-blue-600 text-white' : 'border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'}`}
              >
                Q{q}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : !data ? null : (
          <>
            {/* Period info */}
            <div data-testid="bas-period-info" className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-6 mb-4">
              <div className="flex flex-wrap gap-6 text-sm">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">Period</div>
                  <div className="font-medium text-slate-900 dark:text-white">
                    {data.period_start} — {data.period_end}
                  </div>
                </div>
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">Due Date</div>
                  <div className="font-medium text-slate-900 dark:text-white">{data.due_date}</div>
                </div>
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">Transactions</div>
                  <div className="font-medium text-slate-900 dark:text-white">
                    {data.income_count} income, {data.expense_count} expenses
                  </div>
                </div>
              </div>
            </div>

            {/* GST not registered */}
            {!data.gst_registered && (
              <div data-testid="bas-not-gst-registered" className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-xl p-5 mb-4 flex gap-3">
                <AlertCircle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
                <div>
                  <div className="font-medium text-amber-800 dark:text-amber-200 text-sm mb-1">Not registered for GST</div>
                  <p className="text-xs text-amber-700 dark:text-amber-300">
                    You are not registered for GST. BAS statements are shown for reference only.
                    Register via <a href="https://www.ato.gov.au/business/gst/registering-for-gst/" target="_blank" rel="noopener noreferrer" className="underline">ATO website</a> if your turnover exceeds $75,000.
                  </p>
                </div>
              </div>
            )}

            {/* Summary totals */}
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl p-4">
                <div className="text-xs font-medium text-green-700 dark:text-green-400 uppercase tracking-wider mb-1">Total Income</div>
                <div className="number-display text-xl font-bold text-green-800 dark:text-green-300">{fmt(data.total_income)}</div>
              </div>
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4">
                <div className="text-xs font-medium text-red-700 dark:text-red-400 uppercase tracking-wider mb-1">Total Expenses</div>
                <div className="number-display text-xl font-bold text-red-800 dark:text-red-300">{fmt(data.total_expenses)}</div>
              </div>
            </div>

            {/* BAS Fields */}
            <div data-testid="bas-fields" className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-6 mb-4">
              <div className="flex items-center gap-2 mb-4 pb-3 border-b border-slate-200 dark:border-slate-700">
                <FileText className="w-5 h-5 text-blue-600" />
                <h2 className="font-bold text-slate-900 dark:text-white" style={{ fontFamily: 'Outfit, sans-serif' }}>
                  GST Calculation Fields
                </h2>
                {data.gst_registered && (
                  <span className="text-xs bg-green-100 dark:bg-green-900/40 text-green-600 dark:text-green-400 px-2 py-0.5 rounded font-medium ml-auto">GST Registered</span>
                )}
              </div>
              <div className="mb-4">
                <div className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">Sales</div>
                <BASField code="G1" label="Total Sales (including GST if applicable)" value={bas?.G1_total_sales} description="All income for the period" />
                <BASField code="G3" label="GST-free Sales" value={bas?.G3_gst_free_sales} description="Income not subject to GST" />
                <BASField code="G5" label="Taxable Sales" value={bas?.G5_taxable_sales} description="G1 minus GST-free and input-taxed sales" />
                <BASField code="1A" label="GST on Sales" value={bas?.field_1A_gst_on_sales} description="GST collected from customers (G5 ÷ 11)" highlight />
              </div>
              <div className="mt-4">
                <div className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">Purchases</div>
                <BASField code="G11" label="Total Purchases (including GST)" value={bas?.G11_total_purchases} description="All business expenses for the period" />
                <BASField code="1B" label="GST on Purchases" value={bas?.field_1B_gst_on_purchases} description="GST credits from business purchases (G11 ÷ 11)" highlight />
              </div>
            </div>

            {/* Net GST */}
            <div data-testid="bas-net-gst" className={`rounded-xl p-6 border-2 ${netGstPayable ? 'bg-red-50 dark:bg-red-900/20 border-red-300 dark:border-red-700' : 'bg-green-50 dark:bg-green-900/20 border-green-300 dark:border-green-700'}`}>
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    {netGstPayable ? (
                      <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400" />
                    ) : (
                      <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400" />
                    )}
                    <span className="font-bold text-slate-900 dark:text-white" style={{ fontFamily: 'Outfit, sans-serif' }}>
                      Net GST {netGstPayable ? 'Payable' : 'Refundable'} (1A – 1B)
                    </span>
                  </div>
                  <p className="text-sm text-slate-500 dark:text-slate-400 ml-7">
                    {netGstPayable ? 'Amount owed to the ATO' : 'Amount refundable from the ATO'}
                  </p>
                </div>
                <div className={`number-display text-2xl font-bold ${netGstPayable ? 'text-red-700 dark:text-red-300' : 'text-green-700 dark:text-green-300'}`}>
                  {fmt(Math.abs(bas?.net_gst || 0))}
                </div>
              </div>
            </div>

            {/* Lodge info */}
            <div data-testid="bas-ato-info" className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-5 mt-4">
              <div className="flex items-start gap-3">
                <Info className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-blue-800 dark:text-blue-200">
                  <strong>Lodge your BAS online</strong> at{' '}
                  <a href="https://www.ato.gov.au/business/business-activity-statements-bas/lodge-and-pay-your-bas/" target="_blank" rel="noopener noreferrer" className="underline font-medium">
                    ATO Business Portal
                  </a>{' '}
                  or via your registered tax agent. Due date for this quarter: <strong>{data.due_date}</strong>.
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}
