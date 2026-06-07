import React, { useState, useEffect } from 'react';
import Layout from '@/components/Layout';
import { FileText, Calendar, Info, Printer, AlertCircle, CheckCircle2, Download } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

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

function generateBASpdf(data, user, fy, quarter) {
  const pdf = new jsPDF('p', 'mm', 'a4');
  const bas = data.bas;
  const pageWidth = pdf.internal.pageSize.getWidth();
  const fmtAUD = v => `$${(v || 0).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  // ── Header band ──────────────────────────────────────────────
  pdf.setFillColor(37, 99, 235); // blue-600
  pdf.rect(0, 0, pageWidth, 28, 'F');
  pdf.setTextColor(255, 255, 255);
  pdf.setFontSize(18);
  pdf.setFont('helvetica', 'bold');
  pdf.text('TaxTrack AU', 14, 12);
  pdf.setFontSize(10);
  pdf.setFont('helvetica', 'normal');
  pdf.text('Business Activity Statement', 14, 20);
  pdf.setFontSize(9);
  pdf.text(`Generated ${new Date().toLocaleDateString('en-AU')}`, pageWidth - 14, 12, { align: 'right' });

  // ── Business info ─────────────────────────────────────────────
  pdf.setTextColor(30, 41, 59); // slate-800
  let y = 38;
  pdf.setFontSize(10);
  pdf.setFont('helvetica', 'bold');
  pdf.text('Business Details', 14, y);
  y += 6;
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(9);
  const biz = [
    ['Business Name', user?.business_name || user?.name || '—'],
    ['ABN', user?.abn ? user.abn.replace(/(\d{2})(\d{3})(\d{3})(\d{3})/, '$1 $2 $3 $4') : '—'],
    ['GST Registered', data.gst_registered ? 'Yes' : 'No'],
  ];
  biz.forEach(([label, val]) => {
    pdf.setTextColor(100, 116, 139);
    pdf.text(label + ':', 14, y);
    pdf.setTextColor(30, 41, 59);
    pdf.text(val, 55, y);
    y += 5;
  });

  // ── Period info ───────────────────────────────────────────────
  y += 4;
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(10);
  pdf.setTextColor(30, 41, 59);
  pdf.text('Reporting Period', 14, y);
  y += 6;
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(9);
  const QUARTER_LABELS = { 1: 'Q1 — July to September', 2: 'Q2 — October to December', 3: 'Q3 — January to March', 4: 'Q4 — April to June' };
  const periods = [
    ['Financial Year', `FY${fy}`],
    ['Quarter', QUARTER_LABELS[quarter]],
    ['Period', `${data.period_start} to ${data.period_end}`],
    ['Due Date', data.due_date],
    ['Transactions', `${data.income_count} income, ${data.expense_count} expenses`],
  ];
  periods.forEach(([label, val]) => {
    pdf.setTextColor(100, 116, 139);
    pdf.text(label + ':', 14, y);
    pdf.setTextColor(30, 41, 59);
    pdf.text(val, 55, y);
    y += 5;
  });

  // ── Summary totals ────────────────────────────────────────────
  y += 6;
  autoTable(pdf, {
    startY: y,
    head: [['', 'Amount (AUD)']],
    body: [
      ['Total Income', fmtAUD(data.total_income)],
      ['Total Expenses', fmtAUD(data.total_expenses)],
    ],
    styles: { fontSize: 9, cellPadding: 3 },
    headStyles: { fillColor: [37, 99, 235], textColor: 255, fontStyle: 'bold' },
    columnStyles: { 0: { cellWidth: 120 }, 1: { halign: 'right', fontStyle: 'bold' } },
    margin: { left: 14, right: 14 },
    theme: 'striped',
  });

  // ── BAS Fields ────────────────────────────────────────────────
  y = pdf.lastAutoTable.finalY + 8;
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(10);
  pdf.setTextColor(30, 41, 59);
  pdf.text('GST Calculation Worksheet', 14, y);
  y += 4;

  autoTable(pdf, {
    startY: y,
    head: [['Code', 'Label', 'Amount (AUD)']],
    body: [
      ['G1', 'Total Sales (including GST if applicable)', fmtAUD(bas.G1_total_sales)],
      ['G3', 'GST-free Sales', fmtAUD(bas.G3_gst_free_sales)],
      ['G5', 'Taxable Sales (G1 minus G3)', fmtAUD(bas.G5_taxable_sales)],
      ['1A', 'GST on Sales (G5 ÷ 11)', fmtAUD(bas.field_1A_gst_on_sales)],
      ['G11', 'Total Purchases (including GST)', fmtAUD(bas.G11_total_purchases)],
      ['1B', 'GST on Purchases (G11 ÷ 11)', fmtAUD(bas.field_1B_gst_on_purchases)],
    ],
    styles: { fontSize: 9, cellPadding: 3 },
    headStyles: { fillColor: [37, 99, 235], textColor: 255, fontStyle: 'bold' },
    columnStyles: { 0: { cellWidth: 15, fontStyle: 'bold', textColor: [37, 99, 235] }, 1: { cellWidth: 130 }, 2: { halign: 'right', fontStyle: 'bold' } },
    bodyStyles: { textColor: [30, 41, 59] },
    rowStyles: (row) => row === 3 || row === 5 ? { fillColor: [239, 246, 255] } : {},
    margin: { left: 14, right: 14 },
    theme: 'striped',
  });

  // ── Net GST ───────────────────────────────────────────────────
  y = pdf.lastAutoTable.finalY + 6;
  const netGst = bas.net_gst || 0;
  const isPayable = netGst > 0;
  pdf.setFillColor(isPayable ? 254 : 240, isPayable ? 242 : 253, isPayable ? 242 : 244);
  pdf.roundedRect(14, y, pageWidth - 28, 18, 3, 3, 'F');
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(11);
  pdf.setTextColor(isPayable ? 185 : 22, isPayable ? 28 : 101, isPayable ? 46 : 52);
  pdf.text(`Net GST ${isPayable ? 'Payable' : 'Refundable'} (1A – 1B)`, 20, y + 7);
  pdf.setFontSize(13);
  pdf.text(fmtAUD(Math.abs(netGst)), pageWidth - 20, y + 7, { align: 'right' });
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(8);
  pdf.setTextColor(100, 116, 139);
  pdf.text(isPayable ? 'Amount owed to the ATO' : 'Amount refundable from the ATO', 20, y + 14);

  // ── ATO Notice ────────────────────────────────────────────────
  y += 26;
  pdf.setFillColor(239, 246, 255);
  pdf.roundedRect(14, y, pageWidth - 28, 22, 3, 3, 'F');
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(8);
  pdf.setTextColor(37, 99, 235);
  pdf.text('How to lodge your BAS', 20, y + 7);
  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(30, 41, 59);
  pdf.text('Lodge online at ato.gov.au/business/bas or via your registered tax agent.', 20, y + 13);
  pdf.text(`Due date for this period: ${data.due_date}`, 20, y + 19);

  // ── Footer ────────────────────────────────────────────────────
  const footerY = pdf.internal.pageSize.getHeight() - 10;
  pdf.setDrawColor(226, 232, 240);
  pdf.line(14, footerY - 4, pageWidth - 14, footerY - 4);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(7);
  pdf.setTextColor(148, 163, 184);
  pdf.text('This document is for your records only. Consult a registered tax agent for official lodgements.', 14, footerY);
  pdf.text('TaxTrack AU — taxtrack.au', pageWidth - 14, footerY, { align: 'right' });

  pdf.save(`BAS-FY${fy}-Q${quarter}-${data.period_start}-${data.period_end}.pdf`);
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
      } catch (_e) { /* ignore network errors */ }
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
            <Printer className="w-4 h-4" /> Print
          </button>
          <button data-testid="download-bas-pdf-btn"
            onClick={() => data && generateBASpdf(data, user, fy, quarter)}
            disabled={!data || loading}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg px-4 py-2.5 text-sm font-medium transition-colors disabled:opacity-40 shadow-sm">
            <Download className="w-4 h-4" /> Download PDF
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
