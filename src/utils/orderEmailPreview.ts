import type { Order, OrderStatus, StoreSettings } from '../types';
import { buildWhatsAppLink, formatINR } from './format';

const STATUS_PREVIEW_META: Record<
  OrderStatus,
  { badgeBg: string; badgeColor: string; headline: string; summary: string; subjectPrefix: string }
> = {
  'Order Placed': {
    badgeBg: '#FFF7ED',
    badgeColor: '#C2410C',
    headline: 'We have received your grocery order',
    summary:
      'Thank you for shopping with KUKA TRADERS. Our Sopore store team will verify stock and confirm your order shortly.',
    subjectPrefix: 'Order Received',
  },
  'Order Confirmed': {
    badgeBg: '#ECFDF5',
    badgeColor: '#047857',
    headline: 'Your order has been confirmed',
    summary:
      'Great news! Our store administrator has confirmed your order and reserved your items for packing.',
    subjectPrefix: 'Order Confirmed',
  },
  Preparing: {
    badgeBg: '#FFF7ED',
    badgeColor: '#C2410C',
    headline: 'Your groceries are being packed',
    summary:
      'Our team at Main Bazar, Sopore is carefully checking quality, weight, and packing your items.',
    subjectPrefix: 'Preparing Order',
  },
  'Out for Delivery': {
    badgeBg: '#EFF6FF',
    badgeColor: '#1D4ED8',
    headline: 'Your order is on the way',
    summary:
      'Your KUKA TRADERS order has left our store. Please keep your phone reachable so our delivery partner can coordinate handover.',
    subjectPrefix: 'Out for Delivery',
  },
  Delivered: {
    badgeBg: '#ECFDF5',
    badgeColor: '#065F46',
    headline: 'Your order has been delivered',
    summary:
      'Your order is marked as delivered. Thank you for trusting KUKA TRADERS for your everyday household essentials.',
    subjectPrefix: 'Order Delivered',
  },
  Cancelled: {
    badgeBg: '#FEF2F2',
    badgeColor: '#B91C1C',
    headline: 'Your order has been cancelled',
    summary:
      'This order has been cancelled by our store team. Any reserved stock has been released. If you paid online or have questions, please contact us on WhatsApp.',
    subjectPrefix: 'Order Cancelled',
  },
};

export function buildOrderEmailPreview(params: {
  order: Order;
  newStatus?: OrderStatus;
  settings: StoreSettings;
}): {
  subject: string;
  recipient: string;
  replyTo: string;
  headline: string;
  summary: string;
  badgeBg: string;
  badgeColor: string;
  trackUrl: string;
  whatsappUrl: string;
  formattedTotal: string;
} {
  const { order, settings } = params;
  const targetStatus = params.newStatus ?? order.orderStatus;
  const meta = STATUS_PREVIEW_META[targetStatus] || STATUS_PREVIEW_META['Order Confirmed'];
  const origin =
    typeof window !== 'undefined' && window.location?.origin
      ? window.location.origin
      : 'https://kukatraders.in';

  return {
    subject: `${meta.subjectPrefix}: ${order.orderNumber} — ${settings.storeName || 'KUKA TRADERS'}`,
    recipient: order.customerEmail || 'No customer email on file',
    replyTo: settings.emailReplyTo || settings.email || 'kukatraders.official@gmail.com',
    headline: meta.headline,
    summary: meta.summary,
    badgeBg: meta.badgeBg,
    badgeColor: meta.badgeColor,
    trackUrl: `${origin}/track?order=${encodeURIComponent(order.orderNumber)}`,
    whatsappUrl: buildWhatsAppLink(
      settings.whatsappNumber,
      `Assalamu Alaikum ${settings.storeName}, I need help regarding order ${order.orderNumber} (Status: ${targetStatus}).`
    ),
    formattedTotal: formatINR(order.totalAmount),
  };
}
