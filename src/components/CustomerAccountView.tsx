import React, { useMemo, useState } from 'react';
import {
  BarChart3,
  ChevronRight,
  Download,
  LogOut,
  MapPin,
  MessageCircle,
  Package,
  Plus,
  ShieldCheck,
  Trash2,
  Truck,
  User as UserIcon,
} from 'lucide-react';
import type { Order, OrderStatus, Product, StoreSettings, UserProfile } from '../types';
import { customerCancelOrder, updateUserProfile } from '../services/firestoreStore';
import { buildWhatsAppLink, formatINR, formatISTDateTime, slugifyId } from '../utils/format';
import { downloadOrderInvoicePdf } from '../utils/invoicePdf';
import { CustomerSpendingInsights } from './CustomerSpendingInsights';

interface CustomerAccountViewProps {
  profile: UserProfile | null;
  orders: Order[];
  products?: Product[];
  settings: StoreSettings;
  onSignOut: () => void;
  onOpenTrackOrder?: (orderNumber?: string) => void;
}

const ORDER_STEPS: OrderStatus[] = [
  'Order Placed',
  'Order Confirmed',
  'Preparing',
  'Out for Delivery',
  'Delivered',
];

function getOrderTimestampMs(order: Order): number {
  const ts = order.createdAt as unknown;
  if (!ts) return 0;
  if (typeof ts === 'object' && ts !== null && 'toMillis' in ts) {
    return (ts as { toMillis: () => number }).toMillis();
  }
  if (ts instanceof Date) return ts.getTime();
  if (typeof ts === 'number') return ts;
  return 0;
}

export const CustomerAccountView: React.FC<CustomerAccountViewProps> = ({
  profile,
  orders,
  products = [],
  settings,
  onSignOut,
  onOpenTrackOrder,
}) => {
  const [name, setName] = useState(profile?.name || '');
  const [phone, setPhone] = useState(profile?.phone || '');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [addrLabel, setAddrLabel] = useState('Home');
  const [addrLine, setAddrLine] = useState('');
  const [addrLocality, setAddrLocality] = useState(settings.deliveryZones[0]?.name || 'Main Bazar');
  const [addrLandmark, setAddrLandmark] = useState('');
  const [addrPin, setAddrPin] = useState('193201');
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const sortedOrders = useMemo(
    () => [...orders].sort((a, b) => getOrderTimestampMs(b) - getOrderTimestampMs(a)),
    [orders]
  );

  if (!profile) {
    return (
      <div className="max-w-3xl mx-auto py-12 px-4 text-center">
        <UserIcon className="w-10 h-10 text-slate-400 mx-auto mb-3" />
        <p className="font-semibold text-slate-800">Please sign in to view your account and orders.</p>
      </div>
    );
  }

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMsg('');
    try {
      await updateUserProfile(profile.uid, {
        name: name || profile.name,
        phone,
        savedAddresses: profile.savedAddresses,
        preferredLang: profile.preferredLang,
      });
      setMsg('Profile updated.');
    } finally {
      setSaving(false);
    }
  };

  const handleAddAddress = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addrLine.trim() || profile.savedAddresses.length >= 5) return;
    setSaving(true);
    try {
      const next = [
        ...profile.savedAddresses,
        {
          id: slugifyId('addr', 'addr'),
          label: addrLabel.trim() || 'Home',
          recipientName: name || profile.name,
          phone: phone || profile.phone,
          addressLine: addrLine.trim(),
          locality: addrLocality,
          landmark: addrLandmark.trim(),
          pinCode: addrPin.trim() || '193201',
        },
      ];
      await updateUserProfile(profile.uid, {
        name: name || profile.name,
        phone,
        savedAddresses: next,
        preferredLang: profile.preferredLang,
      });
      setAddrLine('');
      setAddrLandmark('');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteAddress = async (id: string) => {
    await updateUserProfile(profile.uid, {
      name: name || profile.name,
      phone,
      savedAddresses: profile.savedAddresses.filter((a) => a.id !== id),
      preferredLang: profile.preferredLang,
    });
  };

  const handleDownloadInvoice = (order: Order) => {
    setDownloadingId(order.id);
    try {
      downloadOrderInvoicePdf(order, settings);
    } finally {
      setTimeout(() => setDownloadingId(null), 400);
    }
  };

  const initials = (profile.name || profile.email || 'KT')
    .split(/\s+/)
    .map((s) => s[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <section className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
      {/* Screen 10 Midnight Navy Account Header Card */}
      <div className="bg-gradient-to-br from-[#0B1324] via-[#131921] to-[#1E293B] text-white rounded-3xl p-6 sm:p-8 shadow-md relative overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-5 relative z-10">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-white text-[#131921] border-2 border-[#FF9900] flex items-center justify-center font-display text-xl font-extrabold shrink-0 shadow-sm">
              {initials}
            </div>
            <div>
              <h1 className="font-display text-2xl sm:text-3xl font-extrabold tracking-tight">
                {profile.name || 'KUKA Customer'}
              </h1>
              <p className="text-xs sm:text-sm text-slate-300 mt-0.5">{profile.email}</p>
              <div className="mt-2 inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-[#FF9900] text-slate-950 text-[11px] font-extrabold">
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>{profile.status === 'active' ? 'Verified KUKA Member' : 'Account Notice'}</span>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onSignOut}
            className="self-start sm:self-center inline-flex items-center gap-2 px-4 py-2.5 rounded-full bg-white/10 border border-white/20 text-white text-xs font-bold hover:bg-white/20 transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" />
            Sign Out
          </button>
        </div>
      </div>

      {/* Screen 10 Quick White Menu Strip */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs divide-y divide-slate-100 overflow-hidden">
        <a
          href="#account-orders"
          className="px-5 py-3.5 flex items-center justify-between hover:bg-[#F5F7FA] transition-colors"
        >
          <div className="flex items-center gap-3">
            <Package className="w-4 h-4 text-[#FF9900]" />
            <span className="text-sm font-bold text-slate-900">My Orders &amp; PDF Invoices</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded-full bg-[#FF9900] text-slate-950 text-[11px] font-extrabold tabular-nums">
              {sortedOrders.length}
            </span>
            <ChevronRight className="w-4 h-4 text-slate-400" />
          </div>
        </a>
        <a
          href="#account-addresses"
          className="px-5 py-3.5 flex items-center justify-between hover:bg-[#F5F7FA] transition-colors"
        >
          <div className="flex items-center gap-3">
            <MapPin className="w-4 h-4 text-[#131921]" />
            <span className="text-sm font-bold text-slate-900">Your Saved Addresses</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-500 tabular-nums">
              {profile.savedAddresses.length}/5
            </span>
            <ChevronRight className="w-4 h-4 text-slate-400" />
          </div>
        </a>
        <a
          href="#account-insights"
          className="px-5 py-3.5 flex items-center justify-between hover:bg-[#F5F7FA] transition-colors"
        >
          <div className="flex items-center gap-3">
            <BarChart3 className="w-4 h-4 text-[#FF9900]" />
            <span className="text-sm font-bold text-slate-900">Spending Trends &amp; Category Insights</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-500">Last 6 months</span>
            <ChevronRight className="w-4 h-4 text-slate-400" />
          </div>
        </a>
        {onOpenTrackOrder && (
          <button
            type="button"
            onClick={() => onOpenTrackOrder('')}
            className="w-full px-5 py-3.5 flex items-center justify-between hover:bg-[#F5F7FA] transition-colors text-left"
          >
            <div className="flex items-center gap-3">
              <Truck className="w-4 h-4 text-emerald-600" />
              <span className="text-sm font-bold text-slate-900">Track Live Order by ID</span>
            </div>
            <ChevronRight className="w-4 h-4 text-slate-400" />
          </button>
        )}
      </div>

      {/* Past 6 Months Spending Trends & Category Purchase Distribution */}
      <CustomerSpendingInsights orders={orders} products={products} />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left: Profile & Saved Addresses */}
        <div className="lg:col-span-5 space-y-6">
          <form
            onSubmit={handleSaveProfile}
            className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-5 sm:p-6 space-y-4"
          >
            <h2 className="font-display text-base font-extrabold text-slate-900">Contact Profile</h2>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">Full Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#FF9900]"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">Mobile (+91)</label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+91 7006XXXXXX"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#FF9900]"
              />
            </div>
            {msg && <p className="text-xs text-emerald-700 font-semibold">{msg}</p>}
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2.5 rounded-full bg-[#131921] text-white text-xs font-bold hover:bg-slate-800 transition-colors"
            >
              {saving ? 'Saving...' : 'Save Contact Details'}
            </button>
          </form>

          <div
            id="account-addresses"
            className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-5 sm:p-6 space-y-4"
          >
            <h2 className="font-display text-base font-extrabold text-slate-900">
              Saved Delivery Addresses ({profile.savedAddresses.length}/5)
            </h2>

            {profile.savedAddresses.length > 0 && (
              <div className="divide-y divide-slate-100 border-t border-b border-slate-100">
                {profile.savedAddresses.map((addr) => (
                  <div
                    key={addr.id}
                    className="py-3 flex items-start justify-between gap-2 text-xs"
                  >
                    <div>
                      <p className="font-bold text-slate-900">
                        {addr.label} · {addr.locality}
                      </p>
                      <p className="text-slate-600 mt-0.5">{addr.addressLine}</p>
                      <p className="text-slate-500 mt-0.5">
                        {addr.landmark ? `${addr.landmark} · ` : ''}PIN {addr.pinCode}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDeleteAddress(addr.id)}
                      aria-label="Delete address"
                      className="text-slate-400 hover:text-red-600 p-1 rounded-full hover:bg-red-50"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {profile.savedAddresses.length < 5 && (
              <form onSubmit={handleAddAddress} className="space-y-2.5 pt-1">
                <p className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-[#FF9900]" /> Add New Address
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    value={addrLabel}
                    onChange={(e) => setAddrLabel(e.target.value)}
                    placeholder="Label (Home / Shop)"
                    className="px-3 py-2 rounded-xl border border-slate-300 text-xs focus:outline-none focus:ring-2 focus:ring-[#FF9900]"
                  />
                  <input
                    type="text"
                    maxLength={6}
                    value={addrPin}
                    onChange={(e) => setAddrPin(e.target.value.replace(/[^0-9]/g, ''))}
                    placeholder="PIN Code (193201)"
                    className="px-3 py-2 rounded-xl border border-slate-300 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-[#FF9900]"
                  />
                </div>
                <input
                  type="text"
                  required
                  list="kuka-saved-locality-suggestions"
                  value={addrLocality}
                  onChange={(e) => setAddrLocality(e.target.value)}
                  placeholder="Area / Town / Village / City"
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-[#FF9900]"
                />
                <datalist id="kuka-saved-locality-suggestions">
                  {settings.deliveryZones.map((z) => (
                    <option key={z.name} value={z.name} />
                  ))}
                </datalist>
                <input
                  type="text"
                  required
                  value={addrLine}
                  onChange={(e) => setAddrLine(e.target.value)}
                  placeholder="Street / Mohalla / House No."
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs focus:outline-none focus:ring-2 focus:ring-[#FF9900]"
                />
                <input
                  type="text"
                  value={addrLandmark}
                  onChange={(e) => setAddrLandmark(e.target.value)}
                  placeholder="Landmark (optional)"
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs focus:outline-none focus:ring-2 focus:ring-[#FF9900]"
                />
                <button
                  type="submit"
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-[#FF9900] text-slate-950 text-xs font-extrabold hover:bg-[#E68A00] transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" /> Save Address
                </button>
              </form>
            )}
          </div>
        </div>

        {/* Right: Order History, Invoices & Live Tracking */}
        <div id="account-orders" className="lg:col-span-7 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="font-display font-extrabold text-slate-900 text-lg">
                Order History &amp; Invoices ({sortedOrders.length})
              </h2>
              <p className="text-xs text-slate-500">
                Download a formatted PDF invoice for any past or active order
              </p>
            </div>
            {onOpenTrackOrder && (
              <button
                type="button"
                onClick={() => onOpenTrackOrder('')}
                className="text-xs font-bold text-[#E68A00] hover:underline whitespace-nowrap"
              >
                Track by Order ID →
              </button>
            )}
          </div>

          {sortedOrders.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-10 text-center">
              <Package className="w-10 h-10 text-slate-300 mx-auto mb-2" />
              <p className="font-bold text-slate-800">No orders placed yet</p>
              <p className="text-sm text-slate-500 mt-1">
                Your KUKA TRADERS grocery orders, live updates, and downloadable PDF invoices will appear here.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {sortedOrders.map((order) => {
                const stepIdx = ORDER_STEPS.indexOf(order.orderStatus);
                const isCancelled = order.orderStatus === 'Cancelled';
                const waSupport = buildWhatsAppLink(
                  settings.whatsappNumber,
                  `Assalamu Alaikum KUKA TRADERS, I need support regarding Order ${order.orderNumber} (${formatINR(order.totalAmount)}). Current status: ${order.orderStatus}.`
                );

                return (
                  <article
                    key={order.id}
                    className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-5 space-y-4"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3 pb-3 border-b border-slate-100">
                      <div>
                        <p className="font-mono font-extrabold text-slate-900 text-sm">
                          {order.orderNumber}
                        </p>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {formatISTDateTime(order.createdAt)} · {order.paymentMethod} ({order.paymentStatus})
                        </p>
                      </div>
                      <div className="text-right">
                        <span className="font-mono font-extrabold text-base text-slate-900 tabular-nums">
                          {formatINR(order.totalAmount)}
                        </span>
                        <p
                          className={`text-xs font-bold mt-0.5 ${
                            isCancelled
                              ? 'text-red-700'
                              : order.orderStatus === 'Delivered'
                                ? 'text-emerald-600'
                                : 'text-[#E68A00]'
                          }`}
                        >
                          {order.orderStatus}
                        </p>
                      </div>
                    </div>

                    {/* Tracking Steps */}
                    {!isCancelled && (
                      <div className="grid grid-cols-5 gap-1.5 text-center">
                        {ORDER_STEPS.map((st, idx) => {
                          const active = idx <= stepIdx;
                          return (
                            <div key={st} className="space-y-1">
                              <div
                                className={`h-1.5 rounded-full ${
                                  active ? 'bg-emerald-500' : 'bg-slate-200'
                                }`}
                              />
                              <span
                                className={`block text-[10px] leading-tight ${
                                  active ? 'font-bold text-slate-900' : 'text-slate-400'
                                }`}
                              >
                                {st}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Line Items Snapshot */}
                    <div className="space-y-1.5 text-xs text-slate-700">
                      {order.items.map((item, i) => (
                        <div key={i} className="flex justify-between gap-3">
                          <span>
                            {item.name} ({item.packSize}) × {item.quantity}
                          </span>
                          <span className="font-mono tabular-nums shrink-0 font-semibold">
                            {formatINR(item.lineTotal)}
                          </span>
                        </div>
                      ))}
                      {(order.deliveryCharge > 0 || order.discountAmount > 0) && (
                        <div className="pt-1.5 border-t border-slate-100 flex flex-wrap justify-between gap-2 text-[11px] text-slate-500">
                          <span>
                            Subtotal: <span className="font-mono tabular-nums">{formatINR(order.subtotal)}</span>
                            {order.discountAmount > 0 && (
                              <>
                                {' '}· Discount:{' '}
                                <span className="font-mono tabular-nums text-emerald-700">
                                  -{formatINR(order.discountAmount)}
                                </span>
                              </>
                            )}
                          </span>
                          <span>
                            Shipping:{' '}
                            <span className="font-mono tabular-nums font-bold">
                              {order.deliveryCharge === 0 ? 'FREE' : formatINR(order.deliveryCharge)}
                            </span>
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2.5 text-xs">
                      <span className="text-slate-500">
                        Deliver to: {order.deliveryAddress}, {order.locality} ({order.pinCode})
                      </span>
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleDownloadInvoice(order)}
                          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-[#FF9900] text-slate-950 font-extrabold hover:bg-[#E68A00] transition-colors whitespace-nowrap shadow-xs"
                        >
                          <Download className="w-3.5 h-3.5" />
                          {downloadingId === order.id ? 'Generating PDF...' : 'Download Invoice (PDF)'}
                        </button>
                        {onOpenTrackOrder && (
                          <button
                            type="button"
                            onClick={() => onOpenTrackOrder(order.orderNumber)}
                            className="px-3.5 py-2 rounded-full bg-[#131921] text-white font-bold hover:bg-slate-800 transition-colors whitespace-nowrap"
                          >
                            Track
                          </button>
                        )}
                        {order.orderStatus === 'Order Placed' && (
                          <button
                            type="button"
                            onClick={() => customerCancelOrder(order.id)}
                            className="px-3.5 py-2 rounded-full border border-red-200 text-red-700 font-bold hover:bg-red-50 transition-colors whitespace-nowrap"
                          >
                            Cancel Order
                          </button>
                        )}
                        <a
                          href={waSupport}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full border border-emerald-200 bg-emerald-50 text-emerald-800 font-bold hover:bg-emerald-100 transition-colors whitespace-nowrap"
                        >
                          <MessageCircle className="w-3.5 h-3.5" />
                          WhatsApp
                        </a>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </section>
  );
};
