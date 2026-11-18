import React, { useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import {
  AlertCircle,
  Banknote,
  CheckCircle2,
  CreditCard,
  MapPin,
  MessageCircle,
  QrCode,
  ShieldCheck,
  Store,
  Truck,
  X,
} from 'lucide-react';
import type {
  CartItem,
  Coupon,
  PaymentConfig,
  PaymentMethod,
  Product,
  StoreSettings,
  UserProfile,
} from '../types';
import { placeOrderTransaction } from '../services/firestoreStore';
import { buildWhatsAppLink, formatINR } from '../utils/format';

interface CheckoutModalProps {
  isOpen: boolean;
  cart: CartItem[];
  products: Product[];
  coupons: Coupon[];
  appliedCouponCode: string;
  settings: StoreSettings;
  paymentConfig: PaymentConfig;
  user: { uid: string; email: string; displayName: string; emailVerified: boolean } | null;
  profile: UserProfile | null;
  onClose: () => void;
  onOpenAuth: () => void;
  onOrderSuccess: (orderInfo: { orderId: string; orderNumber: string; totalAmount: number }) => void;
}

interface GatewayStatus {
  zapUpiConfigured: boolean;
  zapUpiMerchantConfigured: boolean;
  otherGatewayConfigured: boolean;
  missingVars: string[];
}

export const CheckoutModal: React.FC<CheckoutModalProps> = ({
  isOpen,
  cart,
  products,
  coupons,
  appliedCouponCode,
  settings,
  paymentConfig,
  user,
  profile,
  onClose,
  onOpenAuth,
  onOrderSuccess,
}) => {
  const [fulfillmentMode, setFulfillmentMode] = useState<'delivery' | 'pickup'>('delivery');
  const [customerName, setCustomerName] = useState(profile?.name || user?.displayName || '');
  const [customerPhone, setCustomerPhone] = useState(profile?.phone || '');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [locality, setLocality] = useState('');
  const [landmark, setLandmark] = useState('');
  const [pinCode, setPinCode] = useState(settings.pinCode || '193201');
  const [deliveryInstructions, setDeliveryInstructions] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(
    paymentConfig.codEnabled ? 'COD' : paymentConfig.upiEnabled ? 'UPI' : 'GATEWAY'
  );
  const [upiReference, setUpiReference] = useState('');
  const [gatewayStatus, setGatewayStatus] = useState<GatewayStatus | null>(null);
  const [placing, setPlacing] = useState(false);
  const [error, setError] = useState('');

  const zapConfigured = Boolean(gatewayStatus?.zapUpiConfigured);
  const gatewayConfigured = Boolean(gatewayStatus?.otherGatewayConfigured);
  const isCodAvailable = paymentConfig.codEnabled;
  const isUpiOrderable =
    paymentConfig.upiEnabled &&
    (zapConfigured || paymentConfig.upiVerificationMode === 'manual_utr');
  const isNetBankingOrderable =
    paymentConfig.netBankingEnabled &&
    (!paymentConfig.netBankingRequireGateway || gatewayConfigured);
  const hasAnyOrderableMethod = isCodAvailable || isUpiOrderable || isNetBankingOrderable;

  useEffect(() => {
    if (profile) {
      setCustomerName((prev) => prev || profile.name);
      setCustomerPhone((prev) => prev || profile.phone);
    } else if (user) {
      setCustomerName((prev) => prev || user.displayName);
    }
  }, [profile, user]);

  useEffect(() => {
    const isCurrentOrderable =
      (paymentMethod === 'COD' && isCodAvailable) ||
      (paymentMethod === 'UPI' && isUpiOrderable) ||
      (paymentMethod === 'GATEWAY' && isNetBankingOrderable);
    if (!isCurrentOrderable) {
      if (isCodAvailable) setPaymentMethod('COD');
      else if (isUpiOrderable) setPaymentMethod('UPI');
      else if (isNetBankingOrderable) setPaymentMethod('GATEWAY');
    }
  }, [isOpen, paymentMethod, isCodAvailable, isUpiOrderable, isNetBankingOrderable]);

  useEffect(() => {
    if (!isOpen) return;
    fetch('/api/payments/status')
      .then((r) => r.json())
      .then((d: GatewayStatus) => setGatewayStatus(d))
      .catch(() => setGatewayStatus(null));
  }, [isOpen]);

  if (!isOpen) return null;

  const productMap: Record<string, Product> = {};
  for (const p of products) productMap[p.id] = p;

  const resolvedItems = cart
    .map((ci) => ({ ci, product: productMap[ci.productId] }))
    .filter((entry): entry is { ci: CartItem; product: Product } => Boolean(entry.product));

  const subtotal = resolvedItems.reduce(
    (sum, { ci, product }) => sum + product.sellingPrice * ci.quantity,
    0
  );

  const selectedZone = settings.deliveryZones.find(
    (z) => z.name.toLowerCase() === locality.trim().toLowerCase()
  );
  const deliveryCharge =
    fulfillmentMode === 'pickup'
      ? 0
      : subtotal >= settings.freeDeliveryThreshold
        ? 0
        : selectedZone
          ? selectedZone.charge
          : settings.defaultDeliveryCharge;

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

  const totalAmount = Math.max(0, subtotal + deliveryCharge - discountAmount);

  const activeUpiId = (
    paymentConfig.merchantUpiId ||
    settings.merchantUpiId ||
    'kukatraders@upi'
  ).trim();
  const activeUpiName = (
    paymentConfig.merchantUpiName ||
    settings.merchantUpiName ||
    'KUKA TRADERS'
  ).trim();

  const upiUri = `upi://pay?pa=${encodeURIComponent(activeUpiId)}&pn=${encodeURIComponent(
    activeUpiName
  )}&am=${totalAmount.toFixed(2)}&cu=INR&tn=${encodeURIComponent(
    'KUKA TRADERS Sopore Grocery Order'
  )}`;

  const effectiveLocality =
    fulfillmentMode === 'pickup'
      ? 'Store Pickup (Main Bazar Sopore)'
      : locality.trim() || 'Custom Delivery Location';
  const effectivePinCode =
    fulfillmentMode === 'pickup' ? settings.pinCode || '193201' : pinCode.trim();
  const effectiveAddress =
    fulfillmentMode === 'pickup'
      ? 'Self Pickup at KUKA TRADERS, Main Bazar, near Jamia Masjid, Sopore'
      : deliveryAddress.trim();

  const whatsappCheckoutLink = buildWhatsAppLink(
    settings.whatsappNumber,
    `Assalamu Alaikum KUKA TRADERS, I want to inquire about placing an order:\n${resolvedItems
      .map((r) => `- ${r.product.name} (${r.product.packSize}) × ${r.ci.quantity}`)
      .join('\n')}\nEstimated Total: ${formatINR(totalAmount)}\nMethod: ${
      fulfillmentMode === 'pickup' ? 'Store Pickup' : `Delivery to ${effectiveLocality}, PIN: ${effectivePinCode}`
    }`
  );

  const handleSelectSavedAddress = (addrId: string) => {
    const found = profile?.savedAddresses.find((a) => a.id === addrId);
    if (!found) return;
    setFulfillmentMode('delivery');
    setCustomerName(found.recipientName);
    setCustomerPhone(found.phone);
    setDeliveryAddress(found.addressLine);
    setLocality(found.locality);
    setLandmark(found.landmark);
    setPinCode(found.pinCode);
  };

  const handlePlaceOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!user) {
      onOpenAuth();
      return;
    }
    if (!user.emailVerified) {
      setError('Please verify your email address before placing an order.');
      return;
    }
    const cleanPhone = customerPhone.replace(/[^0-9+]/g, '');
    if (cleanPhone.length < 10) {
      setError('Please enter a valid 10-digit Indian mobile number (+91).');
      return;
    }
    if (fulfillmentMode === 'delivery') {
      if (effectiveAddress.length < 4) {
        setError('Please enter your complete house, street, or village delivery address.');
        return;
      }
      if (!locality.trim()) {
        setError('Please enter your town, village, area, or city for delivery.');
        return;
      }
      if (!/^[0-9]{6}$/.test(effectivePinCode)) {
        setError('Please enter a valid 6-digit Indian PIN code (e.g. 193201).');
        return;
      }
    }
    if (!hasAnyOrderableMethod) {
      setError(
        'No online or offline payment methods are currently active. Please contact KUKA TRADERS or try again later.'
      );
      return;
    }
    if (paymentMethod === 'UPI') {
      if (!paymentConfig.upiEnabled) {
        setError('UPI payment is currently disabled by store settings.');
        return;
      }
      if (!zapConfigured && paymentConfig.upiVerificationMode === 'require_zap_upi') {
        setError(
          'UPI checkout is disabled until Zap UPI integration is completed by the store owner. Please select Cash on Delivery.'
        );
        return;
      }
      if (!zapConfigured && paymentConfig.upiVerificationMode === 'manual_utr' && upiReference.trim().length < 6) {
        setError('Please enter your UPI Transaction / UTR Reference before placing a UPI order.');
        return;
      }
    }
    if (paymentMethod === 'COD' && !isCodAvailable) {
      setError('Cash on Delivery is currently disabled by store settings.');
      return;
    }
    if (paymentMethod === 'GATEWAY' && !isNetBankingOrderable) {
      setError('Net Banking / Payment Gateway is currently disabled until configured by store admin.');
      return;
    }

    setPlacing(true);
    try {
      const orderInfo = await placeOrderTransaction({
        userId: user.uid,
        customerName: customerName.trim(),
        customerEmail: user.email,
        customerPhone: cleanPhone.startsWith('+91') ? cleanPhone : `+91${cleanPhone.slice(-10)}`,
        deliveryAddress: effectiveAddress,
        locality: effectiveLocality,
        landmark: fulfillmentMode === 'pickup' ? 'Near Jamia Masjid, Sopore' : landmark.trim(),
        pinCode: effectivePinCode,
        deliveryInstructions: deliveryInstructions.trim(),
        cartItems: resolvedItems.map(({ ci }) => ({
          productId: ci.productId,
          quantity: ci.quantity,
        })),
        deliveryCharge,
        discountAmount,
        couponCode: activeCoupon?.code || '',
        paymentMethod,
        paymentReference:
          paymentMethod === 'UPI' || paymentMethod === 'GATEWAY' ? upiReference.trim() : '',
      });

      onOrderSuccess(orderInfo);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to place order.');
    } finally {
      setPlacing(false);
    }
  };

  const shippingComplete =
    fulfillmentMode === 'pickup' ||
    (customerPhone.replace(/[^0-9+]/g, '').length >= 10 &&
      deliveryAddress.trim().length >= 4 &&
      locality.trim().length > 0 &&
      /^[0-9]{6}$/.test(pinCode.trim()));

  return (
    <div
      className="fixed inset-0 z-50 bg-[#0B1324]/65 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-label="Checkout"
    >
      <div className="bg-white rounded-3xl border border-slate-200 max-w-4xl w-full max-h-[92vh] overflow-y-auto shadow-2xl">
        <div className="sticky top-0 z-10 bg-white px-6 py-4 border-b border-slate-200">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-display text-xl font-extrabold text-slate-900">Checkout</h2>
              <p className="text-xs text-slate-500">
                Main Bazar, Sopore · Deliver Anywhere You Choose or Store Pickup
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close checkout"
              className="w-9 h-9 rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200 flex items-center justify-center transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Screen 8 Horizontal 3-Step Indicator */}
          <div className="mt-4 grid grid-cols-3 items-center max-w-md mx-auto text-center">
            <div className="flex flex-col items-center gap-1">
              <div className="w-7 h-7 rounded-full bg-[#FF9900] text-slate-950 text-xs font-extrabold flex items-center justify-center shadow-xs">
                1
              </div>
              <span className="text-[11px] font-bold text-slate-900">Shipping</span>
            </div>
            <div className="flex flex-col items-center gap-1 relative">
              <div
                className={`w-7 h-7 rounded-full text-xs font-extrabold flex items-center justify-center transition-colors ${
                  shippingComplete
                    ? 'bg-[#FF9900] text-slate-950 shadow-xs'
                    : 'bg-slate-200 text-slate-600'
                }`}
              >
                2
              </div>
              <span className={`text-[11px] font-bold ${shippingComplete ? 'text-slate-900' : 'text-slate-500'}`}>
                Payment
              </span>
            </div>
            <div className="flex flex-col items-center gap-1">
              <div
                className={`w-7 h-7 rounded-full text-xs font-extrabold flex items-center justify-center transition-colors ${
                  shippingComplete && paymentMethod
                    ? 'bg-[#131921] text-white shadow-xs'
                    : 'bg-slate-200 text-slate-600'
                }`}
              >
                3
              </div>
              <span className="text-[11px] font-bold text-slate-500">Review</span>
            </div>
          </div>
        </div>

        <form onSubmit={handlePlaceOrder} className="p-6 grid grid-cols-1 lg:grid-cols-12 gap-8">
          <div className="lg:col-span-7 space-y-5">
            {!user && (
              <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-between gap-3">
                <p className="text-xs text-slate-800">
                  Please sign in with Google or verified email to complete your order.
                </p>
                <button
                  type="button"
                  onClick={onOpenAuth}
                  className="px-4 py-2 rounded-full bg-[#FF9900] text-slate-950 text-xs font-bold whitespace-nowrap"
                >
                  Sign In
                </button>
              </div>
            )}

            {/* Fulfillment Choice */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-2">
                Shipping / Delivery Preference *
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => setFulfillmentMode('delivery')}
                  className={`p-3.5 rounded-2xl border text-left transition-all flex items-start gap-2.5 ${
                    fulfillmentMode === 'delivery'
                      ? 'border-[#FF9900] bg-amber-50/50 ring-1 ring-[#FF9900]'
                      : 'border-slate-200 bg-white hover:border-slate-300'
                  }`}
                >
                  <Truck className={`w-4 h-4 mt-0.5 shrink-0 ${fulfillmentMode === 'delivery' ? 'text-[#E68A00]' : 'text-slate-500'}`} />
                  <div>
                    <p className="text-xs sm:text-sm font-bold text-slate-900">Deliver to My Address</p>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Enter any area, village, town, or city
                    </p>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setFulfillmentMode('pickup')}
                  className={`p-3.5 rounded-2xl border text-left transition-all flex items-start gap-2.5 ${
                    fulfillmentMode === 'pickup'
                      ? 'border-[#FF9900] bg-amber-50/50 ring-1 ring-[#FF9900]'
                      : 'border-slate-200 bg-white hover:border-slate-300'
                  }`}
                >
                  <Store className={`w-4 h-4 mt-0.5 shrink-0 ${fulfillmentMode === 'pickup' ? 'text-[#E68A00]' : 'text-slate-500'}`} />
                  <div>
                    <p className="text-xs sm:text-sm font-bold text-slate-900">Store Pickup (FREE)</p>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Main Bazar, near Jamia Masjid, Sopore
                    </p>
                  </div>
                </button>
              </div>
            </div>

            {fulfillmentMode === 'delivery' && profile && profile.savedAddresses.length > 0 && (
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Use Saved Address
                </label>
                <div className="flex flex-wrap gap-2">
                  {profile.savedAddresses.map((addr) => (
                    <button
                      key={addr.id}
                      type="button"
                      onClick={() => handleSelectSavedAddress(addr.id)}
                      className="px-3.5 py-1.5 rounded-full border border-slate-200 bg-[#F5F7FA] text-xs font-semibold text-slate-700 hover:border-[#FF9900] hover:text-slate-950"
                    >
                      {addr.label} ({addr.locality})
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Full Name *
                </label>
                <input
                  type="text"
                  required
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="Customer full name"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF9900]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Mobile Number (+91) *
                </label>
                <div className="flex">
                  <span className="inline-flex items-center px-3 rounded-l-xl border border-r-0 border-slate-300 bg-[#F5F7FA] text-xs font-mono text-slate-600">
                    +91
                  </span>
                  <input
                    type="tel"
                    required
                    value={customerPhone.replace(/^\+91/, '')}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    placeholder="7006XXXXXX"
                    className="w-full px-3.5 py-2.5 rounded-r-xl border border-slate-300 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#FF9900]"
                  />
                </div>
              </div>
            </div>

            {fulfillmentMode === 'delivery' ? (
              <>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    House / Mohalla / Street / Village Address *
                  </label>
                  <input
                    type="text"
                    required
                    value={deliveryAddress}
                    onChange={(e) => setDeliveryAddress(e.target.value)}
                    placeholder="Enter full house number, street, mohalla, or village"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF9900]"
                  />
                </div>

                <div className="space-y-2">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Area / Town / Village *
                      </label>
                      <input
                        type="text"
                        required
                        value={locality}
                        onChange={(e) => setLocality(e.target.value)}
                        placeholder="e.g. Baramulla, Pattan, Main Bazar..."
                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#FF9900]"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Landmark</label>
                      <input
                        type="text"
                        value={landmark}
                        onChange={(e) => setLandmark(e.target.value)}
                        placeholder="Nearby masjid, chowk..."
                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF9900]"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">PIN Code *</label>
                      <input
                        type="text"
                        required
                        maxLength={6}
                        value={pinCode}
                        onChange={(e) => setPinCode(e.target.value.replace(/[^0-9]/g, ''))}
                        placeholder="193201"
                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#FF9900]"
                      />
                    </div>
                  </div>

                  {settings.deliveryZones.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5 pt-1">
                      <span className="text-[11px] text-slate-500 flex items-center gap-1 mr-1">
                        <MapPin className="w-3 h-3 text-[#FF9900]" />
                        Quick local areas:
                      </span>
                      {settings.deliveryZones.map((z) => {
                        const active = locality.trim().toLowerCase() === z.name.toLowerCase();
                        return (
                          <button
                            key={z.name}
                            type="button"
                            onClick={() => {
                              setLocality(z.name);
                              if (z.pinCode) setPinCode(z.pinCode);
                            }}
                            className={`px-2.5 py-1 rounded-full border text-[11px] font-semibold transition-colors ${
                              active
                                ? 'border-[#FF9900] bg-amber-50 text-slate-900'
                                : 'border-slate-200 bg-[#F5F7FA] text-slate-600 hover:border-slate-300'
                            }`}
                          >
                            {z.name} ({z.charge === 0 ? 'Free' : formatINR(z.charge)})
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="p-4 rounded-2xl bg-[#F5F7FA] border border-slate-200 text-xs text-slate-700 space-y-1">
                <p className="font-bold text-slate-900">
                  Pickup Counter: KUKA TRADERS, Main Bazar, near Jamia Masjid, Sopore (PIN 193201)
                </p>
                <p>
                  Store Hours: {settings.openingHours} – {settings.closingHours} IST · Zero delivery fee.
                </p>
              </div>
            )}

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                {fulfillmentMode === 'pickup' ? 'Pickup Time / Note (Optional)' : 'Additional Delivery Instructions'}
              </label>
              <input
                type="text"
                value={deliveryInstructions}
                onChange={(e) => setDeliveryInstructions(e.target.value)}
                placeholder={
                  fulfillmentMode === 'pickup'
                    ? 'e.g. Will pick up at 5:30 PM today'
                    : 'Call before arriving, drop at gate, etc.'
                }
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF9900]"
              />
            </div>

            {/* Payment Selection */}
            <div className="pt-2">
              <h3 className="font-display font-bold text-slate-900 text-sm mb-3">
                Payment Method
              </h3>
              {!paymentConfig.codEnabled &&
              !paymentConfig.upiEnabled &&
              !paymentConfig.netBankingEnabled ? (
                <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-xs text-amber-900 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-amber-700" />
                  <span>
                    All checkout payment methods are currently disabled by the store administrator. Please contact KUKA TRADERS on WhatsApp for assistance.
                  </span>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {!hasAnyOrderableMethod && (
                    <div className="p-3 rounded-2xl bg-amber-50 border border-amber-200 text-xs text-amber-900 flex items-start gap-2">
                      <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-amber-700" />
                      <span>
                        No payment method is currently ready for instant checkout. Enabled online options require payment gateway setup by the store owner.
                      </span>
                    </div>
                  )}
                  {paymentConfig.codEnabled && (
                    <label
                      className={`flex items-start gap-3 p-3.5 rounded-2xl border cursor-pointer transition-colors ${
                        paymentMethod === 'COD'
                          ? 'border-[#FF9900] bg-amber-50/40'
                          : 'border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <input
                        type="radio"
                        name="paymentMethod"
                        checked={paymentMethod === 'COD'}
                        onChange={() => setPaymentMethod('COD')}
                        className="mt-1 accent-[#FF9900]"
                      />
                      <div className="flex-1">
                        <div className="flex items-center gap-2 font-bold text-sm text-slate-900">
                          <Banknote className="w-4 h-4 text-emerald-600" />
                          <span>{paymentConfig.codLabel || 'Cash on Delivery (COD)'}</span>
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {paymentConfig.codInstructions ||
                            'Pay in cash or UPI upon delivery at your address.'}
                        </p>
                      </div>
                    </label>
                  )}

                  {paymentConfig.upiEnabled && (
                    <label
                      className={`flex items-start gap-3 p-3.5 rounded-2xl border transition-colors ${
                        !isUpiOrderable
                          ? 'border-slate-200 bg-slate-50 opacity-65 cursor-not-allowed'
                          : paymentMethod === 'UPI'
                            ? 'border-[#FF9900] bg-amber-50/40 cursor-pointer'
                            : 'border-slate-200 hover:border-slate-300 cursor-pointer'
                      }`}
                    >
                      <input
                        type="radio"
                        name="paymentMethod"
                        disabled={!isUpiOrderable}
                        checked={isUpiOrderable && paymentMethod === 'UPI'}
                        onChange={() => setPaymentMethod('UPI')}
                        className="mt-1 accent-[#FF9900]"
                      />
                      <div className="flex-1">
                        <div className="flex flex-wrap items-center gap-2 font-bold text-sm text-slate-900">
                          <QrCode className="w-4 h-4 text-[#FF9900]" />
                          <span>{paymentConfig.upiLabel || 'UPI Payment (Zap UPI)'}</span>
                          {!isUpiOrderable && (
                            <span className="text-[11px] font-semibold text-amber-800 bg-amber-100 px-2 py-0.5 rounded-full">
                              Unavailable until Zap UPI integration is connected
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {!isUpiOrderable
                            ? 'Online UPI checkout is currently disabled until Zap UPI is configured by the store owner. Please use Cash on Delivery.'
                            : paymentConfig.upiInstructions ||
                              `Pay to ${activeUpiId}. Verified on server or by store admin.`}
                        </p>
                      </div>
                    </label>
                  )}

                  {paymentConfig.netBankingEnabled && (
                    <label
                      className={`flex items-start gap-3 p-3.5 rounded-2xl border transition-colors ${
                        !isNetBankingOrderable
                          ? 'border-slate-200 bg-slate-50 opacity-65 cursor-not-allowed'
                          : paymentMethod === 'GATEWAY'
                            ? 'border-[#FF9900] bg-amber-50/40 cursor-pointer'
                            : 'border-slate-200 hover:border-slate-300 cursor-pointer'
                      }`}
                    >
                      <input
                        type="radio"
                        name="paymentMethod"
                        disabled={!isNetBankingOrderable}
                        checked={isNetBankingOrderable && paymentMethod === 'GATEWAY'}
                        onChange={() => setPaymentMethod('GATEWAY')}
                        className="mt-1 accent-[#FF9900]"
                      />
                      <div className="flex-1">
                        <div className="flex flex-wrap items-center gap-2 font-bold text-sm text-slate-900">
                          <CreditCard className="w-4 h-4 text-slate-700" />
                          <span>{paymentConfig.netBankingLabel || 'Net Banking / Card Gateway'}</span>
                          {!isNetBankingOrderable && (
                            <span className="text-[11px] font-semibold text-amber-800 bg-amber-100 px-2 py-0.5 rounded-full">
                              Gateway pending configuration
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {!isNetBankingOrderable
                            ? 'Disabled until payment gateway credentials are configured in Admin Payment Configuration.'
                            : paymentConfig.netBankingInstructions ||
                              'Pay securely via configured gateway.'}
                        </p>
                      </div>
                    </label>
                  )}
                </div>
              )}

              {isUpiOrderable && paymentMethod === 'UPI' && (
                <div className="mt-4 p-4 rounded-2xl bg-[#F5F7FA] border border-slate-200 space-y-3">
                  <div className="flex flex-col sm:flex-row items-center gap-4">
                    <div className="bg-white p-2.5 rounded-xl border border-slate-200 shrink-0">
                      <QRCodeSVG value={upiUri} size={112} />
                    </div>
                    <div className="text-xs text-slate-700 space-y-1.5">
                      <p className="font-semibold text-slate-900">
                        Merchant UPI ID: <span className="font-mono">{activeUpiId}</span>
                      </p>
                      <p>
                        Payable Amount:{' '}
                        <span className="font-mono font-bold text-slate-900">{formatINR(totalAmount)}</span>
                      </p>
                      <a
                        href={upiUri}
                        className="inline-block text-[#E68A00] font-bold underline"
                      >
                        Open UPI App Intent
                      </a>
                      <p className="text-[11px] text-slate-500">
                        {zapConfigured
                          ? 'Zap UPI server verification is active.'
                          : 'Enter your 12-digit UTR below after paying; order remains Pending until verified by Admin.'}
                      </p>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      UPI Transaction / UTR Reference {zapConfigured ? '(Optional)' : '(Required)'}
                    </label>
                    <input
                      type="text"
                      required={!zapConfigured && paymentConfig.upiVerificationMode === 'manual_utr'}
                      value={upiReference}
                      onChange={(e) => setUpiReference(e.target.value)}
                      placeholder="12-digit UTR number for verification"
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs font-mono focus:outline-none focus:ring-2 focus:ring-[#FF9900]"
                    />
                  </div>
                </div>
              )}

              {isNetBankingOrderable && paymentMethod === 'GATEWAY' && (
                <div className="mt-4 p-4 rounded-2xl bg-[#F5F7FA] border border-slate-200 space-y-2">
                  <label className="block text-xs font-bold text-slate-700">
                    Gateway Transaction / Payment Reference (Optional)
                  </label>
                  <input
                    type="text"
                    value={upiReference}
                    onChange={(e) => setUpiReference(e.target.value)}
                    placeholder="Enter transaction / payment ID if already paid"
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs font-mono focus:outline-none focus:ring-2 focus:ring-[#FF9900]"
                  />
                </div>
              )}
            </div>
          </div>

          {/* Right Order Summary */}
          <div className="lg:col-span-5">
            <div className="bg-[#F3F5F8] rounded-2xl border border-slate-200 p-5 space-y-4 sticky top-28">
              <h3 className="font-display font-extrabold text-slate-900">Order Summary</h3>
              <div className="max-h-60 overflow-y-auto space-y-2.5 pr-1">
                {resolvedItems.map(({ ci, product }) => (
                  <div key={product.id} className="flex justify-between gap-2 text-xs">
                    <span className="text-slate-700">
                      {product.name} ({product.packSize}) × {ci.quantity}
                    </span>
                    <span className="font-mono font-bold text-slate-900 tabular-nums shrink-0">
                      {formatINR(product.sellingPrice * ci.quantity)}
                    </span>
                  </div>
                ))}
              </div>

              <div className="pt-3 border-t border-slate-200 space-y-1.5 text-sm">
                <div className="flex justify-between text-slate-600">
                  <span>Subtotal</span>
                  <span className="font-mono tabular-nums">{formatINR(subtotal)}</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>{fulfillmentMode === 'pickup' ? 'Store Pickup' : `Delivery (${effectiveLocality})`}</span>
                  <span className={`font-mono tabular-nums font-bold ${deliveryCharge === 0 ? 'text-emerald-600' : ''}`}>
                    {deliveryCharge === 0 ? 'FREE' : formatINR(deliveryCharge)}
                  </span>
                </div>
                {discountAmount > 0 && (
                  <div className="flex justify-between text-emerald-700 font-semibold">
                    <span>Coupon ({activeCoupon?.code})</span>
                    <span className="font-mono tabular-nums">−{formatINR(discountAmount)}</span>
                  </div>
                )}
                <div className="flex justify-between font-extrabold text-base text-slate-900 pt-2 border-t border-slate-200">
                  <span>Final Payable</span>
                  <span className="font-mono tabular-nums">{formatINR(totalAmount)}</span>
                </div>
              </div>

              {error && (
                <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-800 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={placing || resolvedItems.length === 0 || !hasAnyOrderableMethod}
                className="w-full py-3.5 px-5 rounded-full bg-[#FF9900] text-slate-950 font-extrabold text-sm hover:bg-[#E68A00] transition-colors flex items-center justify-center gap-2 disabled:opacity-50 shadow-xs"
              >
                <ShieldCheck className="w-4 h-4" />
                {placing ? 'Placing Order...' : `Place Order · ${formatINR(totalAmount)}`}
              </button>

              <a
                href={whatsappCheckoutLink}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full py-2.5 px-4 rounded-full border border-emerald-600/30 bg-white text-emerald-800 font-bold text-xs hover:bg-emerald-50 transition-colors flex items-center justify-center gap-2"
              >
                <MessageCircle className="w-4 h-4" />
                WhatsApp Checkout Inquiry
              </a>

              <div className="flex items-center gap-2 text-[11px] text-slate-500">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span>Live price &amp; stock re-validated atomically before saving order.</span>
              </div>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
