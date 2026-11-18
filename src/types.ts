export type UserRole = 'customer' | 'admin';
export type AccountStatus = 'active' | 'suspended';
export type AppLanguage = 'en' | 'ur';

export interface SavedAddress {
  id: string;
  label: string;
  recipientName: string;
  phone: string;
  addressLine: string;
  locality: string;
  landmark: string;
  pinCode: string;
}

export interface UserProfile {
  uid: string;
  name: string;
  email: string;
  phone: string;
  role: UserRole;
  status: AccountStatus;
  preferredLang: AppLanguage;
  savedAddresses: SavedAddress[];
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface Category {
  id: string;
  name: string;
  nameUrdu: string;
  slug: string;
  description: string;
  imageUrl: string;
  sortOrder: number;
  isActive: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export type PriceStatus = 'approved' | 'admin_price_required';

export interface Product {
  id: string;
  name: string;
  nameUrdu: string;
  description: string;
  categoryId: string;
  categoryName: string;
  brand: string;
  sku: string;
  barcode: string;
  imageUrl: string;
  purchaseCost: number;
  sellingPrice: number;
  originalPrice: number;
  packSize: string;
  unit: string;
  stockQuantity: number;
  lowStockThreshold: number;
  discountPercent: number;
  priceStatus: PriceStatus;
  isPublished: boolean;
  isFeatured: boolean;
  isBestSeller: boolean;
  isNewArrival: boolean;
  isDailyEssential: boolean;
  isDeleted: boolean;
  salesCount: number;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface CartItem {
  productId: string;
  quantity: number;
}

export interface OrderItemSnapshot {
  productId: string;
  name: string;
  brand: string;
  packSize: string;
  unit: string;
  sku: string;
  imageUrl: string;
  unitPrice: number;
  originalPrice: number;
  quantity: number;
  lineTotal: number;
}

export type PaymentMethod = 'UPI' | 'COD' | 'GATEWAY';
export type PaymentStatus = 'Pending' | 'COD Pending' | 'Paid' | 'Failed' | 'Refunded';
export type OrderStatus =
  | 'Order Placed'
  | 'Order Confirmed'
  | 'Preparing'
  | 'Out for Delivery'
  | 'Delivered'
  | 'Cancelled';

export interface Order {
  id: string;
  orderNumber: string;
  userId: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  deliveryAddress: string;
  locality: string;
  landmark: string;
  pinCode: string;
  deliveryInstructions: string;
  items: OrderItemSnapshot[];
  subtotal: number;
  deliveryCharge: number;
  discountAmount: number;
  couponCode: string;
  totalAmount: number;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  paymentReference: string;
  orderStatus: OrderStatus;
  adminNotes: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface Review {
  id: string;
  productId: string;
  productName: string;
  userId: string;
  userName: string;
  orderId: string;
  rating: number;
  comment: string;
  verifiedPurchase: boolean;
  status: 'pending' | 'approved' | 'hidden';
  adminReply: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface FaqItem {
  id: string;
  question: string;
  answer: string;
  sortOrder: number;
  isActive: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface Banner {
  id: string;
  title: string;
  subtitle: string;
  imageUrl: string;
  ctaText: string;
  targetCategory: string;
  isActive: boolean;
  sortOrder: number;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface Coupon {
  id: string;
  code: string;
  description: string;
  discountType: 'flat' | 'percent';
  discountValue: number;
  minOrderAmount: number;
  isActive: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface InventoryLog {
  id: string;
  productId: string;
  productName: string;
  changeType: 'restock' | 'adjustment' | 'order_deduction' | 'order_restore';
  quantityDelta: number;
  previousStock: number;
  newStock: number;
  reason: string;
  performedBy: string;
  createdAt?: unknown;
}

export type PriceScope =
  | 'supplier_invoice'
  | 'local_sopore_quote'
  | 'official_mrp'
  | 'jk_des_bulletin'
  | 'dca_monitoring'
  | 'online_retailer_ref';

export type PriceVerificationStatus =
  | 'admin_price_required'
  | 'verified_pending_approval'
  | 'approved_published';

export interface PriceResearchItem {
  id: string;
  productId: string;
  productName: string;
  brand: string;
  packSize: string;
  unit: string;
  priceScope: PriceScope;
  mrp: number;
  observedPrice: number;
  purchaseCost: number;
  proposedSellingPrice: number;
  sourceLabel: string;
  sourceUrl: string;
  locationMarket: string;
  researchDate: string;
  verificationStatus: PriceVerificationStatus;
  notes: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface DeliveryZone {
  name: string;
  pinCode: string;
  charge: number;
  estimatedTime: string;
}

export interface StoreSettings {
  storeName: string;
  logoUrl?: string;
  tagline: string;
  phone: string;
  whatsappNumber: string;
  email: string;
  address: string;
  pinCode: string;
  latitude: number;
  longitude: number;
  openingHours: string;
  closingHours: string;
  deliveryZones: DeliveryZone[];
  defaultDeliveryCharge: number;
  freeDeliveryThreshold: number;
  minOrderAmount: number;
  promoBannerText: string;
  primaryColor: string;
  codEnabled: boolean;
  codLabel?: string;
  codInstructions?: string;
  upiEnabled: boolean;
  upiLabel?: string;
  upiInstructions?: string;
  merchantUpiId: string;
  merchantUpiName: string;
  zapUpiMerchantId?: string;
  zapUpiCreateUrl?: string;
  zapUpiVerifyUrl?: string;
  otherGatewayEnabled: boolean;
  otherGatewayLabel: string;
  otherGatewayInstructions?: string;
  aboutUsTitle: string;
  aboutUsParagraphs: string[];
  returnPolicy: string;
  privacyPolicy: string;
  termsConditions: string;
  facebookUrl: string;
  instagramUrl: string;
  orderStatusEmailsEnabled?: boolean;
  emailNotifyStatuses?: OrderStatus[];
  emailReplyTo?: string;
  updatedAt?: unknown;
}

export type UpiVerificationMode = 'require_zap_upi' | 'manual_utr';

export interface PaymentConfig {
  codEnabled: boolean;
  codLabel: string;
  codInstructions: string;
  upiEnabled: boolean;
  upiLabel: string;
  upiInstructions: string;
  upiVerificationMode: UpiVerificationMode;
  netBankingEnabled: boolean;
  netBankingLabel: string;
  netBankingInstructions: string;
  netBankingRequireGateway: boolean;
  merchantUpiId: string;
  merchantUpiName: string;
  zapUpiEnvironment: 'sandbox' | 'production';
  zapUpiMerchantId: string;
  zapUpiCreateUrl: string;
  zapUpiVerifyUrl: string;
  updatedAt?: unknown;
}

export interface StoreNotification {
  id: string;
  targetRole: 'admin' | 'customer';
  targetUserId: string;
  title: string;
  message: string;
  type: 'order' | 'stock' | 'system';
  isRead: boolean;
  createdAt?: unknown;
}

export interface EmailLog {
  id: string;
  orderId: string;
  orderNumber: string;
  userId: string;
  recipientEmail: string;
  customerName: string;
  previousStatus: OrderStatus;
  newStatus: OrderStatus;
  subject: string;
  provider: 'smtp' | 'resend' | 'unconfigured';
  deliveryStatus: 'sent' | 'skipped' | 'failed';
  messageId: string;
  errorMessage: string;
  triggeredBy: 'cloud_function';
  eventId: string;
  createdAt?: unknown;
}

export type PriceAlertStatus = 'active' | 'notified' | 'cancelled';

export interface PriceAlert {
  id: string;
  userId: string;
  userEmail: string;
  userName: string;
  productId: string;
  productName: string;
  baselinePrice: number;
  targetPrice: number;
  status: PriceAlertStatus;
  createdAt?: unknown;
  updatedAt?: unknown;
}

