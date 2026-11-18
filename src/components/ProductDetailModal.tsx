import React, { useEffect, useState } from 'react';
import {
  Bell,
  BellRing,
  CheckCircle2,
  Heart,
  MessageCircle,
  Minus,
  Package,
  Plus,
  ShoppingCart,
  Star,
  X,
  Zap,
} from 'lucide-react';
import type { Order, PriceAlert, Product, Review } from '../types';
import {
  cancelPriceDropAlert,
  getUserProductPriceAlert,
  savePriceDropAlert,
  submitCustomerReview,
} from '../services/firestoreStore';
import { buildWhatsAppLink, formatINR, formatISTDateTime } from '../utils/format';

interface ProductDetailModalProps {
  product: Product | null;
  reviews: Review[];
  userOrders: Order[];
  currentUser: { uid: string; name: string; email?: string; emailVerified: boolean } | null;
  whatsappNumber: string;
  isWishlisted: boolean;
  onClose: () => void;
  onAddToCart: (product: Product, qty: number) => void;
  onBuyNow: (product: Product, qty: number) => void;
  onToggleWishlist: (productId: string) => void;
  onOpenAuth: () => void;
}

export const ProductDetailModal: React.FC<ProductDetailModalProps> = ({
  product,
  reviews,
  userOrders,
  currentUser,
  whatsappNumber,
  isWishlisted,
  onClose,
  onAddToCart,
  onBuyNow,
  onToggleWishlist,
  onOpenAuth,
}) => {
  const [qty, setQty] = useState(1);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [submittingReview, setSubmittingReview] = useState(false);
  const [reviewMsg, setReviewMsg] = useState('');
  const [reviewErr, setReviewErr] = useState('');
  const [imgError, setImgError] = useState(false);
  const [priceAlert, setPriceAlert] = useState<PriceAlert | null>(null);
  const [loadingAlert, setLoadingAlert] = useState(false);
  const [savingAlert, setSavingAlert] = useState(false);
  const [targetPriceInput, setTargetPriceInput] = useState('');
  const [alertMsg, setAlertMsg] = useState('');
  const [alertErr, setAlertErr] = useState('');

  useEffect(() => {
    setQty(1);
    setImgError(false);
    setReviewMsg('');
    setReviewErr('');
  }, [product?.id]);

  useEffect(() => {
    let cancelled = false;
    setAlertMsg('');
    setAlertErr('');
    setTargetPriceInput('');
    setPriceAlert(null);

    if (!product?.id || !currentUser?.uid || !currentUser.emailVerified) {
      setLoadingAlert(false);
      return;
    }

    setLoadingAlert(true);
    getUserProductPriceAlert(currentUser.uid, product.id)
      .then((existing) => {
        if (cancelled) return;
        if (existing && existing.status === 'active') {
          setPriceAlert(existing);
          if (existing.targetPrice > 0) {
            setTargetPriceInput(String(existing.targetPrice));
          }
        }
      })
      .catch(() => {
        if (!cancelled) {
          setPriceAlert(null);
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingAlert(false);
      });

    return () => {
      cancelled = true;
    };
  }, [product?.id, currentUser?.uid, currentUser?.emailVerified]);

  if (!product) return null;

  const isOutOfStock = product.stockQuantity <= 0;
  const hasPrice = product.priceStatus === 'approved' && product.sellingPrice > 0;
  const productReviews = reviews.filter((r) => r.productId === product.id);
  const avgRating =
    productReviews.length > 0
      ? (productReviews.reduce((s, r) => s + r.rating, 0) / productReviews.length).toFixed(1)
      : null;

  const matchingPurchaseOrder = userOrders.find(
    (o) =>
      o.orderStatus !== 'Cancelled' &&
      o.items.some((i) => i.productId === product.id)
  );

  const productLink =
    typeof window !== 'undefined'
      ? `${window.location.origin}/?product=${encodeURIComponent(product.id)}`
      : '';
  const whatsappLink = buildWhatsAppLink(
    whatsappNumber,
    `Assalamu Alaikum KUKA TRADERS, I have a question about:\nProduct: ${product.name} (${product.brand}, ${product.packSize})\nQuantity: ${qty}\nLink: ${productLink}`
  );

  const handleRequestPriceAlert = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!currentUser) {
      onOpenAuth();
      return;
    }
    if (!currentUser.emailVerified) {
      setAlertErr('Please verify your email address before setting a price drop alert.');
      setAlertMsg('');
      return;
    }

    const trimmedTarget = targetPriceInput.trim();
    const parsedTarget = trimmedTarget ? Math.round(Number(trimmedTarget)) : 0;
    if (trimmedTarget && (Number.isNaN(parsedTarget) || parsedTarget <= 0)) {
      setAlertErr('Please enter a valid target price in ₹.');
      setAlertMsg('');
      return;
    }
    if (hasPrice && parsedTarget > 0 && parsedTarget >= product.sellingPrice) {
      setAlertErr(`Target price should be lower than the current price (${formatINR(product.sellingPrice)}).`);
      setAlertMsg('');
      return;
    }

    setSavingAlert(true);
    setAlertErr('');
    setAlertMsg('');
    try {
      const saved = await savePriceDropAlert({
        userId: currentUser.uid,
        userEmail: currentUser.email || '',
        userName: currentUser.name || 'Customer',
        productId: product.id,
        productName: product.name,
        baselinePrice: hasPrice ? product.sellingPrice : 0,
        targetPrice: parsedTarget > 0 ? parsedTarget : 0,
      });
      setPriceAlert(saved);
      const emailHint = currentUser.email ? ` (${currentUser.email})` : '';
      setAlertMsg(
        parsedTarget > 0
          ? `Price alert saved! We will notify you${emailHint} if the price drops to ${formatINR(parsedTarget)} or below.`
          : `Price alert saved! We will notify you${emailHint} when this product drops in price.`
      );
    } catch (err) {
      setAlertErr(err instanceof Error ? err.message : 'Unable to save price alert.');
    } finally {
      setSavingAlert(false);
    }
  };

  const handleCancelPriceAlert = async () => {
    if (!currentUser) return;
    setSavingAlert(true);
    setAlertErr('');
    setAlertMsg('');
    try {
      await cancelPriceDropAlert(currentUser.uid, product.id);
      setPriceAlert(null);
      setTargetPriceInput('');
      setAlertMsg('Price drop alert removed.');
    } catch (err) {
      setAlertErr(err instanceof Error ? err.message : 'Unable to remove price alert.');
    } finally {
      setSavingAlert(false);
    }
  };

  const handleReviewSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) {
      onOpenAuth();
      return;
    }
    if (!currentUser.emailVerified) {
      setReviewErr('Please verify your email address before posting a review.');
      return;
    }
    if (comment.trim().length < 3) {
      setReviewErr('Please write at least a short review.');
      return;
    }

    setSubmittingReview(true);
    setReviewErr('');
    setReviewMsg('');
    try {
      await submitCustomerReview({
        productId: product.id,
        productName: product.name,
        userId: currentUser.uid,
        userName: currentUser.name || 'Customer',
        orderId: matchingPurchaseOrder?.id || '',
        rating,
        comment: comment.trim(),
        verifiedPurchase: Boolean(matchingPurchaseOrder),
      });
      setComment('');
      setReviewMsg('Thank you! Your review has been submitted for admin approval.');
    } catch (err) {
      setReviewErr(err instanceof Error ? err.message : 'Unable to submit review.');
    } finally {
      setSubmittingReview(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-[#0B1324]/65 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-label={product.name}
    >
      <div className="bg-white rounded-3xl border border-slate-200 max-w-4xl w-full max-h-[92vh] overflow-y-auto shadow-2xl">
        <div className="sticky top-0 z-10 bg-white/95 backdrop-blur-sm px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <div className="text-xs text-slate-500 font-semibold truncate">
            {product.categoryName} · {product.brand} · SKU {product.sku}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onToggleWishlist(product.id)}
              aria-label={isWishlisted ? 'Remove from wishlist' : 'Add to wishlist'}
              className="w-9 h-9 rounded-full border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 flex items-center justify-center transition-colors"
            >
              <Heart className={`w-4 h-4 ${isWishlisted ? 'fill-[#FF9900] text-[#FF9900]' : ''}`} />
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close product details"
              className="w-9 h-9 rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200 flex items-center justify-center transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Left Image + Clean Preview Strip (Screen 6 style) */}
          <div className="space-y-3">
            <div className="bg-[#F5F7FA] rounded-2xl overflow-hidden aspect-[4/3] border border-slate-100 flex items-center justify-center relative">
              {product.discountPercent > 0 && hasPrice && (
                <span className="absolute top-3 left-3 px-2.5 py-1 rounded-full bg-[#FF9900] text-slate-950 text-xs font-extrabold tabular-nums shadow-xs">
                  -{product.discountPercent}%
                </span>
              )}
              {!imgError && product.imageUrl ? (
                <img
                  src={product.imageUrl}
                  alt={product.name}
                  referrerPolicy="no-referrer"
                  onError={() => setImgError(true)}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center p-6 text-slate-500">
                  <Package className="w-12 h-12 text-[#FF9900] mb-2" />
                  <span className="text-sm font-medium">{product.name}</span>
                </div>
              )}
            </div>

            {!imgError && product.imageUrl && (
              <div className="grid grid-cols-4 gap-2">
                {[0, 1, 2, 3].map((thumbIdx) => (
                  <div
                    key={thumbIdx}
                    className={`aspect-square rounded-xl overflow-hidden bg-[#F5F7FA] border-2 ${
                      thumbIdx === 0 ? 'border-[#FF9900]' : 'border-slate-200 opacity-75'
                    }`}
                  >
                    <img
                      src={product.imageUrl}
                      alt={`${product.name} view ${thumbIdx + 1}`}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                    />
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Right Contiguous Purchase Module */}
          <div className="flex flex-col justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">
                {product.brand} · {product.packSize}
              </p>
              <h2 className="font-display text-2xl font-extrabold text-slate-900 leading-tight mb-1.5">
                {product.name}
              </h2>
              {product.nameUrdu && (
                <p className="text-sm text-slate-500 mb-3" dir="rtl">
                  {product.nameUrdu}
                </p>
              )}

              <div className="flex flex-wrap items-center gap-3 mb-4 text-sm">
                <div className="inline-flex items-center gap-1 text-slate-700">
                  {[1, 2, 3, 4, 5].map((s) => (
                    <Star
                      key={s}
                      className={`w-4 h-4 ${
                        s <= Math.round(Number(avgRating || 5))
                          ? 'fill-[#FF9900] text-[#FF9900]'
                          : 'text-slate-300'
                      }`}
                    />
                  ))}
                  {avgRating ? (
                    <>
                      <span className="font-bold tabular-nums ml-1">{avgRating}</span>
                      <span className="text-slate-500">({productReviews.length} reviews)</span>
                    </>
                  ) : (
                    <span className="text-xs text-slate-500 ml-1">Sopore Store Verified</span>
                  )}
                </div>
              </div>

              {hasPrice ? (
                <div className="flex flex-wrap items-center gap-2.5 mb-3">
                  <span className="font-mono text-3xl font-extrabold text-slate-900 tabular-nums">
                    {formatINR(product.sellingPrice)}
                  </span>
                  {product.originalPrice > product.sellingPrice && (
                    <span className="font-mono text-base text-slate-400 line-through tabular-nums">
                      {formatINR(product.originalPrice)}
                    </span>
                  )}
                  {product.discountPercent > 0 && (
                    <span className="px-2.5 py-0.5 rounded-full bg-[#FF9900] text-slate-950 text-xs font-extrabold tabular-nums">
                      -{product.discountPercent}%
                    </span>
                  )}
                </div>
              ) : (
                <p className="text-sm font-semibold text-amber-800 mb-3">
                  Admin Price Required — Price is pending verification by KUKA TRADERS.
                </p>
              )}

              <div className="mb-4">
                <span
                  className={`inline-flex items-center gap-1.5 text-xs font-bold ${
                    isOutOfStock
                      ? 'text-red-700'
                      : product.stockQuantity <= product.lowStockThreshold
                        ? 'text-amber-700'
                        : 'text-emerald-600'
                  }`}
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  {isOutOfStock
                    ? 'Out of Stock'
                    : product.stockQuantity <= product.lowStockThreshold
                      ? `Low Stock (${product.stockQuantity} left)`
                      : `In Stock (${product.stockQuantity} available)`}
                </span>
              </div>

              <p className="text-sm text-slate-600 leading-relaxed mb-6">{product.description}</p>
            </div>

            <div className="space-y-3 pt-4 border-t border-slate-100">
              {!isOutOfStock && hasPrice && (
                <div className="space-y-2.5">
                  <div className="flex items-center gap-3">
                    <div className="inline-flex items-center border border-slate-300 bg-[#F5F7FA] rounded-full overflow-hidden shrink-0">
                      <button
                        type="button"
                        onClick={() => setQty((q) => Math.max(1, q - 1))}
                        aria-label="Decrease quantity"
                        className="w-10 h-11 flex items-center justify-center hover:bg-slate-200 text-slate-700"
                      >
                        <Minus className="w-4 h-4" />
                      </button>
                      <span className="w-9 text-center font-mono text-sm font-bold tabular-nums text-slate-900">
                        {qty}
                      </span>
                      <button
                        type="button"
                        onClick={() => setQty((q) => Math.min(product.stockQuantity, q + 1))}
                        aria-label="Increase quantity"
                        className="w-10 h-11 flex items-center justify-center hover:bg-slate-200 text-slate-700"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        onAddToCart(product, qty);
                        onClose();
                      }}
                      className="flex-1 h-11 px-5 rounded-full bg-[#FF9900] text-slate-950 font-extrabold text-sm hover:bg-[#E68A00] transition-colors flex items-center justify-center gap-2 whitespace-nowrap shadow-xs"
                    >
                      <ShoppingCart className="w-4 h-4 shrink-0" />
                      Add to Cart
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      onBuyNow(product, qty);
                      onClose();
                    }}
                    className="w-full h-11 px-5 rounded-full bg-[#131921] text-white font-bold text-sm hover:bg-slate-800 transition-colors flex items-center justify-center gap-2 whitespace-nowrap"
                  >
                    <Zap className="w-4 h-4 text-[#FF9900] shrink-0" />
                    Buy Now · {formatINR(product.sellingPrice * qty)}
                  </button>
                </div>
              )}

              <div className="flex flex-wrap gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => onToggleWishlist(product.id)}
                  className="flex-1 min-w-[140px] h-10 px-4 rounded-full border border-slate-200 text-slate-700 text-xs font-semibold hover:bg-slate-50 flex items-center justify-center gap-2"
                >
                  <Heart
                    className={`w-4 h-4 ${isWishlisted ? 'fill-[#FF9900] text-[#FF9900]' : ''}`}
                  />
                  {isWishlisted ? 'Saved in Wishlist' : 'Save to Wishlist'}
                </button>

                <a
                  href={whatsappLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 min-w-[160px] h-10 px-4 rounded-full border border-emerald-600/30 bg-emerald-50 text-emerald-800 text-xs font-semibold hover:bg-emerald-100 flex items-center justify-center gap-2"
                >
                  <MessageCircle className="w-4 h-4" />
                  Ask About Product
                </a>
              </div>

              {/* Price Drop Alert */}
              <div className="pt-1 space-y-2">
                {priceAlert && priceAlert.status === 'active' ? (
                  <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-3 space-y-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-900">
                        <BellRing className="w-4 h-4 text-[#FF9900]" />
                        Price drop alert active
                      </span>
                      <button
                        type="button"
                        onClick={handleCancelPriceAlert}
                        disabled={savingAlert}
                        className="text-xs font-semibold text-red-700 hover:text-red-800 disabled:opacity-50"
                      >
                        Remove alert
                      </button>
                    </div>
                    <form onSubmit={handleRequestPriceAlert} className="flex items-center gap-2">
                      <input
                        type="number"
                        min={1}
                        step={1}
                        value={targetPriceInput}
                        onChange={(e) => setTargetPriceInput(e.target.value)}
                        placeholder={
                          hasPrice
                            ? `Optional target ₹ (< ${product.sellingPrice})`
                            : 'Optional target ₹'
                        }
                        aria-label="Target alert price in rupees"
                        className="flex-1 h-9 px-3 rounded-full border border-amber-300 bg-white text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#FF9900]"
                      />
                      <button
                        type="submit"
                        disabled={savingAlert}
                        className="h-9 px-3.5 rounded-full bg-[#131921] text-white text-xs font-bold hover:bg-slate-800 transition-colors disabled:opacity-60 whitespace-nowrap"
                      >
                        {savingAlert ? 'Saving...' : 'Update'}
                      </button>
                    </form>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleRequestPriceAlert()}
                    disabled={savingAlert || loadingAlert}
                    className="w-full h-10 px-4 rounded-full border border-slate-200 bg-[#F5F7FA] text-slate-800 text-xs font-semibold hover:bg-slate-100 hover:border-slate-300 transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
                  >
                    <Bell className="w-4 h-4 text-[#FF9900]" />
                    {loadingAlert
                      ? 'Checking price alert...'
                      : savingAlert
                        ? 'Saving price alert...'
                        : 'Notify me when price drops'}
                  </button>
                )}

                {alertErr && (
                  <p className="text-xs text-red-700 font-medium px-1">{alertErr}</p>
                )}
                {alertMsg && (
                  <p className="text-xs text-emerald-700 font-medium px-1">{alertMsg}</p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Reviews Section */}
        <div className="px-6 pb-8 pt-6 border-t border-slate-200 bg-[#F3F5F8] grid grid-cols-1 md:grid-cols-12 gap-8">
          <div className="md:col-span-7">
            <h3 className="font-display font-bold text-slate-900 text-lg mb-4">
              Customer Reviews ({productReviews.length})
            </h3>
            {productReviews.length === 0 ? (
              <p className="text-sm text-slate-500">
                No published reviews yet for this product. Verified buyers can submit a review after ordering.
              </p>
            ) : (
              <div className="space-y-4">
                {productReviews.map((r) => (
                  <div key={r.id} className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-xs">
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm text-slate-900">{r.userName}</span>
                        {r.verifiedPurchase && (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            Verified Purchase
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-slate-400">{formatISTDateTime(r.createdAt)}</span>
                    </div>
                    <div className="flex items-center gap-0.5 mb-2">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <Star
                          key={star}
                          className={`w-3.5 h-3.5 ${
                            star <= r.rating
                              ? 'fill-[#FF9900] text-[#FF9900]'
                              : 'text-slate-300'
                          }`}
                        />
                      ))}
                    </div>
                    <p className="text-sm text-slate-700">{r.comment}</p>
                    {r.adminReply && (
                      <div className="mt-3 pt-2.5 border-t border-slate-100 text-xs text-slate-600">
                        <span className="font-semibold text-[#131921]">KUKA TRADERS Reply: </span>
                        {r.adminReply}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="md:col-span-5">
            <h4 className="font-display font-bold text-slate-900 text-base mb-3">
              Write a Review
            </h4>
            <form onSubmit={handleReviewSubmit} className="bg-white rounded-2xl border border-slate-200/80 p-4 space-y-3 shadow-xs">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Rating</label>
                <div className="flex items-center gap-1">
                  {[1, 2, 3, 4, 5].map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setRating(s)}
                      aria-label={`Rate ${s} stars`}
                      className="p-1"
                    >
                      <Star
                        className={`w-5 h-5 ${
                          s <= rating ? 'fill-[#FF9900] text-[#FF9900]' : 'text-slate-300'
                        }`}
                      />
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Your Experience
                </label>
                <textarea
                  rows={3}
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Share quality, packaging, or delivery feedback..."
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF9900]"
                />
              </div>

              {matchingPurchaseOrder && (
                <p className="text-xs text-emerald-700 font-medium">
                  Eligible for Verified Purchase label (Order {matchingPurchaseOrder.orderNumber}).
                </p>
              )}

              {reviewErr && <p className="text-xs text-red-700">{reviewErr}</p>}
              {reviewMsg && <p className="text-xs text-emerald-700">{reviewMsg}</p>}

              <button
                type="submit"
                disabled={submittingReview}
                className="w-full py-2.5 px-4 rounded-full bg-[#131921] text-white text-xs font-bold hover:bg-slate-800 transition-colors disabled:opacity-60"
              >
                {currentUser
                  ? submittingReview
                    ? 'Submitting...'
                    : 'Submit Review'
                  : 'Sign In to Review'}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};
