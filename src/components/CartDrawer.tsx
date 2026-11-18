import React, { useState } from 'react';
import { Minus, Plus, ShoppingBag, Tag, Trash2, X } from 'lucide-react';
import type { CartItem, Coupon, Product, StoreSettings } from '../types';
import { formatINR } from '../utils/format';

interface CartDrawerProps {
  isOpen: boolean;
  cart: CartItem[];
  products: Product[];
  coupons: Coupon[];
  settings: StoreSettings;
  appliedCouponCode: string;
  onApplyCoupon: (code: string) => void;
  onUpdateQty: (productId: string, qty: number) => void;
  onRemoveItem: (productId: string) => void;
  onClose: () => void;
  onProceedCheckout: () => void;
}

export const CartDrawer: React.FC<CartDrawerProps> = ({
  isOpen,
  cart,
  products,
  coupons,
  settings,
  appliedCouponCode,
  onApplyCoupon,
  onUpdateQty,
  onRemoveItem,
  onClose,
  onProceedCheckout,
}) => {
  const [couponInput, setCouponInput] = useState(appliedCouponCode);
  const [couponError, setCouponError] = useState('');

  if (!isOpen) return null;

  const productMap: Record<string, Product> = {};
  for (const p of products) productMap[p.id] = p;

  const resolvedItems = cart
    .map((ci) => ({ ci, product: productMap[ci.productId] }))
    .filter((entry): entry is { ci: CartItem; product: Product } => Boolean(entry.product));

  const subtotal = resolvedItems.reduce((sum, { ci, product }) => {
    const validQty = Math.min(ci.quantity, Math.max(0, product.stockQuantity));
    return sum + (product.priceStatus === 'approved' ? product.sellingPrice * validQty : 0);
  }, 0);

  const activeCoupon = coupons.find(
    (c) =>
      c.isActive &&
      c.code.toUpperCase() === appliedCouponCode.toUpperCase() &&
      subtotal >= c.minOrderAmount
  );

  const discountAmount = activeCoupon
    ? activeCoupon.discountType === 'flat'
      ? Math.min(subtotal, activeCoupon.discountValue)
      : Math.round((subtotal * activeCoupon.discountValue) / 100)
    : 0;

  const estimatedDelivery =
    subtotal === 0 || subtotal >= settings.freeDeliveryThreshold
      ? 0
      : settings.defaultDeliveryCharge;

  const finalAmount = Math.max(0, subtotal - discountAmount + estimatedDelivery);

  const hasUnavailable = resolvedItems.some(
    ({ ci, product }) =>
      product.stockQuantity <= 0 ||
      ci.quantity > product.stockQuantity ||
      !product.isPublished ||
      product.priceStatus !== 'approved'
  );

  const handleApplyCoupon = (e: React.FormEvent) => {
    e.preventDefault();
    const code = couponInput.trim().toUpperCase();
    if (!code) {
      onApplyCoupon('');
      setCouponError('');
      return;
    }
    const found = coupons.find((c) => c.isActive && c.code.toUpperCase() === code);
    if (!found) {
      setCouponError('Invalid or inactive coupon code.');
      return;
    }
    if (subtotal < found.minOrderAmount) {
      setCouponError(`Minimum order ${formatINR(found.minOrderAmount)} required for ${found.code}.`);
      return;
    }
    setCouponError('');
    onApplyCoupon(found.code);
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#0B1324]/55 backdrop-blur-xs flex justify-end">
      <div
        className="w-full max-w-md bg-[#F3F5F8] h-full flex flex-col shadow-2xl border-l border-slate-200"
        role="dialog"
        aria-modal="true"
        aria-label="Your Cart"
      >
        <div className="px-5 py-4 bg-white border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-[#131921] text-[#FF9900] flex items-center justify-center">
              <ShoppingBag className="w-4 h-4" />
            </div>
            <h2 className="font-display font-bold text-lg text-slate-900">
              Your Cart ({resolvedItems.reduce((s, r) => s + r.ci.quantity, 0)})
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close cart"
            className="w-9 h-9 rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200 flex items-center justify-center transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-3">
          {resolvedItems.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200/80 text-center py-14 px-6 shadow-xs">
              <ShoppingBag className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <p className="font-bold text-slate-900">Your cart is empty</p>
              <p className="text-sm text-slate-500 mt-1">
                Browse groceries, oils, spices, household supplies, and cattle feed to add items.
              </p>
            </div>
          ) : (
            resolvedItems.map(({ ci, product }) => {
              const outOfStock = product.stockQuantity <= 0 || !product.isPublished;
              const exceedsStock = ci.quantity > product.stockQuantity;
              return (
                <div
                  key={product.id}
                  className="bg-white rounded-2xl border border-slate-200/80 p-3.5 shadow-xs flex gap-3.5"
                >
                  <img
                    src={product.imageUrl}
                    alt={product.name}
                    referrerPolicy="no-referrer"
                    className="w-20 h-20 rounded-xl object-cover bg-[#F5F7FA] border border-slate-100 shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold">
                          {product.brand} · {product.packSize}
                        </p>
                        <h3 className="font-bold text-sm text-slate-900 line-clamp-2">
                          {product.name}
                        </h3>
                      </div>
                      <button
                        type="button"
                        onClick={() => onRemoveItem(product.id)}
                        aria-label={`Remove ${product.name}`}
                        className="text-slate-400 hover:text-red-600 p-1 rounded-full hover:bg-red-50 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                    {(outOfStock || exceedsStock) && (
                      <p className="text-xs text-red-700 font-medium mt-1">
                        {outOfStock
                          ? 'Currently unavailable — please remove.'
                          : `Only ${product.stockQuantity} left in stock.`}
                      </p>
                    )}

                    <div className="mt-2.5 flex items-center justify-between">
                      <div className="inline-flex items-center border border-slate-200 bg-[#F5F7FA] rounded-full overflow-hidden">
                        <button
                          type="button"
                          onClick={() => onUpdateQty(product.id, ci.quantity - 1)}
                          aria-label="Decrease quantity"
                          className="w-7 h-7 flex items-center justify-center text-slate-700 hover:bg-slate-200"
                        >
                          <Minus className="w-3.5 h-3.5" />
                        </button>
                        <span className="w-8 text-center font-mono text-xs font-bold tabular-nums text-slate-900">
                          {ci.quantity}
                        </span>
                        <button
                          type="button"
                          disabled={ci.quantity >= product.stockQuantity}
                          onClick={() => onUpdateQty(product.id, ci.quantity + 1)}
                          aria-label="Increase quantity"
                          className="w-7 h-7 flex items-center justify-center text-slate-700 hover:bg-slate-200 disabled:opacity-40"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      <span className="font-mono font-extrabold text-sm text-slate-900 tabular-nums">
                        {formatINR(product.sellingPrice * ci.quantity)}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {resolvedItems.length > 0 && (
          <div className="p-5 border-t border-slate-200 bg-white space-y-4 rounded-t-3xl shadow-lg">
            <form onSubmit={handleApplyCoupon} className="flex gap-2">
              <div className="relative flex-1">
                <Tag className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={couponInput}
                  onChange={(e) => setCouponInput(e.target.value)}
                  placeholder="Promo code (e.g. SOPORE50)"
                  className="w-full pl-9 pr-3 py-2.5 rounded-full border border-slate-300 bg-[#F5F7FA] text-xs focus:outline-none focus:ring-2 focus:ring-[#FF9900]"
                />
              </div>
              <button
                type="submit"
                className="px-4 py-2 rounded-full bg-[#131921] text-white text-xs font-bold hover:bg-slate-800 transition-colors"
              >
                Apply
              </button>
            </form>
            {couponError && <p className="text-xs text-red-700">{couponError}</p>}

            <div className="space-y-1.5 text-sm">
              <div className="flex justify-between text-slate-600">
                <span>Subtotal</span>
                <span className="font-mono tabular-nums font-medium">{formatINR(subtotal)}</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>Shipping</span>
                <span className={`font-mono tabular-nums font-bold ${estimatedDelivery === 0 ? 'text-emerald-600' : ''}`}>
                  {estimatedDelivery === 0 ? 'FREE' : formatINR(estimatedDelivery)}
                </span>
              </div>
              {discountAmount > 0 && (
                <div className="flex justify-between text-emerald-700 font-semibold">
                  <span>Discount ({activeCoupon?.code})</span>
                  <span className="font-mono tabular-nums">−{formatINR(discountAmount)}</span>
                </div>
              )}
              <div className="flex justify-between font-extrabold text-base text-slate-900 pt-2 border-t border-slate-200">
                <span>Total</span>
                <span className="font-mono tabular-nums">{formatINR(finalAmount)}</span>
              </div>
            </div>

            {subtotal < settings.minOrderAmount && (
              <p className="text-xs text-amber-800 font-medium">
                Minimum order amount is {formatINR(settings.minOrderAmount)}. Add{' '}
                {formatINR(settings.minOrderAmount - subtotal)} more to proceed.
              </p>
            )}

            <button
              type="button"
              disabled={hasUnavailable || subtotal < settings.minOrderAmount}
              onClick={onProceedCheckout}
              className="w-full py-3.5 px-5 rounded-full bg-[#FF9900] text-slate-950 font-extrabold text-sm hover:bg-[#E68A00] transition-colors disabled:opacity-50 shadow-xs"
            >
              Proceed to Checkout · {formatINR(finalAmount)}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
