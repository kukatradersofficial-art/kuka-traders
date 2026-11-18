import React, { useEffect, useState } from 'react';
import {
  CreditCard,
  Eye,
  Mail,
  MessageCircle,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { storage } from '../../firebase';
import { DEFAULT_STORE_LOGO_URL } from '../../data/seedCatalog';
import type {
  Banner,
  Coupon,
  EmailLog,
  FaqItem,
  Order,
  OrderStatus,
  PaymentConfig,
  PaymentStatus,
  StoreSettings,
  UserProfile,
} from '../../types';
import {
  adminCancelAndRestoreOrder,
  adminUpdateOrder,
  deleteBanner,
  deleteCoupon,
  deleteFaq,
  saveBanner,
  saveCoupon,
  saveFaq,
  saveStoreSettings,
  seedDatabaseIfEmpty,
  updateCustomerStatus,
} from '../../services/firestoreStore';
import { buildWhatsAppLink, formatINR, formatISTDateTime } from '../../utils/format';
import { buildOrderEmailPreview } from '../../utils/orderEmailPreview';

interface AdminOrdersCustomersContentProps {
  tab: 'orders' | 'customers' | 'cms' | 'settings';
  orders: Order[];
  customers: UserProfile[];
  faqs: FaqItem[];
  banners: Banner[];
  coupons: Coupon[];
  settings: StoreSettings;
  paymentConfig?: PaymentConfig;
  emailLogs: EmailLog[];
  adminUid: string;
  onOpenPaymentConfig?: () => void;
}

const ORDER_STATUSES: OrderStatus[] = [
  'Order Placed',
  'Order Confirmed',
  'Preparing',
  'Out for Delivery',
  'Delivered',
  'Cancelled',
];

const PAYMENT_STATUSES: PaymentStatus[] = [
  'Pending',
  'COD Pending',
  'Paid',
  'Failed',
  'Refunded',
];

export const AdminOrdersCustomersContent: React.FC<AdminOrdersCustomersContentProps> = ({
  tab,
  orders,
  customers,
  faqs,
  banners,
  coupons,
  settings,
  paymentConfig,
  emailLogs,
  adminUid,
  onOpenPaymentConfig,
}) => {
  const [statusFilter, setStatusFilter] = useState<'all' | OrderStatus>('all');
  const [custSearch, setCustSearch] = useState('');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [settingsForm, setSettingsForm] = useState<StoreSettings>(settings);
  const [aboutText, setAboutText] = useState(settings.aboutUsParagraphs.join('\n\n'));
  const [feedback, setFeedback] = useState('');
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [savingLogo, setSavingLogo] = useState(false);
  const [showEmailLogsPanel, setShowEmailLogsPanel] = useState(false);
  const [previewEmailOrder, setPreviewEmailOrder] = useState<Order | null>(null);
  const [updatingOrderId, setUpdatingOrderId] = useState<string | null>(null);

  // FAQ form
  const [faqQ, setFaqQ] = useState('');
  const [faqA, setFaqA] = useState('');
  const [faqOrder, setFaqOrder] = useState(faqs.length + 1);
  const [editingFaqId, setEditingFaqId] = useState<string | null>(null);

  // Coupon form
  const [cpnCode, setCpnCode] = useState('');
  const [cpnDesc, setCpnDesc] = useState('');
  const [cpnVal, setCpnVal] = useState(50);
  const [cpnMin, setCpnMin] = useState(500);

  // Banner form
  const [banTitle, setBanTitle] = useState('');
  const [banSub, setBanSub] = useState('');
  const [banCta, setBanCta] = useState('Shop Now');

  // New Zone form
  const [zoneName, setZoneName] = useState('');
  const [zonePin, setZonePin] = useState('193201');
  const [zoneCharge, setZoneCharge] = useState(30);
  const [zoneEta, setZoneEta] = useState('45–60 mins');

  useEffect(() => {
    setSettingsForm(settings);
    setAboutText(settings.aboutUsParagraphs.join('\n\n'));
  }, [settings]);

  const handleVerifyServerUpi = async (order: Order) => {
    try {
      const res = await fetch('/api/payments/verify-upi', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderNumber: order.orderNumber,
          utrNumber: order.paymentReference,
          merchantId: paymentConfig?.zapUpiMerchantId || settings.zapUpiMerchantId || '',
          verifyUrl: paymentConfig?.zapUpiVerifyUrl || settings.zapUpiVerifyUrl || '',
        }),
      });
      const data = (await res.json()) as {
        verified: boolean;
        configured: boolean;
        message?: string;
        utr?: string;
      };
      if (data.verified) {
        await adminUpdateOrder(order.id, {
          paymentStatus: 'Paid',
          paymentReference: data.utr || order.paymentReference,
        });
        setFeedback(`Server verified payment for ${order.orderNumber} and marked Paid.`);
      } else {
        setFeedback(data.message || 'UPI transaction not confirmed by gateway.');
      }
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : 'Unable to verify UPI payment.');
    }
  };

  const compressLogoToDataUrl = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      if (file.type === 'image/svg+xml') {
        const reader = new FileReader();
        reader.onload = () => {
          const res = typeof reader.result === 'string' ? reader.result : '';
          if (res && res.length <= 70000) resolve(res);
          else reject(new Error('SVG logo exceeds 70KB inline limit.'));
        };
        reader.onerror = () => reject(new Error('Failed to read SVG file.'));
        reader.readAsDataURL(file);
        return;
      }
      const objectUrl = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        try {
          const widths = [360, 280, 220, 160];
          for (const maxW of widths) {
            const scale = Math.min(1, maxW / (img.width || maxW));
            const canvas = document.createElement('canvas');
            canvas.width = Math.max(1, Math.round((img.width || maxW) * scale));
            canvas.height = Math.max(1, Math.round((img.height || 100) * scale));
            const ctx = canvas.getContext('2d');
            if (!ctx) continue;
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            const webp = canvas.toDataURL('image/webp', 0.85);
            if (webp.length <= 70000) {
              URL.revokeObjectURL(objectUrl);
              resolve(webp);
              return;
            }
            const png = canvas.toDataURL('image/png');
            if (png.length <= 70000) {
              URL.revokeObjectURL(objectUrl);
              resolve(png);
              return;
            }
          }
          URL.revokeObjectURL(objectUrl);
          reject(new Error('Logo image is too large; please choose a smaller file or URL.'));
        } catch (err) {
          URL.revokeObjectURL(objectUrl);
          reject(err);
        }
      };
      img.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        reject(new Error('Unsupported image format for logo upload.'));
      };
      img.src = objectUrl;
    });
  };

  const handleLogoFileUpload = async (file: File) => {
    setUploadingLogo(true);
    try {
      let resolvedUrl = '';
      try {
        const cleanName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
        const storageRef = ref(storage, `branding/logo_${Date.now()}_${cleanName}`);
        await uploadBytes(storageRef, file);
        resolvedUrl = await getDownloadURL(storageRef);
      } catch {
        resolvedUrl = await compressLogoToDataUrl(file);
      }
      const nextSettings: StoreSettings = { ...settingsForm, logoUrl: resolvedUrl };
      setSettingsForm(nextSettings);
      await saveStoreSettings({
        ...nextSettings,
        aboutUsParagraphs: aboutText
          .split(/\n\n+/)
          .map((s) => s.trim())
          .filter(Boolean)
          .slice(0, 10),
      });
      setFeedback('New store logo uploaded and applied across storefront & admin.');
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : 'Unable to upload logo image.');
    } finally {
      setUploadingLogo(false);
    }
  };

  const handleSaveLogoOnly = async (overrideUrl?: string) => {
    setSavingLogo(true);
    try {
      const targetUrl =
        overrideUrl !== undefined ? overrideUrl : settingsForm.logoUrl ?? DEFAULT_STORE_LOGO_URL;
      const nextSettings: StoreSettings = { ...settingsForm, logoUrl: targetUrl };
      setSettingsForm(nextSettings);
      await saveStoreSettings({
        ...nextSettings,
        aboutUsParagraphs: aboutText
          .split(/\n\n+/)
          .map((s) => s.trim())
          .filter(Boolean)
          .slice(0, 10),
      });
      setFeedback('Store logo updated in Firestore and applied live.');
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : 'Failed to save store logo.');
    } finally {
      setSavingLogo(false);
    }
  };

  const handleOrderStatusChange = async (order: Order, nextStatus: OrderStatus) => {
    if (order.orderStatus === nextStatus) return;
    setUpdatingOrderId(order.id);
    try {
      await adminUpdateOrder(
        order.id,
        { orderStatus: nextStatus },
        order.userId,
        order.orderNumber
      );
      const emailActive = settings.orderStatusEmailsEnabled !== false;
      const notifyStatuses = settings.emailNotifyStatuses || [
        'Order Confirmed',
        'Preparing',
        'Out for Delivery',
        'Delivered',
        'Cancelled',
      ];
      if (emailActive && notifyStatuses.includes(nextStatus) && order.customerEmail) {
        setFeedback(
          `Order ${order.orderNumber} updated to "${nextStatus}". Firebase Cloud Function (onOrderStatusUpdated) triggered for ${order.customerEmail}.`
        );
      } else {
        setFeedback(`Order ${order.orderNumber} updated to "${nextStatus}".`);
      }
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : 'Unable to update order status.');
    } finally {
      setUpdatingOrderId(null);
    }
  };

  if (tab === 'orders') {
    const filteredOrders =
      statusFilter === 'all'
        ? orders
        : orders.filter((o) => o.orderStatus === statusFilter);

    const sortedEmailLogs = [...emailLogs].sort((a, b) => {
      const ta =
        a.createdAt && typeof a.createdAt === 'object' && 'toMillis' in a.createdAt
          ? (a.createdAt as { toMillis: () => number }).toMillis()
          : 0;
      const tb =
        b.createdAt && typeof b.createdAt === 'object' && 'toMillis' in b.createdAt
          ? (b.createdAt as { toMillis: () => number }).toMillis()
          : 0;
      return tb - ta;
    });

    const previewData = previewEmailOrder
      ? buildOrderEmailPreview({ order: previewEmailOrder, settings })
      : null;

    return (
      <div className="space-y-4">
        {feedback && (
          <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-stone-800 flex justify-between gap-3">
            <span>{feedback}</span>
            <button type="button" onClick={() => setFeedback('')} className="underline shrink-0">
              Dismiss
            </button>
          </div>
        )}

        {/* Cloud Function Automated Email Status Bar */}
        <div className="bg-white rounded-xl border border-stone-200 p-4 text-xs space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-start gap-2.5">
              <Mail className="w-4 h-4 text-[#F36B16] shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-stone-900">
                  Automated Order Status Emails ·{' '}
                  <span
                    className={
                      settings.orderStatusEmailsEnabled !== false
                        ? 'text-emerald-700'
                        : 'text-stone-500'
                    }
                  >
                    {settings.orderStatusEmailsEnabled !== false
                      ? 'Cloud Function Trigger Active'
                      : 'Paused in Store Settings'}
                  </span>
                </p>
                <p className="text-stone-500 mt-0.5">
                  Firestore trigger <span className="font-mono">onOrderStatusUpdated</span> watches{' '}
                  <span className="font-mono">orders/&#123;orderId&#125;</span> and emails customers when
                  status changes.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowEmailLogsPanel((v) => !v)}
              className="px-3 py-1.5 rounded-lg border border-stone-300 font-semibold text-stone-700 hover:bg-stone-50"
            >
              {showEmailLogsPanel
                ? 'Hide Email Logs'
                : `View Email Delivery Logs (${sortedEmailLogs.length})`}
            </button>
          </div>

          {showEmailLogsPanel && (
            <div className="pt-3 border-t border-stone-100 space-y-2">
              {sortedEmailLogs.length === 0 ? (
                <p className="text-stone-500 py-2">
                  No Cloud Function email deliveries logged yet. Update an order status after deploying{' '}
                  <span className="font-mono">functions/</span> with SMTP or Resend secrets configured.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-stone-200 text-stone-500">
                        <th className="py-2 pr-3 font-semibold">Order</th>
                        <th className="py-2 pr-3 font-semibold">Recipient</th>
                        <th className="py-2 pr-3 font-semibold">Transition</th>
                        <th className="py-2 pr-3 font-semibold">Status</th>
                        <th className="py-2 pr-3 font-semibold">Provider</th>
                        <th className="py-2 font-semibold">Time</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-100">
                      {sortedEmailLogs.slice(0, 20).map((log) => (
                        <tr key={log.id}>
                          <td className="py-2 pr-3 font-mono font-semibold text-stone-900">
                            {log.orderNumber}
                          </td>
                          <td className="py-2 pr-3 text-stone-700">{log.recipientEmail || '—'}</td>
                          <td className="py-2 pr-3 text-stone-700">
                            {log.previousStatus} &rarr; <strong>{log.newStatus}</strong>
                          </td>
                          <td className="py-2 pr-3">
                            <span
                              className={`font-semibold ${
                                log.deliveryStatus === 'sent'
                                  ? 'text-emerald-700'
                                  : log.deliveryStatus === 'failed'
                                    ? 'text-red-700'
                                    : 'text-amber-700'
                              }`}
                              title={log.errorMessage || log.messageId}
                            >
                              {log.deliveryStatus.toUpperCase()}
                            </span>
                            {log.errorMessage && (
                              <span className="block text-[11px] text-stone-500 truncate max-w-[240px]">
                                {log.errorMessage}
                              </span>
                            )}
                          </td>
                          <td className="py-2 pr-3 font-mono text-stone-600">{log.provider}</td>
                          <td className="py-2 text-stone-500">{formatISTDateTime(log.createdAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-1.5 p-1 bg-stone-100 rounded-xl w-fit text-xs font-semibold">
          <button
            type="button"
            onClick={() => setStatusFilter('all')}
            className={`px-3 py-1.5 rounded-lg ${statusFilter === 'all' ? 'bg-white text-stone-900 shadow-xs' : 'text-stone-600'}`}
          >
            All ({orders.length})
          </button>
          {ORDER_STATUSES.map((st) => (
            <button
              key={st}
              type="button"
              onClick={() => setStatusFilter(st)}
              className={`px-3 py-1.5 rounded-lg ${statusFilter === st ? 'bg-white text-stone-900 shadow-xs' : 'text-stone-600'}`}
            >
              {st}
            </button>
          ))}
        </div>

        {filteredOrders.length === 0 ? (
          <div className="bg-white rounded-xl border border-stone-200 p-10 text-center text-xs text-stone-500">
            No orders match the selected filter.
          </div>
        ) : (
          <div className="space-y-3">
            {filteredOrders.map((order) => {
              const waCustomer = buildWhatsAppLink(
                order.customerPhone,
                `Assalamu Alaikum ${order.customerName}, update from KUKA TRADERS Sopore on your order ${order.orderNumber} (${formatINR(order.totalAmount)}): Status is now ${order.orderStatus}.`
              );
              const latestOrderEmail = sortedEmailLogs.find(
                (l) => l.orderId === order.id || l.orderNumber === order.orderNumber
              );
              return (
                <div
                  key={order.id}
                  className="bg-white rounded-xl border border-stone-200 p-4 space-y-3 text-xs"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3 pb-3 border-b border-stone-100">
                    <div>
                      <p className="font-mono font-bold text-sm text-stone-900">
                        {order.orderNumber} · {formatINR(order.totalAmount)}
                      </p>
                      <p className="text-stone-600 mt-0.5">
                        {order.customerName} ({order.customerPhone}) · {order.customerEmail}
                      </p>
                      <p className="text-stone-500">
                        {order.deliveryAddress}, {order.locality}
                        {order.landmark ? ` (Near ${order.landmark})` : ''} · PIN {order.pinCode}
                      </p>
                      <p className="text-stone-400 mt-0.5">{formatISTDateTime(order.createdAt)}</p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <select
                        value={order.orderStatus}
                        disabled={updatingOrderId === order.id}
                        onChange={(e) =>
                          void handleOrderStatusChange(order, e.target.value as OrderStatus)
                        }
                        className="px-2.5 py-1.5 rounded-lg border border-stone-300 bg-white font-semibold disabled:opacity-60"
                      >
                        {ORDER_STATUSES.map((st) => (
                          <option key={st} value={st}>
                            {st}
                          </option>
                        ))}
                      </select>

                      <select
                        value={order.paymentStatus}
                        onChange={(e) =>
                          adminUpdateOrder(order.id, {
                            paymentStatus: e.target.value as PaymentStatus,
                          })
                        }
                        className="px-2.5 py-1.5 rounded-lg border border-stone-300 bg-white font-semibold"
                      >
                        {PAYMENT_STATUSES.map((ps) => (
                          <option key={ps} value={ps}>
                            Pay: {ps}
                          </option>
                        ))}
                      </select>

                      {order.paymentMethod === 'UPI' && order.paymentStatus !== 'Paid' && (
                        <button
                          type="button"
                          onClick={() => handleVerifyServerUpi(order)}
                          className="px-2.5 py-1.5 rounded-lg border border-[#F36B16] text-[#F36B16] font-semibold hover:bg-orange-50"
                        >
                          Verify Zap UPI
                        </button>
                      )}

                      {order.orderStatus !== 'Cancelled' && (
                        <button
                          type="button"
                          onClick={() => adminCancelAndRestoreOrder(order, adminUid)}
                          className="px-2.5 py-1.5 rounded-lg border border-red-200 text-red-700 font-semibold hover:bg-red-50"
                        >
                          Cancel &amp; Restore Stock
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => setPreviewEmailOrder(order)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-stone-300 text-stone-700 font-semibold hover:bg-stone-50"
                      >
                        <Eye className="w-3.5 h-3.5" /> Preview Email
                      </button>

                      <a
                        href={waCustomer}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 font-semibold"
                      >
                        <MessageCircle className="w-3.5 h-3.5" /> WhatsApp
                      </a>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {order.items.map((it, idx) => (
                      <div key={idx} className="flex justify-between text-stone-700 bg-stone-50 px-3 py-1.5 rounded-lg">
                        <span>
                          {it.name} ({it.packSize}) × {it.quantity}
                        </span>
                        <span className="font-mono font-semibold tabular-nums">
                          {formatINR(it.lineTotal)}
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-[11px] text-stone-500">
                    <div>
                      {order.paymentReference && (
                        <span className="font-mono">
                          Payment Ref / UTR: {order.paymentReference}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Mail className="w-3.5 h-3.5 text-stone-400" />
                      {latestOrderEmail ? (
                        <span>
                          Email ({latestOrderEmail.newStatus}):{' '}
                          <strong
                            className={
                              latestOrderEmail.deliveryStatus === 'sent'
                                ? 'text-emerald-700'
                                : latestOrderEmail.deliveryStatus === 'failed'
                                  ? 'text-red-700'
                                  : 'text-amber-700'
                            }
                          >
                            {latestOrderEmail.deliveryStatus}
                          </strong>{' '}
                          via {latestOrderEmail.provider} · {formatISTDateTime(latestOrderEmail.createdAt)}
                        </span>
                      ) : (
                        <span>
                          Cloud Function emails trigger automatically when status changes (to{' '}
                          {order.customerEmail || 'customer email'}).
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Transactional Email Preview Modal */}
        {previewEmailOrder && previewData && (
          <div className="fixed inset-0 z-50 bg-stone-950/60 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl border border-stone-200 max-w-xl w-full p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto text-xs">
              <div className="flex items-start justify-between gap-3 pb-3 border-b border-stone-200">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-[#F36B16]">
                    Cloud Function Email Preview
                  </p>
                  <h3 className="font-display text-base font-bold text-stone-900 mt-0.5">
                    {previewData.subject}
                  </h3>
                  <p className="text-stone-500 mt-0.5">
                    To: <span className="font-mono">{previewData.recipient}</span> · Reply-To:{' '}
                    <span className="font-mono">{previewData.replyTo}</span>
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setPreviewEmailOrder(null)}
                  className="p-1.5 rounded-lg text-stone-500 hover:bg-stone-100"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="rounded-xl border border-stone-200 overflow-hidden bg-[#FAF7F2]">
                <div className="bg-[#F36B16] text-white px-5 py-4">
                  <p className="font-display font-extrabold text-base">
                    {settings.storeName || 'KUKA TRADERS'}
                  </p>
                  <p className="text-[11px] text-orange-100">
                    Order Update Notification · {previewEmailOrder.orderNumber}
                  </p>
                </div>
                <div className="bg-white p-5 space-y-3">
                  <span
                    className="inline-block px-2.5 py-1 rounded-md font-bold text-[11px]"
                    style={{
                      backgroundColor: previewData.badgeBg,
                      color: previewData.badgeColor,
                    }}
                  >
                    {previewEmailOrder.orderStatus}
                  </span>
                  <h4 className="font-display text-base font-bold text-stone-900">
                    {previewData.headline}
                  </h4>
                  <p className="text-stone-600 leading-relaxed">
                    Assalamu Alaikum <strong>{previewEmailOrder.customerName}</strong>,{' '}
                    {previewData.summary}
                  </p>
                  <div className="p-3 rounded-lg bg-stone-50 border border-stone-200 space-y-1">
                    {previewEmailOrder.items.map((item, idx) => (
                      <div key={idx} className="flex justify-between">
                        <span>
                          {item.name} ({item.packSize}) × {item.quantity}
                        </span>
                        <span className="font-mono font-semibold">{formatINR(item.lineTotal)}</span>
                      </div>
                    ))}
                    <div className="flex justify-between pt-2 border-t border-stone-200 font-bold text-stone-900">
                      <span>Total Amount</span>
                      <span className="font-mono">{previewData.formattedTotal}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  if (tab === 'customers') {
    const filtered = customers.filter((c) => {
      const q = custSearch.trim().toLowerCase();
      return (
        !q ||
        c.name.toLowerCase().includes(q) ||
        c.email.toLowerCase().includes(q) ||
        c.phone.toLowerCase().includes(q)
      );
    });
    const selectedCustomer = customers.find((c) => c.uid === selectedCustomerId);
    const customerOrders = selectedCustomer
      ? orders.filter((o) => o.userId === selectedCustomer.uid)
      : [];

    return (
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 bg-white rounded-xl border border-stone-200 p-5 space-y-4">
          <div className="relative">
            <Search className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={custSearch}
              onChange={(e) => setCustSearch(e.target.value)}
              placeholder="Search customers by name, email, or phone..."
              className="w-full pl-9 pr-3 py-2 rounded-xl border border-stone-300 text-xs"
            />
          </div>

          <div className="divide-y divide-stone-100">
            {filtered.map((c) => {
              const count = orders.filter((o) => o.userId === c.uid).length;
              return (
                <div
                  key={c.uid}
                  className="py-3 flex items-center justify-between gap-3 text-xs"
                >
                  <button
                    type="button"
                    onClick={() => setSelectedCustomerId(c.uid)}
                    className="text-left flex-1"
                  >
                    <p className="font-semibold text-stone-900">{c.name}</p>
                    <p className="text-stone-500">
                      {c.email} · {c.phone || 'No phone saved'} · {count} orders
                    </p>
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      updateCustomerStatus(c.uid, c.status === 'active' ? 'suspended' : 'active')
                    }
                    className={`px-2.5 py-1 rounded-lg border font-semibold ${
                      c.status === 'active'
                        ? 'border-stone-300 text-stone-700 hover:bg-stone-50'
                        : 'border-red-200 bg-red-50 text-red-700'
                    }`}
                  >
                    {c.status === 'active' ? 'Active' : 'Suspended'}
                  </button>
                </div>
              );
            })}
            {filtered.length === 0 && (
              <p className="py-8 text-center text-xs text-stone-500">No customers found.</p>
            )}
          </div>
        </div>

        <div className="lg:col-span-5 bg-white rounded-xl border border-stone-200 p-5 text-xs space-y-4 h-fit">
          {selectedCustomer ? (
            <>
              <div>
                <h3 className="font-display font-bold text-base text-stone-900">
                  {selectedCustomer.name}
                </h3>
                <p className="text-stone-500">{selectedCustomer.email}</p>
                <p className="text-stone-600 mt-1">
                  Phone: {selectedCustomer.phone || '—'} · Language: {selectedCustomer.preferredLang.toUpperCase()}
                </p>
              </div>
              <div>
                <h4 className="font-semibold text-stone-900 mb-2">
                  Order History ({customerOrders.length})
                </h4>
                <div className="space-y-2">
                  {customerOrders.map((o) => (
                    <div key={o.id} className="p-2.5 rounded-lg bg-stone-50 border border-stone-200 flex justify-between">
                      <span>
                        <span className="font-mono font-semibold">{o.orderNumber}</span> · {o.orderStatus}
                      </span>
                      <span className="font-mono font-semibold tabular-nums">
                        {formatINR(o.totalAmount)}
                      </span>
                    </div>
                  ))}
                  {customerOrders.length === 0 && (
                    <p className="text-stone-500">No orders placed by this customer yet.</p>
                  )}
                </div>
              </div>
            </>
          ) : (
            <p className="text-stone-500 py-8 text-center">
              Select a customer to view saved addresses and order history.
            </p>
          )}
        </div>
      </div>
    );
  }

  if (tab === 'cms') {
    return (
      <div className="space-y-6">
        {/* FAQs Manager */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-7 bg-white rounded-xl border border-stone-200 p-5 space-y-3">
            <h3 className="font-display font-bold text-stone-900">FAQs ({faqs.length})</h3>
            <div className="divide-y divide-stone-100">
              {faqs.map((f) => (
                <div key={f.id} className="py-3 flex justify-between gap-3 text-xs">
                  <div>
                    <p className="font-semibold text-stone-900">
                      #{f.sortOrder}. {f.question}
                    </p>
                    <p className="text-stone-600 mt-0.5">{f.answer}</p>
                  </div>
                  <div className="flex items-start gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        setEditingFaqId(f.id);
                        setFaqQ(f.question);
                        setFaqA(f.answer);
                        setFaqOrder(f.sortOrder);
                      }}
                      className="px-2 py-1 rounded border border-stone-300"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteFaq(f.id)}
                      className="p-1 text-red-600"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <form
            onSubmit={async (e) => {
              e.preventDefault();
              await saveFaq({
                id: editingFaqId || undefined,
                question: faqQ,
                answer: faqA,
                sortOrder: faqOrder,
                isActive: true,
              });
              setEditingFaqId(null);
              setFaqQ('');
              setFaqA('');
            }}
            className="lg:col-span-5 bg-white rounded-xl border border-stone-200 p-5 space-y-3 h-fit text-xs"
          >
            <h3 className="font-display font-bold text-stone-900">
              {editingFaqId ? 'Edit FAQ' : 'Add FAQ'}
            </h3>
            <input
              type="text"
              required
              value={faqQ}
              onChange={(e) => setFaqQ(e.target.value)}
              placeholder="Question"
              className="w-full px-3 py-2 rounded-lg border border-stone-300"
            />
            <textarea
              rows={3}
              required
              value={faqA}
              onChange={(e) => setFaqA(e.target.value)}
              placeholder="Answer"
              className="w-full px-3 py-2 rounded-lg border border-stone-300"
            />
            <input
              type="number"
              value={faqOrder}
              onChange={(e) => setFaqOrder(Number(e.target.value))}
              className="w-24 px-3 py-2 rounded-lg border border-stone-300 font-mono"
            />
            <button
              type="submit"
              className="block px-4 py-2 rounded-lg bg-[#F36B16] text-white font-semibold"
            >
              {editingFaqId ? 'Update FAQ' : 'Add FAQ'}
            </button>
          </form>
        </div>

        {/* Coupons & Banners */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-xl border border-stone-200 p-5 space-y-3 text-xs">
            <h3 className="font-display font-bold text-stone-900 text-sm">Coupons</h3>
            {coupons.map((c) => (
              <div key={c.id} className="flex justify-between items-center py-2 border-b border-stone-100">
                <span>
                  <span className="font-mono font-bold text-stone-900">{c.code}</span> · {c.description}
                </span>
                <button type="button" onClick={() => deleteCoupon(c.id)} className="text-red-600">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                await saveCoupon({
                  code: cpnCode,
                  description: cpnDesc,
                  discountType: 'flat',
                  discountValue: cpnVal,
                  minOrderAmount: cpnMin,
                  isActive: true,
                });
                setCpnCode('');
                setCpnDesc('');
              }}
              className="grid grid-cols-2 gap-2 pt-2"
            >
              <input
                type="text"
                required
                placeholder="Code (SOPORE50)"
                value={cpnCode}
                onChange={(e) => setCpnCode(e.target.value)}
                className="px-3 py-2 rounded-lg border border-stone-300 font-mono uppercase"
              />
              <input
                type="number"
                placeholder="Discount ₹"
                value={cpnVal}
                onChange={(e) => setCpnVal(Number(e.target.value))}
                className="px-3 py-2 rounded-lg border border-stone-300 font-mono"
              />
              <input
                type="text"
                required
                placeholder="Description"
                value={cpnDesc}
                onChange={(e) => setCpnDesc(e.target.value)}
                className="col-span-2 px-3 py-2 rounded-lg border border-stone-300"
              />
              <input
                type="number"
                placeholder="Min Order ₹"
                value={cpnMin}
                onChange={(e) => setCpnMin(Number(e.target.value))}
                className="px-3 py-2 rounded-lg border border-stone-300 font-mono"
              />
              <button type="submit" className="px-3 py-2 rounded-lg bg-stone-900 text-white font-semibold">
                Add Coupon
              </button>
            </form>
          </div>

          <div className="bg-white rounded-xl border border-stone-200 p-5 space-y-3 text-xs">
            <h3 className="font-display font-bold text-stone-900 text-sm">Promotional Banners</h3>
            {banners.map((b) => (
              <div key={b.id} className="flex justify-between items-center py-2 border-b border-stone-100">
                <span>
                  <span className="font-semibold text-stone-900">{b.title}</span>
                </span>
                <button type="button" onClick={() => deleteBanner(b.id)} className="text-red-600">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                await saveBanner({
                  title: banTitle,
                  subtitle: banSub,
                  imageUrl: '/src/assets/images/hero_kuka_grocery_1794922636224.jpg',
                  ctaText: banCta,
                  targetCategory: 'all',
                  isActive: true,
                  sortOrder: banners.length + 1,
                });
                setBanTitle('');
                setBanSub('');
              }}
              className="space-y-2 pt-2"
            >
              <input
                type="text"
                required
                placeholder="Banner headline"
                value={banTitle}
                onChange={(e) => setBanTitle(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-stone-300"
              />
              <input
                type="text"
                placeholder="Subtitle"
                value={banSub}
                onChange={(e) => setBanSub(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-stone-300"
              />
              <button type="submit" className="px-4 py-2 rounded-lg bg-stone-900 text-white font-semibold">
                Add Banner
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  // Store Settings & Payment Integrations
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        await saveStoreSettings({
          ...settingsForm,
          aboutUsParagraphs: aboutText
            .split(/\n\n+/)
            .map((s) => s.trim())
            .filter(Boolean)
            .slice(0, 10),
        });
        setFeedback('All store settings saved to Firestore and applied live.');
      }}
      className="space-y-6 text-xs"
    >
      {feedback && (
        <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 flex justify-between">
          <span>{feedback}</span>
          <button type="button" onClick={() => setFeedback('')} className="underline">
            Dismiss
          </button>
        </div>
      )}

      {/* Store Logo & Branding */}
      <div className="bg-white rounded-xl border border-stone-200 p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="font-display font-bold text-sm text-stone-900">
              Store Logo &amp; Branding
            </h3>
            <p className="text-stone-500 mt-0.5">
              Displayed in the customer header, footer, loading screen, and admin console.
            </p>
          </div>
          <button
            type="button"
            disabled={savingLogo || uploadingLogo}
            onClick={() => void handleSaveLogoOnly(DEFAULT_STORE_LOGO_URL)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-stone-300 bg-white font-semibold text-stone-700 hover:bg-stone-50 disabled:opacity-60"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Reset to Default Logo
          </button>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="bg-[#FAF7F2] border border-stone-200 rounded-xl px-4 py-3 flex items-center justify-center min-w-[200px] min-h-[72px]">
            <img
              src={(settingsForm.logoUrl || DEFAULT_STORE_LOGO_URL).trim()}
              alt={settingsForm.storeName || 'KUKA TRADERS'}
              className="h-12 w-auto max-w-[200px] object-contain"
            />
          </div>

          <div className="flex-1 space-y-2.5">
            <div className="flex flex-wrap items-center gap-2">
              <label className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#F36B16] text-white font-semibold hover:bg-[#D95708] cursor-pointer">
                <Upload className="w-3.5 h-3.5" />
                {uploadingLogo ? 'Uploading Logo...' : 'Upload Logo Image'}
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/svg+xml"
                  disabled={uploadingLogo}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void handleLogoFileUpload(file);
                    e.currentTarget.value = '';
                  }}
                  className="hidden"
                />
              </label>
              <button
                type="button"
                disabled={savingLogo || uploadingLogo}
                onClick={() => void handleSaveLogoOnly()}
                className="px-3.5 py-2 rounded-lg bg-stone-900 text-white font-semibold hover:bg-stone-800 disabled:opacity-60"
              >
                {savingLogo ? 'Saving...' : 'Save Logo'}
              </button>
            </div>

            <div>
              <label className="block font-semibold text-stone-700 mb-1">
                Or Paste Logo Image URL / Path
              </label>
              <input
                type="text"
                value={settingsForm.logoUrl ?? ''}
                onChange={(e) =>
                  setSettingsForm({ ...settingsForm, logoUrl: e.target.value })
                }
                placeholder={DEFAULT_STORE_LOGO_URL}
                className="w-full px-3 py-2 rounded-lg border border-stone-300 font-mono text-[11px]"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Payment Configuration Link Card */}
      <div className="bg-white rounded-xl border border-stone-200 p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <CreditCard className="w-5 h-5 text-[#F36B16] shrink-0 mt-0.5" />
          <div>
            <h3 className="font-display font-bold text-sm text-stone-900">
              Payment Configuration &amp; Zap UPI
            </h3>
            <p className="text-stone-600 mt-1">
              Manage Cash on Delivery ({paymentConfig?.codEnabled ? 'Enabled' : 'Disabled'}), UPI / Zap UPI ({paymentConfig?.upiEnabled ? 'Enabled' : 'Disabled'}), Net Banking ({paymentConfig?.netBankingEnabled ? 'Enabled' : 'Disabled'}), and Zap UPI environment settings saved in <span className="font-mono">settings/payment_config</span>.
            </p>
          </div>
        </div>
        {onOpenPaymentConfig && (
          <button
            type="button"
            onClick={onOpenPaymentConfig}
            className="px-4 py-2 rounded-lg bg-[#F36B16] text-white font-semibold hover:bg-[#D95708] shrink-0"
          >
            Open Payment Configuration
          </button>
        )}
      </div>

      {/* Automated Transactional Order Emails (Firebase Cloud Function) */}
      <div className="bg-white rounded-xl border border-stone-200 p-5 space-y-4">
        <div className="flex items-start gap-3">
          <Mail className="w-5 h-5 text-[#F36B16] shrink-0 mt-0.5" />
          <div>
            <h3 className="font-display font-bold text-sm text-stone-900">
              Automated Transactional Order Emails (Firebase Cloud Function)
            </h3>
            <p className="text-stone-600 mt-1">
              Triggers <span className="font-mono">onOrderStatusUpdated</span> automatically on
              Firestore database <span className="font-mono">ai-studio-fa4839e4-247d-4857-9dd8-0e7dcfbb4018</span>{' '}
              whenever an admin updates an order status.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-start">
          <label className="flex items-center gap-2 font-semibold text-stone-800 pt-1">
            <input
              type="checkbox"
              checked={settingsForm.orderStatusEmailsEnabled !== false}
              onChange={(e) =>
                setSettingsForm({ ...settingsForm, orderStatusEmailsEnabled: e.target.checked })
              }
              className="accent-[#F36B16]"
            />
            Send automated customer emails on status changes
          </label>

          <div>
            <label className="block font-semibold text-stone-700 mb-1">Reply-To Email Address</label>
            <input
              type="email"
              value={settingsForm.emailReplyTo ?? settingsForm.email}
              onChange={(e) => setSettingsForm({ ...settingsForm, emailReplyTo: e.target.value })}
              placeholder="kukatraders.official@gmail.com"
              className="w-full px-3 py-2 rounded-lg border border-stone-300 font-mono"
            />
          </div>
        </div>

        <div>
          <p className="font-semibold text-stone-700 mb-2">
            Statuses that trigger automated transactional emails:
          </p>
          <div className="flex flex-wrap gap-3">
            {ORDER_STATUSES.map((status) => {
              const currentList = settingsForm.emailNotifyStatuses || [
                'Order Confirmed',
                'Preparing',
                'Out for Delivery',
                'Delivered',
                'Cancelled',
              ];
              const checked = currentList.includes(status);
              return (
                <label key={status} className="inline-flex items-center gap-1.5 text-stone-800">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) => {
                      const next = e.target.checked
                        ? Array.from(new Set([...currentList, status]))
                        : currentList.filter((s) => s !== status);
                      setSettingsForm({ ...settingsForm, emailNotifyStatuses: next });
                    }}
                    className="accent-[#F36B16]"
                  />
                  <span>{status}</span>
                </label>
              );
            })}
          </div>
        </div>

        <div className="p-3 rounded-xl bg-stone-50 border border-stone-200 font-mono text-[11px] text-stone-700 space-y-1">
          <p className="font-sans font-semibold text-stone-900 text-xs">
            Cloud Function Deployment Commands (Firebase CLI):
          </p>
          <p>firebase functions:secrets:set SMTP_HOST SMTP_PORT SMTP_USER SMTP_PASS SMTP_FROM</p>
          <p>firebase deploy --only functions,firestore:rules</p>
        </div>
      </div>

      {/* General & Sopore Localization Settings */}
      <div className="bg-white rounded-xl border border-stone-200 p-5 space-y-4">
        <h3 className="font-display font-bold text-sm text-stone-900">
          Storefront, Contact &amp; Sopore Coordinates
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="block font-semibold text-stone-700 mb-1">Store Name</label>
            <input
              type="text"
              value={settingsForm.storeName}
              onChange={(e) => setSettingsForm({ ...settingsForm, storeName: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border border-stone-300"
            />
          </div>
          <div>
            <label className="block font-semibold text-stone-700 mb-1">Phone</label>
            <input
              type="text"
              value={settingsForm.phone}
              onChange={(e) => setSettingsForm({ ...settingsForm, phone: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border border-stone-300 font-mono"
            />
          </div>
          <div>
            <label className="block font-semibold text-stone-700 mb-1">WhatsApp Digits</label>
            <input
              type="text"
              value={settingsForm.whatsappNumber}
              onChange={(e) =>
                setSettingsForm({ ...settingsForm, whatsappNumber: e.target.value })
              }
              className="w-full px-3 py-2 rounded-lg border border-stone-300 font-mono"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="block font-semibold text-stone-700 mb-1">Shop Address</label>
            <input
              type="text"
              value={settingsForm.address}
              onChange={(e) => setSettingsForm({ ...settingsForm, address: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border border-stone-300"
            />
          </div>
          <div>
            <label className="block font-semibold text-stone-700 mb-1">PIN Code</label>
            <input
              type="text"
              value={settingsForm.pinCode}
              onChange={(e) => setSettingsForm({ ...settingsForm, pinCode: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border border-stone-300 font-mono"
            />
          </div>
          <div>
            <label className="block font-semibold text-stone-700 mb-1">Opening Hours</label>
            <input
              type="text"
              value={settingsForm.openingHours}
              onChange={(e) => setSettingsForm({ ...settingsForm, openingHours: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border border-stone-300"
            />
          </div>
          <div>
            <label className="block font-semibold text-stone-700 mb-1">Closing Hours</label>
            <input
              type="text"
              value={settingsForm.closingHours}
              onChange={(e) => setSettingsForm({ ...settingsForm, closingHours: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border border-stone-300"
            />
          </div>
          <div>
            <label className="block font-semibold text-stone-700 mb-1">Min Order (₹)</label>
            <input
              type="number"
              value={settingsForm.minOrderAmount}
              onChange={(e) =>
                setSettingsForm({ ...settingsForm, minOrderAmount: Number(e.target.value) })
              }
              className="w-full px-3 py-2 rounded-lg border border-stone-300 font-mono"
            />
          </div>
          <div>
            <label className="block font-semibold text-stone-700 mb-1">Free Delivery Above (₹)</label>
            <input
              type="number"
              value={settingsForm.freeDeliveryThreshold}
              onChange={(e) =>
                setSettingsForm({ ...settingsForm, freeDeliveryThreshold: Number(e.target.value) })
              }
              className="w-full px-3 py-2 rounded-lg border border-stone-300 font-mono"
            />
          </div>
          <div>
            <label className="block font-semibold text-stone-700 mb-1">Latitude</label>
            <input
              type="number"
              step="0.0001"
              value={settingsForm.latitude}
              onChange={(e) =>
                setSettingsForm({ ...settingsForm, latitude: Number(e.target.value) })
              }
              className="w-full px-3 py-2 rounded-lg border border-stone-300 font-mono"
            />
          </div>
          <div>
            <label className="block font-semibold text-stone-700 mb-1">Longitude</label>
            <input
              type="number"
              step="0.0001"
              value={settingsForm.longitude}
              onChange={(e) =>
                setSettingsForm({ ...settingsForm, longitude: Number(e.target.value) })
              }
              className="w-full px-3 py-2 rounded-lg border border-stone-300 font-mono"
            />
          </div>
        </div>

        <div>
          <label className="block font-semibold text-stone-700 mb-1">Promotional Announcement Bar</label>
          <input
            type="text"
            value={settingsForm.promoBannerText}
            onChange={(e) =>
              setSettingsForm({ ...settingsForm, promoBannerText: e.target.value })
            }
            className="w-full px-3 py-2 rounded-lg border border-stone-300"
          />
        </div>

        {/* Delivery Zones Editor */}
        <div className="pt-2 border-t border-stone-100 space-y-2">
          <h4 className="font-semibold text-stone-900">Sopore Delivery Zones</h4>
          {settingsForm.deliveryZones.map((z, idx) => (
            <div key={idx} className="flex items-center justify-between gap-2 bg-stone-50 px-3 py-2 rounded-lg">
              <span>
                <strong>{z.name}</strong> (PIN {z.pinCode}) · {formatINR(z.charge)} · {z.estimatedTime}
              </span>
              <button
                type="button"
                onClick={() =>
                  setSettingsForm({
                    ...settingsForm,
                    deliveryZones: settingsForm.deliveryZones.filter((_, i) => i !== idx),
                  })
                }
                className="text-red-600"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            <input
              type="text"
              placeholder="Zone name"
              value={zoneName}
              onChange={(e) => setZoneName(e.target.value)}
              className="sm:col-span-2 px-3 py-1.5 rounded-lg border border-stone-300"
            />
            <input
              type="text"
              placeholder="PIN"
              value={zonePin}
              onChange={(e) => setZonePin(e.target.value)}
              className="px-3 py-1.5 rounded-lg border border-stone-300 font-mono"
            />
            <input
              type="number"
              placeholder="Charge ₹"
              value={zoneCharge}
              onChange={(e) => setZoneCharge(Number(e.target.value))}
              className="px-3 py-1.5 rounded-lg border border-stone-300 font-mono"
            />
            <button
              type="button"
              onClick={() => {
                if (!zoneName.trim()) return;
                setSettingsForm({
                  ...settingsForm,
                  deliveryZones: [
                    ...settingsForm.deliveryZones,
                    {
                      name: zoneName.trim(),
                      pinCode: zonePin.trim() || '193201',
                      charge: zoneCharge,
                      estimatedTime: zoneEta,
                    },
                  ],
                });
                setZoneName('');
              }}
              className="inline-flex items-center justify-center gap-1 px-3 py-1.5 rounded-lg bg-stone-900 text-white font-semibold"
            >
              <Plus className="w-3.5 h-3.5" /> Add Zone
            </button>
          </div>
        </div>

        {/* About Us & Policies */}
        <div className="pt-2 border-t border-stone-100 space-y-3">
          <div>
            <label className="block font-semibold text-stone-700 mb-1">
              About Us Paragraphs (separate paragraphs with blank line)
            </label>
            <textarea
              rows={4}
              value={aboutText}
              onChange={(e) => setAboutText(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-stone-300"
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block font-semibold text-stone-700 mb-1">Return &amp; Cancellation Policy</label>
              <textarea
                rows={3}
                value={settingsForm.returnPolicy}
                onChange={(e) =>
                  setSettingsForm({ ...settingsForm, returnPolicy: e.target.value })
                }
                className="w-full px-3 py-2 rounded-lg border border-stone-300"
              />
            </div>
            <div>
              <label className="block font-semibold text-stone-700 mb-1">Privacy Policy</label>
              <textarea
                rows={3}
                value={settingsForm.privacyPolicy}
                onChange={(e) =>
                  setSettingsForm({ ...settingsForm, privacyPolicy: e.target.value })
                }
                className="w-full px-3 py-2 rounded-lg border border-stone-300"
              />
            </div>
            <div>
              <label className="block font-semibold text-stone-700 mb-1">Terms &amp; Conditions</label>
              <textarea
                rows={3}
                value={settingsForm.termsConditions}
                onChange={(e) =>
                  setSettingsForm({ ...settingsForm, termsConditions: e.target.value })
                }
                className="w-full px-3 py-2 rounded-lg border border-stone-300"
              />
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={async () => {
            await seedDatabaseIfEmpty(true);
            setFeedback('Default Sopore catalog & settings synced to Firestore.');
          }}
          className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-stone-300 bg-white font-semibold text-stone-700 hover:bg-stone-50"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Sync / Restore Initial Catalog
        </button>

        <button
          type="submit"
          className="px-6 py-2.5 rounded-xl bg-[#F36B16] text-white font-semibold hover:bg-[#D95708]"
        >
          Save All Store Settings
        </button>
      </div>
    </form>
  );
};
