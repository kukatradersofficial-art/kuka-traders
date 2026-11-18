import React, { useState } from 'react';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { Copy, Edit3, Plus, RotateCcw, Search, Trash2, Upload, X } from 'lucide-react';
import { storage } from '../../firebase';
import { STORE_IMAGES } from '../../data/seedCatalog';
import type { Category, Product } from '../../types';
import {
  deleteCategory,
  deleteProductPermanently,
  saveCategory,
  saveProduct,
  toggleProductSoftDelete,
} from '../../services/firestoreStore';
import { formatINR, parseCsvRows, slugifyId } from '../../utils/format';

interface AdminProductsCategoriesProps {
  products: Product[];
  categories: Category[];
}

const emptyProductForm = (categories: Category[]): Omit<Product, 'id'> => ({
  name: '',
  nameUrdu: '',
  description: '',
  categoryId: categories[0]?.id || 'cat_daals_pulses',
  categoryName: categories[0]?.name || 'Daals & Pulses',
  brand: '',
  sku: `KT-${Date.now().toString().slice(-5)}`,
  barcode: '',
  imageUrl: STORE_IMAGES.pulsesRice,
  purchaseCost: 0,
  sellingPrice: 0,
  originalPrice: 0,
  packSize: '1 kg',
  unit: 'pack',
  stockQuantity: 0,
  lowStockThreshold: 5,
  discountPercent: 0,
  priceStatus: 'admin_price_required',
  isPublished: false,
  isFeatured: false,
  isBestSeller: false,
  isNewArrival: true,
  isDailyEssential: false,
  isDeleted: false,
  salesCount: 0,
});

export const AdminProductsCategories: React.FC<AdminProductsCategoriesProps> = ({
  products,
  categories,
}) => {
  const [subTab, setSubTab] = useState<'products' | 'categories' | 'deleted'>('products');
  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState('all');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<Omit<Product, 'id'>>(emptyProductForm(categories));
  const [saving, setSaving] = useState(false);
  const [uploadingImg, setUploadingImg] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [csvFeedback, setCsvFeedback] = useState('');

  // Bulk price/stock update
  const [bulkMode, setBulkMode] = useState<'none' | 'price' | 'stock'>('none');
  const [bulkCat, setBulkCat] = useState('all');
  const [bulkDelta, setBulkDelta] = useState('0');

  // Category form
  const [catName, setCatName] = useState('');
  const [catUrdu, setCatUrdu] = useState('');
  const [catDesc, setCatDesc] = useState('');
  const [catSort, setCatSort] = useState(categories.length + 1);
  const [editingCatId, setEditingCatId] = useState<string | null>(null);

  const visibleProducts = products.filter((p) => {
    if (subTab === 'deleted') return p.isDeleted;
    if (p.isDeleted) return false;
    const matchCat = catFilter === 'all' || p.categoryId === catFilter;
    const q = search.trim().toLowerCase();
    const matchSearch =
      !q ||
      p.name.toLowerCase().includes(q) ||
      p.brand.toLowerCase().includes(q) ||
      p.sku.toLowerCase().includes(q);
    return matchCat && matchSearch;
  });

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyProductForm(categories));
    setFormOpen(true);
  };

  const openEdit = (p: Product) => {
    setEditingId(p.id);
    const { id: _id, ...rest } = p;
    setForm(rest);
    setFormOpen(true);
  };

  const handleDuplicate = async (p: Product) => {
    const { id: _id, ...rest } = p;
    await saveProduct({
      ...rest,
      name: `${p.name} (Copy)`,
      sku: `${p.sku}-CPY`,
      isPublished: false,
    });
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingImg(true);
    try {
      const storageRef = ref(storage, `products/${Date.now()}_${file.name}`);
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);
      setForm((prev) => ({ ...prev, imageUrl: url }));
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Firebase Storage upload failed.');
    } finally {
      setUploadingImg(false);
    }
  };

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const cat = categories.find((c) => c.id === form.categoryId);
      const computedDiscount =
        form.originalPrice > form.sellingPrice && form.sellingPrice > 0
          ? Math.round(((form.originalPrice - form.sellingPrice) / form.originalPrice) * 100)
          : form.discountPercent;

      await saveProduct({
        ...form,
        id: editingId || undefined,
        categoryName: cat?.name || form.categoryName,
        discountPercent: computedDiscount,
        priceStatus: form.sellingPrice > 0 ? form.priceStatus : 'admin_price_required',
        isPublished:
          form.priceStatus === 'approved' && form.sellingPrice > 0 ? form.isPublished : false,
      });
      setFormOpen(false);
    } finally {
      setSaving(false);
    }
  };

  const handleCsvUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const rows = parseCsvRows(text);
    if (rows.length === 0) {
      setCsvFeedback('CSV must include headers (name,brand,category,packSize,unit,sellingPrice,originalPrice,purchaseCost,stockQuantity).');
      return;
    }
    let count = 0;
    for (const r of rows) {
      if (!r.name) continue;
      const matchedCat =
        categories.find(
          (c) =>
            c.name.toLowerCase() === (r.category || '').toLowerCase() ||
            c.id === r.category
        ) || categories[0];
      const sp = Number(r.sellingPrice) || 0;
      const op = Number(r.originalPrice) || sp;
      await saveProduct({
        name: r.name,
        nameUrdu: r.nameUrdu || '',
        description: r.description || `${r.name} (${r.packSize || '1 unit'})`,
        categoryId: matchedCat.id,
        categoryName: matchedCat.name,
        brand: r.brand || 'KUKA Select',
        sku: r.sku || slugifyId(r.name, 'SKU').toUpperCase().slice(0, 14),
        barcode: r.barcode || '',
        imageUrl: r.imageUrl || matchedCat.imageUrl || STORE_IMAGES.pulsesRice,
        purchaseCost: Number(r.purchaseCost) || 0,
        sellingPrice: sp,
        originalPrice: op,
        packSize: r.packSize || '1 unit',
        unit: r.unit || 'pack',
        stockQuantity: Math.max(0, Number(r.stockQuantity) || 0),
        lowStockThreshold: Math.max(0, Number(r.lowStockThreshold) || 5),
        discountPercent: op > sp && sp > 0 ? Math.round(((op - sp) / op) * 100) : 0,
        priceStatus: sp > 0 ? 'approved' : 'admin_price_required',
        isPublished: sp > 0,
        isFeatured: false,
        isBestSeller: false,
        isNewArrival: true,
        isDailyEssential: false,
        isDeleted: false,
        salesCount: 0,
      });
      count++;
    }
    setCsvFeedback(`Imported ${count} products from CSV into Firestore.`);
    e.target.value = '';
  };

  const applyBulkUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    const delta = Number(bulkDelta);
    if (!Number.isFinite(delta) || delta === 0) return;
    const targets = products.filter(
      (p) => !p.isDeleted && (bulkCat === 'all' || p.categoryId === bulkCat)
    );
    for (const p of targets) {
      if (bulkMode === 'price' && p.sellingPrice > 0) {
        const nextPrice = Math.max(1, Math.round(p.sellingPrice * (1 + delta / 100)));
        await saveProduct({ ...p, sellingPrice: nextPrice });
      } else if (bulkMode === 'stock') {
        const nextStock = Math.max(0, p.stockQuantity + Math.round(delta));
        await saveProduct({ ...p, stockQuantity: nextStock });
      }
    }
    setBulkMode('none');
    setCsvFeedback(`Bulk ${bulkMode} update applied across ${targets.length} products.`);
  };

  const handleSaveCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!catName.trim()) return;
    await saveCategory({
      id: editingCatId || undefined,
      name: catName.trim(),
      nameUrdu: catUrdu.trim(),
      slug: catName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      description: catDesc.trim(),
      imageUrl: STORE_IMAGES.pulsesRice,
      sortOrder: catSort,
      isActive: true,
    });
    setCatName('');
    setCatUrdu('');
    setCatDesc('');
    setEditingCatId(null);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1 p-1 bg-stone-100 rounded-xl">
          <button
            type="button"
            onClick={() => setSubTab('products')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              subTab === 'products' ? 'bg-white text-stone-900 shadow-xs' : 'text-stone-600'
            }`}
          >
            Products ({products.filter((p) => !p.isDeleted).length})
          </button>
          <button
            type="button"
            onClick={() => setSubTab('categories')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              subTab === 'categories' ? 'bg-white text-stone-900 shadow-xs' : 'text-stone-600'
            }`}
          >
            Categories ({categories.length})
          </button>
          <button
            type="button"
            onClick={() => setSubTab('deleted')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              subTab === 'deleted' ? 'bg-white text-stone-900 shadow-xs' : 'text-stone-600'
            }`}
          >
            Deleted ({products.filter((p) => p.isDeleted).length})
          </button>
        </div>

        {subTab === 'products' && (
          <div className="flex flex-wrap items-center gap-2">
            <label className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-stone-300 bg-white text-xs font-semibold text-stone-700 hover:bg-stone-50">
              <Upload className="w-3.5 h-3.5" />
              CSV Bulk Upload
              <input type="file" accept=".csv" onChange={handleCsvUpload} className="hidden" />
            </label>
            <button
              type="button"
              onClick={() => setBulkMode(bulkMode === 'price' ? 'none' : 'price')}
              className="px-3 py-2 rounded-xl border border-stone-300 bg-white text-xs font-semibold text-stone-700 hover:bg-stone-50"
            >
              Bulk Price %
            </button>
            <button
              type="button"
              onClick={() => setBulkMode(bulkMode === 'stock' ? 'none' : 'stock')}
              className="px-3 py-2 rounded-xl border border-stone-300 bg-white text-xs font-semibold text-stone-700 hover:bg-stone-50"
            >
              Bulk Stock +/-
            </button>
            <button
              type="button"
              onClick={openCreate}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#F36B16] text-white text-xs font-semibold hover:bg-[#D95708]"
            >
              <Plus className="w-4 h-4" />
              Add Product
            </button>
          </div>
        )}
      </div>

      {csvFeedback && (
        <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 flex justify-between items-center">
          <span>{csvFeedback}</span>
          <button type="button" onClick={() => setCsvFeedback('')} className="underline">
            Dismiss
          </button>
        </div>
      )}

      {bulkMode !== 'none' && (
        <form
          onSubmit={applyBulkUpdate}
          className="p-4 rounded-xl bg-stone-50 border border-stone-200 flex flex-wrap items-end gap-3"
        >
          <div>
            <label className="block text-xs font-semibold text-stone-700 mb-1">Category</label>
            <select
              value={bulkCat}
              onChange={(e) => setBulkCat(e.target.value)}
              className="px-3 py-2 rounded-lg border border-stone-300 bg-white text-xs"
            >
              <option value="all">All Categories</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-stone-700 mb-1">
              {bulkMode === 'price' ? 'Price Adjustment (%)' : 'Stock Quantity Delta (+/-)'}
            </label>
            <input
              type="number"
              value={bulkDelta}
              onChange={(e) => setBulkDelta(e.target.value)}
              className="w-36 px-3 py-2 rounded-lg border border-stone-300 bg-white text-xs font-mono"
            />
          </div>
          <button
            type="submit"
            className="px-4 py-2 rounded-lg bg-stone-900 text-white text-xs font-semibold"
          >
            Apply Bulk Update
          </button>
        </form>
      )}

      {subTab !== 'categories' ? (
        <div className="bg-white rounded-xl border border-stone-200 overflow-hidden">
          {subTab === 'products' && (
            <div className="p-4 border-b border-stone-200 flex flex-wrap gap-3">
              <div className="relative flex-1 min-w-[220px]">
                <Search className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by product name, brand, or SKU..."
                  className="w-full pl-9 pr-3 py-2 rounded-lg border border-stone-300 text-xs"
                />
              </div>
              <select
                value={catFilter}
                onChange={(e) => setCatFilter(e.target.value)}
                className="px-3 py-2 rounded-lg border border-stone-300 text-xs bg-white"
              >
                <option value="all">All Categories</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="border-b border-stone-200 bg-stone-50 text-stone-500">
                  <th className="py-3 px-4 font-semibold">Product</th>
                  <th className="py-3 px-3 font-semibold">Category</th>
                  <th className="py-3 px-3 font-semibold text-right">Cost</th>
                  <th className="py-3 px-3 font-semibold text-right">Selling</th>
                  <th className="py-3 px-3 font-semibold text-right">Stock</th>
                  <th className="py-3 px-3 font-semibold">Status</th>
                  <th className="py-3 px-4 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {visibleProducts.map((p) => (
                  <tr key={p.id} className="hover:bg-stone-50/70">
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        <img
                          src={p.imageUrl}
                          alt={p.name}
                          className="w-10 h-10 rounded-lg object-cover bg-stone-100 shrink-0"
                        />
                        <div>
                          <p className="font-semibold text-stone-900">{p.name}</p>
                          <p className="text-[11px] text-stone-500">
                            {p.brand} · {p.packSize} · <span className="font-mono">{p.sku}</span>
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-3 text-stone-700">{p.categoryName}</td>
                    <td className="py-3 px-3 text-right font-mono tabular-nums text-stone-600">
                      {p.purchaseCost > 0 ? formatINR(p.purchaseCost) : '—'}
                    </td>
                    <td className="py-3 px-3 text-right font-mono font-semibold tabular-nums text-stone-900">
                      {p.sellingPrice > 0 ? formatINR(p.sellingPrice) : 'Price Req.'}
                    </td>
                    <td className="py-3 px-3 text-right font-mono tabular-nums">
                      <span
                        className={
                          p.stockQuantity <= 0
                            ? 'text-red-700 font-semibold'
                            : p.stockQuantity <= p.lowStockThreshold
                              ? 'text-amber-700 font-semibold'
                              : 'text-stone-900'
                        }
                      >
                        {p.stockQuantity}
                      </span>
                    </td>
                    <td className="py-3 px-3">
                      {p.priceStatus === 'admin_price_required' ? (
                        <span className="text-amber-800 font-medium">Admin Price Required</span>
                      ) : p.isPublished ? (
                        <span className="text-emerald-700 font-medium">Published</span>
                      ) : (
                        <span className="text-stone-500">Hidden</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="inline-flex items-center gap-1">
                        {subTab === 'products' ? (
                          <>
                            <button
                              type="button"
                              onClick={() => openEdit(p)}
                              title="Edit"
                              className="p-1.5 rounded-lg text-stone-600 hover:bg-stone-100"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDuplicate(p)}
                              title="Duplicate"
                              className="p-1.5 rounded-lg text-stone-600 hover:bg-stone-100"
                            >
                              <Copy className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(p.id)}
                              title="Delete"
                              className="p-1.5 rounded-lg text-red-600 hover:bg-red-50"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={() => toggleProductSoftDelete(p.id, false)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-stone-300 text-stone-700 hover:bg-stone-100"
                            >
                              <RotateCcw className="w-3 h-3" /> Restore
                            </button>
                            <button
                              type="button"
                              onClick={() => deleteProductPermanently(p.id)}
                              className="px-2.5 py-1 rounded-lg border border-red-200 text-red-700 hover:bg-red-50"
                            >
                              Purge
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-7 bg-white rounded-xl border border-stone-200 p-5 space-y-3">
            <h3 className="font-display font-bold text-stone-900">Store Categories</h3>
            <div className="divide-y divide-stone-100">
              {categories.map((c) => (
                <div key={c.id} className="py-3 flex items-center justify-between gap-3 text-xs">
                  <div>
                    <p className="font-semibold text-stone-900">
                      {c.sortOrder}. {c.name}{' '}
                      {c.nameUrdu && <span className="text-stone-500">({c.nameUrdu})</span>}
                    </p>
                    <p className="text-stone-500">{c.description}</p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        setEditingCatId(c.id);
                        setCatName(c.name);
                        setCatUrdu(c.nameUrdu);
                        setCatDesc(c.description);
                        setCatSort(c.sortOrder);
                      }}
                      className="p-1.5 rounded-lg text-stone-600 hover:bg-stone-100"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteCategory(c.id)}
                      className="p-1.5 rounded-lg text-red-600 hover:bg-red-50"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <form
            onSubmit={handleSaveCategory}
            className="lg:col-span-5 bg-white rounded-xl border border-stone-200 p-5 space-y-3 h-fit"
          >
            <h3 className="font-display font-bold text-stone-900">
              {editingCatId ? 'Edit Category' : 'Add New Category'}
            </h3>
            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">
                Category Name *
              </label>
              <input
                type="text"
                required
                value={catName}
                onChange={(e) => setCatName(e.target.value)}
                placeholder="e.g. Bakery & Rusks"
                className="w-full px-3 py-2 rounded-lg border border-stone-300 text-xs"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">
                Urdu Name (Optional)
              </label>
              <input
                type="text"
                dir="rtl"
                value={catUrdu}
                onChange={(e) => setCatUrdu(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-stone-300 text-xs"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">
                Description
              </label>
              <textarea
                rows={2}
                value={catDesc}
                onChange={(e) => setCatDesc(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-stone-300 text-xs"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">
                Sort Order
              </label>
              <input
                type="number"
                value={catSort}
                onChange={(e) => setCatSort(Number(e.target.value))}
                className="w-24 px-3 py-2 rounded-lg border border-stone-300 text-xs font-mono"
              />
            </div>
            <div className="flex gap-2">
              <button
                type="submit"
                className="px-4 py-2 rounded-lg bg-[#F36B16] text-white text-xs font-semibold hover:bg-[#D95708]"
              >
                {editingCatId ? 'Update Category' : 'Create Category'}
              </button>
              {editingCatId && (
                <button
                  type="button"
                  onClick={() => {
                    setEditingCatId(null);
                    setCatName('');
                    setCatUrdu('');
                    setCatDesc('');
                  }}
                  className="px-3 py-2 rounded-lg border border-stone-300 text-xs"
                >
                  Cancel
                </button>
              )}
            </div>
          </form>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {confirmDeleteId && (
        <div className="fixed inset-0 z-50 bg-stone-950/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-stone-200 max-w-sm w-full p-6 space-y-4">
            <h4 className="font-display font-bold text-stone-900">Delete Product?</h4>
            <p className="text-xs text-stone-600">
              This moves the product to the Deleted tab so historical orders remain intact, and you can restore it anytime.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmDeleteId(null)}
                className="px-4 py-2 rounded-lg border border-stone-300 text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  await toggleProductSoftDelete(confirmDeleteId, true);
                  setConfirmDeleteId(null);
                }}
                className="px-4 py-2 rounded-lg bg-red-600 text-white text-xs font-semibold"
              >
                Confirm Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add/Edit Product Modal */}
      {formOpen && (
        <div className="fixed inset-0 z-50 bg-stone-950/50 flex items-center justify-center p-4 overflow-y-auto">
          <form
            onSubmit={handleSaveProduct}
            className="bg-white rounded-2xl border border-stone-200 max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6 space-y-4"
          >
            <div className="flex items-center justify-between pb-3 border-b border-stone-200">
              <h3 className="font-display font-bold text-lg text-stone-900">
                {editingId ? 'Edit Product' : 'Add New Product'}
              </h3>
              <button
                type="button"
                onClick={() => setFormOpen(false)}
                className="p-1.5 rounded-lg hover:bg-stone-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block font-semibold text-stone-700 mb-1">Product Name *</label>
                <input
                  type="text"
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-stone-300"
                />
              </div>
              <div>
                <label className="block font-semibold text-stone-700 mb-1">Urdu Name</label>
                <input
                  type="text"
                  dir="rtl"
                  value={form.nameUrdu}
                  onChange={(e) => setForm({ ...form, nameUrdu: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-stone-300"
                />
              </div>
              <div>
                <label className="block font-semibold text-stone-700 mb-1">Category *</label>
                <select
                  value={form.categoryId}
                  onChange={(e) => {
                    const c = categories.find((x) => x.id === e.target.value);
                    setForm({
                      ...form,
                      categoryId: e.target.value,
                      categoryName: c?.name || form.categoryName,
                    });
                  }}
                  className="w-full px-3 py-2 rounded-lg border border-stone-300 bg-white"
                >
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block font-semibold text-stone-700 mb-1">Brand *</label>
                <input
                  type="text"
                  required
                  value={form.brand}
                  onChange={(e) => setForm({ ...form, brand: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-stone-300"
                />
              </div>
              <div>
                <label className="block font-semibold text-stone-700 mb-1">SKU *</label>
                <input
                  type="text"
                  required
                  value={form.sku}
                  onChange={(e) => setForm({ ...form, sku: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-stone-300 font-mono"
                />
              </div>
              <div>
                <label className="block font-semibold text-stone-700 mb-1">Barcode (Optional)</label>
                <input
                  type="text"
                  value={form.barcode}
                  onChange={(e) => setForm({ ...form, barcode: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-stone-300 font-mono"
                />
              </div>
              <div>
                <label className="block font-semibold text-stone-700 mb-1">Pack Size *</label>
                <input
                  type="text"
                  required
                  value={form.packSize}
                  onChange={(e) => setForm({ ...form, packSize: e.target.value })}
                  placeholder="e.g. 1 kg, 500 ml, 25 kg"
                  className="w-full px-3 py-2 rounded-lg border border-stone-300"
                />
              </div>
              <div>
                <label className="block font-semibold text-stone-700 mb-1">Unit *</label>
                <input
                  type="text"
                  required
                  value={form.unit}
                  onChange={(e) => setForm({ ...form, unit: e.target.value })}
                  placeholder="pack, bottle, bag, kg"
                  className="w-full px-3 py-2 rounded-lg border border-stone-300"
                />
              </div>
              <div>
                <label className="block font-semibold text-stone-700 mb-1">Purchase Cost (₹)</label>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={form.purchaseCost}
                  onChange={(e) => setForm({ ...form, purchaseCost: Number(e.target.value) })}
                  className="w-full px-3 py-2 rounded-lg border border-stone-300 font-mono"
                />
              </div>
              <div>
                <label className="block font-semibold text-stone-700 mb-1">Selling Price (₹)</label>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={form.sellingPrice}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      sellingPrice: Number(e.target.value),
                      priceStatus:
                        Number(e.target.value) > 0 ? 'approved' : 'admin_price_required',
                    })
                  }
                  className="w-full px-3 py-2 rounded-lg border border-stone-300 font-mono"
                />
              </div>
              <div>
                <label className="block font-semibold text-stone-700 mb-1">Original Price / MRP (₹)</label>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={form.originalPrice}
                  onChange={(e) => setForm({ ...form, originalPrice: Number(e.target.value) })}
                  className="w-full px-3 py-2 rounded-lg border border-stone-300 font-mono"
                />
              </div>
              <div>
                <label className="block font-semibold text-stone-700 mb-1">Stock Quantity *</label>
                <input
                  type="number"
                  min={0}
                  value={form.stockQuantity}
                  onChange={(e) => setForm({ ...form, stockQuantity: Number(e.target.value) })}
                  className="w-full px-3 py-2 rounded-lg border border-stone-300 font-mono"
                />
              </div>
              <div>
                <label className="block font-semibold text-stone-700 mb-1">Low-Stock Threshold</label>
                <input
                  type="number"
                  min={0}
                  value={form.lowStockThreshold}
                  onChange={(e) => setForm({ ...form, lowStockThreshold: Number(e.target.value) })}
                  className="w-full px-3 py-2 rounded-lg border border-stone-300 font-mono"
                />
              </div>
              <div>
                <label className="block font-semibold text-stone-700 mb-1">Price Verification</label>
                <select
                  value={form.priceStatus}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      priceStatus: e.target.value as Product['priceStatus'],
                    })
                  }
                  className="w-full px-3 py-2 rounded-lg border border-stone-300 bg-white"
                >
                  <option value="approved">Approved for Storefront</option>
                  <option value="admin_price_required">Admin Price Required (Unpublished)</option>
                </select>
              </div>
            </div>

            <div className="text-xs">
              <label className="block font-semibold text-stone-700 mb-1">Description</label>
              <textarea
                rows={2}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-stone-300"
              />
            </div>

            <div className="text-xs space-y-2">
              <label className="block font-semibold text-stone-700">Product Image URL or Upload</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={form.imageUrl}
                  onChange={(e) => setForm({ ...form, imageUrl: e.target.value })}
                  className="flex-1 px-3 py-2 rounded-lg border border-stone-300"
                />
                <label className="cursor-pointer px-3 py-2 rounded-lg border border-stone-300 bg-stone-50 font-semibold hover:bg-stone-100">
                  {uploadingImg ? 'Uploading...' : 'Upload'}
                  <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
                </label>
              </div>
            </div>

            <div className="flex flex-wrap gap-4 text-xs pt-2">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={form.isPublished}
                  onChange={(e) => setForm({ ...form, isPublished: e.target.checked })}
                  className="accent-[#F36B16]"
                />
                Visible on Storefront
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={form.isFeatured}
                  onChange={(e) => setForm({ ...form, isFeatured: e.target.checked })}
                  className="accent-[#F36B16]"
                />
                Featured
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={form.isBestSeller}
                  onChange={(e) => setForm({ ...form, isBestSeller: e.target.checked })}
                  className="accent-[#F36B16]"
                />
                Best Seller
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={form.isNewArrival}
                  onChange={(e) => setForm({ ...form, isNewArrival: e.target.checked })}
                  className="accent-[#F36B16]"
                />
                New Arrival
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={form.isDailyEssential}
                  onChange={(e) => setForm({ ...form, isDailyEssential: e.target.checked })}
                  className="accent-[#F36B16]"
                />
                Daily Essential
              </label>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-stone-200">
              <button
                type="button"
                onClick={() => setFormOpen(false)}
                className="px-4 py-2 rounded-lg border border-stone-300 text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-5 py-2 rounded-lg bg-[#F36B16] text-white text-xs font-semibold hover:bg-[#D95708]"
              >
                {saving ? 'Saving...' : 'Save Product'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
