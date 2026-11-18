import React, { useState } from 'react';
import { Heart, MessageCircle, Package, Plus, ShoppingCart, Zap } from 'lucide-react';
import type { AppLanguage, Product } from '../types';
import { buildWhatsAppLink, formatINR } from '../utils/format';

interface ProductCardProps {
  product: Product;
  lang: AppLanguage;
  whatsappNumber: string;
  isWishlisted: boolean;
  cartQuantity: number;
  onToggleWishlist: (productId: string) => void;
  onAddToCart: (product: Product) => void;
  onBuyNow: (product: Product) => void;
  onOpenDetail: (product: Product) => void;
}

export const ProductCard: React.FC<ProductCardProps> = ({
  product,
  lang,
  whatsappNumber,
  isWishlisted,
  cartQuantity,
  onToggleWishlist,
  onAddToCart,
  onBuyNow,
  onOpenDetail,
}) => {
  const [imgError, setImgError] = useState(false);

  const isOutOfStock = product.stockQuantity <= 0;
  const isLowStock = product.stockQuantity > 0 && product.stockQuantity <= product.lowStockThreshold;
  const hasApprovedPrice = product.priceStatus === 'approved' && product.sellingPrice > 0;
  const hasDiscount =
    hasApprovedPrice &&
    product.originalPrice > product.sellingPrice &&
    product.discountPercent > 0;

  const stockLabel = isOutOfStock
    ? lang === 'ur'
      ? 'اسٹاک ختم'
      : 'Out of Stock'
    : isLowStock
      ? lang === 'ur'
        ? 'کم اسٹاک'
        : 'Low Stock'
      : lang === 'ur'
        ? 'دستیاب'
        : 'In Stock';

  const stockColorClass = isOutOfStock
    ? 'text-red-700'
    : isLowStock
      ? 'text-amber-700'
      : 'text-emerald-700';

  const productDisplayName = lang === 'ur' && product.nameUrdu ? product.nameUrdu : product.name;
  const whatsappHref = buildWhatsAppLink(
    whatsappNumber,
    `Assalamu Alaikum KUKA TRADERS, I would like to inquire about "${product.name}" (${product.brand}, ${product.packSize}).`
  );

  return (
    <article className="group bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden flex flex-col justify-between transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
      <div>
        {/* Product Image Area */}
        <div className="relative aspect-[4/3] bg-[#F5F7FA] overflow-hidden">
          <button
            type="button"
            onClick={() => onOpenDetail(product)}
            className="w-full h-full block text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF9900]"
            aria-label={`View ${product.name}`}
          >
            {!imgError && product.imageUrl ? (
              <img
                src={product.imageUrl}
                alt={`${product.name} - ${product.brand} ${product.packSize}`}
                loading="lazy"
                referrerPolicy="no-referrer"
                onError={() => setImgError(true)}
                className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
              />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center p-4 bg-[#F5F7FA] text-slate-500">
                <Package className="w-8 h-8 text-[#FF9900] mb-1.5" />
                <span className="text-xs font-medium text-center line-clamp-2">{product.name}</span>
              </div>
            )}
          </button>

          <button
            type="button"
            onClick={() => onToggleWishlist(product.id)}
            aria-label={isWishlisted ? 'Remove from wishlist' : 'Add to wishlist'}
            className="absolute top-2.5 right-2.5 w-8 h-8 rounded-full bg-white/95 border border-slate-200/80 shadow-xs flex items-center justify-center text-slate-500 hover:text-[#FF9900] transition-colors"
          >
            <Heart
              className={`w-4 h-4 ${isWishlisted ? 'fill-[#FF9900] text-[#FF9900]' : ''}`}
            />
          </button>
        </div>

        {/* Metadata & Title */}
        <div className="p-3.5 sm:p-4">
          <div className="flex items-center justify-between gap-2 text-[11px] text-slate-500 mb-1">
            <span className="truncate font-medium uppercase tracking-wide">
              {product.brand} · {product.packSize}
            </span>
            <span className={`font-semibold whitespace-nowrap shrink-0 ${stockColorClass}`}>
              {stockLabel}
            </span>
          </div>

          <button
            type="button"
            onClick={() => onOpenDetail(product)}
            className="text-left w-full focus-visible:outline-none"
          >
            <h3 className="font-display font-bold text-slate-900 text-sm sm:text-base leading-snug line-clamp-2 hover:text-[#D97706] transition-colors">
              {productDisplayName}
            </h3>
          </button>
        </div>
      </div>

      {/* Pricing & CTA (Matches Screens 3, 5 & 6) */}
      <div className="px-3.5 pb-3.5 sm:px-4 sm:pb-4 pt-1">
        {hasApprovedPrice ? (
          <div className="flex items-center flex-wrap gap-2 mb-3">
            <span className="font-mono font-extrabold text-base sm:text-lg text-slate-950 tabular-nums">
              {formatINR(product.sellingPrice)}
            </span>
            {hasDiscount && (
              <>
                <span className="font-mono text-xs text-slate-400 line-through tabular-nums">
                  {formatINR(product.originalPrice)}
                </span>
                <span className="px-2 py-0.5 rounded-full bg-[#FF9900] text-slate-950 text-[11px] font-extrabold tabular-nums">
                  -{product.discountPercent}%
                </span>
              </>
            )}
          </div>
        ) : (
          <div className="mb-3">
            <span className="text-xs font-semibold text-amber-800">Admin Price Required</span>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {!isOutOfStock && hasApprovedPrice ? (
            <>
              <button
                type="button"
                onClick={() => onAddToCart(product)}
                className="inline-flex items-center justify-center gap-1.5 px-2.5 py-2 rounded-full bg-[#FF9900] text-slate-950 text-xs font-bold hover:bg-[#E68A00] active:scale-[0.99] transition-all whitespace-nowrap min-h-[38px]"
              >
                {cartQuantity > 0 ? (
                  <>
                    <Plus className="w-3.5 h-3.5 shrink-0" />
                    <span>In Cart ({cartQuantity})</span>
                  </>
                ) : (
                  <>
                    <ShoppingCart className="w-3.5 h-3.5 shrink-0" />
                    <span>{lang === 'ur' ? 'کارٹ میں' : 'Add to Cart'}</span>
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={() => onBuyNow(product)}
                className="inline-flex items-center justify-center gap-1.5 px-2.5 py-2 rounded-full bg-[#131921] text-white text-xs font-bold hover:bg-slate-800 active:scale-[0.99] transition-all whitespace-nowrap min-h-[38px]"
              >
                <Zap className="w-3.5 h-3.5 shrink-0 text-[#FF9900]" />
                <span>{lang === 'ur' ? 'ابھی خریدیں' : 'Buy Now'}</span>
              </button>
            </>
          ) : (
            <a
              href={whatsappHref}
              target="_blank"
              rel="noopener noreferrer"
              className="sm:col-span-2 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-full border border-slate-300 text-slate-700 text-xs sm:text-sm font-semibold hover:bg-slate-50 transition-colors whitespace-nowrap min-h-[38px]"
            >
              <MessageCircle className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{isOutOfStock ? 'Notify / Ask' : 'Ask Price'}</span>
            </a>
          )}
        </div>
      </div>
    </article>
  );
};
