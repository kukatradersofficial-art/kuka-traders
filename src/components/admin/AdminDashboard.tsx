import React, { useEffect, useState } from 'react';
import type { User } from 'firebase/auth';
import {
  ArrowLeft,
  BadgeIndianRupee,
  BarChart3,
  Boxes,
  CreditCard,
  FileText,
  Lock,
  MessageSquare,
  Package,
  Settings,
  ShoppingBag,
  Users,
} from 'lucide-react';
import type {
  Banner,
  Category,
  Coupon,
  EmailLog,
  FaqItem,
  InventoryLog,
  Order,
  PaymentConfig,
  PriceResearchItem,
  Product,
  Review,
  StoreNotification,
  StoreSettings,
  UserProfile,
} from '../../types';
import { KukaLogo } from '../KukaLogo';
import { AdminOverview } from './AdminOverview';
import { AdminProductsCategories } from './AdminProductsCategories';
import { AdminInventoryPriceResearch } from './AdminInventoryPriceResearch';
import { AdminOrdersCustomersContent } from './AdminOrdersCustomersContent';
import { AdminReviewSentiment } from './AdminReviewSentiment';
import { AdminPaymentConfig } from './AdminPaymentConfig';

type AdminTab =
  | 'overview'
  | 'products'
  | 'inventory'
  | 'price_research'
  | 'orders'
  | 'customers'
  | 'reviews'
  | 'cms'
  | 'payment_config'
  | 'settings';

interface AdminDashboardProps {
  firebaseUser: User | null;
  products: Product[];
  categories: Category[];
  orders: Order[];
  customers: UserProfile[];
  reviews: Review[];
  faqs: FaqItem[];
  banners: Banner[];
  coupons: Coupon[];
  inventoryLogs: InventoryLog[];
  priceResearch: PriceResearchItem[];
  notifications: StoreNotification[];
  emailLogs: EmailLog[];
  settings: StoreSettings;
  paymentConfig: PaymentConfig;
  onExitAdmin: () => void;
  onOpenAuth: () => void;
}

const NAV_ITEMS: Array<{ id: AdminTab; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { id: 'overview', label: 'Overview', icon: BarChart3 },
  { id: 'products', label: 'Products & Categories', icon: Package },
  { id: 'inventory', label: 'Inventory', icon: Boxes },
  { id: 'price_research', label: 'Price Research', icon: BadgeIndianRupee },
  { id: 'orders', label: 'Orders', icon: ShoppingBag },
  { id: 'customers', label: 'Customers', icon: Users },
  { id: 'reviews', label: 'Reviews & Sentiment', icon: MessageSquare },
  { id: 'cms', label: 'FAQs & Banners', icon: FileText },
  { id: 'payment_config', label: 'Payment Configuration', icon: CreditCard },
  { id: 'settings', label: 'Store Settings', icon: Settings },
];

export const AdminDashboard: React.FC<AdminDashboardProps> = ({
  firebaseUser,
  products,
  categories,
  orders,
  customers,
  reviews,
  faqs,
  banners,
  coupons,
  inventoryLogs,
  priceResearch,
  notifications,
  emailLogs,
  settings,
  paymentConfig,
  onExitAdmin,
  onOpenAuth,
}) => {
  const [activeTab, setActiveTab] = useState<AdminTab>('overview');
  const [verifying, setVerifying] = useState(true);
  const [serverAuthorized, setServerAuthorized] = useState(false);
  const [authError, setAuthError] = useState('');

  useEffect(() => {
    let active = true;
    const verify = async () => {
      if (!firebaseUser) {
        if (active) {
          setServerAuthorized(false);
          setVerifying(false);
          setAuthError('Sign in with an authorized KUKA TRADERS administrator account.');
        }
        return;
      }

      setVerifying(true);
      try {
        const idToken = await firebaseUser.getIdToken();
        const res = await fetch('/api/admin/verify-session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ idToken }),
        });
        const rawText = await res.text();
        let data: { authorized?: boolean; error?: string } = {};
        try {
          data = rawText ? (JSON.parse(rawText) as { authorized?: boolean; error?: string }) : {};
        } catch {
          data = {
            authorized: false,
            error: `Server verification returned an unexpected response (HTTP ${res.status}).`,
          };
        }
        if (!active) return;
        if (res.ok && data.authorized) {
          setServerAuthorized(true);
          setAuthError('');
        } else {
          setServerAuthorized(false);
          setAuthError(
            data.error ||
              'Unauthorized access rejected. Only mursaleewandroo@gmail.com and kukatraders.official@gmail.com are authorized.'
          );
        }
      } catch (err) {
        if (active) {
          setServerAuthorized(false);
          setAuthError(err instanceof Error ? err.message : 'Unable to verify admin session.');
        }
      } finally {
        if (active) setVerifying(false);
      }
    };
    verify();
    return () => {
      active = false;
    };
  }, [firebaseUser]);

  if (verifying) {
    return (
      <div className="min-h-screen bg-stone-50 flex items-center justify-center p-6">
        <div className="text-center space-y-2">
          <div className="w-8 h-8 border-2 border-[#F36B16] border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm font-medium text-stone-600">
            Verifying administrator credentials on server...
          </p>
        </div>
      </div>
    );
  }

  if (!serverAuthorized || !firebaseUser) {
    return (
      <div className="min-h-screen bg-stone-50 flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white rounded-2xl border border-stone-200 p-8 text-center space-y-4">
          <div className="w-12 h-12 rounded-xl bg-red-50 text-red-700 flex items-center justify-center mx-auto">
            <Lock className="w-6 h-6" />
          </div>
          <h1 className="font-display text-xl font-bold text-stone-900">
            Admin Access Restricted
          </h1>
          <p className="text-sm text-stone-600">{authError}</p>
          <div className="flex flex-wrap justify-center gap-3 pt-2">
            {!firebaseUser && (
              <button
                type="button"
                onClick={onOpenAuth}
                className="px-5 py-2.5 rounded-xl bg-[#F36B16] text-white text-xs font-semibold hover:bg-[#D95708]"
              >
                Admin Sign In
              </button>
            )}
            <button
              type="button"
              onClick={onExitAdmin}
              className="px-5 py-2.5 rounded-xl border border-stone-300 text-stone-800 text-xs font-semibold hover:bg-stone-50"
            >
              Return to Storefront
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-stone-50 flex flex-col lg:flex-row">
      {/* Sidebar */}
      <aside className="w-full lg:w-64 bg-white border-b lg:border-b-0 lg:border-r border-stone-200 shrink-0 flex flex-col justify-between">
        <div>
          <div className="px-5 py-4 border-b border-stone-200 flex items-center justify-between">
            <KukaLogo logoUrl={settings.logoUrl} storeName={settings.storeName} />
          </div>
          <div className="px-4 py-3 border-b border-stone-100 text-xs">
            <p className="font-semibold text-stone-900 truncate">{firebaseUser.email}</p>
            <p className="text-stone-500">Verified Store Administrator</p>
          </div>
          <nav className="p-3 flex lg:flex-col gap-1 overflow-x-auto">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const active = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveTab(item.id)}
                  className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-semibold whitespace-nowrap shrink-0 transition-colors ${
                    active
                      ? 'bg-orange-50 text-[#F36B16]'
                      : 'text-stone-600 hover:bg-stone-100 hover:text-stone-900'
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        <div className="p-4 border-t border-stone-200 hidden lg:block">
          <button
            type="button"
            onClick={onExitAdmin}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-stone-300 text-xs font-semibold text-stone-800 hover:bg-stone-50"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Customer Store
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 min-w-0">
        <header className="bg-white border-b border-stone-200 px-6 py-4 flex items-center justify-between gap-4">
          <div>
            <p className="text-xs text-stone-500">KUKA TRADERS Admin Console</p>
            <h1 className="font-display text-lg font-bold text-stone-900">
              {NAV_ITEMS.find((n) => n.id === activeTab)?.label}
            </h1>
          </div>
          <button
            type="button"
            onClick={onExitAdmin}
            className="lg:hidden inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-stone-300 text-xs font-semibold text-stone-800"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Storefront
          </button>
        </header>

        <div className="p-4 sm:p-6 max-w-7xl mx-auto">
          {activeTab === 'overview' && (
            <AdminOverview
              products={products}
              orders={orders}
              customers={customers}
              reviews={reviews}
              notifications={notifications}
              onNavigateTab={(t) => setActiveTab(t as AdminTab)}
            />
          )}

          {activeTab === 'products' && (
            <AdminProductsCategories products={products} categories={categories} />
          )}

          {(activeTab === 'inventory' || activeTab === 'price_research') && (
            <AdminInventoryPriceResearch
              mode={activeTab}
              products={products}
              inventoryLogs={inventoryLogs}
              priceResearch={priceResearch}
              adminUid={firebaseUser.uid}
            />
          )}

          {activeTab === 'reviews' && (
            <AdminReviewSentiment reviews={reviews} products={products} />
          )}

          {activeTab === 'payment_config' && (
            <AdminPaymentConfig paymentConfig={paymentConfig} storeSettings={settings} />
          )}

          {(activeTab === 'orders' ||
            activeTab === 'customers' ||
            activeTab === 'cms' ||
            activeTab === 'settings') && (
            <AdminOrdersCustomersContent
              tab={activeTab}
              orders={orders}
              customers={customers}
              faqs={faqs}
              banners={banners}
              coupons={coupons}
              settings={settings}
              paymentConfig={paymentConfig}
              emailLogs={emailLogs}
              adminUid={firebaseUser.uid}
              onOpenPaymentConfig={() => setActiveTab('payment_config')}
            />
          )}
        </div>
      </main>
    </div>
  );
};
