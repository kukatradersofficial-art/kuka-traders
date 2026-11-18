import React, { useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { BarChart3, ShoppingBag, TrendingUp } from 'lucide-react';
import type { Order, Product } from '../types';
import { formatINR } from '../utils/format';

interface CustomerSpendingInsightsProps {
  orders: Order[];
  products: Product[];
}

type TrendMetric = 'spend' | 'orders';
type CategoryScope = '6m' | 'all';
type CategoryMetric = 'spend' | 'quantity';

interface MonthBucket {
  monthKey: string;
  label: string;
  spend: number;
  orders: number;
  items: number;
}

interface CategorySlice {
  name: string;
  spend: number;
  quantity: number;
  percentage: number;
  color: string;
}

const CATEGORY_COLORS = [
  '#FF9900', // Brand Amber
  '#131921', // Midnight Navy
  '#16A34A', // Emerald
  '#2563EB', // Cobalt
  '#0D9488', // Teal
  '#64748B', // Slate (Other)
];

function getOrderTimestampMs(order: Order): number {
  const ts = order.createdAt as unknown;
  if (!ts) return 0;
  if (
    typeof ts === 'object' &&
    ts !== null &&
    'toMillis' in ts &&
    typeof (ts as { toMillis: () => number }).toMillis === 'function'
  ) {
    return (ts as { toMillis: () => number }).toMillis();
  }
  if (
    typeof ts === 'object' &&
    ts !== null &&
    'toDate' in ts &&
    typeof (ts as { toDate: () => Date }).toDate === 'function'
  ) {
    return (ts as { toDate: () => Date }).toDate().getTime();
  }
  if (ts instanceof Date) return ts.getTime();
  if (typeof ts === 'number' || typeof ts === 'string') {
    const ms = new Date(ts).getTime();
    return Number.isNaN(ms) ? 0 : ms;
  }
  return 0;
}

function getLastSixMonths(): Array<{
  monthKey: string;
  label: string;
  startMs: number;
}> {
  const now = new Date();
  // Build calendar months in IST to match storefront timestamps
  const istParts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(now);
  const currYear = Number(istParts.find((p) => p.type === 'year')?.value || now.getFullYear());
  const currMonth = Number(istParts.find((p) => p.type === 'month')?.value || now.getMonth() + 1);

  const months: Array<{ monthKey: string; label: string; startMs: number }> = [];
  const labelFmt = new Intl.DateTimeFormat('en-IN', {
    month: 'short',
    year: '2-digit',
  });

  for (let offset = 5; offset >= 0; offset--) {
    const d = new Date(Date.UTC(currYear, currMonth - 1 - offset, 1));
    const y = d.getUTCFullYear();
    const m = d.getUTCMonth() + 1;
    const monthKey = `${y}-${String(m).padStart(2, '0')}`;
    months.push({
      monthKey,
      label: labelFmt.format(d),
      startMs: d.getTime(),
    });
  }
  return months;
}

function toIstMonthKey(ms: number): string {
  if (!ms) return '';
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
  })
    .format(new Date(ms))
    .slice(0, 7);
}

export const CustomerSpendingInsights: React.FC<CustomerSpendingInsightsProps> = ({
  orders,
  products,
}) => {
  const [trendMetric, setTrendMetric] = useState<TrendMetric>('spend');
  const [categoryScope, setCategoryScope] = useState<CategoryScope>('6m');
  const [categoryMetric, setCategoryMetric] = useState<CategoryMetric>('spend');
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  const validOrders = useMemo(
    () => orders.filter((o) => o.orderStatus !== 'Cancelled'),
    [orders]
  );

  // Build product category lookup by id and fallback lowercase name
  const categoryLookup = useMemo(() => {
    const byId = new Map<string, string>();
    const byName = new Map<string, string>();
    for (const p of products) {
      if (p.categoryName) {
        byId.set(p.id, p.categoryName);
        byName.set(p.name.trim().toLowerCase(), p.categoryName);
      }
    }
    return { byId, byName };
  }, [products]);

  const sixMonthBuckets = useMemo(() => {
    const template = getLastSixMonths();
    const map = new Map<string, MonthBucket>();
    for (const m of template) {
      map.set(m.monthKey, {
        monthKey: m.monthKey,
        label: m.label,
        spend: 0,
        orders: 0,
        items: 0,
      });
    }

    for (const order of validOrders) {
      const ms = getOrderTimestampMs(order);
      const key = toIstMonthKey(ms);
      const bucket = map.get(key);
      if (!bucket) continue;
      bucket.spend += Number(order.totalAmount) || 0;
      bucket.orders += 1;
      bucket.items += order.items.reduce((sum, it) => sum + (Number(it.quantity) || 0), 0);
    }

    return template.map((m) => map.get(m.monthKey)!);
  }, [validOrders]);

  const sixMonthWindowKeys = useMemo(
    () => new Set(sixMonthBuckets.map((b) => b.monthKey)),
    [sixMonthBuckets]
  );

  const summary = useMemo(() => {
    const totalSpend6m = sixMonthBuckets.reduce((s, b) => s + b.spend, 0);
    const totalOrders6m = sixMonthBuckets.reduce((s, b) => s + b.orders, 0);
    const totalItems6m = sixMonthBuckets.reduce((s, b) => s + b.items, 0);
    const avgOrder6m = totalOrders6m > 0 ? totalSpend6m / totalOrders6m : 0;
    const monthlyAvg6m = totalSpend6m / 6;

    const peakMonth = [...sixMonthBuckets].sort((a, b) => b.spend - a.spend)[0];

    return {
      totalSpend6m,
      totalOrders6m,
      totalItems6m,
      avgOrder6m,
      monthlyAvg6m,
      peakMonthLabel: peakMonth && peakMonth.spend > 0 ? peakMonth.label : '—',
      peakMonthSpend: peakMonth?.spend || 0,
    };
  }, [sixMonthBuckets]);

  const categoryData = useMemo<{
    slices: CategorySlice[];
    totalSpend: number;
    totalQuantity: number;
  }>(() => {
    const scopedOrders =
      categoryScope === '6m'
        ? validOrders.filter((o) => sixMonthWindowKeys.has(toIstMonthKey(getOrderTimestampMs(o))))
        : validOrders;

    const totals = new Map<string, { spend: number; quantity: number }>();

    for (const order of scopedOrders) {
      for (const item of order.items) {
        const resolvedCategory =
          categoryLookup.byId.get(item.productId) ||
          categoryLookup.byName.get((item.name || '').trim().toLowerCase()) ||
          'Groceries & Essentials';

        const curr = totals.get(resolvedCategory) ?? { spend: 0, quantity: 0 };
        curr.spend += Number(item.lineTotal) || 0;
        curr.quantity += Number(item.quantity) || 0;
        totals.set(resolvedCategory, curr);
      }
    }

    const sorted = Array.from(totals.entries())
      .map(([name, val]) => ({ name, ...val }))
      .sort((a, b) =>
        categoryMetric === 'spend' ? b.spend - a.spend : b.quantity - a.quantity
      );

    // Group tail categories beyond top 5 into "Other Categories" for chart clarity
    const grouped =
      sorted.length > 6
        ? [
            ...sorted.slice(0, 5),
            sorted.slice(5).reduce(
              (acc, cur) => ({
                name: 'Other Categories',
                spend: acc.spend + cur.spend,
                quantity: acc.quantity + cur.quantity,
              }),
              { name: 'Other Categories', spend: 0, quantity: 0 }
            ),
          ]
        : sorted;

    const totalSpend = grouped.reduce((s, c) => s + c.spend, 0);
    const totalQuantity = grouped.reduce((s, c) => s + c.quantity, 0);
    const denom = categoryMetric === 'spend' ? totalSpend : totalQuantity;

    const slices: CategorySlice[] = grouped.map((c, idx) => {
      const value = categoryMetric === 'spend' ? c.spend : c.quantity;
      return {
        name: c.name,
        spend: c.spend,
        quantity: c.quantity,
        percentage: denom > 0 ? Math.round((value / denom) * 1000) / 10 : 0,
        color: CATEGORY_COLORS[idx % CATEGORY_COLORS.length],
      };
    });

    return { slices, totalSpend, totalQuantity };
  }, [validOrders, categoryScope, categoryMetric, sixMonthWindowKeys, categoryLookup]);

  const topCategory = categoryData.slices[0] ?? null;

  return (
    <section
      id="account-insights"
      className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-5 sm:p-6 space-y-6"
    >
      {/* Header & Controls */}
      <div className="flex flex-wrap items-start justify-between gap-4 pb-4 border-b border-slate-100">
        <div>
          <h2 className="font-display font-extrabold text-slate-900 text-lg">
            Spending Trends &amp; Category Insights
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Past 6 months of KUKA TRADERS purchases and category-wise breakdown (excluding cancelled orders)
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg text-xs font-semibold">
            <button
              type="button"
              onClick={() => setTrendMetric('spend')}
              className={`px-3 py-1 rounded-md whitespace-nowrap shrink-0 transition-colors ${
                trendMetric === 'spend'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Spend (₹)
            </button>
            <button
              type="button"
              onClick={() => setTrendMetric('orders')}
              className={`px-3 py-1 rounded-md whitespace-nowrap shrink-0 transition-colors ${
                trendMetric === 'orders'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Orders
            </button>
          </div>
        </div>
      </div>

      {validOrders.length === 0 ? (
        <div className="py-10 text-center space-y-2">
          <BarChart3 className="w-9 h-9 text-slate-300 mx-auto" />
          <p className="font-bold text-slate-800 text-sm">No purchase analytics yet</p>
          <p className="text-xs text-slate-500 max-w-md mx-auto leading-relaxed">
            Once you place your first order with KUKA TRADERS, your 6-month spending curve and
            favorite product categories will appear here automatically.
          </p>
        </div>
      ) : (
        <>
          {/* 3-Column Summary Metrics Strip */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="p-4 rounded-xl bg-[#F8FAFC] border border-slate-200/70">
              <p className="text-xs font-medium text-slate-500">6-Month Total Spend</p>
              <p className="font-mono text-2xl font-extrabold text-slate-900 mt-1 tabular-nums">
                {formatINR(summary.totalSpend6m)}
              </p>
              <p className="text-xs text-slate-500 mt-1 tabular-nums">
                {summary.totalOrders6m} orders · {summary.totalItems6m} items
              </p>
            </div>

            <div className="p-4 rounded-xl bg-[#F8FAFC] border border-slate-200/70">
              <p className="text-xs font-medium text-slate-500">Monthly &amp; Order Average</p>
              <p className="font-mono text-2xl font-extrabold text-slate-900 mt-1 tabular-nums">
                {formatINR(Math.round(summary.monthlyAvg6m))}
                <span className="text-xs font-sans font-semibold text-slate-500 ml-1">/ mo</span>
              </p>
              <p className="text-xs text-slate-500 mt-1 tabular-nums">
                Avg basket {formatINR(Math.round(summary.avgOrder6m))} · Peak {summary.peakMonthLabel}
              </p>
            </div>

            <div className="p-4 rounded-xl bg-[#F8FAFC] border border-slate-200/70">
              <p className="text-xs font-medium text-slate-500">Top Purchased Category</p>
              <p className="font-display text-lg font-extrabold text-slate-900 mt-1.5 truncate">
                {topCategory ? topCategory.name : '—'}
              </p>
              <p className="text-xs text-slate-500 mt-1 tabular-nums">
                {topCategory
                  ? `${topCategory.percentage.toFixed(1)}% share · ${formatINR(topCategory.spend)}`
                  : 'No category items in scope'}
              </p>
            </div>
          </div>

          {/* 2-Column Charts Row */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
            {/* Left (7 cols): Past 6 Months Spending Trend */}
            <div className="lg:col-span-7 flex flex-col justify-between p-4 sm:p-5 rounded-xl border border-slate-200/80 bg-white">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                <div className="flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-[#FF9900]" />
                  <div>
                    <h3 className="font-display font-bold text-slate-900 text-sm">
                      Past 6 Months {trendMetric === 'spend' ? 'Spending Trend' : 'Order Frequency'}
                    </h3>
                    <p className="text-[11px] text-slate-500">
                      Monthly breakdown from {sixMonthBuckets[0]?.label} to{' '}
                      {sixMonthBuckets[sixMonthBuckets.length - 1]?.label}
                    </p>
                  </div>
                </div>
              </div>

              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                  <AreaChart
                    data={sixMonthBuckets}
                    margin={{ top: 10, right: 12, left: 0, bottom: 4 }}
                  >
                    <defs>
                      <linearGradient id="kukaSpendGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#FF9900" stopOpacity={0.28} />
                        <stop offset="95%" stopColor="#FF9900" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                    <XAxis
                      dataKey="label"
                      tick={{ fontSize: 11, fill: '#64748B' }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      allowDecimals={false}
                      tick={{ fontSize: 11, fill: '#64748B' }}
                      axisLine={false}
                      tickLine={false}
                      width={trendMetric === 'spend' ? 54 : 32}
                      tickFormatter={(val: number) =>
                        trendMetric === 'spend'
                          ? val >= 1000
                            ? `₹${(val / 1000).toFixed(val % 1000 === 0 ? 0 : 1)}k`
                            : `₹${val}`
                          : String(val)
                      }
                    />
                    <Tooltip
                      contentStyle={{
                        fontSize: '12px',
                        borderRadius: '10px',
                        border: '1px solid #E2E8F0',
                        boxShadow: '0 4px 12px rgba(15, 23, 42, 0.08)',
                      }}
                      formatter={(value, name) => {
                        const num = Number(value) || 0;
                        if (name === 'spend') return [formatINR(num), 'Total Spend'];
                        return [`${num} orders`, 'Orders'];
                      }}
                      labelFormatter={(label) => `Month: ${label}`}
                    />
                    <Area
                      type="monotone"
                      dataKey={trendMetric}
                      stroke="#E68A00"
                      strokeWidth={2.5}
                      fillOpacity={1}
                      fill="url(#kukaSpendGradient)"
                      dot={{ r: 3.5, fill: '#131921', stroke: '#FF9900', strokeWidth: 2 }}
                      activeDot={{ r: 5, fill: '#FF9900', stroke: '#131921', strokeWidth: 2 }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Right (5 cols): Category-Based Purchase Distribution */}
            <div className="lg:col-span-5 flex flex-col justify-between p-4 sm:p-5 rounded-xl border border-slate-200/80 bg-white gap-4">
              <div className="space-y-2.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <ShoppingBag className="w-4 h-4 text-[#131921]" />
                    <div>
                      <h3 className="font-display font-bold text-slate-900 text-sm">
                        Category Distribution
                      </h3>
                      <p className="text-[11px] text-slate-500">
                        {categoryScope === '6m' ? 'Last 6 months' : 'All orders'} ·{' '}
                        {categoryMetric === 'spend' ? 'By spend' : 'By units'}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 p-0.5 bg-slate-100 rounded-md text-[11px] font-semibold">
                    <button
                      type="button"
                      onClick={() => setCategoryScope('6m')}
                      className={`px-2 py-1 rounded whitespace-nowrap shrink-0 ${
                        categoryScope === '6m'
                          ? 'bg-white text-slate-900 shadow-xs'
                          : 'text-slate-600'
                      }`}
                    >
                      6M
                    </button>
                    <button
                      type="button"
                      onClick={() => setCategoryScope('all')}
                      className={`px-2 py-1 rounded whitespace-nowrap shrink-0 ${
                        categoryScope === 'all'
                          ? 'bg-white text-slate-900 shadow-xs'
                          : 'text-slate-600'
                      }`}
                    >
                      All
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-1 p-0.5 bg-slate-100 rounded-lg text-[11px] font-semibold w-fit">
                  <button
                    type="button"
                    onClick={() => setCategoryMetric('spend')}
                    className={`px-2.5 py-1 rounded-md whitespace-nowrap shrink-0 ${
                      categoryMetric === 'spend'
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600'
                    }`}
                  >
                    By Amount (₹)
                  </button>
                  <button
                    type="button"
                    onClick={() => setCategoryMetric('quantity')}
                    className={`px-2.5 py-1 rounded-md whitespace-nowrap shrink-0 ${
                      categoryMetric === 'quantity'
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600'
                    }`}
                  >
                    By Units
                  </button>
                </div>
              </div>

              {categoryData.slices.length === 0 ? (
                <div className="h-44 flex items-center justify-center text-xs text-slate-500 text-center px-4">
                  No purchases in the last 6 months. Switch to “All” to view older category history.
                </div>
              ) : (
                <>
                  <div className="relative h-44 w-full">
                    <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                      <PieChart>
                        <Pie
                          data={categoryData.slices}
                          dataKey={categoryMetric}
                          nameKey="name"
                          cx="50%"
                          cy="50%"
                          innerRadius={48}
                          outerRadius={72}
                          paddingAngle={3}
                          onClick={(entry) => {
                            const clicked = (entry as { name?: string })?.name;
                            if (clicked) {
                              setActiveCategory((prev) => (prev === clicked ? null : clicked));
                            }
                          }}
                        >
                          {categoryData.slices.map((slice) => (
                            <Cell
                              key={slice.name}
                              fill={slice.color}
                              opacity={
                                activeCategory === null || activeCategory === slice.name ? 1 : 0.35
                              }
                              className="cursor-pointer outline-none"
                            />
                          ))}
                        </Pie>
                        <Tooltip
                          contentStyle={{
                            fontSize: '12px',
                            borderRadius: '10px',
                            border: '1px solid #E2E8F0',
                          }}
                          formatter={(value) => {
                            const num = Number(value) || 0;
                            return categoryMetric === 'spend'
                              ? [formatINR(num), 'Category Spend']
                              : [`${num} units`, 'Items Bought'];
                          }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center px-6">
                      <span className="font-mono text-sm font-extrabold text-slate-900 tabular-nums">
                        {categoryMetric === 'spend'
                          ? formatINR(categoryData.totalSpend)
                          : `${categoryData.totalQuantity}`}
                      </span>
                      <span className="text-[10px] text-slate-500">
                        {categoryMetric === 'spend' ? 'Items Total' : 'Total Units'}
                      </span>
                    </div>
                  </div>

                  {/* Clean Category Legend & Percentages */}
                  <div className="divide-y divide-slate-100 text-xs">
                    {categoryData.slices.map((slice) => {
                      const isSelected = activeCategory === slice.name;
                      return (
                        <button
                          key={slice.name}
                          type="button"
                          onClick={() =>
                            setActiveCategory((prev) => (prev === slice.name ? null : slice.name))
                          }
                          className={`w-full py-1.5 px-1.5 flex items-center justify-between gap-2 text-left rounded transition-colors ${
                            isSelected ? 'bg-amber-50/80 font-bold' : 'hover:bg-slate-50'
                          }`}
                        >
                          <span className="flex items-center gap-2 min-w-0">
                            <span
                              className="w-2.5 h-2.5 rounded-xs shrink-0"
                              style={{ backgroundColor: slice.color }}
                            />
                            <span className="text-slate-800 truncate">{slice.name}</span>
                          </span>
                          <span className="font-mono text-slate-700 shrink-0 tabular-nums">
                            {categoryMetric === 'spend'
                              ? formatINR(slice.spend)
                              : `${slice.quantity}×`}{' '}
                            <span className="text-slate-400">
                              ({slice.percentage.toFixed(0)}%)
                            </span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          </div>
        </>
      )}
    </section>
  );
};
