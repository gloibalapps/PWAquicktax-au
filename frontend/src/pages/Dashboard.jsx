import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import Layout from '@/components/Layout';
import {
  TrendingUp, TrendingDown, DollarSign, Calculator,
  FileText, ArrowUpRight, ArrowDownRight, Calendar
} from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts';

const API = process.env.REACT_APP_BACKEND_URL + '/api';

const CURRENT_FY = (() => {
  const now = new Date();
  return now.getMonth() >= 6 ? now.getFullYear() + 1 : now.getFullYear();
})();

const FY_OPTIONS = Array.from({ length: 7 }, (_, i) => CURRENT_FY - i);

function SummaryCard({ icon: Icon, label, value, subtext, color, testId }) {
  return (
    <div
      data-testid={testId}
      className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-6 card-hover"
    >
      <div className="flex items-start justify-between mb-3">
        <div className={`w-10 h-10 ${color} rounded-lg flex items-center justify-center`}>
          <Icon className="w-5 h-5 text-white" />
        </div>
      </div>
      <div className="number-display text-2xl font-bold text-slate-900 dark:text-white">{value}</div>
      <div className="text-sm font-medium text-slate-500 dark:text-slate-400 mt-1">{label}</div>
      {subtext && <div className="text-xs text-slate-400 dark:text-slate-500 mt-1">{subtext}</div>}
    </div>
  );
}

const formatCurrency = (val) =>
  new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', minimumFractionDigits: 0 }).format(val || 0);

export default function Dashboard() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [fy, setFy] = useState(CURRENT_FY);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const res = await fetch(`${API}/dashboard?fy=${fy}`, { credentials: 'include' });
        if (res.ok) setData(await res.json());
      } catch {}
      setLoading(false);
    };
    fetchData();
  }, [fy]);

  const netProfit = data?.net_profit ?? 0;

  return (
    <Layout>
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-bold text-slate-900 dark:text-white" style={{ fontFamily: 'Outfit, sans-serif' }}>
              Dashboard
            </h1>
            <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
              Welcome back, {user?.name?.split(' ')[0]}!
              {user?.business_name && <span className="ml-1">· {user.business_name}</span>}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Calendar className="w-4 h-4 text-slate-400" />
            <select
              data-testid="fy-selector"
              value={fy}
              onChange={e => setFy(Number(e.target.value))}
              className="border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {FY_OPTIONS.map(y => (
                <option key={y} value={y}>FY{y} (Jul {y - 1} - Jun {y})</option>
              ))}
            </select>
          </div>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-6 animate-pulse">
                <div className="h-10 w-10 bg-slate-200 dark:bg-slate-700 rounded-lg mb-3" />
                <div className="h-6 bg-slate-200 dark:bg-slate-700 rounded w-2/3" />
                <div className="h-4 bg-slate-100 dark:bg-slate-800 rounded w-1/2 mt-2" />
              </div>
            ))}
          </div>
        ) : (
          <>
            {/* Summary Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
              <SummaryCard
                icon={TrendingUp}
                label="Total Income"
                value={formatCurrency(data?.total_income)}
                subtext={`${data?.income_count || 0} entries`}
                color="bg-green-500"
                testId="card-total-income"
              />
              <SummaryCard
                icon={TrendingDown}
                label="Total Expenses"
                value={formatCurrency(data?.total_expenses)}
                subtext={`${data?.expense_count || 0} entries`}
                color="bg-red-500"
                testId="card-total-expenses"
              />
              <SummaryCard
                icon={DollarSign}
                label="Net Profit"
                value={formatCurrency(netProfit)}
                subtext={netProfit >= 0 ? 'Profitable' : 'Net loss'}
                color={netProfit >= 0 ? 'bg-blue-600' : 'bg-orange-500'}
                testId="card-net-profit"
              />
              <SummaryCard
                icon={Calculator}
                label="Est. Tax"
                value={formatCurrency(data?.estimated_tax)}
                subtext="Individual tax rates"
                color="bg-purple-600"
                testId="card-est-tax"
              />
            </div>

            {/* GST + BAS Due */}
            {user?.gst_registered && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-8">
                <div data-testid="card-net-gst" className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-6">
                  <div className="text-xs font-semibold uppercase tracking-widest text-slate-500 mb-2">Net GST</div>
                  <div className={`number-display text-2xl font-bold ${data?.net_gst >= 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>
                    {formatCurrency(Math.abs(data?.net_gst || 0))}
                  </div>
                  <div className="text-sm text-slate-500 mt-1">
                    {data?.net_gst >= 0 ? 'Payable to ATO' : 'Refundable from ATO'}
                  </div>
                </div>
                <div data-testid="card-bas-due" className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-6">
                  <div className="flex items-center gap-2 mb-2">
                    <FileText className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                    <div className="text-xs font-semibold uppercase tracking-widest text-blue-600 dark:text-blue-400">Next BAS Due</div>
                  </div>
                  <div className="text-base font-semibold text-blue-900 dark:text-blue-100">{data?.next_bas_due}</div>
                  <div className="text-sm text-blue-700 dark:text-blue-300 mt-1">ATO quarterly lodgement</div>
                </div>
              </div>
            )}

            {/* Chart */}
            {data?.chart_data?.length > 0 && (
              <div data-testid="income-expense-chart" className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-6 mb-8">
                <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4" style={{ fontFamily: 'Outfit, sans-serif' }}>
                  Income vs Expenses — FY{fy}
                </h2>
                <ResponsiveContainer width="100%" height={240}>
                  <LineChart data={data.chart_data} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.2)" />
                    <XAxis dataKey="month" tick={{ fontSize: 11 }} tickFormatter={v => v.slice(5)} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} />
                    <Tooltip formatter={(value) => formatCurrency(value)} />
                    <Legend />
                    <Line type="monotone" dataKey="income" stroke="#2563EB" strokeWidth={2} dot={false} name="Income" />
                    <Line type="monotone" dataKey="expenses" stroke="#EF4444" strokeWidth={2} dot={false} name="Expenses" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Recent Transactions */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold text-slate-900 dark:text-white" style={{ fontFamily: 'Outfit, sans-serif' }}>Recent Income</h3>
                  <a href="/income" className="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400">View all</a>
                </div>
                {data?.recent_income?.length > 0 ? (
                  <div className="space-y-3">
                    {data.recent_income.map(item => (
                      <div key={item.income_id} data-testid={`recent-income-${item.income_id}`}
                        className="flex items-center justify-between py-2 border-b border-slate-100 dark:border-slate-800 last:border-0">
                        <div>
                          <div className="text-sm font-medium text-slate-900 dark:text-white truncate max-w-[180px]">{item.description}</div>
                          <div className="text-xs text-slate-400">{item.date}</div>
                        </div>
                        <div className="flex items-center gap-1 text-green-600 dark:text-green-400 font-medium number-display text-sm">
                          <ArrowUpRight className="w-3.5 h-3.5" />
                          {formatCurrency(item.amount)}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-slate-400 text-center py-4">No income recorded for FY{fy}</p>
                )}
              </div>
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold text-slate-900 dark:text-white" style={{ fontFamily: 'Outfit, sans-serif' }}>Recent Expenses</h3>
                  <a href="/expenses" className="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400">View all</a>
                </div>
                {data?.recent_expenses?.length > 0 ? (
                  <div className="space-y-3">
                    {data.recent_expenses.map(item => (
                      <div key={item.expense_id} data-testid={`recent-expense-${item.expense_id}`}
                        className="flex items-center justify-between py-2 border-b border-slate-100 dark:border-slate-800 last:border-0">
                        <div>
                          <div className="text-sm font-medium text-slate-900 dark:text-white truncate max-w-[180px]">{item.description}</div>
                          <div className="text-xs text-slate-400">{item.date}</div>
                        </div>
                        <div className="flex items-center gap-1 text-red-600 dark:text-red-400 font-medium number-display text-sm">
                          <ArrowDownRight className="w-3.5 h-3.5" />
                          {formatCurrency(item.amount)}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-slate-400 text-center py-4">No expenses recorded for FY{fy}</p>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}
