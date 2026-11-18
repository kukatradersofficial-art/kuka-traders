import React, { useState } from 'react';
import { CheckCircle2, Minus, Plus, Search, Upload } from 'lucide-react';
import type {
  InventoryLog,
  PriceResearchItem,
  PriceScope,
  Product,
} from '../../types';
import {
  adjustInventoryStock,
  approveAndPublishPrice,
  savePriceResearch,
} from '../../services/firestoreStore';
import { formatINR, formatISTDateTime, parseCsvRows } from '../../utils/format';

interface AdminInventoryPriceResearchProps {
  mode: 'inventory' | 'price_research';
  products: Product[];
  inventoryLogs: InventoryLog[];
  priceResearch: PriceResearchItem[];
  adminUid: string;
}

const PRICE_SCOPE_LABELS: Record<PriceScope, string> = {
  supplier_invoice: '1. KUKA Supplier Invoice / Purchase Bill',
  local_sopore_quote: '2. Local Sopore Supplier Quotation',
  official_mrp: '3. Official Product Packaging MRP',
  jk_des_bulletin: '4. J&K Directorate of Economics & Statistics',
  dca_monitoring: '5. Dept. of Consumer Affairs Price Monitoring',
  online_retailer_ref: '6. Online Retailer Secondary Reference',
};

export const AdminInventoryPriceResearch: React.FC<AdminInventoryPriceResearchProps> = ({
  mode,
  products,
  inventoryLogs,
  priceResearch,
  adminUid,
}) => {
  const [stockFilter, setStockFilter] = useState<'all' | 'low' | 'out'>('all');
  const [search, setSearch] = useState('');
  const [deltaMap, setDeltaMap] = useState<Record<string, string>>({});
  const [reasonMap, setReasonMap] = useState<Record<string, string>>({});
  const [feedback, setFeedback] = useState('');

  // Price Research manual form + publish modal
  const [prForm, setPrForm] = useState({
    productId: '',
    productName: '',
    brand: '',
    packSize: '1 kg',
    unit: 'pack',
    priceScope: 'supplier_invoice' as PriceScope,
    mrp: 0,
    observedPrice: 0,
    purchaseCost: 0,
    proposedSellingPrice: 0,
    sourceLabel: '',
    sourceUrl: '',
    locationMarket: 'Main Bazar, Sopore (193201)',
    researchDate: new Date().toISOString().slice(0, 10),
    notes: '',
  });
  const [publishCosts, setPublishCosts] = useState<
    Record<string, { cost: string; mrp: string; sell: string }>
  >({});

  const activeProducts = products.filter((p) => !p.isDeleted);

  const filteredInvProducts = activeProducts.filter((p) => {
    const q = search.trim().toLowerCase();
    const matchSearch =
      !q || p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q);
    if (!matchSearch) return false;
    if (stockFilter === 'out') return p.stockQuantity <= 0;
    if (stockFilter === 'low')
      return p.stockQuantity > 0 && p.stockQuantity <= p.lowStockThreshold;
    return true;
  });

  const handleAdjust = async (product: Product, sign: 1 | -1) => {
    const raw = Number(deltaMap[product.id] || '1');
    if (!Number.isFinite(raw) || raw <= 0) return;
    await adjustInventoryStock({
      productId: product.id,
      quantityDelta: sign * Math.round(raw),
      changeType: sign > 0 ? 'restock' : 'adjustment',
      reason: reasonMap[product.id] || (sign > 0 ? 'Manual Restock' : 'Manual Stock Correction'),
      adminUid,
    });
    setDeltaMap((prev) => ({ ...prev, [product.id]: '' }));
    setFeedback(`Updated stock for ${product.name}.`);
  };

  const handleAddResearch = async (e: React.FormEvent) => {
    e.preventDefault();
    const linked = activeProducts.find((p) => p.id === prForm.productId);
    await savePriceResearch({
      productId: prForm.productId,
      productName: prForm.productName || linked?.name || 'Unnamed Product',
      brand: prForm.brand || linked?.brand || 'KUKA Select',
      packSize: prForm.packSize || linked?.packSize || '1 unit',
      unit: prForm.unit || linked?.unit || 'pack',
      priceScope: prForm.priceScope,
      mrp: Number(prForm.mrp) || 0,
      observedPrice: Number(prForm.observedPrice) || 0,
      purchaseCost: Number(prForm.purchaseCost) || 0,
      proposedSellingPrice: Number(prForm.proposedSellingPrice) || 0,
      sourceLabel: prForm.sourceLabel || PRICE_SCOPE_LABELS[prForm.priceScope],
      sourceUrl: prForm.sourceUrl,
      locationMarket: prForm.locationMarket,
      researchDate: prForm.researchDate,
      verificationStatus:
        prForm.proposedSellingPrice > 0
          ? 'verified_pending_approval'
          : 'admin_price_required',
      notes: prForm.notes,
    });
    setFeedback('Saved price research entry inside Admin Verification Queue (not published yet).');
  };

  const handleCsvPriceResearch = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const rows = parseCsvRows(await file.text());
    let imported = 0;
    for (const r of rows) {
      if (!r.productName) continue;
      await savePriceResearch({
        productId: r.productId || '',
        productName: r.productName,
        brand: r.brand || 'KUKA Select',
        packSize: r.packSize || '1 unit',
        unit: r.unit || 'pack',
        priceScope: (r.priceScope as PriceScope) || 'local_sopore_quote',
        mrp: Number(r.mrp) || 0,
        observedPrice: Number(r.observedPrice) || 0,
        purchaseCost: Number(r.purchaseCost) || 0,
        proposedSellingPrice: Number(r.proposedSellingPrice) || 0,
        sourceLabel: r.sourceLabel || 'CSV Price Research Import',
        sourceUrl: r.sourceUrl || '',
        locationMarket: r.locationMarket || 'Sopore Market (193201)',
        researchDate: r.researchDate || new Date().toISOString().slice(0, 10),
        verificationStatus:
          Number(r.proposedSellingPrice) > 0
            ? 'verified_pending_approval'
            : 'admin_price_required',
        notes: r.notes || '',
      });
      imported++;
    }
    setFeedback(`Imported ${imported} price research rows for admin review.`);
    e.target.value = '';
  };

  if (mode === 'inventory') {
    return (
      <div className="space-y-6">
        {feedback && (
          <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 flex justify-between">
            <span>{feedback}</span>
            <button type="button" onClick={() => setFeedback('')} className="underline">
              Dismiss
            </button>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1 p-1 bg-stone-100 rounded-xl text-xs font-semibold">
            <button
              type="button"
              onClick={() => setStockFilter('all')}
              className={`px-3 py-1.5 rounded-lg ${stockFilter === 'all' ? 'bg-white text-stone-900 shadow-xs' : 'text-stone-600'}`}
            >
              All ({activeProducts.length})
            </button>
            <button
              type="button"
              onClick={() => setStockFilter('low')}
              className={`px-3 py-1.5 rounded-lg ${stockFilter === 'low' ? 'bg-white text-amber-800 shadow-xs' : 'text-stone-600'}`}
            >
              Low Stock ({activeProducts.filter((p) => p.stockQuantity > 0 && p.stockQuantity <= p.lowStockThreshold).length})
            </button>
            <button
              type="button"
              onClick={() => setStockFilter('out')}
              className={`px-3 py-1.5 rounded-lg ${stockFilter === 'out' ? 'bg-white text-red-700 shadow-xs' : 'text-stone-600'}`}
            >
              Out of Stock ({activeProducts.filter((p) => p.stockQuantity <= 0).length})
            </button>
          </div>

          <div className="relative min-w-[240px]">
            <Search className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter inventory by name or SKU..."
              className="w-full pl-9 pr-3 py-2 rounded-xl border border-stone-300 bg-white text-xs"
            />
          </div>
        </div>

        <div className="bg-white rounded-xl border border-stone-200 overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead>
              <tr className="border-b border-stone-200 bg-stone-50 text-stone-500">
                <th className="py-3 px-4 font-semibold">Product</th>
                <th className="py-3 px-3 font-semibold text-right">Current Stock</th>
                <th className="py-3 px-3 font-semibold text-right">Alert Threshold</th>
                <th className="py-3 px-3 font-semibold">Adjustment Qty &amp; Reason</th>
                <th className="py-3 px-4 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {filteredInvProducts.map((p) => (
                <tr key={p.id}>
                  <td className="py-3 px-4">
                    <p className="font-semibold text-stone-900">{p.name}</p>
                    <p className="text-[11px] text-stone-500">
                      {p.brand} · {p.packSize} · <span className="font-mono">{p.sku}</span>
                    </p>
                  </td>
                  <td className="py-3 px-3 text-right font-mono font-bold tabular-nums">
                    <span
                      className={
                        p.stockQuantity <= 0
                          ? 'text-red-700'
                          : p.stockQuantity <= p.lowStockThreshold
                            ? 'text-amber-700'
                            : 'text-emerald-700'
                      }
                    >
                      {p.stockQuantity} {p.unit}
                    </span>
                  </td>
                  <td className="py-3 px-3 text-right font-mono tabular-nums text-stone-500">
                    {p.lowStockThreshold}
                  </td>
                  <td className="py-3 px-3">
                    <div className="flex gap-2">
                      <input
                        type="number"
                        min={1}
                        placeholder="Qty"
                        value={deltaMap[p.id] || ''}
                        onChange={(e) => setDeltaMap({ ...deltaMap, [p.id]: e.target.value })}
                        className="w-20 px-2 py-1.5 rounded-lg border border-stone-300 font-mono"
                      />
                      <input
                        type="text"
                        placeholder="Reason (e.g. Supplier delivery)"
                        value={reasonMap[p.id] || ''}
                        onChange={(e) => setReasonMap({ ...reasonMap, [p.id]: e.target.value })}
                        className="flex-1 min-w-[140px] px-2 py-1.5 rounded-lg border border-stone-300"
                      />
                    </div>
                  </td>
                  <td className="py-3 px-4 text-right whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => handleAdjust(p, 1)}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-600 text-white font-semibold hover:bg-emerald-700 mr-1.5"
                    >
                      <Plus className="w-3 h-3" /> Add
                    </button>
                    <button
                      type="button"
                      onClick={() => handleAdjust(p, -1)}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-stone-300 text-stone-700 font-semibold hover:bg-stone-100"
                    >
                      <Minus className="w-3 h-3" /> Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="bg-white rounded-xl border border-stone-200 p-5">
          <h3 className="font-display font-bold text-stone-900 mb-3">
            Inventory Audit History ({inventoryLogs.length})
          </h3>
          {inventoryLogs.length === 0 ? (
            <p className="text-xs text-stone-500">No inventory movements recorded yet.</p>
          ) : (
            <div className="overflow-x-auto max-h-72 overflow-y-auto">
              <table className="w-full text-xs text-left">
                <thead>
                  <tr className="border-b border-stone-200 text-stone-500">
                    <th className="py-2 pr-3 font-semibold">Date (IST)</th>
                    <th className="py-2 pr-3 font-semibold">Product</th>
                    <th className="py-2 pr-3 font-semibold">Type</th>
                    <th className="py-2 pr-3 font-semibold text-right">Delta</th>
                    <th className="py-2 pr-3 font-semibold text-right">Stock Change</th>
                    <th className="py-2 font-semibold">Reason</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {inventoryLogs.slice(0, 40).map((log) => (
                    <tr key={log.id}>
                      <td className="py-2 pr-3 text-stone-500 whitespace-nowrap">
                        {formatISTDateTime(log.createdAt)}
                      </td>
                      <td className="py-2 pr-3 font-semibold text-stone-900">{log.productName}</td>
                      <td className="py-2 pr-3 text-stone-600">{log.changeType}</td>
                      <td
                        className={`py-2 pr-3 text-right font-mono font-semibold tabular-nums ${
                          log.quantityDelta >= 0 ? 'text-emerald-700' : 'text-red-700'
                        }`}
                      >
                        {log.quantityDelta >= 0 ? `+${log.quantityDelta}` : log.quantityDelta}
                      </td>
                      <td className="py-2 pr-3 text-right font-mono tabular-nums text-stone-700">
                        {log.previousStock} → {log.newStock}
                      </td>
                      <td className="py-2 text-stone-600">{log.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Price Research & Verification Mode
  return (
    <div className="space-y-6">
      <div className="p-4 rounded-xl bg-amber-50/80 border border-amber-200 text-xs text-stone-800 space-y-1">
        <p className="font-bold text-stone-900">
          Sopore &amp; J&amp;K Price Verification Policy (Admin-Approved Only)
        </p>
        <p>
          External references (J&amp;K Directorate of Economics &amp; Statistics, Dept. of Consumer Affairs, or online listings) are never auto-published as live Sopore prices. Verify pack size, brand, MRP, and supplier purchase bill, then click <strong>Approve &amp; Publish Price</strong>.
        </p>
      </div>

      {feedback && (
        <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 flex justify-between">
          <span>{feedback}</span>
          <button type="button" onClick={() => setFeedback('')} className="underline">
            Dismiss
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-8 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-display font-bold text-stone-900">
              Price Research &amp; Approval Queue ({priceResearch.length})
            </h3>
            <label className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-stone-300 bg-white text-xs font-semibold text-stone-700 hover:bg-stone-50">
              <Upload className="w-3.5 h-3.5" />
              Import Price Research CSV
              <input type="file" accept=".csv" onChange={handleCsvPriceResearch} className="hidden" />
            </label>
          </div>

          <div className="space-y-3">
            {priceResearch.map((item) => {
              const vals = publishCosts[item.id] || {
                cost: String(item.purchaseCost || ''),
                mrp: String(item.mrp || ''),
                sell: String(item.proposedSellingPrice || ''),
              };
              const costNum = Number(vals.cost) || 0;
              const sellNum = Number(vals.sell) || 0;
              const mrpNum = Number(vals.mrp) || 0;
              const marginPct =
                sellNum > 0 && costNum > 0
                  ? (((sellNum - costNum) / sellNum) * 100).toFixed(1)
                  : null;

              return (
                <div
                  key={item.id}
                  className="bg-white rounded-xl border border-stone-200 p-4 space-y-3 text-xs"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-bold text-sm text-stone-900">
                        {item.productName} · {item.brand} ({item.packSize})
                      </p>
                      <p className="text-stone-500 mt-0.5">
                        Source: <span className="font-medium text-stone-700">{item.sourceLabel}</span> ({PRICE_SCOPE_LABELS[item.priceScope]})
                      </p>
                      <p className="text-stone-500">
                        Market: {item.locationMarket} · Date: {item.researchDate}
                        {item.sourceUrl && (
                          <>
                            {' · '}
                            <a
                              href={item.sourceUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[#F36B16] underline"
                            >
                              View Source
                            </a>
                          </>
                        )}
                      </p>
                    </div>
                    <span
                      className={`font-semibold ${
                        item.verificationStatus === 'approved_published'
                          ? 'text-emerald-700'
                          : 'text-amber-800'
                      }`}
                    >
                      {item.verificationStatus === 'approved_published'
                        ? 'Approved & Published'
                        : item.verificationStatus === 'verified_pending_approval'
                          ? 'Verified (Pending Publish)'
                          : 'Admin Price Required'}
                    </span>
                  </div>

                  {item.notes && <p className="text-stone-600">{item.notes}</p>}

                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 pt-2 border-t border-stone-100 items-end">
                    <div>
                      <label className="block text-[11px] text-stone-500 mb-0.5">Observed Ref</label>
                      <p className="font-mono font-semibold text-stone-800 py-1.5 tabular-nums">
                        {item.observedPrice > 0 ? formatINR(item.observedPrice) : '—'}
                      </p>
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-stone-700 mb-0.5">
                        Purchase Cost (₹)
                      </label>
                      <input
                        type="number"
                        min={0}
                        value={vals.cost}
                        onChange={(e) =>
                          setPublishCosts({
                            ...publishCosts,
                            [item.id]: { ...vals, cost: e.target.value },
                          })
                        }
                        className="w-full px-2.5 py-1.5 rounded-lg border border-stone-300 font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-stone-700 mb-0.5">
                        Pack MRP (₹)
                      </label>
                      <input
                        type="number"
                        min={0}
                        value={vals.mrp}
                        onChange={(e) =>
                          setPublishCosts({
                            ...publishCosts,
                            [item.id]: { ...vals, mrp: e.target.value },
                          })
                        }
                        className="w-full px-2.5 py-1.5 rounded-lg border border-stone-300 font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-stone-700 mb-0.5">
                        Shop Selling (₹)
                      </label>
                      <input
                        type="number"
                        min={0}
                        value={vals.sell}
                        onChange={(e) =>
                          setPublishCosts({
                            ...publishCosts,
                            [item.id]: { ...vals, sell: e.target.value },
                          })
                        }
                        className="w-full px-2.5 py-1.5 rounded-lg border border-stone-300 font-mono"
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      {marginPct && (
                        <span className="text-[11px] font-mono text-emerald-700 tabular-nums">
                          Margin: {marginPct}%
                        </span>
                      )}
                      <button
                        type="button"
                        disabled={sellNum <= 0}
                        onClick={async () => {
                          await approveAndPublishPrice({
                            researchItem: item,
                            purchaseCost: costNum,
                            mrp: mrpNum,
                            sellingPrice: sellNum,
                          });
                          setFeedback(`Approved & published live selling price for ${item.productName}.`);
                        }}
                        className="inline-flex items-center justify-center gap-1 px-3 py-1.5 rounded-lg bg-[#F36B16] text-white font-semibold hover:bg-[#D95708] disabled:opacity-40"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Approve &amp; Publish
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Manual Price Research Logger */}
        <form
          onSubmit={handleAddResearch}
          className="lg:col-span-4 bg-white rounded-xl border border-stone-200 p-5 space-y-3 h-fit text-xs"
        >
          <h3 className="font-display font-bold text-stone-900 text-sm">
            Record Local Price Verification
          </h3>
          <div>
            <label className="block font-semibold text-stone-700 mb-1">Link to Product</label>
            <select
              value={prForm.productId}
              onChange={(e) => {
                const p = activeProducts.find((x) => x.id === e.target.value);
                setPrForm({
                  ...prForm,
                  productId: e.target.value,
                  productName: p?.name || prForm.productName,
                  brand: p?.brand || prForm.brand,
                  packSize: p?.packSize || prForm.packSize,
                  unit: p?.unit || prForm.unit,
                });
              }}
              className="w-full px-3 py-2 rounded-lg border border-stone-300 bg-white"
            >
              <option value="">— Select existing product (optional) —</option>
              {activeProducts.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.packSize})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block font-semibold text-stone-700 mb-1">Product Name *</label>
            <input
              type="text"
              required
              value={prForm.productName}
              onChange={(e) => setPrForm({ ...prForm, productName: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border border-stone-300"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block font-semibold text-stone-700 mb-1">Brand *</label>
              <input
                type="text"
                required
                value={prForm.brand}
                onChange={(e) => setPrForm({ ...prForm, brand: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-stone-300"
              />
            </div>
            <div>
              <label className="block font-semibold text-stone-700 mb-1">Exact Pack Size *</label>
              <input
                type="text"
                required
                value={prForm.packSize}
                onChange={(e) => setPrForm({ ...prForm, packSize: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-stone-300"
              />
            </div>
          </div>
          <div>
            <label className="block font-semibold text-stone-700 mb-1">Source Hierarchy *</label>
            <select
              value={prForm.priceScope}
              onChange={(e) =>
                setPrForm({ ...prForm, priceScope: e.target.value as PriceScope })
              }
              className="w-full px-3 py-2 rounded-lg border border-stone-300 bg-white"
            >
              {Object.entries(PRICE_SCOPE_LABELS).map(([k, label]) => (
                <option key={k} value={k}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block font-semibold text-stone-700 mb-1">Source Description *</label>
            <input
              type="text"
              required
              value={prForm.sourceLabel}
              onChange={(e) => setPrForm({ ...prForm, sourceLabel: e.target.value })}
              placeholder="e.g. Baramulla Distributor Bill #412"
              className="w-full px-3 py-2 rounded-lg border border-stone-300"
            />
          </div>
          <div>
            <label className="block font-semibold text-stone-700 mb-1">Source URL (Optional)</label>
            <input
              type="url"
              value={prForm.sourceUrl}
              onChange={(e) => setPrForm({ ...prForm, sourceUrl: e.target.value })}
              placeholder="https://..."
              className="w-full px-3 py-2 rounded-lg border border-stone-300"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block font-semibold text-stone-700 mb-1">MRP (₹)</label>
              <input
                type="number"
                min={0}
                value={prForm.mrp}
                onChange={(e) => setPrForm({ ...prForm, mrp: Number(e.target.value) })}
                className="w-full px-3 py-2 rounded-lg border border-stone-300 font-mono"
              />
            </div>
            <div>
              <label className="block font-semibold text-stone-700 mb-1">Observed Price (₹)</label>
              <input
                type="number"
                min={0}
                value={prForm.observedPrice}
                onChange={(e) => setPrForm({ ...prForm, observedPrice: Number(e.target.value) })}
                className="w-full px-3 py-2 rounded-lg border border-stone-300 font-mono"
              />
            </div>
            <div>
              <label className="block font-semibold text-stone-700 mb-1">Purchase Cost (₹)</label>
              <input
                type="number"
                min={0}
                value={prForm.purchaseCost}
                onChange={(e) => setPrForm({ ...prForm, purchaseCost: Number(e.target.value) })}
                className="w-full px-3 py-2 rounded-lg border border-stone-300 font-mono"
              />
            </div>
            <div>
              <label className="block font-semibold text-stone-700 mb-1">Proposed Selling (₹)</label>
              <input
                type="number"
                min={0}
                value={prForm.proposedSellingPrice}
                onChange={(e) =>
                  setPrForm({ ...prForm, proposedSellingPrice: Number(e.target.value) })
                }
                className="w-full px-3 py-2 rounded-lg border border-stone-300 font-mono"
              />
            </div>
          </div>
          <div>
            <label className="block font-semibold text-stone-700 mb-1">Location / Market *</label>
            <input
              type="text"
              required
              value={prForm.locationMarket}
              onChange={(e) => setPrForm({ ...prForm, locationMarket: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border border-stone-300"
            />
          </div>
          <button
            type="submit"
            className="w-full py-2.5 rounded-lg bg-stone-900 text-white font-semibold hover:bg-stone-800"
          >
            Save Research Draft
          </button>
        </form>
      </div>
    </div>
  );
};
