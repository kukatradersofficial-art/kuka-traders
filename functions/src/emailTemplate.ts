export type OrderStatus =
  | 'Order Placed'
  | 'Order Confirmed'
  | 'Preparing'
  | 'Out for Delivery'
  | 'Delivered'
  | 'Cancelled';

export interface OrderEmailItem {
  name: string;
  brand?: string;
  packSize?: string;
  quantity: number;
  lineTotal: number;
}

export interface OrderEmailData {
  orderNumber: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  deliveryAddress: string;
  locality: string;
  landmark?: string;
  pinCode: string;
  paymentMethod: string;
  paymentStatus: string;
  subtotal: number;
  deliveryCharge: number;
  discountAmount: number;
  totalAmount: number;
  adminNotes?: string;
  items: OrderEmailItem[];
}

export interface StoreEmailBranding {
  storeName: string;
  phone: string;
  whatsappNumber: string;
  email: string;
  address: string;
  appUrl: string;
}

interface StatusCopy {
  badgeText: string;
  badgeBg: string;
  badgeColor: string;
  headline: string;
  summary: string;
  subjectPrefix: string;
}

const STATUS_COPY: Record<OrderStatus, StatusCopy> = {
  'Order Placed': {
    badgeText: 'Order Placed',
    badgeBg: '#FFF7ED',
    badgeColor: '#C2410C',
    headline: 'We have received your grocery order',
    summary:
      'Thank you for shopping with KUKA TRADERS. Our Sopore store team will verify stock and confirm your order shortly.',
    subjectPrefix: 'Order Received',
  },
  'Order Confirmed': {
    badgeText: 'Order Confirmed',
    badgeBg: '#ECFDF5',
    badgeColor: '#047857',
    headline: 'Your order has been confirmed',
    summary:
      'Great news! Our store administrator has confirmed your order and reserved your items for packing.',
    subjectPrefix: 'Order Confirmed',
  },
  Preparing: {
    badgeText: 'Preparing Your Items',
    badgeBg: '#FFF7ED',
    badgeColor: '#C2410C',
    headline: 'Your groceries are being packed',
    summary:
      'Our team at Main Bazar, Sopore is carefully checking quality, weight, and packing your items.',
    subjectPrefix: 'Preparing Order',
  },
  'Out for Delivery': {
    badgeText: 'Out for Delivery',
    badgeBg: '#EFF6FF',
    badgeColor: '#1D4ED8',
    headline: 'Your order is on the way',
    summary:
      'Your KUKA TRADERS order has left our store. Please keep your phone reachable so our delivery partner can coordinate handover.',
    subjectPrefix: 'Out for Delivery',
  },
  Delivered: {
    badgeText: 'Delivered',
    badgeBg: '#ECFDF5',
    badgeColor: '#065F46',
    headline: 'Your order has been delivered',
    summary:
      'Your order is marked as delivered. Thank you for trusting KUKA TRADERS for your everyday household essentials.',
    subjectPrefix: 'Order Delivered',
  },
  Cancelled: {
    badgeText: 'Cancelled',
    badgeBg: '#FEF2F2',
    badgeColor: '#B91C1C',
    headline: 'Your order has been cancelled',
    summary:
      'This order has been cancelled by our store team. Any reserved stock has been released. If you paid online or have questions, please contact us on WhatsApp.',
    subjectPrefix: 'Order Cancelled',
  },
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatINR(amount: number): string {
  const safe = Number.isFinite(amount) ? amount : 0;
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: safe % 1 === 0 ? 0 : 2,
  }).format(safe);
}

export function buildOrderStatusEmail(params: {
  order: OrderEmailData;
  previousStatus: OrderStatus | string;
  newStatus: OrderStatus;
  branding: StoreEmailBranding;
}): { subject: string; html: string; text: string } {
  const { order, previousStatus, newStatus, branding } = params;
  const meta = STATUS_COPY[newStatus] || STATUS_COPY['Order Confirmed'];
  const cleanBaseUrl = (branding.appUrl || 'https://kukatraders.in').replace(/\/+$/, '');
  const trackUrl = `${cleanBaseUrl}/track?order=${encodeURIComponent(order.orderNumber)}`;
  const waDigits = (branding.whatsappNumber || '917006183435').replace(/[^0-9]/g, '') || '917006183435';
  const waUrl = `https://wa.me/${waDigits.startsWith('91') ? waDigits : `91${waDigits}`}?text=${encodeURIComponent(
    `Assalamu Alaikum ${branding.storeName}, I need help regarding order ${order.orderNumber} (Status: ${newStatus}).`
  )}`;

  const subject = `${meta.subjectPrefix}: ${order.orderNumber} — ${branding.storeName}`;

  const itemRowsHtml = order.items
    .map(
      (item) => `
        <tr>
          <td style="padding:10px 12px;border-bottom:1px solid #E7E5E4;font-size:13px;color:#1C1917;">
            <strong>${escapeHtml(item.name)}</strong>
            ${item.packSize ? `<span style="color:#78716C;"> (${escapeHtml(item.packSize)})</span>` : ''}
            <div style="font-size:12px;color:#78716C;margin-top:2px;">Qty: ${Number(item.quantity) || 1}</div>
          </td>
          <td style="padding:10px 12px;border-bottom:1px solid #E7E5E4;font-size:13px;color:#1C1917;text-align:right;font-family:monospace;white-space:nowrap;">
            ${escapeHtml(formatINR(item.lineTotal))}
          </td>
        </tr>`
    )
    .join('');

  const itemLinesText = order.items
    .map(
      (item) =>
        `- ${item.name}${item.packSize ? ` (${item.packSize})` : ''} x ${item.quantity}: ${formatINR(item.lineTotal)}`
    )
    .join('\n');

  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(subject)}</title>
  </head>
  <body style="margin:0;padding:0;background-color:#FAF7F2;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1C1917;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#FAF7F2;padding:24px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background-color:#FFFFFF;border:1px solid #E7E5E4;border-radius:16px;overflow:hidden;">
            <tr>
              <td style="background-color:#F36B16;padding:20px 24px;">
                <div style="font-size:20px;font-weight:800;letter-spacing:0.4px;color:#FFFFFF;">${escapeHtml(branding.storeName)}</div>
                <div style="font-size:12px;color:#FFEDD5;margin-top:2px;">Order Update Notification · ${escapeHtml(order.orderNumber)}</div>
              </td>
            </tr>
            <tr>
              <td style="padding:24px;">
                <div style="display:inline-block;padding:6px 12px;border-radius:8px;background-color:${meta.badgeBg};color:${meta.badgeColor};font-size:12px;font-weight:700;">
                  ${escapeHtml(meta.badgeText)}
                </div>
                <h1 style="margin:14px 0 8px 0;font-size:22px;line-height:1.25;color:#1C1917;">
                  ${escapeHtml(meta.headline)}
                </h1>
                <p style="margin:0 0 16px 0;font-size:14px;line-height:1.55;color:#44403C;">
                  Assalamu Alaikum <strong>${escapeHtml(order.customerName || 'Customer')}</strong>,<br />
                  ${escapeHtml(meta.summary)}
                </p>

                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#FAF7F2;border:1px solid #E7E5E4;border-radius:12px;margin-bottom:18px;">
                  <tr>
                    <td style="padding:14px 16px;font-size:13px;color:#44403C;">
                      <div><strong>Order ID:</strong> <span style="font-family:monospace;color:#1C1917;">${escapeHtml(order.orderNumber)}</span></div>
                      <div style="margin-top:4px;"><strong>Status Update:</strong> ${escapeHtml(String(previousStatus || 'Order Placed'))} &rarr; <strong style="color:#F36B16;">${escapeHtml(newStatus)}</strong></div>
                      <div style="margin-top:4px;"><strong>Payment:</strong> ${escapeHtml(order.paymentMethod)} (${escapeHtml(order.paymentStatus)})</div>
                    </td>
                  </tr>
                </table>

                ${
                  order.adminNotes && order.adminNotes.trim()
                    ? `<div style="margin-bottom:18px;padding:12px 14px;border-left:4px solid #F36B16;background-color:#FFF7ED;border-radius:6px;font-size:13px;color:#7C2D12;">
                        <strong>Note from ${escapeHtml(branding.storeName)}:</strong><br />
                        ${escapeHtml(order.adminNotes.trim())}
                      </div>`
                    : ''
                }

                <div style="margin-bottom:20px;">
                  <a href="${escapeHtml(trackUrl)}" style="display:inline-block;padding:12px 20px;background-color:#F36B16;color:#FFFFFF;text-decoration:none;font-size:13px;font-weight:700;border-radius:10px;">
                    Track Order Live
                  </a>
                </div>

                <h2 style="margin:0 0 8px 0;font-size:14px;color:#1C1917;text-transform:uppercase;letter-spacing:0.5px;">Order Summary</h2>
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border:1px solid #E7E5E4;border-radius:10px;overflow:hidden;margin-bottom:18px;">
                  ${itemRowsHtml}
                  <tr>
                    <td style="padding:10px 12px;font-size:12px;color:#57534E;">Subtotal</td>
                    <td style="padding:10px 12px;font-size:12px;color:#57534E;text-align:right;font-family:monospace;">${escapeHtml(formatINR(order.subtotal))}</td>
                  </tr>
                  <tr>
                    <td style="padding:4px 12px;font-size:12px;color:#57534E;">Delivery Charge</td>
                    <td style="padding:4px 12px;font-size:12px;color:#57534E;text-align:right;font-family:monospace;">${order.deliveryCharge === 0 ? 'Free' : escapeHtml(formatINR(order.deliveryCharge))}</td>
                  </tr>
                  ${
                    order.discountAmount > 0
                      ? `<tr>
                          <td style="padding:4px 12px;font-size:12px;color:#047857;">Coupon Discount</td>
                          <td style="padding:4px 12px;font-size:12px;color:#047857;text-align:right;font-family:monospace;">-${escapeHtml(formatINR(order.discountAmount))}</td>
                        </tr>`
                      : ''
                  }
                  <tr>
                    <td style="padding:12px;border-top:1px solid #E7E5E4;font-size:14px;font-weight:700;color:#1C1917;">Total Amount</td>
                    <td style="padding:12px;border-top:1px solid #E7E5E4;font-size:14px;font-weight:700;color:#1C1917;text-align:right;font-family:monospace;">${escapeHtml(formatINR(order.totalAmount))}</td>
                  </tr>
                </table>

                <div style="padding:14px 16px;background-color:#FAF7F2;border:1px solid #E7E5E4;border-radius:12px;font-size:12px;line-height:1.5;color:#57534E;">
                  <strong style="color:#1C1917;">Delivery Details</strong><br />
                  ${escapeHtml(order.deliveryAddress)}, ${escapeHtml(order.locality)}${order.landmark ? ` (Near ${escapeHtml(order.landmark)})` : ''} — PIN ${escapeHtml(order.pinCode)}<br />
                  Phone: ${escapeHtml(order.customerPhone)}
                </div>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 24px;background-color:#F5F5F4;border-top:1px solid #E7E5E4;font-size:12px;color:#57534E;">
                <div>Need help? <a href="${escapeHtml(waUrl)}" style="color:#F36B16;font-weight:600;text-decoration:none;">Message us on WhatsApp (${escapeHtml(branding.phone)})</a></div>
                <div style="margin-top:4px;color:#78716C;">${escapeHtml(branding.storeName)} · ${escapeHtml(branding.address)}</div>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const text = [
    `${branding.storeName} — Order Status Update (${order.orderNumber})`,
    '',
    `Assalamu Alaikum ${order.customerName || 'Customer'},`,
    meta.headline,
    meta.summary,
    '',
    `Order ID: ${order.orderNumber}`,
    `Status: ${previousStatus} -> ${newStatus}`,
    `Payment: ${order.paymentMethod} (${order.paymentStatus})`,
    order.adminNotes?.trim() ? `Store Note: ${order.adminNotes.trim()}` : '',
    '',
    'Items:',
    itemLinesText,
    `Subtotal: ${formatINR(order.subtotal)}`,
    `Delivery: ${order.deliveryCharge === 0 ? 'Free' : formatINR(order.deliveryCharge)}`,
    order.discountAmount > 0 ? `Discount: -${formatINR(order.discountAmount)}` : '',
    `Total: ${formatINR(order.totalAmount)}`,
    '',
    `Delivery Address: ${order.deliveryAddress}, ${order.locality} - PIN ${order.pinCode}`,
    `Track your order live: ${trackUrl}`,
    `WhatsApp Support: ${branding.phone}`,
  ]
    .filter((line) => line !== undefined)
    .join('\n');

  return { subject, html, text };
}
