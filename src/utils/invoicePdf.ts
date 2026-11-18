import { jsPDF } from 'jspdf';
import type { Order, StoreSettings } from '../types';
import { formatISTDateTime } from './format';

function formatPdfCurrency(amount: number): string {
  const safe = Number.isFinite(amount) ? amount : 0;
  const formatted = new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: safe % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(safe);
  return `Rs. ${formatted}`;
}

export function downloadOrderInvoicePdf(order: Order, settings: StoreSettings): void {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 15;
  const contentWidth = pageWidth - margin * 2;
  const storeName = (settings.storeName || 'KUKA TRADERS').trim();

  // Top Brand Accent Bar
  doc.setFillColor(243, 107, 22); // #F36B16
  doc.rect(0, 0, pageWidth, 4, 'F');

  // Left: Store Identity
  let y = 16;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(20, 20, 19);
  doc.text(storeName, margin, y);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(87, 83, 78);
  y += 5;
  const storeAddressLines = doc.splitTextToSize(
    `${settings.address || 'Main Bazar, near Jamia Masjid, Sopore, Baramulla, J&K'} - ${settings.pinCode || '193201'}`,
    95
  );
  doc.text(storeAddressLines, margin, y);
  y += storeAddressLines.length * 4;
  doc.text(`Phone: ${settings.phone || '+91 7006183435'}`, margin, y);
  y += 4;
  doc.text(`Email: ${settings.email || 'kukatraders.official@gmail.com'}`, margin, y);

  // Right: Invoice Header Block
  const rightX = pageWidth - margin;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(243, 107, 22);
  doc.text('ORDER INVOICE', rightX, 16, { align: 'right' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(68, 64, 60);
  doc.text(`Invoice No: INV-${order.orderNumber}`, rightX, 22, { align: 'right' });
  doc.text(`Order ID: ${order.orderNumber}`, rightX, 26.5, { align: 'right' });
  doc.text(`Date (IST): ${formatISTDateTime(order.createdAt)}`, rightX, 31, { align: 'right' });
  doc.text(`Order Status: ${order.orderStatus}`, rightX, 35.5, { align: 'right' });

  // Horizontal Divider
  y = Math.max(y + 6, 42);
  doc.setDrawColor(229, 229, 227);
  doc.setLineWidth(0.35);
  doc.line(margin, y, pageWidth - margin, y);

  // Customer & Delivery Details Section
  y += 7;
  const colMid = margin + contentWidth / 2 + 4;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(120, 113, 108);
  doc.text('BILLED TO', margin, y);
  doc.text('DELIVERY / PICKUP ADDRESS', colMid, y);

  y += 4.5;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(20, 20, 19);
  doc.text(order.customerName || 'Customer', margin, y);
  doc.text(order.locality || 'Sopore', colMid, y);

  y += 4.5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(68, 64, 60);

  let leftY = y;
  doc.text(`Phone: ${order.customerPhone || '—'}`, margin, leftY);
  leftY += 4;
  if (order.customerEmail) {
    doc.text(`Email: ${order.customerEmail}`, margin, leftY);
    leftY += 4;
  }
  doc.text(`Payment: ${order.paymentMethod} (${order.paymentStatus})`, margin, leftY);
  leftY += 4;
  if (order.paymentReference) {
    doc.text(`Ref / UTR: ${order.paymentReference}`, margin, leftY);
    leftY += 4;
  }

  let rightY = y;
  const fullAddr = [
    order.deliveryAddress,
    order.landmark ? `Near ${order.landmark}` : '',
    `PIN ${order.pinCode}`,
  ]
    .filter(Boolean)
    .join(', ');
  const addrLines = doc.splitTextToSize(fullAddr, contentWidth / 2 - 4);
  doc.text(addrLines, colMid, rightY);
  rightY += addrLines.length * 4;
  if (order.deliveryInstructions) {
    const instrLines = doc.splitTextToSize(`Note: ${order.deliveryInstructions}`, contentWidth / 2 - 4);
    doc.text(instrLines, colMid, rightY);
    rightY += instrLines.length * 4;
  }

  // Items Table Header
  y = Math.max(leftY, rightY) + 6;
  const drawTableHeader = (startY: number) => {
    doc.setFillColor(245, 245, 244);
    doc.rect(margin, startY, contentWidth, 8, 'F');
    doc.setDrawColor(214, 211, 209);
    doc.line(margin, startY, pageWidth - margin, startY);
    doc.line(margin, startY + 8, pageWidth - margin, startY + 8);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(41, 37, 36);
    doc.text('#', margin + 2, startY + 5.3);
    doc.text('ITEM & PACK SIZE', margin + 10, startY + 5.3);
    doc.text('QTY', margin + 114, startY + 5.3, { align: 'right' });
    doc.text('UNIT RATE', margin + 144, startY + 5.3, { align: 'right' });
    doc.text('AMOUNT', pageWidth - margin - 2, startY + 5.3, { align: 'right' });
  };

  drawTableHeader(y);
  y += 8;

  // Table Rows
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);

  order.items.forEach((item, index) => {
    const itemTitle = `${item.name}${item.packSize ? ` (${item.packSize})` : ''}`;
    const subMeta = [item.brand, item.sku].filter(Boolean).join(' · ');
    const titleLines = doc.splitTextToSize(itemTitle, 92);
    const rowHeight = Math.max(9, titleLines.length * 4 + (subMeta ? 4 : 0) + 3);

    if (y + rowHeight > pageHeight - 45) {
      doc.addPage();
      y = 18;
      drawTableHeader(y);
      y += 8;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
    }

    if (index % 2 === 1) {
      doc.setFillColor(250, 250, 249);
      doc.rect(margin, y, contentWidth, rowHeight, 'F');
    }

    const textY = y + 4.8;
    doc.setTextColor(87, 83, 78);
    doc.text(String(index + 1), margin + 2, textY);

    doc.setFont('helvetica', 'bold');
    doc.setTextColor(28, 25, 23);
    doc.text(titleLines, margin + 10, textY);

    if (subMeta) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(120, 113, 108);
      doc.text(subMeta, margin + 10, textY + titleLines.length * 4);
      doc.setFontSize(8.5);
    }

    doc.setFont('helvetica', 'normal');
    doc.setTextColor(28, 25, 23);
    doc.text(String(item.quantity), margin + 114, textY, { align: 'right' });
    doc.text(formatPdfCurrency(item.unitPrice), margin + 144, textY, { align: 'right' });
    doc.setFont('helvetica', 'bold');
    doc.text(formatPdfCurrency(item.lineTotal), pageWidth - margin - 2, textY, { align: 'right' });

    y += rowHeight;
    doc.setDrawColor(231, 229, 228);
    doc.line(margin, y, pageWidth - margin, y);
  });

  // Totals Block
  if (y + 42 > pageHeight - 25) {
    doc.addPage();
    y = 20;
  }

  y += 6;
  const summaryLabelX = pageWidth - margin - 55;
  const summaryValX = pageWidth - margin - 2;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(68, 64, 60);

  doc.text('Subtotal', summaryLabelX, y);
  doc.text(formatPdfCurrency(order.subtotal), summaryValX, y, { align: 'right' });
  y += 5.5;

  doc.text('Delivery Charge', summaryLabelX, y);
  doc.text(
    order.deliveryCharge === 0 ? 'Free' : formatPdfCurrency(order.deliveryCharge),
    summaryValX,
    y,
    { align: 'right' }
  );
  y += 5.5;

  if (order.discountAmount > 0) {
    doc.setTextColor(4, 120, 87);
    doc.text(
      `Discount${order.couponCode ? ` (${order.couponCode})` : ''}`,
      summaryLabelX,
      y
    );
    doc.text(`- ${formatPdfCurrency(order.discountAmount)}`, summaryValX, y, { align: 'right' });
    doc.setTextColor(68, 64, 60);
    y += 5.5;
  }

  doc.setDrawColor(20, 20, 19);
  doc.setLineWidth(0.4);
  doc.line(summaryLabelX, y - 1, pageWidth - margin, y - 1);
  y += 4.5;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(20, 20, 19);
  doc.text('Grand Total', summaryLabelX, y);
  doc.setTextColor(243, 107, 22);
  doc.text(formatPdfCurrency(order.totalAmount), summaryValX, y, { align: 'right' });

  // Store Note if present
  if (order.adminNotes && order.adminNotes.trim()) {
    y += 10;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(41, 37, 36);
    doc.text('Store Note:', margin, y);
    doc.setFont('helvetica', 'normal');
    const noteLines = doc.splitTextToSize(order.adminNotes.trim(), contentWidth);
    doc.text(noteLines, margin, y + 4);
  }

  // Footer
  const footerY = pageHeight - 18;
  doc.setDrawColor(229, 229, 227);
  doc.setLineWidth(0.3);
  doc.line(margin, footerY - 4, pageWidth - margin, footerY - 4);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(120, 113, 108);
  doc.text(
    `Thank you for shopping with ${storeName}. Unopened packaged items may be exchanged within 48 hours at our Main Bazar, Sopore counter with this invoice.`,
    margin,
    footerY,
    { maxWidth: contentWidth }
  );
  doc.text(
    `Customer Support & WhatsApp: ${settings.phone || '+91 7006183435'} · Computer-generated invoice`,
    margin,
    footerY + 7
  );

  doc.save(`KUKA_TRADERS_Invoice_${order.orderNumber}.pdf`);
}
