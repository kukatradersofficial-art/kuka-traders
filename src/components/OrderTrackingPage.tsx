import React, { useEffect, useMemo, useState } from 'react';
import {
  collection,
  onSnapshot,
  query,
  where,
} from 'firebase/firestore';
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Clock,
  Download,
  Mail,
  MapPin,
  MessageCircle,
  Package,
  PackageCheck,
  Search,
  ShoppingBag,
  Truck,
  XCircle,
} from 'lucide-react';
import { db, handleFirestoreError, OperationType } from '../firebase';
import type { AppLanguage, EmailLog, Order, OrderStatus, StoreSettings } from '../types';
import { customerCancelOrder } from '../services/firestoreStore';
import { buildWhatsAppLink, formatINR, formatISTDateTime } from '../utils/format';
import { downloadOrderInvoicePdf } from '../utils/invoicePdf';

interface OrderTrackingPageProps {
  userId: string;
  isAdmin: boolean;
  recentOrders: Order[];
  emailLogs?: EmailLog[];
  settings: StoreSettings;
  lang: AppLanguage;
  initialOrderId?: string;
  onBackToStore: () => void;
  onOpenAccount: () => void;
}

const ORDER_STEPS: Array<{
  status: OrderStatus;
  label: string;
  labelUrdu: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  {
    status: 'Order Placed',
    label: 'Order Placed',
    labelUrdu: 'آرڈر موصول ہوا',
    description: 'Your order has been received by KUKA TRADERS.',
    icon: ShoppingBag,
  },
  {
    status: 'Order Confirmed',
    label: 'Order Confirmed',
    labelUrdu: 'آرڈر کی تصدیق',
    description: 'Store team has verified items and payment details.',
    icon: CheckCircle2,
  },
  {
    status: 'Preparing',
    label: 'Preparing',
    labelUrdu: 'پیکنگ جاری ہے',
    description: 'Groceries are being packed cleanly at our store.',
    icon: Package,
  },
  {
    status: 'Out for Delivery',
    label: 'Out for Delivery',
    labelUrdu: 'ڈیلیوری کے لیے روانہ',
    description: 'Your order is on the way or ready for pickup.',
    icon: Truck,
  },
  {
    status: 'Delivered',
    label: 'Delivered',
    labelUrdu: 'ڈیلیور ہو گیا',
    description: 'Order completed and handed over.',
    icon: PackageCheck,
  },
];

function normalizeOrderLookupInput(raw: string, knownOrders: Order[]): {
  orderNumberQuery: string | null;
  matchedLocal: Order | null;
} {
  const trimmed = raw.trim();
  if (!trimmed) return { orderNumberQuery: null, matchedLocal: null };

  const upper = trimmed.toUpperCase();
  // Direct match in already-loaded live orders by orderNumber or Firestore document ID
  const direct = knownOrders.find(
    (o) =>
      o.orderNumber.toUpperCase() === upper ||
      o.id.toLowerCase() === trimmed.toLowerCase() ||
      (/^[0-9]{6}$/.test(trimmed) && o.orderNumber.toUpperCase() === `KT-${trimmed}`)
  );

  if (direct) {
    return { orderNumberQuery: direct.orderNumber, matchedLocal: direct };
  }

  if (upper.startsWith('KT-')) {
    return { orderNumberQuery: upper, matchedLocal: null };
  }
  if (/^[0-9]{6}$/.test(trimmed)) {
    return { orderNumberQuery: `KT-${trimmed}`, matchedLocal: null };
  }
  return { orderNumberQuery: upper, matchedLocal: null };
}

export const OrderTrackingPage: React.FC<OrderTrackingPageProps> = ({
  userId,
  isAdmin,
  recentOrders,
  emailLogs = [],
  settings,
  lang,
  initialOrderId = '',
  onBackToStore,
  onOpenAccount,
}) => {
  const isUrdu = lang === 'ur';
  const [inputOrderId, setInputOrderId] = useState(initialOrderId);
  const [submittedQuery, setSubmittedQuery] = useState(initialOrderId);
  const [liveTrackedOrder, setLiveTrackedOrder] = useState<Order | null>(null);
  const [searching, setSearching] = useState(Boolean(initialOrderId));
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState('');

  useEffect(() => {
    if (initialOrderId) {
      setInputOrderId(initialOrderId);
      setSubmittedQuery(initialOrderId);
    }
  }, [initialOrderId]);

  const { orderNumberQuery, matchedLocal } = useMemo(
    () => normalizeOrderLookupInput(submittedQuery, recentOrders),
    [submittedQuery, recentOrders]
  );

  // Real-time Firestore listener scoped strictly by ownership (or admin) for the queried Order ID
  useEffect(() => {
    if (!orderNumberQuery) {
      setLiveTrackedOrder(null);
      setSearching(false);
      return;
    }

    setSearching(true);
    setCancelError('');

    const q = isAdmin
      ? query(collection(db, 'orders'), where('orderNumber', '==', orderNumberQuery))
      : query(
          collection(db, 'orders'),
          where('userId', '==', userId),
          where('orderNumber', '==', orderNumberQuery)
        );

    const unsub = onSnapshot(
      q,
      (snap) => {
        if (!snap.empty) {
          const docSnap = snap.docs[0];
          setLiveTrackedOrder({ id: docSnap.id, ...(docSnap.data() as Omit<Order, 'id'>) });
        } else {
          setLiveTrackedOrder(null);
        }
        setSearching(false);
      },
      (err) => {
        setSearching(false);
        handleFirestoreError(err, OperationType.LIST, 'orders');
      }
    );

    return () => unsub();
  }, [orderNumberQuery, userId, isAdmin]);

  const trackedOrder = liveTrackedOrder ?? matchedLocal;
  const hasSearched = Boolean(submittedQuery.trim());

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setCancelError('');
    setSubmittedQuery(inputOrderId.trim());
  };

  const handleQuickSelect = (orderNumber: string) => {
    setCancelError('');
    setInputOrderId(orderNumber);
    setSubmittedQuery(orderNumber);
  };

  const handleCancelOrder = async (orderId: string) => {
    setCancelling(true);
    setCancelError('');
    try {
      await customerCancelOrder(orderId);
    } catch (err) {
      setCancelError(err instanceof Error ? err.message : 'Unable to cancel order.');
    } finally {
      setCancelling(false);
    }
  };

  const stepIndex = trackedOrder
    ? ORDER_STEPS.findIndex((s) => s.status === trackedOrder.orderStatus)
    : -1;
  const isCancelled = trackedOrder?.orderStatus === 'Cancelled';
  const isPickup = Boolean(
    trackedOrder &&
      (trackedOrder.locality === 'Store Pickup' ||
        trackedOrder.deliveryAddress.startsWith('Store Pickup'))
  );

  const latestEmailLog = useMemo(() => {
    if (!trackedOrder) return null;
    return (
      emailLogs
        .filter((l) => l.orderId === trackedOrder.id || l.orderNumber === trackedOrder.orderNumber)
        .sort((a, b) => {
          const ta =
            a.createdAt && typeof a.createdAt === 'object' && 'toMillis' in a.createdAt
              ? (a.createdAt as { toMillis: () => number }).toMillis()
              : 0;
          const tb =
            b.createdAt && typeof b.createdAt === 'object' && 'toMillis' in b.createdAt
              ? (b.createdAt as { toMillis: () => number }).toMillis()
              : 0;
          return tb - ta;
        })[0] || null
    );
  }, [emailLogs, trackedOrder]);

  return (
    <section className="max-w-5xl mx-auto px-4 sm:px-6 py-8 sm:py-10 space-y-6">
      {/* Top Back Navigation */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={onBackToStore}
          className="inline-flex items-center gap-1.5 text-sm font-bold text-[#131921] hover:text-[#FF9900] whitespace-nowrap transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          {isUrdu ? 'اسٹور پر واپس جائیں' : 'Back to Store'}
        </button>

        <button
          type="button"
          onClick={onOpenAccount}
          className="text-xs font-semibold text-slate-600 hover:text-slate-900 underline whitespace-nowrap"
        >
          {isUrdu ? 'تمام آرڈرز اور پروفائل دیکھیں' : 'View Full Order History & Account'}
        </button>
      </div>

      {/* Order ID Lookup Box */}
      <div className="bg-white rounded-3xl border border-slate-200/80 shadow-xs p-6 sm:p-8 space-y-5">
        <div className="space-y-1.5">
          <h1 className="font-display text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
            {isUrdu ? 'اپنا آرڈر ٹریک کریں' : 'Track Order'}
          </h1>
          <p className="text-sm text-slate-600 max-w-2xl">
            {isUrdu
              ? 'اپنا آرڈر آئی ڈی (مثلاً KT-123456) درج کریں اور فوری لائیو اسٹیٹس دیکھیں۔'
              : 'Enter your KUKA TRADERS Order ID (for example, KT-482910) to view real-time status updates without scrolling through your account history.'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={inputOrderId}
              onChange={(e) => setInputOrderId(e.target.value)}
              placeholder={isUrdu ? 'آرڈر آئی ڈی درج کریں (KT-XXXXXX)' : 'Enter Order ID (e.g. KT-123456)'}
              aria-label="Order ID"
              className="w-full pl-11 pr-4 py-3 rounded-full border border-slate-300 bg-[#F5F7FA] text-sm font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#FF9900]"
            />
          </div>
          <div className="flex items-center gap-2">
            <button
              type="submit"
              disabled={!inputOrderId.trim()}
              className="px-6 py-3 rounded-full bg-[#FF9900] text-slate-950 text-sm font-extrabold hover:bg-[#E68A00] transition-colors whitespace-nowrap disabled:opacity-50 shadow-xs"
            >
              {isUrdu ? 'اسٹیٹس دیکھیں' : 'Track Live Order'}
            </button>
            {hasSearched && (
              <button
                type="button"
                onClick={() => {
                  setInputOrderId('');
                  setSubmittedQuery('');
                  setLiveTrackedOrder(null);
                  setCancelError('');
                }}
                className="px-4 py-3 rounded-full border border-slate-300 text-xs font-bold text-slate-700 hover:bg-slate-50 whitespace-nowrap"
              >
                {isUrdu ? 'صاف کریں' : 'Clear'}
              </button>
            )}
          </div>
        </form>

        {/* Quiet 1-Tap Recent Order IDs */}
        {recentOrders.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 pt-1">
            <span>{isUrdu ? 'حالیہ آرڈر آئی ڈیز:' : 'Your recent orders:'}</span>
            {recentOrders.slice(0, 4).map((ord) => {
              const active = submittedQuery.toUpperCase() === ord.orderNumber.toUpperCase();
              return (
                <button
                  key={ord.id}
                  type="button"
                  onClick={() => handleQuickSelect(ord.orderNumber)}
                  className={`px-3 py-1 rounded-full font-mono font-bold transition-colors ${
                    active
                      ? 'bg-[#131921] text-[#FF9900]'
                      : 'bg-[#F3F5F8] text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  {ord.orderNumber}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Results Area */}
      {!hasSearched ? (
        <div className="bg-white rounded-3xl border border-slate-200/80 shadow-xs p-8 sm:p-10 text-center space-y-2.5">
          <div className="w-14 h-14 rounded-full bg-[#F5F7FA] flex items-center justify-center mx-auto">
            <Package className="w-7 h-7 text-slate-400" />
          </div>
          <h2 className="font-display text-lg font-extrabold text-slate-900">
            {isUrdu ? 'آرڈر آئی ڈی اوپر درج کریں' : 'Ready to track your delivery'}
          </h2>
          <p className="text-sm text-slate-500 max-w-md mx-auto">
            {isUrdu
              ? 'آپ کو آرڈر کی تصدیق پر KT سے شروع ہونے والا آرڈر آئی ڈی ملا ہوگا۔'
              : 'Your Order ID starts with KT- and is shown immediately after checkout as well as in your order history.'}
          </p>
        </div>
      ) : searching && !trackedOrder ? (
        <div className="bg-white rounded-3xl border border-slate-200/80 shadow-xs p-10 text-center space-y-3">
          <div className="w-7 h-7 border-2 border-[#FF9900] border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm font-medium text-slate-600">
            Looking up Order <span className="font-mono font-semibold">{orderNumberQuery}</span>...
          </p>
        </div>
      ) : !trackedOrder ? (
        <div className="bg-white rounded-3xl border border-slate-200/80 shadow-xs p-8 sm:p-10 text-center space-y-3">
          <AlertCircle className="w-10 h-10 text-amber-500 mx-auto" />
          <h2 className="font-display text-lg font-bold text-slate-900">
            Order ID <span className="font-mono">{submittedQuery.trim().toUpperCase()}</span> not found
          </h2>
          <p className="text-sm text-slate-600 max-w-lg mx-auto">
            Please verify the Order ID and make sure you are signed in with the same account used to place the order.
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-3xl border border-slate-200/80 shadow-xs p-6 sm:p-8 space-y-6">
          {/* Screen 9 Centered Status Hero Badge */}
          <div className="text-center space-y-2 pb-5 border-b border-slate-100">
            <div
              className={`w-14 h-14 rounded-full mx-auto flex items-center justify-center shadow-sm ${
                isCancelled
                  ? 'bg-red-100 text-red-600'
                  : 'bg-emerald-500 text-white'
              }`}
            >
              {isCancelled ? (
                <XCircle className="w-7 h-7" />
              ) : (
                <CheckCircle2 className="w-8 h-8" />
              )}
            </div>
            <h2 className="font-display text-2xl font-extrabold text-slate-900">
              {isCancelled
                ? 'Order Cancelled'
                : trackedOrder.orderStatus === 'Delivered'
                  ? 'Order Delivered!'
                  : trackedOrder.orderStatus === 'Order Placed'
                    ? 'Order Placed!'
                    : `${trackedOrder.orderStatus}!`}
            </h2>
            <p className="text-sm text-slate-500">
              {isCancelled
                ? 'This order was cancelled. Contact WhatsApp support for assistance.'
                : trackedOrder.orderStatus === 'Delivered'
                  ? 'Your KUKA TRADERS order has been completed.'
                  : 'Your order is on the way · Real-time status updates enabled.'}
            </p>
            <div className="inline-flex flex-wrap items-center justify-center gap-2 pt-1 text-xs text-slate-500">
              <span className="px-3 py-1 rounded-full bg-[#F5F7FA] font-mono font-bold text-slate-900">
                {trackedOrder.orderNumber}
              </span>
              <span>·</span>
              <span className="inline-flex items-center gap-1 font-semibold text-emerald-600">
                <Clock className="w-3.5 h-3.5" />
                Placed {formatISTDateTime(trackedOrder.createdAt)}
              </span>
              <span>·</span>
              <span className="font-mono font-extrabold text-slate-900 tabular-nums">
                {formatINR(trackedOrder.totalAmount)}
              </span>
            </div>
          </div>

          {latestEmailLog && latestEmailLog.deliveryStatus === 'sent' && (
            <div className="flex flex-wrap items-center gap-2 px-4 py-3 rounded-2xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-900">
              <Mail className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>
                Status update email sent to{' '}
                <span className="font-mono font-semibold">{latestEmailLog.recipientEmail}</span> for{' '}
                <strong>{latestEmailLog.newStatus}</strong> ({formatISTDateTime(latestEmailLog.createdAt)}).
              </span>
            </div>
          )}

          {/* Screen 9 Vertical Timeline Stepper */}
          {isCancelled ? (
            <div className="p-4 rounded-2xl bg-red-50 border border-red-200 text-sm text-red-900 flex items-start gap-3">
              <XCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold">This order was cancelled</p>
                <p className="text-xs text-red-800 mt-0.5">
                  Need help reordering or checking refund details? Contact KUKA TRADERS support on WhatsApp below.
                </p>
              </div>
            </div>
          ) : (
            <div className="max-w-xl mx-auto py-2">
              <div className="space-y-0">
                {ORDER_STEPS.map((step, idx) => {
                  const Icon = step.icon;
                  const isCurrent = idx === stepIndex;
                  const isCompleted = idx < stepIndex || trackedOrder.orderStatus === 'Delivered';
                  const isActive = idx <= stepIndex;
                  const isLast = idx === ORDER_STEPS.length - 1;

                  return (
                    <div key={step.status} className="relative flex gap-4 pb-6 last:pb-0">
                      {!isLast && (
                        <div
                          className={`absolute left-[15px] top-8 bottom-0 w-0.5 ${
                            idx < stepIndex ? 'bg-emerald-500' : 'bg-slate-200'
                          }`}
                        />
                      )}
                      <div className="relative z-10 shrink-0 mt-0.5">
                        {isCompleted ? (
                          <div className="w-8 h-8 rounded-full bg-emerald-500 text-white flex items-center justify-center shadow-xs">
                            <CheckCircle2 className="w-4 h-4" />
                          </div>
                        ) : isCurrent ? (
                          <div className="w-8 h-8 rounded-full bg-white border-2 border-emerald-500 text-emerald-600 flex items-center justify-center shadow-xs">
                            <Icon className="w-4 h-4" />
                          </div>
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-slate-100 border border-slate-200 text-slate-400 flex items-center justify-center">
                            <Icon className="w-4 h-4" />
                          </div>
                        )}
                      </div>
                      <div className="flex-1 pt-0.5">
                        <div className="flex items-center justify-between gap-2">
                          <p
                            className={`text-sm font-bold ${
                              isActive ? 'text-slate-900' : 'text-slate-400'
                            }`}
                          >
                            {isUrdu ? step.labelUrdu : step.label}
                          </p>
                          {isCurrent && (
                            <span className="px-2.5 py-0.5 rounded-full bg-[#FF9900] text-slate-950 text-[10px] font-extrabold uppercase">
                              Current
                            </span>
                          )}
                        </div>
                        <p className={`text-xs mt-0.5 ${isActive ? 'text-slate-500' : 'text-slate-400'}`}>
                          {step.description}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 2-Column Detail Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-slate-100">
            <div className="bg-[#F5F7FA] rounded-2xl p-4 space-y-2 text-xs">
              <h3 className="font-display font-bold text-sm text-slate-900 flex items-center gap-1.5">
                <MapPin className="w-4 h-4 text-[#FF9900]" />
                {isPickup ? 'Store Pickup Details' : 'Delivery Details'}
              </h3>
              <div className="space-y-1 text-slate-700">
                <p className="font-bold text-slate-900">
                  {trackedOrder.customerName} · {trackedOrder.customerPhone}
                </p>
                <p>{trackedOrder.deliveryAddress}</p>
                <p>
                  {trackedOrder.locality}
                  {trackedOrder.landmark ? ` · ${trackedOrder.landmark}` : ''} · PIN{' '}
                  <span className="font-mono">{trackedOrder.pinCode}</span>
                </p>
                {trackedOrder.deliveryInstructions && (
                  <p className="text-slate-500 pt-1">
                    Note: {trackedOrder.deliveryInstructions}
                  </p>
                )}
                {trackedOrder.adminNotes && (
                  <p className="text-[#E68A00] font-semibold pt-1">
                    Store Update: {trackedOrder.adminNotes}
                  </p>
                )}
              </div>
            </div>

            <div className="bg-[#F5F7FA] rounded-2xl p-4 space-y-2.5 text-xs">
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-display font-bold text-sm text-slate-900">
                  Order Items &amp; Payment
                </h3>
                <span className="text-slate-600 font-medium">
                  {trackedOrder.paymentMethod} · <strong>{trackedOrder.paymentStatus}</strong>
                </span>
              </div>

              <div className="space-y-1.5 text-slate-700 max-h-40 overflow-y-auto pr-1">
                {trackedOrder.items.map((item, idx) => (
                  <div key={idx} className="flex justify-between gap-2">
                    <span>
                      {item.name} ({item.packSize}) × {item.quantity}
                    </span>
                    <span className="font-mono tabular-nums shrink-0 font-semibold">
                      {formatINR(item.lineTotal)}
                    </span>
                  </div>
                ))}
              </div>

              <div className="border-t border-slate-200 pt-2 space-y-1 text-slate-600">
                <div className="flex justify-between">
                  <span>Subtotal</span>
                  <span className="font-mono tabular-nums">
                    {formatINR(trackedOrder.subtotal)}
                  </span>
                </div>
                {trackedOrder.discountAmount > 0 && (
                  <div className="flex justify-between text-emerald-700">
                    <span>Discount ({trackedOrder.couponCode})</span>
                    <span className="font-mono tabular-nums">
                      -{formatINR(trackedOrder.discountAmount)}
                    </span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span>Shipping</span>
                  <span className={`font-mono tabular-nums font-bold ${trackedOrder.deliveryCharge === 0 ? 'text-emerald-600' : ''}`}>
                    {trackedOrder.deliveryCharge === 0
                      ? 'FREE'
                      : formatINR(trackedOrder.deliveryCharge)}
                  </span>
                </div>
                <div className="flex justify-between font-extrabold text-slate-900 text-sm pt-1 border-t border-slate-200">
                  <span>Total</span>
                  <span className="font-mono tabular-nums">
                    {formatINR(trackedOrder.totalAmount)}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {cancelError && (
            <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-800">
              {cancelError}
            </div>
          )}

          {/* Screen 9 Pill Action Row */}
          <div className="pt-4 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
            <span className="text-xs text-slate-500">
              Status updates automatically in real time as our store packs and dispatches your order.
            </span>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => downloadOrderInvoicePdf(trackedOrder, settings)}
                className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-full bg-[#FF9900] text-slate-950 text-xs font-extrabold hover:bg-[#E68A00] transition-colors whitespace-nowrap shadow-xs"
              >
                <Download className="w-3.5 h-3.5" />
                Download Invoice (PDF)
              </button>

              {trackedOrder.orderStatus === 'Order Placed' && (
                <button
                  type="button"
                  disabled={cancelling}
                  onClick={() => void handleCancelOrder(trackedOrder.id)}
                  className="px-4 py-2.5 rounded-full border border-red-200 text-red-700 text-xs font-bold hover:bg-red-50 disabled:opacity-60 whitespace-nowrap"
                >
                  {cancelling ? 'Cancelling...' : 'Cancel Order'}
                </button>
              )}

              <a
                href={buildWhatsAppLink(
                  settings.whatsappNumber,
                  `Assalamu Alaikum KUKA TRADERS, I am tracking Order ${trackedOrder.orderNumber} (${formatINR(trackedOrder.totalAmount)}). Current status: ${trackedOrder.orderStatus}.`
                )}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-full bg-[#131921] text-white text-xs font-bold hover:bg-slate-800 whitespace-nowrap"
              >
                <MessageCircle className="w-4 h-4 text-emerald-400" />
                WhatsApp Support
              </a>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
