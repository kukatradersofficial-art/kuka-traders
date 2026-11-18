import { getApps, initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { defineSecret } from 'firebase-functions/params';
import { onDocumentUpdated } from 'firebase-functions/v2/firestore';
import nodemailer from 'nodemailer';
import { buildOrderStatusEmail, type OrderEmailData, type OrderStatus } from './emailTemplate';

if (getApps().length === 0) {
  initializeApp();
}

const FIRESTORE_DATABASE_ID = 'ai-studio-fa4839e4-247d-4857-9dd8-0e7dcfbb4018';
const db = getFirestore(FIRESTORE_DATABASE_ID);

// Secrets configured via `firebase functions:secrets:set <NAME>`
const smtpHostSecret = defineSecret('SMTP_HOST');
const smtpPortSecret = defineSecret('SMTP_PORT');
const smtpUserSecret = defineSecret('SMTP_USER');
const smtpPassSecret = defineSecret('SMTP_PASS');
const smtpFromSecret = defineSecret('SMTP_FROM');
const resendApiKeySecret = defineSecret('RESEND_API_KEY');
const appUrlSecret = defineSecret('APP_URL');

const DEFAULT_NOTIFY_STATUSES: OrderStatus[] = [
  'Order Confirmed',
  'Preparing',
  'Out for Delivery',
  'Delivered',
  'Cancelled',
];

function isValidEmailAddress(email?: string): email is string {
  if (!email || typeof email !== 'string') return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

function sanitizeIdPart(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 48) || 'item';
}

interface StoreConfigDoc {
  storeName?: string;
  phone?: string;
  whatsappNumber?: string;
  email?: string;
  address?: string;
  orderStatusEmailsEnabled?: boolean;
  emailNotifyStatuses?: OrderStatus[];
  emailReplyTo?: string;
}

/**
 * Automated Firebase Cloud Function v2 triggered whenever an order document
 * in `orders/{orderId}` is updated. Sends a transactional status email to
 * the customer when `orderStatus` changes and records an audit log in `emailLogs`.
 */
export const onOrderStatusUpdated = onDocumentUpdated(
  {
    document: 'orders/{orderId}',
    database: FIRESTORE_DATABASE_ID,
    region: 'asia-south1',
    secrets: [
      smtpHostSecret,
      smtpPortSecret,
      smtpUserSecret,
      smtpPassSecret,
      smtpFromSecret,
      resendApiKeySecret,
      appUrlSecret,
    ],
  },
  async (event) => {
    const beforeData = event.data?.before.data() as (OrderEmailData & { userId: string; orderStatus: OrderStatus }) | undefined;
    const afterData = event.data?.after.data() as (OrderEmailData & { userId: string; orderStatus: OrderStatus }) | undefined;

    if (!beforeData || !afterData) {
      return;
    }

    const previousStatus = beforeData.orderStatus;
    const newStatus = afterData.orderStatus;

    // Only trigger transactional emails when orderStatus actually changed
    if (!newStatus || previousStatus === newStatus) {
      return;
    }

    const orderId = event.params.orderId;
    const logId = `email_${sanitizeIdPart(orderId)}_${sanitizeIdPart(newStatus)}_${sanitizeIdPart(event.id)}`;
    const logRef = db.collection('emailLogs').doc(logId);

    // Idempotency guard against duplicate retries
    const existingLog = await logRef.get();
    if (existingLog.exists && existingLog.data()?.deliveryStatus === 'sent') {
      logger.info('Skipping duplicate order status email retry', { orderId, newStatus, logId });
      return;
    }

    // Read storefront notification preferences & branding
    const settingsSnap = await db.collection('settings').doc('store_config').get();
    const storeConfig = (settingsSnap.exists ? settingsSnap.data() : {}) as StoreConfigDoc;

    const emailsEnabled = storeConfig.orderStatusEmailsEnabled !== false;
    const allowedStatuses =
      Array.isArray(storeConfig.emailNotifyStatuses) && storeConfig.emailNotifyStatuses.length > 0
        ? storeConfig.emailNotifyStatuses
        : DEFAULT_NOTIFY_STATUSES;

    const recipientEmail = (afterData.customerEmail || '').trim();
    const branding = {
      storeName: storeConfig.storeName || 'KUKA TRADERS',
      phone: storeConfig.phone || '+91 7006183435',
      whatsappNumber: storeConfig.whatsappNumber || '917006183435',
      email: storeConfig.email || 'kukatraders.official@gmail.com',
      address:
        storeConfig.address ||
        'Main Bazar, near Jamia Masjid, Sopore, Baramulla, Jammu & Kashmir, India',
      appUrl: (appUrlSecret.value() || process.env.APP_URL || 'https://kukatraders.in').trim(),
    };
    const replyTo = (storeConfig.emailReplyTo || branding.email).trim();

    const { subject, html, text } = buildOrderStatusEmail({
      order: afterData,
      previousStatus,
      newStatus,
      branding,
    });

    const writeAuditLog = async (payload: {
      provider: 'smtp' | 'resend' | 'unconfigured';
      deliveryStatus: 'sent' | 'skipped' | 'failed';
      messageId?: string;
      errorMessage?: string;
    }) => {
      await logRef.set({
        orderId,
        orderNumber: String(afterData.orderNumber || '').slice(0, 40),
        userId: String(afterData.userId || '').slice(0, 128),
        recipientEmail: recipientEmail.slice(0, 160),
        customerName: String(afterData.customerName || 'Customer').slice(0, 120),
        previousStatus,
        newStatus,
        subject: subject.slice(0, 240),
        provider: payload.provider,
        deliveryStatus: payload.deliveryStatus,
        messageId: (payload.messageId || '').slice(0, 200),
        errorMessage: (payload.errorMessage || '').slice(0, 500),
        triggeredBy: 'cloud_function',
        eventId: event.id.slice(0, 128),
        createdAt: FieldValue.serverTimestamp(),
      });
    };

    if (!emailsEnabled || !allowedStatuses.includes(newStatus)) {
      await writeAuditLog({
        provider: 'unconfigured',
        deliveryStatus: 'skipped',
        errorMessage: !emailsEnabled
          ? 'Automated order status emails are disabled in Store Settings.'
          : `Status "${newStatus}" is excluded in Store Settings notification preferences.`,
      });
      return;
    }

    if (!isValidEmailAddress(recipientEmail)) {
      await writeAuditLog({
        provider: 'unconfigured',
        deliveryStatus: 'skipped',
        errorMessage: 'Order does not have a valid customerEmail address.',
      });
      return;
    }

    const resendApiKey = (resendApiKeySecret.value() || process.env.RESEND_API_KEY || '').trim();
    const smtpHost = (smtpHostSecret.value() || process.env.SMTP_HOST || '').trim();
    const smtpPort = Number((smtpPortSecret.value() || process.env.SMTP_PORT || '465').trim()) || 465;
    const smtpUser = (smtpUserSecret.value() || process.env.SMTP_USER || '').trim();
    const smtpPass = (smtpPassSecret.value() || process.env.SMTP_PASS || '').trim();
    const fromAddress = (
      smtpFromSecret.value() ||
      process.env.SMTP_FROM ||
      (smtpUser ? `${branding.storeName} <${smtpUser}>` : `${branding.storeName} <${branding.email}>`)
    ).trim();

    // 1. Prefer Resend HTTP API if RESEND_API_KEY is configured
    if (resendApiKey) {
      try {
        const res = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${resendApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: fromAddress,
            to: [recipientEmail],
            reply_to: isValidEmailAddress(replyTo) ? replyTo : undefined,
            subject,
            html,
            text,
          }),
        });

        const body = (await res.json()) as { id?: string; message?: string };
        if (!res.ok) {
          throw new Error(body.message || `Resend returned HTTP ${res.status}`);
        }

        await writeAuditLog({
          provider: 'resend',
          deliveryStatus: 'sent',
          messageId: body.id || '',
        });
        logger.info('Order status email sent via Resend', { orderId, newStatus, recipientEmail });
        return;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        await writeAuditLog({
          provider: 'resend',
          deliveryStatus: 'failed',
          errorMessage: msg,
        });
        logger.error('Failed sending order status email via Resend', { orderId, error: msg });
        return;
      }
    }

    // 2. Fall back to Nodemailer SMTP transport if SMTP secrets are configured
    if (smtpHost && smtpUser && smtpPass) {
      try {
        const transporter = nodemailer.createTransport({
          host: smtpHost,
          port: smtpPort,
          secure: smtpPort === 465,
          auth: {
            user: smtpUser,
            pass: smtpPass,
          },
        });

        const info = await transporter.sendMail({
          from: fromAddress,
          to: recipientEmail,
          replyTo: isValidEmailAddress(replyTo) ? replyTo : undefined,
          subject,
          text,
          html,
        });

        await writeAuditLog({
          provider: 'smtp',
          deliveryStatus: 'sent',
          messageId: info.messageId || '',
        });
        logger.info('Order status email sent via SMTP', {
          orderId,
          newStatus,
          recipientEmail,
          messageId: info.messageId,
        });
        return;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        await writeAuditLog({
          provider: 'smtp',
          deliveryStatus: 'failed',
          errorMessage: msg,
        });
        logger.error('Failed sending order status email via SMTP', { orderId, error: msg });
        return;
      }
    }

    // 3. No email provider secret configured yet — log cleanly without infinite retry
    await writeAuditLog({
      provider: 'unconfigured',
      deliveryStatus: 'skipped',
      errorMessage:
        'No SMTP or Resend secret configured. Run `firebase functions:secrets:set SMTP_HOST` (or `RESEND_API_KEY`) and deploy functions.',
    });
    logger.warn('Order status email skipped: no SMTP/Resend secrets configured', { orderId, newStatus });
  }
);
