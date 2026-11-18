import React from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Bell, Check } from 'lucide-react';
import type { Order, Product, Review, StoreNotification, UserProfile } from '../../types';
import { markNotificationRead } from '../../services/firestoreStore';
import { formatINR, formatISTDateTime } from '../../utils/format';
import { analyzeSingleReview, buildRatingDistribution } from '../../utils/reviewSentiment';

interface AdminOverviewProps {
  products: Product[];
  orders: Order[];
  customers: UserProfile[];
  reviews: Review[];
  notifications: StoreNotification[];
  onNavigateTab: (tab: string) => void;
}

export const AdminOverview: React.FC<AdminOverviewProps> = ({
  products,
  orders,
  customers,
  reviews,
  notifications,
  onNavigateTab,
}) => {
  const activeProducts = products.filter((p) => !p.isDeleted);
  const outOfStock = activeProducts.filter((p) => p.stockQuantity <= 0);
  const lowStock = activeProducts.filter(
    (p) => p.stockQuantity > 0 && p.stockQuantity <= p.lowStockThreshold
  );
  const pendingOrders = orders.filter(
    (o) => o.orderStatus !== 'Delivered' && o.orderStatus !== 'Cancelled'
  );
  const completedOrders = orders.filter((o) => o.orderStatus === 'Delivered');
  const totalRevenue = orders
    .filter((o) => o.orderStatus !== 'Cancelled')
    .reduce((sum, o) => sum + (o.totalAmount || 0), 0);

  const bestSellers = [...activeProducts]
    .sort((a, b) => (b.salesCount || 0) - (a.salesCount || 0))
    .slice(0, 5);

  const analyzedReviews = reviews.map(analyzeSingleReview);
  const ratingBuckets = buildRatingDistribution(analyzedReviews);
  const reviewTotal = analyzedReviews.length;
  const avgRating =
    reviewTotal > 0
      ? analyzedReviews.reduce((sum, r) => sum + (Number(r.review.rating) || 0), 0) / reviewTotal
      : 0;
  const posReviews = analyzedReviews.filter((r) => r.sentiment === 'positive').length;
  const neuReviews = analyzedReviews.filter((r) => r.sentiment === 'neutral').length;
  const negReviews = analyzedReviews.filter((r) => r.sentiment === 'negative').length;
  const pendingReviews = analyzedReviews.filter((r) => r.review.status === 'pending').length;

  // Category stock & sales chart data
  const catStatsMap: Record<string, { category: string; sales: number; products: number }> = {};
  for (const p of activeProducts) {
    const key = p.categoryName || 'Other';
    if (!catStatsMap[key]) {
      catStatsMap[key] = { category: key.slice(0, 14), sales: 0, products: 0 };
    }
    catStatsMap[key].sales += p.salesCount || 0;
    catStatsMap[key].products += 1;
  }
  const chartData = Object.values(catStatsMap)
    .sort((a, b) => b.sales - a.sales)
    .slice(0, 8);

  const unreadAdminNotifs = notifications.filter((n) => n.targetRole === 'admin' && !n.isRead);

  const kpis = [
    { label: 'Total Revenue', value: formatINR(totalRevenue), sub: 'Excl. cancelled orders' },
    { label: 'Total Orders', value: String(orders.length), sub: `${pendingOrders.length} active · ${completedOrders.length} delivered` },
    { label: 'Customers', value: String(customers.length), sub: 'Registered Sopore buyers' },
    { label: 'Catalog Products', value: String(activeProducts.length), sub: `${lowStock.length} low · ${outOfStock.length} out of stock` },
  ];

  return (
    <div className="space-y-6">
      {/* KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {kpis.map((k) => (
          <div key={k.label} className="bg-white rounded-xl border border-stone-200 p-5">
            <p className="text-xs font-medium text-stone-500">{k.label}</p>
            <p className="font-mono text-2xl font-bold text-stone-900 mt-1 tabular-nums">
              {k.value}
            </p>
            <p className="text-xs text-stone-500 mt-1">{k.sub}</p>
          </div>
        ))}
      </div>

      {/* Chart + Alerts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 bg-white rounded-xl border border-stone-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-display font-bold text-stone-900 text-base">
                Units Sold by Category
              </h3>
              <p className="text-xs text-stone-500">Live sales distribution across KUKA TRADERS catalog</p>
            </div>
          </div>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E7E5E4" />
                <XAxis
                  dataKey="category"
                  tick={{ fontSize: 11, fill: '#57534E' }}
                  interval={0}
                  angle={-20}
                  textAnchor="end"
                />
                <YAxis tick={{ fontSize: 11, fill: '#57534E' }} />
                <Tooltip />
                <Bar dataKey="sales" fill="#F36B16" radius={[6, 6, 0, 0]} name="Units Sold" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="lg:col-span-5 bg-white rounded-xl border border-stone-200 p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-display font-bold text-stone-900 text-base flex items-center gap-2">
                <Bell className="w-4 h-4 text-[#F36B16]" />
                Store Alerts &amp; Notifications
              </h3>
              <span className="text-xs font-mono text-stone-500 tabular-nums">
                {unreadAdminNotifs.length} unread
              </span>
            </div>

            <div className="space-y-2.5 max-h-56 overflow-y-auto pr-1">
              {unreadAdminNotifs.map((n) => (
                <div
                  key={n.id}
                  className="p-3 rounded-lg bg-orange-50/70 border border-orange-200/70 flex items-start justify-between gap-2 text-xs"
                >
                  <div>
                    <p className="font-semibold text-stone-900">{n.title}</p>
                    <p className="text-stone-600 mt-0.5">{n.message}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => markNotificationRead(n.id)}
                    aria-label="Mark notification read"
                    className="p-1 text-stone-500 hover:text-stone-900"
                  >
                    <Check className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}

              {[...outOfStock, ...lowStock].slice(0, 5).map((p) => (
                <div
                  key={p.id}
                  className="p-2.5 rounded-lg bg-stone-50 border border-stone-200 flex items-center justify-between gap-2 text-xs"
                >
                  <div>
                    <p className="font-semibold text-stone-900">{p.name}</p>
                    <p className={p.stockQuantity <= 0 ? 'text-red-700 font-medium' : 'text-amber-700 font-medium'}>
                      {p.stockQuantity <= 0
                        ? 'Out of Stock'
                        : `Low Stock (${p.stockQuantity} ${p.unit} left)`}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onNavigateTab('inventory')}
                    className="px-2.5 py-1 rounded-md border border-stone-300 bg-white text-stone-700 font-medium hover:bg-stone-100"
                  >
                    Restock
                  </button>
                </div>
              ))}

              {unreadAdminNotifs.length === 0 && outOfStock.length === 0 && lowStock.length === 0 && (
                <p className="text-xs text-stone-500 py-8 text-center">
                  All stock levels and alerts are clear.
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Customer Review Sentiment Snapshot */}
      <div className="bg-white rounded-xl border border-stone-200 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <h3 className="font-display font-bold text-stone-900 text-base">
              Customer Review Sentiment &amp; Ratings Snapshot
            </h3>
            <p className="text-xs text-stone-500">
              {reviewTotal > 0
                ? `${reviewTotal} total reviews · ${pendingReviews} awaiting moderation`
                : 'Live customer ratings and sentiment trends appear as buyers leave reviews'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => onNavigateTab('reviews')}
            className="text-xs font-semibold text-[#F36B16] hover:underline whitespace-nowrap shrink-0"
          >
            View Sentiment Analytics
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-center">
          <div className="md:col-span-4 space-y-2">
            <div className="flex items-baseline gap-2">
              <span className="font-mono text-3xl font-bold text-stone-900 tabular-nums">
                {reviewTotal > 0 ? avgRating.toFixed(2) : '—'}
              </span>
              <span className="text-xs font-mono text-stone-500 tabular-nums">/ 5.0 avg</span>
            </div>
            <div className="h-2.5 w-full bg-stone-100 rounded-full overflow-hidden flex">
              {reviewTotal > 0 && (
                <>
                  <div style={{ width: `${(posReviews / reviewTotal) * 100}%`, backgroundColor: '#16A34A' }} />
                  <div style={{ width: `${(neuReviews / reviewTotal) * 100}%`, backgroundColor: '#D97706' }} />
                  <div style={{ width: `${(negReviews / reviewTotal) * 100}%`, backgroundColor: '#DC2626' }} />
                </>
              )}
            </div>
            <p className="text-xs text-stone-600 font-mono tabular-nums">
              {posReviews} positive · {neuReviews} neutral · {negReviews} negative
            </p>
          </div>

          <div className="md:col-span-8 grid grid-cols-5 gap-2">
            {ratingBuckets.map((b) => (
              <div key={b.star} className="p-2.5 rounded-lg bg-stone-50 border border-stone-200 text-center">
                <p className="text-xs font-semibold text-stone-700 tabular-nums">{b.star} ★</p>
                <p className="font-mono text-base font-bold text-stone-900 mt-0.5 tabular-nums">
                  {b.count}
                </p>
                <p className="font-mono text-[11px] text-stone-500 tabular-nums">
                  {b.percentage.toFixed(0)}%
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Recent Orders + Best Sellers */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 bg-white rounded-xl border border-stone-200 p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-display font-bold text-stone-900 text-base">Recent Orders</h3>
            <button
              type="button"
              onClick={() => onNavigateTab('orders')}
              className="text-xs font-semibold text-[#F36B16] hover:underline"
            >
              Manage All Orders
            </button>
          </div>
          {orders.length === 0 ? (
            <p className="text-xs text-stone-500 py-8 text-center">No orders placed yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead>
                  <tr className="border-b border-stone-200 text-stone-500">
                    <th className="py-2 pr-3 font-semibold">Order</th>
                    <th className="py-2 pr-3 font-semibold">Customer</th>
                    <th className="py-2 pr-3 font-semibold">Status</th>
                    <th className="py-2 text-right font-semibold">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {orders.slice(0, 6).map((o) => (
                    <tr key={o.id} className="hover:bg-stone-50">
                      <td className="py-2.5 pr-3 font-mono font-semibold text-stone-900">
                        {o.orderNumber}
                        <span className="block text-[10px] font-sans font-normal text-stone-400">
                          {formatISTDateTime(o.createdAt)}
                        </span>
                      </td>
                      <td className="py-2.5 pr-3 text-stone-700">
                        {o.customerName}
                        <span className="block text-[10px] text-stone-400">{o.locality}</span>
                      </td>
                      <td className="py-2.5 pr-3 font-medium text-stone-800">{o.orderStatus}</td>
                      <td className="py-2.5 text-right font-mono font-semibold text-stone-900 tabular-nums">
                        {formatINR(o.totalAmount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="lg:col-span-5 bg-white rounded-xl border border-stone-200 p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-display font-bold text-stone-900 text-base">Best-Selling Products</h3>
            <button
              type="button"
              onClick={() => onNavigateTab('products')}
              className="text-xs font-semibold text-[#F36B16] hover:underline"
            >
              View Catalog
            </button>
          </div>
          <div className="space-y-3">
            {bestSellers.map((p) => (
              <div key={p.id} className="flex items-center justify-between gap-3 text-xs pb-2.5 border-b border-stone-100 last:border-0">
                <div className="min-w-0">
                  <p className="font-semibold text-stone-900 truncate">{p.name}</p>
                  <p className="text-stone-500">
                    {p.brand} · {p.packSize} · Stock: <span className="font-mono tabular-nums">{p.stockQuantity}</span>
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="font-mono font-bold text-stone-900 tabular-nums">
                    {p.salesCount} sold
                  </p>
                  <p className="font-mono text-stone-500 tabular-nums">
                    {p.sellingPrice > 0 ? formatINR(p.sellingPrice) : 'Price Req.'}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
