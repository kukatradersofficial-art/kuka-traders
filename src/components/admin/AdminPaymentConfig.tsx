import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Banknote,
  CheckCircle2,
  Copy,
  CreditCard,
  Globe,
  QrCode,
  RefreshCw,
  Save,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react';
import type { PaymentConfig, StoreSettings } from '../../types';
import { savePaymentConfig } from '../../services/firestoreStore';

interface AdminPaymentConfigProps {
  paymentConfig: PaymentConfig;
  storeSettings: StoreSettings;
}

interface PaymentGatewayStatusResponse {
  runtime?: string;
  zapUpiConfigured: boolean;
  zapUpiMerchantConfigured?: boolean;
  otherGatewayConfigured?: boolean;
  vars?: Record<string, boolean>;
  missingVars?: string[];
}

export const AdminPaymentConfig: React.FC<AdminPaymentConfigProps> = ({
  paymentConfig,
  storeSettings,
}) => {
  const [form, setForm] = useState<PaymentConfig>(paymentConfig);
  const [gatewayStatus, setGatewayStatus] = useState<PaymentGatewayStatusResponse | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(false);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [copiedTemplate, setCopiedTemplate] = useState(false);

  useEffect(() => {
    setForm(paymentConfig);
  }, [paymentConfig]);

  const refreshServerStatus = async () => {
    setLoadingStatus(true);
    try {
      const res = await fetch('/api/payments/status');
      const raw = await res.text();
      if (raw) {
        setGatewayStatus(JSON.parse(raw) as PaymentGatewayStatusResponse);
      }
    } catch {
      // Keep prior status on transient fetch error
    } finally {
      setLoadingStatus(false);
    }
  };

  useEffect(() => {
    void refreshServerStatus();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setFeedback('');
    setErrorMsg('');
    try {
      await savePaymentConfig(form, storeSettings);
      setFeedback('Payment configuration saved to Firestore (settings/payment_config).');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to save payment configuration.');
    } finally {
      setSaving(false);
    }
  };

  const handleCopyVercelEnvTemplate = async () => {
    const template = [
      'ZAP_UPI_API_KEY=',
      'ZAP_UPI_SECRET_KEY=',
      `ZAP_UPI_MERCHANT_ID=${form.zapUpiMerchantId.trim()}`,
      `ZAP_UPI_CREATE_URL=${form.zapUpiCreateUrl.trim() || 'https://api.zapupi.com/api/create-order'}`,
      `ZAP_UPI_VERIFY_URL=${form.zapUpiVerifyUrl.trim() || 'https://api.zapupi.com/api/check-order-status'}`,
      'PAYMENT_GATEWAY_KEY_ID=',
      'PAYMENT_GATEWAY_KEY_SECRET=',
    ].join('\n');

    try {
      await navigator.clipboard.writeText(template);
      setCopiedTemplate(true);
      setTimeout(() => setCopiedTemplate(false), 2500);
    } catch {
      setErrorMsg('Clipboard permission denied. Copy the variable names manually below.');
    }
  };

  const noMethodEnabled = !form.codEnabled && !form.upiEnabled && !form.netBankingEnabled;
  const zapNotReady = !gatewayStatus?.zapUpiConfigured;
  const upiBlockedUntilZap = form.upiEnabled && form.upiVerificationMode === 'require_zap_upi' && zapNotReady;

  return (
    <form onSubmit={handleSave} className="space-y-6 text-xs">
      {feedback && (
        <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 flex items-center justify-between gap-3">
          <span className="font-medium">{feedback}</span>
          <button type="button" onClick={() => setFeedback('')} className="underline shrink-0">
            Dismiss
          </button>
        </div>
      )}

      {errorMsg && (
        <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-800 flex items-center justify-between gap-3">
          <span className="font-medium">{errorMsg}</span>
          <button type="button" onClick={() => setErrorMsg('')} className="underline shrink-0">
            Dismiss
          </button>
        </div>
      )}

      {/* Zap UPI Integration Guard Banner */}
      <div
        className={`rounded-xl border p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
          gatewayStatus?.zapUpiConfigured
            ? 'bg-emerald-50/70 border-emerald-200 text-emerald-900'
            : 'bg-amber-50 border-amber-200 text-amber-950'
        }`}
      >
        <div className="flex items-start gap-3">
          {gatewayStatus?.zapUpiConfigured ? (
            <ShieldCheck className="w-5 h-5 text-emerald-700 shrink-0 mt-0.5" />
          ) : (
            <AlertTriangle className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
          )}
          <div className="space-y-1">
            <p className="font-display font-bold text-sm">
              {gatewayStatus?.zapUpiConfigured
                ? 'Zap UPI Server Integration Active'
                : 'Zap UPI Not Connected Yet — Unverified UPI Order Protection'}
            </p>
            <p className="leading-relaxed opacity-90">
              {gatewayStatus?.zapUpiConfigured
                ? 'ZAP_UPI_API_KEY and ZAP_UPI_SECRET_KEY are active on the server. Customers can complete verified UPI checkouts.'
                : upiBlockedUntilZap
                  ? 'Protected: Because "Require Zap UPI Integration" is selected, customers CANNOT place unverified UPI orders right now (only enabled offline/ready options like Cash on Delivery can place orders).'
                  : !form.upiEnabled
                    ? 'UPI checkout is disabled. Customers cannot place UPI orders until you enable it or connect Zap UPI later.'
                    : 'Manual UPI QR + UTR mode is active. Customers must enter a transaction UTR before placing an order.'}
            </p>
          </div>
        </div>

        <button
          type="submit"
          disabled={saving}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[#F36B16] text-white font-semibold hover:bg-[#D95708] disabled:opacity-60 shrink-0"
        >
          <Save className="w-4 h-4" />
          {saving ? 'Saving...' : 'Save Payment Configuration'}
        </button>
      </div>

      {noMethodEnabled && (
        <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-800 font-semibold">
          Warning: Every payment method is currently disabled. Enable at least one option (such as Cash on Delivery) so customers can check out.
        </div>
      )}

      {/* Payment Method Toggles */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* 1. Cash on Delivery */}
        <div
          className={`bg-white rounded-xl border p-5 space-y-4 ${
            form.codEnabled ? 'border-stone-300' : 'border-stone-200 opacity-85'
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center">
                <Banknote className="w-4 h-4" />
              </div>
              <div>
                <h3 className="font-display font-bold text-sm text-stone-900">Cash on Delivery</h3>
                <span
                  className={`text-[11px] font-semibold ${
                    form.codEnabled ? 'text-emerald-700' : 'text-stone-500'
                  }`}
                >
                  {form.codEnabled ? 'Enabled' : 'Disabled'}
                </span>
              </div>
            </div>

            <button
              type="button"
              role="switch"
              aria-checked={form.codEnabled}
              onClick={() => setForm({ ...form, codEnabled: !form.codEnabled })}
              className={`px-3 py-1.5 rounded-lg font-bold transition-colors ${
                form.codEnabled
                  ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                  : 'bg-stone-200 text-stone-700 hover:bg-stone-300'
              }`}
            >
              {form.codEnabled ? 'Enabled' : 'Disabled'}
            </button>
          </div>

          <div>
            <label className="block font-semibold text-stone-700 mb-1">Display Title</label>
            <input
              type="text"
              value={form.codLabel}
              onChange={(e) => setForm({ ...form, codLabel: e.target.value })}
              maxLength={80}
              className="w-full px-3 py-2 rounded-lg border border-stone-300"
            />
          </div>

          <div>
            <label className="block font-semibold text-stone-700 mb-1">Checkout Instructions</label>
            <textarea
              rows={2}
              value={form.codInstructions}
              onChange={(e) => setForm({ ...form, codInstructions: e.target.value })}
              maxLength={240}
              className="w-full px-3 py-2 rounded-lg border border-stone-300"
            />
          </div>
        </div>

        {/* 2. UPI / Zap UPI */}
        <div
          className={`bg-white rounded-xl border p-5 space-y-4 ${
            form.upiEnabled ? 'border-stone-300' : 'border-stone-200 opacity-85'
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-amber-50 text-[#F36B16] flex items-center justify-center">
                <QrCode className="w-4 h-4" />
              </div>
              <div>
                <h3 className="font-display font-bold text-sm text-stone-900">UPI / Zap UPI</h3>
                <span
                  className={`text-[11px] font-semibold ${
                    form.upiEnabled ? 'text-emerald-700' : 'text-stone-500'
                  }`}
                >
                  {form.upiEnabled ? 'Enabled' : 'Disabled'}
                </span>
              </div>
            </div>

            <button
              type="button"
              role="switch"
              aria-checked={form.upiEnabled}
              onClick={() => setForm({ ...form, upiEnabled: !form.upiEnabled })}
              className={`px-3 py-1.5 rounded-lg font-bold transition-colors ${
                form.upiEnabled
                  ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                  : 'bg-stone-200 text-stone-700 hover:bg-stone-300'
              }`}
            >
              {form.upiEnabled ? 'Enabled' : 'Disabled'}
            </button>
          </div>

          <div>
            <label className="block font-semibold text-stone-700 mb-1">Display Title</label>
            <input
              type="text"
              value={form.upiLabel}
              onChange={(e) => setForm({ ...form, upiLabel: e.target.value })}
              maxLength={80}
              className="w-full px-3 py-2 rounded-lg border border-stone-300"
            />
          </div>

          <div>
            <label className="block font-semibold text-stone-700 mb-1">Checkout Instructions</label>
            <textarea
              rows={2}
              value={form.upiInstructions}
              onChange={(e) => setForm({ ...form, upiInstructions: e.target.value })}
              maxLength={240}
              className="w-full px-3 py-2 rounded-lg border border-stone-300"
            />
          </div>

          <div className="pt-1 border-t border-stone-100">
            <label className="block font-semibold text-stone-700 mb-1">
              When Zap UPI Is Not Connected
            </label>
            <select
              value={form.upiVerificationMode}
              onChange={(e) =>
                setForm({
                  ...form,
                  upiVerificationMode:
                    e.target.value === 'manual_utr' ? 'manual_utr' : 'require_zap_upi',
                })
              }
              className="w-full px-3 py-2 rounded-lg border border-stone-300 bg-white font-medium"
            >
              <option value="require_zap_upi">
                Block UPI Orders Until Zap UPI Is Connected (Recommended)
              </option>
              <option value="manual_utr">
                Allow Merchant QR + Require UTR Reference
              </option>
            </select>
          </div>
        </div>

        {/* 3. Net Banking / Card Gateway */}
        <div
          className={`bg-white rounded-xl border p-5 space-y-4 ${
            form.netBankingEnabled ? 'border-stone-300' : 'border-stone-200 opacity-85'
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center">
                <CreditCard className="w-4 h-4" />
              </div>
              <div>
                <h3 className="font-display font-bold text-sm text-stone-900">
                  Net Banking / Gateway
                </h3>
                <span
                  className={`text-[11px] font-semibold ${
                    form.netBankingEnabled ? 'text-emerald-700' : 'text-stone-500'
                  }`}
                >
                  {form.netBankingEnabled ? 'Enabled' : 'Disabled'}
                </span>
              </div>
            </div>

            <button
              type="button"
              role="switch"
              aria-checked={form.netBankingEnabled}
              onClick={() => setForm({ ...form, netBankingEnabled: !form.netBankingEnabled })}
              className={`px-3 py-1.5 rounded-lg font-bold transition-colors ${
                form.netBankingEnabled
                  ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                  : 'bg-stone-200 text-stone-700 hover:bg-stone-300'
              }`}
            >
              {form.netBankingEnabled ? 'Enabled' : 'Disabled'}
            </button>
          </div>

          <div>
            <label className="block font-semibold text-stone-700 mb-1">Display Title</label>
            <input
              type="text"
              value={form.netBankingLabel}
              onChange={(e) => setForm({ ...form, netBankingLabel: e.target.value })}
              maxLength={80}
              className="w-full px-3 py-2 rounded-lg border border-stone-300"
            />
          </div>

          <div>
            <label className="block font-semibold text-stone-700 mb-1">Checkout Instructions</label>
            <textarea
              rows={2}
              value={form.netBankingInstructions}
              onChange={(e) => setForm({ ...form, netBankingInstructions: e.target.value })}
              maxLength={240}
              className="w-full px-3 py-2 rounded-lg border border-stone-300"
            />
          </div>

          <label className="flex items-center gap-2 pt-1 border-t border-stone-100 font-medium text-stone-700">
            <input
              type="checkbox"
              checked={form.netBankingRequireGateway}
              onChange={(e) =>
                setForm({ ...form, netBankingRequireGateway: e.target.checked })
              }
              className="accent-[#F36B16]"
            />
            Block Net Banking orders until server gateway keys are configured
          </label>
        </div>
      </div>

      {/* Dynamic Zap UPI Configuration (saved to settings/payment_config) */}
      <div className="bg-white rounded-xl border border-stone-200 p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Globe className="w-4 h-4 text-[#F36B16]" />
            <h3 className="font-display font-bold text-sm text-stone-900">
              Zap UPI Configuration &amp; Merchant Details
            </h3>
          </div>
          <span className="font-mono text-[11px] text-stone-500">
            Firestore doc: settings/payment_config
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div>
            <label className="block font-semibold text-stone-700 mb-1">Zap UPI Environment</label>
            <select
              value={form.zapUpiEnvironment}
              onChange={(e) =>
                setForm({
                  ...form,
                  zapUpiEnvironment: e.target.value === 'sandbox' ? 'sandbox' : 'production',
                })
              }
              className="w-full px-3 py-2 rounded-lg border border-stone-300 bg-white"
            >
              <option value="production">Production (Live)</option>
              <option value="sandbox">Sandbox / Testing</option>
            </select>
          </div>

          <div>
            <label className="block font-semibold text-stone-700 mb-1">Merchant UPI ID (VPA)</label>
            <input
              type="text"
              value={form.merchantUpiId}
              onChange={(e) => setForm({ ...form, merchantUpiId: e.target.value })}
              placeholder="kukatraders@upi"
              maxLength={120}
              className="w-full px-3 py-2 rounded-lg border border-stone-300 font-mono"
            />
          </div>

          <div>
            <label className="block font-semibold text-stone-700 mb-1">
              Merchant Display Name
            </label>
            <input
              type="text"
              value={form.merchantUpiName}
              onChange={(e) => setForm({ ...form, merchantUpiName: e.target.value })}
              placeholder="KUKA TRADERS Sopore"
              maxLength={120}
              className="w-full px-3 py-2 rounded-lg border border-stone-300"
            />
          </div>

          <div>
            <label className="block font-semibold text-stone-700 mb-1">
              ZAP_UPI_MERCHANT_ID
            </label>
            <input
              type="text"
              value={form.zapUpiMerchantId}
              onChange={(e) => setForm({ ...form, zapUpiMerchantId: e.target.value })}
              placeholder="Enter when Zap UPI account is ready"
              maxLength={120}
              className="w-full px-3 py-2 rounded-lg border border-stone-300 font-mono"
            />
          </div>

          <div>
            <label className="block font-semibold text-stone-700 mb-1">
              ZAP_UPI_CREATE_URL
            </label>
            <input
              type="url"
              value={form.zapUpiCreateUrl}
              onChange={(e) => setForm({ ...form, zapUpiCreateUrl: e.target.value })}
              placeholder="https://api.zapupi.com/api/create-order"
              maxLength={300}
              className="w-full px-3 py-2 rounded-lg border border-stone-300 font-mono text-[11px]"
            />
          </div>

          <div>
            <label className="block font-semibold text-stone-700 mb-1">
              ZAP_UPI_VERIFY_URL
            </label>
            <input
              type="url"
              value={form.zapUpiVerifyUrl}
              onChange={(e) => setForm({ ...form, zapUpiVerifyUrl: e.target.value })}
              placeholder="https://api.zapupi.com/api/check-order-status"
              maxLength={300}
              className="w-full px-3 py-2 rounded-lg border border-stone-300 font-mono text-[11px]"
            />
          </div>
        </div>
      </div>

      {/* Vercel / Server Secrets Readiness */}
      <div className="bg-white rounded-xl border border-stone-200 p-5 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-2.5">
            <ShieldAlert className="w-5 h-5 text-[#F36B16] shrink-0 mt-0.5" />
            <div>
              <h3 className="font-display font-bold text-sm text-stone-900">
                Server &amp; Vercel API Secrets Status ({gatewayStatus?.runtime || 'checking...'})
              </h3>
              <p className="text-stone-600 mt-1">
                Secret credentials (<span className="font-mono">ZAP_UPI_API_KEY</span>,{' '}
                <span className="font-mono">ZAP_UPI_SECRET_KEY</span>,{' '}
                <span className="font-mono">PAYMENT_GATEWAY_KEY_ID</span>,{' '}
                <span className="font-mono">PAYMENT_GATEWAY_KEY_SECRET</span>) are never stored in browser-readable Firestore settings. Add them in{' '}
                <strong>Vercel Project Settings → Environment Variables</strong> and redeploy when ready.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void handleCopyVercelEnvTemplate()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-stone-300 bg-white font-semibold text-stone-800 hover:bg-stone-50"
            >
              <Copy className="w-3.5 h-3.5" />
              {copiedTemplate ? 'Copied Template' : 'Copy Vercel Env Template'}
            </button>
            <button
              type="button"
              disabled={loadingStatus}
              onClick={() => void refreshServerStatus()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-stone-300 bg-white font-semibold text-stone-800 hover:bg-stone-50 disabled:opacity-60"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingStatus ? 'animate-spin' : ''}`} />
              Refresh Status
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
          {[
            { key: 'ZAP_UPI_API_KEY', label: 'ZAP_UPI_API_KEY' },
            { key: 'ZAP_UPI_SECRET_KEY', label: 'ZAP_UPI_SECRET_KEY' },
            {
              key: 'ZAP_UPI_MERCHANT_ID',
              label: 'ZAP_UPI_MERCHANT_ID',
              firestoreSet: Boolean(form.zapUpiMerchantId.trim()),
            },
            {
              key: 'ZAP_UPI_CREATE_URL',
              label: 'ZAP_UPI_CREATE_URL',
              firestoreSet: Boolean(form.zapUpiCreateUrl.trim()),
            },
            {
              key: 'ZAP_UPI_VERIFY_URL',
              label: 'ZAP_UPI_VERIFY_URL',
              firestoreSet: Boolean(form.zapUpiVerifyUrl.trim()),
            },
            { key: 'PAYMENT_GATEWAY_KEY_ID', label: 'PAYMENT_GATEWAY_KEY_ID' },
            { key: 'PAYMENT_GATEWAY_KEY_SECRET', label: 'PAYMENT_GATEWAY_KEY_SECRET' },
          ].map((item) => {
            const serverSet = Boolean(gatewayStatus?.vars?.[item.key]);
            const configured = serverSet || Boolean(item.firestoreSet);
            return (
              <div
                key={item.key}
                className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-stone-50 border border-stone-200"
              >
                <span className="font-mono text-[11px] text-stone-800 truncate">{item.label}</span>
                <span
                  className={`inline-flex items-center gap-1 font-semibold text-[11px] shrink-0 ${
                    configured ? 'text-emerald-700' : 'text-amber-700'
                  }`}
                >
                  {configured && <CheckCircle2 className="w-3.5 h-3.5" />}
                  {serverSet ? 'Server Env' : item.firestoreSet ? 'Firestore' : 'Missing'}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </form>
  );
};
