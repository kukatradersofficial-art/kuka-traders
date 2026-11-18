import React, { useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged, signOut, type User } from 'firebase/auth';
import {
  collection,
  doc,
  onSnapshot,
  query,
  where,
} from 'firebase/firestore';
import {
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Globe,
  Heart,
  Home,
  LayoutGrid,
  Lock,
  Mail,
  MapPin,
  MessageCircle,
  Package,
  Phone,
  Search,
  ShieldCheck,
  ShoppingBag,
  ShoppingCart,
  SlidersHorizontal,
  Star,
  Truck,
  User as UserIcon,
  X,
} from 'lucide-react';
import {
  auth,
  db,
  handleFirestoreError,
  isAuthorizedAdminEmail,
  OperationType,
  testConnection,
} from './firebase';
import {
  DEFAULT_PAYMENT_CONFIG,
  DEFAULT_STORE_SETTINGS,
  INITIAL_BANNERS,
  INITIAL_CATEGORIES,
  INITIAL_COUPONS,
  INITIAL_FAQS,
  INITIAL_PRODUCTS,
  STORE_IMAGES,
} from './data/seedCatalog';
import {
  ensureAdminRecord,
  ensureUserProfile,
  seedDatabaseIfEmpty,
  updateUserProfile,
} from './services/firestoreStore';
import type {
  AppLanguage,
  Banner,
  CartItem,
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
} from './types';
import { TRANSLATIONS } from './i18n/translations';
import { buildWhatsAppLink, formatINR, formatISTDateTime } from './utils/format';
import { KukaLogo } from './components/KukaLogo';
import { ProductCard } from './components/ProductCard';
import { ProductDetailModal } from './components/ProductDetailModal';
import { CartDrawer } from './components/CartDrawer';
import { CheckoutModal } from './components/CheckoutModal';
import { AuthModal } from './components/AuthModal';
import { CustomerAccountView } from './components/CustomerAccountView';
import { SoporeStoreMap } from './components/SoporeStoreMap';
import { GeminiAssistantChat } from './components/GeminiAssistantChat';
import { AdminDashboard } from './components/admin/AdminDashboard';
import { LoginGate } from './components/LoginGate';
import { OrderTrackingPage } from './components/OrderTrackingPage';

type ViewMode = 'store' | 'account' | 'track' | 'admin';
type ShowcaseTab =
  | 'all'
  | 'featured'
  | 'best_sellers'
  | 'new_arrivals'
  | 'offers'
  | 'essentials';
type SortOption = 'popularity' | 'price_asc' | 'price_desc' | 'newest';
type PolicyKey = 'return' | 'privacy' | 'terms' | null;

export default function App() {
  // Navigation & UI View State
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    if (window.location.pathname.startsWith('/admin') || window.location.hash === '#admin') {
      return 'admin';
    }
    if (window.location.pathname.startsWith('/track') || window.location.hash === '#track') {
      return 'track';
    }
    return 'store';
  });
  const [trackingOrderId, setTrackingOrderId] = useState<string>(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('order') || '';
  });
  const [lang, setLang] = useState<AppLanguage>('en');
  const [gmpQuotaExceeded, setGmpQuotaExceeded] = useState(false);
  const [booting, setBooting] = useState(true);
  const [catalogLoaded, setCatalogLoaded] = useState(false);

  // Auth & Profile
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authRefreshTick, setAuthRefreshTick] = useState(0);

  // Firestore Live Collections (fallback cleanly to initial defaults until first admin seeds Firestore)
  const [categories, setCategories] = useState<Category[]>(INITIAL_CATEGORIES);
  const [products, setProducts] = useState<Product[]>(INITIAL_PRODUCTS);
  const [faqs, setFaqs] = useState<FaqItem[]>(INITIAL_FAQS);
  const [banners, setBanners] = useState<Banner[]>(INITIAL_BANNERS);
  const [coupons, setCoupons] = useState<Coupon[]>(INITIAL_COUPONS);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [customers, setCustomers] = useState<UserProfile[]>([]);
  const [inventoryLogs, setInventoryLogs] = useState<InventoryLog[]>([]);
  const [priceResearch, setPriceResearch] = useState<PriceResearchItem[]>([]);
  const [notifications, setNotifications] = useState<StoreNotification[]>([]);
  const [emailLogs, setEmailLogs] = useState<EmailLog[]>([]);
  const [settings, setSettings] = useState<StoreSettings>(DEFAULT_STORE_SETTINGS);
  const [paymentConfig, setPaymentConfig] = useState<PaymentConfig>(DEFAULT_PAYMENT_CONFIG);

  // Shopping State
  const [cart, setCart] = useState<CartItem[]>([]);
  const [directBuyCart, setDirectBuyCart] = useState<CartItem[] | null>(null);
  const [pendingCheckoutAfterAuth, setPendingCheckoutAfterAuth] = useState(false);
  const [wishlist, setWishlist] = useState<string[]>([]);
  const [appliedCouponCode, setAppliedCouponCode] = useState('');
  const [cartDrawerOpen, setCartDrawerOpen] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [orderConfirmation, setOrderConfirmation] = useState<{
    orderId: string;
    orderNumber: string;
    totalAmount: number;
  } | null>(null);

  // Search, Filter & Discovery State
  const [searchQuery, setSearchQuery] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const [selectedCategoryId, setSelectedCategoryId] = useState('all');
  const [selectedBrand, setSelectedBrand] = useState('all');
  const [maxPriceFilter, setMaxPriceFilter] = useState<number>(0);
  const [inStockOnly, setInStockOnly] = useState(false);
  const [wishlistOnly, setWishlistOnly] = useState(false);
  const [showcaseTab, setShowcaseTab] = useState<ShowcaseTab>('all');
  const [sortBy, setSortBy] = useState<SortOption>('popularity');
  const [filtersExpanded, setFiltersExpanded] = useState(false);

  // FAQ & Policy Modal State
  const [openFaqId, setOpenFaqId] = useState<string | null>(INITIAL_FAQS[0]?.id || null);
  const [activePolicy, setActivePolicy] = useState<PolicyKey>(null);

  const isVerifiedSignedIn = Boolean(
    firebaseUser && firebaseUser.emailVerified && authRefreshTick >= 0
  );
  const isAdminUser = Boolean(
    firebaseUser?.emailVerified && isAuthorizedAdminEmail(firebaseUser?.email)
  );
  const t = TRANSLATIONS[lang];

  // Google Maps quota listener
  useEffect(() => {
    const handler = () => setGmpQuotaExceeded(true);
    window.addEventListener('gmp-quota-exceeded', handler);
    return () => window.removeEventListener('gmp-quota-exceeded', handler);
  }, []);

  // Firestore connection verification & Firebase Auth listener
  useEffect(() => {
    void testConnection();
    const unsubAuth = onAuthStateChanged(auth, async (user) => {
      setFirebaseUser(user);
      if (user) {
        try {
          if (user.emailVerified && isAuthorizedAdminEmail(user.email)) {
            await ensureAdminRecord(user);
            await seedDatabaseIfEmpty(false);
          }
          const profile = await ensureUserProfile(user);
          setUserProfile(profile);
          if (profile?.preferredLang) {
            setLang(profile.preferredLang);
          }
        } catch (err) {
          console.error('User profile / admin sync error:', err);
        }
      } else {
        setUserProfile(null);
      }
      setBooting(false);
    });
    return () => unsubAuth();
  }, []);

  useEffect(() => {
    if (firebaseUser && pendingCheckoutAfterAuth) {
      setPendingCheckoutAfterAuth(false);
      setCheckoutOpen(true);
    }
  }, [firebaseUser, pendingCheckoutAfterAuth]);

  // Authenticated Storefront Firestore Listeners (nothing queried before login)
  useEffect(() => {
    if (!isVerifiedSignedIn) {
      setCategories(INITIAL_CATEGORIES);
      setProducts(INITIAL_PRODUCTS);
      setFaqs(INITIAL_FAQS);
      setBanners(INITIAL_BANNERS);
      setCoupons(INITIAL_COUPONS);
      setSettings(DEFAULT_STORE_SETTINGS);
      setPaymentConfig(DEFAULT_PAYMENT_CONFIG);
      setCatalogLoaded(false);
      return;
    }

    const unsubCategories = onSnapshot(
      collection(db, 'categories'),
      (snap) => {
        if (!snap.empty) {
          const list = snap.docs
            .map((d) => ({ id: d.id, ...(d.data() as Omit<Category, 'id'>) }))
            .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
          setCategories(list);
        }
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'categories')
    );

    const unsubProducts = onSnapshot(
      collection(db, 'products'),
      (snap) => {
        if (!snap.empty) {
          const list = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Product, 'id'>) }));
          setProducts(list);
        }
        setCatalogLoaded(true);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'products')
    );

    const unsubFaqs = onSnapshot(
      collection(db, 'faqs'),
      (snap) => {
        if (!snap.empty) {
          const list = snap.docs
            .map((d) => ({ id: d.id, ...(d.data() as Omit<FaqItem, 'id'>) }))
            .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
          setFaqs(list);
        }
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'faqs')
    );

    const unsubBanners = onSnapshot(
      collection(db, 'banners'),
      (snap) => {
        if (!snap.empty) {
          const list = snap.docs
            .map((d) => ({ id: d.id, ...(d.data() as Omit<Banner, 'id'>) }))
            .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
          setBanners(list);
        }
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'banners')
    );

    const unsubCoupons = onSnapshot(
      collection(db, 'coupons'),
      (snap) => {
        if (!snap.empty) {
          const list = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Coupon, 'id'>) }));
          setCoupons(list);
        }
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'coupons')
    );

    const unsubSettings = onSnapshot(
      doc(db, 'settings', 'store_config'),
      (snap) => {
        if (snap.exists()) {
          setSettings({ ...DEFAULT_STORE_SETTINGS, ...(snap.data() as Partial<StoreSettings>) });
        }
      },
      (err) => handleFirestoreError(err, OperationType.GET, 'settings/store_config')
    );

    const unsubPaymentConfig = onSnapshot(
      doc(db, 'settings', 'payment_config'),
      (snap) => {
        if (snap.exists()) {
          setPaymentConfig({
            ...DEFAULT_PAYMENT_CONFIG,
            ...(snap.data() as Partial<PaymentConfig>),
          });
        }
      },
      (err) => handleFirestoreError(err, OperationType.GET, 'settings/payment_config')
    );

    return () => {
      unsubCategories();
      unsubProducts();
      unsubFaqs();
      unsubBanners();
      unsubCoupons();
      unsubSettings();
      unsubPaymentConfig();
    };
  }, [isVerifiedSignedIn]);

  // Role-Scoped Firestore Listeners (Reviews, Orders, Notifications, Admin Collections)
  useEffect(() => {
    if (!isVerifiedSignedIn || !firebaseUser) {
      setReviews([]);
      setOrders([]);
      setNotifications([]);
      setCustomers([]);
      setInventoryLogs([]);
      setPriceResearch([]);
      setEmailLogs([]);
      return;
    }

    const reviewsQuery = isAdminUser
      ? collection(db, 'reviews')
      : query(collection(db, 'reviews'), where('status', '==', 'approved'));

    const unsubReviews = onSnapshot(
      reviewsQuery,
      (snap) => {
        setReviews(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Review, 'id'>) })));
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'reviews')
    );

    let unsubOrders: (() => void) | undefined;
    let unsubNotifications: (() => void) | undefined;
    let unsubEmailLogs: (() => void) | undefined;
    let unsubUsers: (() => void) | undefined;
    let unsubInventory: (() => void) | undefined;
    let unsubPriceResearch: (() => void) | undefined;

    if (firebaseUser) {
      const ordersRef = isAdminUser
        ? collection(db, 'orders')
        : query(collection(db, 'orders'), where('userId', '==', firebaseUser.uid));

      unsubOrders = onSnapshot(
        ordersRef,
        (snap) => {
          const list = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Order, 'id'>) }));
          setOrders(list);
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'orders')
      );

      const notifRef = isAdminUser
        ? collection(db, 'notifications')
        : query(collection(db, 'notifications'), where('targetUserId', '==', firebaseUser.uid));

      unsubNotifications = onSnapshot(
        notifRef,
        (snap) => {
          setNotifications(
            snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<StoreNotification, 'id'>) }))
          );
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'notifications')
      );

      const emailLogsRef = isAdminUser
        ? collection(db, 'emailLogs')
        : query(collection(db, 'emailLogs'), where('userId', '==', firebaseUser.uid));

      unsubEmailLogs = onSnapshot(
        emailLogsRef,
        (snap) => {
          setEmailLogs(
            snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<EmailLog, 'id'>) }))
          );
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'emailLogs')
      );
    } else {
      setOrders([]);
      setNotifications([]);
      setEmailLogs([]);
    }

    if (isAdminUser) {
      unsubUsers = onSnapshot(
        collection(db, 'users'),
        (snap) => {
          setCustomers(
            snap.docs.map((d) => ({ ...(d.data() as UserProfile), uid: d.id }))
          );
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'users')
      );

      unsubInventory = onSnapshot(
        collection(db, 'inventory'),
        (snap) => {
          setInventoryLogs(
            snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<InventoryLog, 'id'>) }))
          );
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'inventory')
      );

      unsubPriceResearch = onSnapshot(
        collection(db, 'priceResearch'),
        (snap) => {
          setPriceResearch(
            snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<PriceResearchItem, 'id'>) }))
          );
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'priceResearch')
      );
    } else {
      setCustomers([]);
      setInventoryLogs([]);
      setPriceResearch([]);
    }

    return () => {
      unsubReviews();
      if (unsubOrders) unsubOrders();
      if (unsubNotifications) unsubNotifications();
      if (unsubEmailLogs) unsubEmailLogs();
      if (unsubUsers) unsubUsers();
      if (unsubInventory) unsubInventory();
      if (unsubPriceResearch) unsubPriceResearch();
    };
  }, [firebaseUser, isAdminUser, isVerifiedSignedIn]);

  // Derived Customer Catalog
  const activeCategories = useMemo(
    () => categories.filter((c) => c.isActive).sort((a, b) => a.sortOrder - b.sortOrder),
    [categories]
  );

  const visibleProducts = useMemo(
    () => products.filter((p) => !p.isDeleted && p.isPublished),
    [products]
  );

  const availableBrands = useMemo(() => {
    const set = new Set<string>();
    for (const p of visibleProducts) {
      if (p.brand) set.add(p.brand);
    }
    return Array.from(set).sort();
  }, [visibleProducts]);

  const maxCatalogPrice = useMemo(() => {
    const prices = visibleProducts
      .filter((p) => p.priceStatus === 'approved' && p.sellingPrice > 0)
      .map((p) => p.sellingPrice);
    return prices.length ? Math.max(...prices) : 3000;
  }, [visibleProducts]);

  const searchSuggestions = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (q.length < 2) return [];
    return visibleProducts
      .filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.brand.toLowerCase().includes(q) ||
          p.categoryName.toLowerCase().includes(q) ||
          p.packSize.toLowerCase().includes(q) ||
          p.nameUrdu.toLowerCase().includes(q)
      )
      .slice(0, 6);
  }, [visibleProducts, searchQuery]);

  const filteredProducts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const list = visibleProducts.filter((p) => {
      if (selectedCategoryId !== 'all' && p.categoryId !== selectedCategoryId) return false;
      if (selectedBrand !== 'all' && p.brand !== selectedBrand) return false;
      if (inStockOnly && p.stockQuantity <= 0) return false;
      if (wishlistOnly && !wishlist.includes(p.id)) return false;
      if (maxPriceFilter > 0 && p.priceStatus === 'approved' && p.sellingPrice > maxPriceFilter) {
        return false;
      }

      if (showcaseTab === 'featured' && !p.isFeatured) return false;
      if (showcaseTab === 'best_sellers' && !p.isBestSeller) return false;
      if (showcaseTab === 'new_arrivals' && !p.isNewArrival) return false;
      if (showcaseTab === 'offers' && !(p.discountPercent > 0 && p.priceStatus === 'approved'))
        return false;
      if (showcaseTab === 'essentials' && !p.isDailyEssential) return false;

      if (q) {
        const haystack = `${p.name} ${p.nameUrdu} ${p.brand} ${p.categoryName} ${p.packSize} ${p.description} ${p.sku}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });

    const sorted = [...list];
    if (sortBy === 'popularity') {
      sorted.sort((a, b) => (b.salesCount || 0) - (a.salesCount || 0));
    } else if (sortBy === 'price_asc') {
      sorted.sort((a, b) => {
        const pa = a.priceStatus === 'approved' && a.sellingPrice > 0 ? a.sellingPrice : Number.MAX_SAFE_INTEGER;
        const pb = b.priceStatus === 'approved' && b.sellingPrice > 0 ? b.sellingPrice : Number.MAX_SAFE_INTEGER;
        return pa - pb;
      });
    } else if (sortBy === 'price_desc') {
      sorted.sort((a, b) => {
        const pa = a.priceStatus === 'approved' ? a.sellingPrice : -1;
        const pb = b.priceStatus === 'approved' ? b.sellingPrice : -1;
        return pb - pa;
      });
    } else if (sortBy === 'newest') {
      sorted.sort((a, b) => Number(b.isNewArrival) - Number(a.isNewArrival));
    }
    return sorted;
  }, [
    visibleProducts,
    selectedCategoryId,
    selectedBrand,
    inStockOnly,
    wishlistOnly,
    wishlist,
    maxPriceFilter,
    showcaseTab,
    searchQuery,
    sortBy,
  ]);

  const cartCount = useMemo(
    () => cart.reduce((sum, item) => sum + item.quantity, 0),
    [cart]
  );

  const activeBanners = useMemo(
    () => banners.filter((b) => b.isActive).sort((a, b) => a.sortOrder - b.sortOrder),
    [banners]
  );

  const primaryBanner = activeBanners[0];

  const approvedReviews = useMemo(
    () => reviews.filter((r) => r.status === 'approved'),
    [reviews]
  );

  // Handlers
  const handleToggleLanguage = async () => {
    const nextLang: AppLanguage = lang === 'en' ? 'ur' : 'en';
    setLang(nextLang);
    if (userProfile) {
      try {
        await updateUserProfile(userProfile.uid, {
          name: userProfile.name,
          phone: userProfile.phone,
          savedAddresses: userProfile.savedAddresses,
          preferredLang: nextLang,
        });
      } catch {
        // Non-blocking UI preference update
      }
    }
  };

  const handleAddToCart = (product: Product, qty = 1) => {
    if (product.stockQuantity <= 0 || product.priceStatus !== 'approved' || product.sellingPrice <= 0) {
      return;
    }
    setCart((prev) => {
      const existing = prev.find((item) => item.productId === product.id);
      if (existing) {
        const nextQty = Math.min(product.stockQuantity, existing.quantity + qty);
        return prev.map((item) =>
          item.productId === product.id ? { ...item, quantity: nextQty } : item
        );
      }
      return [...prev, { productId: product.id, quantity: Math.min(product.stockQuantity, qty) }];
    });
  };

  const handleBuyNow = (product: Product, qty = 1) => {
    if (product.stockQuantity <= 0 || product.priceStatus !== 'approved' || product.sellingPrice <= 0) {
      return;
    }
    setDirectBuyCart([
      { productId: product.id, quantity: Math.min(product.stockQuantity, Math.max(1, qty)) },
    ]);
    setCartDrawerOpen(false);
    setSelectedProduct(null);
    setCheckoutOpen(true);
  };

  const handleUpdateCartQty = (productId: string, qty: number) => {
    if (qty <= 0) {
      setCart((prev) => prev.filter((item) => item.productId !== productId));
      return;
    }
    const prod = products.find((p) => p.id === productId);
    const maxAllowed = prod ? Math.max(1, prod.stockQuantity) : qty;
    setCart((prev) =>
      prev.map((item) =>
        item.productId === productId ? { ...item, quantity: Math.min(qty, maxAllowed) } : item
      )
    );
  };

  const handleRemoveCartItem = (productId: string) => {
    setCart((prev) => prev.filter((item) => item.productId !== productId));
  };

  const handleToggleWishlist = (productId: string) => {
    setWishlist((prev) =>
      prev.includes(productId) ? prev.filter((id) => id !== productId) : [...prev, productId]
    );
  };

  const resetAllFilters = () => {
    setSearchQuery('');
    setSelectedCategoryId('all');
    setSelectedBrand('all');
    setMaxPriceFilter(0);
    setInStockOnly(false);
    setWishlistOnly(false);
    setShowcaseTab('all');
    setSortBy('popularity');
  };

  const scrollToSection = (id: string) => {
    if (viewMode !== 'store') {
      setViewMode('store');
      setTimeout(() => {
        document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
      }, 80);
    } else {
      document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const handleSignOut = async () => {
    await signOut(auth);
    setViewMode('store');
    setCartDrawerOpen(false);
    setCheckoutOpen(false);
    setSelectedProduct(null);
    setOrderConfirmation(null);
    setDirectBuyCart(null);
  };

  if (booting) {
    return (
      <div className="min-h-screen bg-[#F3F5F8] flex flex-col items-center justify-center p-6">
        <div className="bg-white px-5 py-3 rounded-2xl shadow-xs border border-slate-200">
          <KukaLogo logoUrl={settings.logoUrl} storeName={settings.storeName} />
        </div>
        <p className="mt-4 text-sm font-semibold text-slate-600">
          Loading KUKA TRADERS...
        </p>
      </div>
    );
  }

  // Strict Login-First Gate: Nothing is visible until signed in with verified account
  if (!isVerifiedSignedIn) {
    return (
      <LoginGate
        lang={lang}
        onChangeLang={setLang}
        unverifiedUser={firebaseUser && !firebaseUser.emailVerified ? firebaseUser : null}
        logoUrl={settings.logoUrl}
        storeName={settings.storeName}
        onUserVerified={async (refreshedUser) => {
          setFirebaseUser(refreshedUser);
          setAuthRefreshTick((n) => n + 1);
          try {
            if (refreshedUser.emailVerified && isAuthorizedAdminEmail(refreshedUser.email)) {
              await ensureAdminRecord(refreshedUser);
              await seedDatabaseIfEmpty(false);
            }
            const profile = await ensureUserProfile(refreshedUser);
            setUserProfile(profile);
            if (profile?.preferredLang) {
              setLang(profile.preferredLang);
            }
          } catch (err) {
            console.error('Verified user setup error:', err);
          }
        }}
      />
    );
  }

  // Admin View
  if (viewMode === 'admin') {
    return (
      <>
        {gmpQuotaExceeded && (
          <div className="bg-amber-50 border-b border-amber-200 text-amber-900 px-4 py-2.5 text-xs md:text-sm text-center sticky top-0 z-50 shadow-sm">
            <span>
              Google Maps Platform quota reached. If you are the app owner, visit{' '}
              <a
                href="https://developers.google.com/maps/ai/ai-studio?utm_campaign=gmp_mcp_codeassist_v1_aistudio#quota_exceeded_errors"
                target="_blank"
                rel="noopener noreferrer"
                className="underline font-semibold text-amber-950 hover:text-amber-800"
              >
                maps developer site
              </a>{' '}
              for instructions to update your account.
            </span>
          </div>
        )}
        <AdminDashboard
          firebaseUser={firebaseUser}
          products={products}
          categories={categories}
          orders={orders}
          customers={customers}
          reviews={reviews}
          faqs={faqs}
          banners={banners}
          coupons={coupons}
          inventoryLogs={inventoryLogs}
          priceResearch={priceResearch}
          notifications={notifications}
          emailLogs={emailLogs}
          settings={settings}
          paymentConfig={paymentConfig}
          onExitAdmin={() => {
            setViewMode('store');
            if (window.location.pathname.startsWith('/admin')) {
              window.history.replaceState({}, '', '/');
            }
          }}
          onOpenAuth={() => setAuthModalOpen(true)}
        />
        <AuthModal
          isOpen={authModalOpen}
          onClose={() => setAuthModalOpen(false)}
          title="Admin & Customer Sign In"
        />
      </>
    );
  }

  const cartCountMap: Record<string, number> = {};
  for (const item of cart) cartCountMap[item.productId] = item.quantity;

  const firstCoupon = coupons.find((c) => c.isActive);

  return (
    <div
      className="min-h-screen flex flex-col bg-[#F3F5F8] text-slate-900 pb-16 md:pb-0"
      dir={lang === 'ur' ? 'rtl' : 'ltr'}
    >
      {/* Google Maps Demo Key Quota Banner */}
      {gmpQuotaExceeded && (
        <div className="bg-amber-50 border-b border-amber-200 text-amber-900 px-4 py-2 text-xs md:text-sm text-center sticky top-0 z-50">
          <span>
            Google Maps Platform quota reached. If you are the app owner, visit{' '}
            <a
              href="https://developers.google.com/maps/ai/ai-studio?utm_campaign=gmp_mcp_codeassist_v1_aistudio#quota_exceeded_errors"
              target="_blank"
              rel="noopener noreferrer"
              className="underline font-semibold text-amber-950 hover:text-amber-800"
            >
              maps developer site
            </a>{' '}
            for instructions to update your account.
          </span>
        </div>
      )}

      {/* Slim Top Sopore Address & Promo Strip */}
      <div className="bg-[#0B111A] text-slate-200 text-[11px] sm:text-xs py-2 px-4 text-center border-b border-slate-800/80">
        <span className="inline-flex flex-wrap items-center justify-center gap-x-2 gap-y-0.5">
          <span className="inline-flex items-center gap-1 font-semibold text-white">
            <MapPin className="w-3.5 h-3.5 text-[#FF9900]" />
            Main Bazar, near Jamia Masjid, Sopore · PIN 193201
          </span>
          <span className="text-slate-500 hidden sm:inline">|</span>
          <span className="text-slate-300">
            {settings.promoBannerText || 'Free delivery across Main Bazar Sopore (193201) on orders above ₹999'}
          </span>
          <span className="text-[#FF9900] font-bold">
            · Code <span className="font-mono">{firstCoupon?.code || 'SOPORE50'}</span>
          </span>
        </span>
      </div>

      {/* Amazon-Inspired Midnight Navy Header + Integrated Search Bar (Screens 3 & 5) */}
      <header className="sticky top-0 z-40 bg-[#131921] text-white shadow-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4 sm:gap-6">
          {/* Brand Logo */}
          <button
            type="button"
            onClick={() => {
              setViewMode('store');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            className="text-left focus:outline-none shrink-0 bg-white rounded-xl px-2.5 py-1 shadow-xs"
          >
            <KukaLogo logoUrl={settings.logoUrl} storeName={settings.storeName} />
          </button>

          {/* Center Navigation */}
          <nav className="hidden lg:flex items-center gap-6">
            <button
              type="button"
              onClick={() => scrollToSection('shop-catalog')}
              className="text-sm font-semibold text-slate-200 hover:text-[#FF9900] transition-colors whitespace-nowrap shrink-0"
            >
              {t.navShop}
            </button>
            <button
              type="button"
              onClick={() => scrollToSection('categories-section')}
              className="text-sm font-semibold text-slate-200 hover:text-[#FF9900] transition-colors whitespace-nowrap shrink-0"
            >
              {t.navCategories}
            </button>
            <button
              type="button"
              onClick={() => {
                setViewMode('track');
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              className={`text-sm font-semibold transition-colors whitespace-nowrap shrink-0 ${
                viewMode === 'track'
                  ? 'text-[#FF9900]'
                  : 'text-slate-200 hover:text-[#FF9900]'
              }`}
            >
              {t.navTrackOrder}
            </button>
            <button
              type="button"
              onClick={() => scrollToSection('about-section')}
              className="text-sm font-semibold text-slate-200 hover:text-[#FF9900] transition-colors whitespace-nowrap shrink-0"
            >
              {t.navAbout}
            </button>
            <button
              type="button"
              onClick={() => scrollToSection('contact-section')}
              className="text-sm font-semibold text-slate-200 hover:text-[#FF9900] transition-colors whitespace-nowrap shrink-0"
            >
              {t.navContact}
            </button>
          </nav>

          {/* Right Actions */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleToggleLanguage}
              title="Switch English / اردو"
              className="inline-flex items-center gap-1.5 px-2.5 py-2 rounded-full border border-slate-700 bg-slate-800/70 text-xs font-semibold text-slate-200 hover:bg-slate-700 whitespace-nowrap shrink-0"
            >
              <Globe className="w-3.5 h-3.5 text-[#FF9900]" />
              {lang === 'en' ? 'اردو' : 'EN'}
            </button>

            {isAdminUser && (
              <button
                type="button"
                onClick={() => setViewMode('admin')}
                className="hidden sm:inline-flex items-center gap-1.5 px-3 py-2 rounded-full border border-[#FF9900]/40 bg-[#FF9900]/15 text-[#FF9900] text-xs font-bold hover:bg-[#FF9900]/25 whitespace-nowrap shrink-0"
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                Admin
              </button>
            )}

            {firebaseUser ? (
              <button
                type="button"
                onClick={() => setViewMode(viewMode === 'account' ? 'store' : 'account')}
                className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-full border text-xs sm:text-sm font-semibold whitespace-nowrap shrink-0 transition-colors ${
                  viewMode === 'account'
                    ? 'border-[#FF9900] bg-[#FF9900] text-slate-950 font-bold'
                    : 'border-slate-700 bg-slate-800/70 text-slate-100 hover:bg-slate-700'
                }`}
              >
                <UserIcon className={`w-4 h-4 ${viewMode === 'account' ? 'text-slate-950' : 'text-[#FF9900]'}`} />
                <span className="hidden sm:inline max-w-[110px] truncate">
                  {userProfile?.name || firebaseUser.displayName || 'Account'}
                </span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setAuthModalOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-full border border-slate-700 bg-slate-800/70 text-xs sm:text-sm font-semibold text-slate-100 hover:bg-slate-700 whitespace-nowrap shrink-0"
              >
                <UserIcon className="w-4 h-4 text-[#FF9900]" />
                <span>Sign In</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => setCartDrawerOpen(true)}
              aria-label="Open Shopping Cart"
              className="relative inline-flex items-center gap-2 px-3.5 py-2 rounded-full bg-[#FF9900] text-slate-950 text-xs sm:text-sm font-extrabold hover:bg-[#E68A00] transition-colors whitespace-nowrap shrink-0 shadow-xs"
            >
              <ShoppingCart className="w-4 h-4" />
              <span className="hidden sm:inline">Cart</span>
              {cartCount > 0 && (
                <span className="px-1.5 py-0.5 rounded-full bg-[#131921] text-[#FF9900] text-[11px] font-extrabold tabular-nums leading-none">
                  {cartCount}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Integrated Search & Filter Row inside Navy Header (Screens 3 & 5) */}
        {viewMode === 'store' && (
          <div className="border-t border-slate-800/90 bg-[#131921]">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 py-2.5 flex flex-col md:flex-row gap-2.5 items-stretch md:items-center">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="search"
                  value={searchQuery}
                  onFocus={() => setSearchFocused(true)}
                  onBlur={() => setTimeout(() => setSearchFocused(false), 180)}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={t.searchPlaceholder}
                  className="w-full pl-10 pr-9 py-2.5 rounded-xl text-sm bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#FF9900]"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    aria-label="Clear search"
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}

                {/* Instant Search Suggestions Dropdown */}
                {searchFocused && searchSuggestions.length > 0 && (
                  <div className="absolute left-0 right-0 top-full mt-1.5 bg-white border border-slate-200 rounded-2xl shadow-xl z-40 divide-y divide-slate-100 overflow-hidden text-slate-900">
                    {searchSuggestions.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onMouseDown={() => {
                          setSelectedProduct(p);
                          setSearchFocused(false);
                        }}
                        className="w-full px-3.5 py-2.5 flex items-center justify-between gap-3 text-left hover:bg-[#F5F7FA]"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <img
                            src={p.imageUrl}
                            alt={p.name}
                            className="w-9 h-9 rounded-lg object-cover border border-slate-200 shrink-0"
                          />
                          <div className="min-w-0">
                            <p className="text-sm font-bold text-slate-900 truncate">
                              {p.name}
                            </p>
                            <p className="text-xs text-slate-500 truncate">
                              {p.brand} · {p.packSize} · {p.categoryName}
                            </p>
                          </div>
                        </div>
                        <span className="text-xs font-extrabold text-slate-900 tabular-nums shrink-0">
                          {p.priceStatus === 'approved' && p.sellingPrice > 0
                            ? formatINR(p.sellingPrice)
                            : 'Price on Inquiry'}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as SortOption)}
                  aria-label="Sort products"
                  className="px-3 py-2.5 rounded-xl border border-slate-700 text-xs sm:text-sm bg-slate-800 font-semibold text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#FF9900]"
                >
                  <option value="popularity">Sort: Popularity</option>
                  <option value="price_asc">Price: Low to High</option>
                  <option value="price_desc">Price: High to Low</option>
                  <option value="newest">Sort: New Arrivals</option>
                </select>

                <button
                  type="button"
                  onClick={() => setFiltersExpanded((prev) => !prev)}
                  className={`inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl border text-xs sm:text-sm font-bold whitespace-nowrap transition-colors ${
                    filtersExpanded
                      ? 'bg-[#FF9900] border-[#FF9900] text-slate-950'
                      : 'border-slate-700 bg-slate-800 text-slate-100 hover:bg-slate-700'
                  }`}
                >
                  <SlidersHorizontal className="w-4 h-4" />
                  Filters
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setWishlistOnly((prev) => !prev);
                    scrollToSection('shop-catalog');
                  }}
                  className={`inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl border text-xs sm:text-sm font-bold whitespace-nowrap transition-colors ${
                    wishlistOnly
                      ? 'bg-[#FF9900] border-[#FF9900] text-slate-950'
                      : 'border-slate-700 bg-slate-800 text-slate-100 hover:bg-slate-700'
                  }`}
                >
                  <Heart className={`w-4 h-4 ${wishlistOnly ? 'fill-slate-950' : 'text-[#FF9900]'}`} />
                  Wishlist ({wishlist.length})
                </button>
              </div>
            </div>

            {filtersExpanded && (
              <div className="bg-white text-slate-900 border-t border-slate-200">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-600 mb-1">
                      Category
                    </label>
                    <select
                      value={selectedCategoryId}
                      onChange={(e) => setSelectedCategoryId(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm bg-white"
                    >
                      <option value="all">{t.allCategories}</option>
                      {activeCategories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {lang === 'ur' && c.nameUrdu ? c.nameUrdu : c.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-600 mb-1">
                      Brand
                    </label>
                    <select
                      value={selectedBrand}
                      onChange={(e) => setSelectedBrand(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm bg-white"
                    >
                      <option value="all">All Brands</option>
                      {availableBrands.map((brand) => (
                        <option key={brand} value={brand}>
                          {brand}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-600 mb-1">
                      Max Price: {maxPriceFilter > 0 ? formatINR(maxPriceFilter) : 'Any'}
                    </label>
                    <input
                      type="range"
                      min={0}
                      max={Math.max(2000, maxCatalogPrice)}
                      step={50}
                      value={maxPriceFilter}
                      onChange={(e) => setMaxPriceFilter(Number(e.target.value))}
                      className="w-full accent-[#FF9900]"
                    />
                  </div>

                  <div className="flex items-end justify-between gap-2 pb-1">
                    <label className="inline-flex items-center gap-2 text-xs font-bold text-slate-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={inStockOnly}
                        onChange={(e) => setInStockOnly(e.target.checked)}
                        className="accent-[#FF9900]"
                      />
                      In Stock Only
                    </label>
                    <button
                      type="button"
                      onClick={resetAllFilters}
                      className="text-xs font-bold text-[#E68A00] hover:underline"
                    >
                      Reset All
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </header>

      {/* Order Confirmation Banner */}
      {orderConfirmation && (
        <div className="bg-emerald-50 border-b border-emerald-200 px-4 py-3">
          <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 text-sm text-emerald-900">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
              <span>
                Order <strong className="font-mono">{orderConfirmation.orderNumber}</strong> placed
                successfully for <strong className="tabular-nums">{formatINR(orderConfirmation.totalAmount)}</strong>!
                We will confirm from Main Bazar, Sopore shortly.
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setTrackingOrderId(orderConfirmation.orderNumber);
                  setViewMode('track');
                  setOrderConfirmation(null);
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                className="px-4 py-1.5 rounded-full bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 whitespace-nowrap"
              >
                Track Order
              </button>
              <button
                type="button"
                onClick={() => setOrderConfirmation(null)}
                className="p-1 text-emerald-700 hover:text-emerald-900"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Order Tracking View */}
      {viewMode === 'track' ? (
        <main className="flex-1 bg-[#F3F5F8]">
          <OrderTrackingPage
            userId={firebaseUser?.uid || ''}
            isAdmin={isAdminUser}
            recentOrders={orders}
            emailLogs={emailLogs}
            settings={settings}
            lang={lang}
            initialOrderId={trackingOrderId}
            onBackToStore={() => setViewMode('store')}
            onOpenAccount={() => setViewMode('account')}
          />
        </main>
      ) : viewMode === 'account' ? (
        /* Account View */
        <main className="flex-1 bg-[#F3F5F8]">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-6 flex items-center justify-between">
            <button
              type="button"
              onClick={() => setViewMode('store')}
              className="inline-flex items-center gap-1.5 text-sm font-bold text-[#131921] hover:text-[#FF9900] transition-colors"
            >
              ← Back to Storefront
            </button>
            {isAdminUser && (
              <button
                type="button"
                onClick={() => setViewMode('admin')}
                className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-[#131921] text-white text-xs font-bold hover:bg-slate-800"
              >
                <ShieldCheck className="w-4 h-4 text-[#FF9900]" />
                Open Admin Dashboard
              </button>
            )}
          </div>
          <CustomerAccountView
            profile={userProfile}
            orders={orders}
            products={products}
            settings={settings}
            onSignOut={handleSignOut}
            onOpenTrackOrder={(ordNum) => {
              if (ordNum) setTrackingOrderId(ordNum);
              setViewMode('track');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
          />
        </main>
      ) : (
        /* Customer Storefront (Screens 3, 4 & 5) */
        <main className="flex-1">
          {/* Dark Navy Rounded Hero Deal Card (Screen 3 & 5 Style) */}
          <section className="max-w-7xl mx-auto px-4 sm:px-6 pt-5 sm:pt-7">
            <div className="bg-gradient-to-br from-[#0B1324] via-[#13203B] to-[#1E293B] text-white rounded-3xl overflow-hidden shadow-lg p-6 sm:p-8 lg:p-10 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center relative">
              <div className="lg:col-span-6 space-y-4 relative z-10">
                <div className="flex flex-col items-start gap-3">
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/10 border border-white/15 text-[11px] sm:text-xs font-semibold text-[#FF9900]">
                    <MapPin className="w-3.5 h-3.5 shrink-0" />
                    <span>Main Bazar, near Jamia Masjid, Sopore · PIN 193201</span>
                  </div>

                  <div className="inline-flex items-center gap-2 px-3.5 py-2 rounded-2xl bg-[#FF9900]/15 border border-[#FF9900]/30 text-xs text-amber-100 font-medium">
                    <span>
                      Free delivery across Main Bazar Sopore (193201) on orders above ₹999 ·{' '}
                      <strong className="text-[#FF9900] font-mono">Code SOPORE50</strong>
                    </span>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3 pt-1">
                  <button
                    type="button"
                    onClick={() => scrollToSection('shop-catalog')}
                    className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-[#FF9900] text-slate-950 text-sm font-extrabold hover:bg-[#E68A00] transition-colors whitespace-nowrap shadow-sm"
                  >
                    <ShoppingBag className="w-4 h-4" />
                    {t.shopNow}
                    <ArrowRight className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => scrollToSection('store-location')}
                    className="inline-flex items-center gap-2 px-5 py-3 rounded-full border border-white/25 bg-white/10 text-white text-sm font-bold hover:bg-white/15 transition-colors whitespace-nowrap"
                  >
                    <MapPin className="w-4 h-4 text-[#FF9900]" />
                    Sopore Store &amp; Delivery
                  </button>
                </div>

                <div className="grid grid-cols-3 gap-4 pt-5 border-t border-white/10 text-xs text-slate-300">
                  <div>
                    <p className="font-extrabold text-white text-sm tabular-nums">
                      {activeCategories.length}+ Categories
                    </p>
                    <p className="mt-0.5 text-slate-400">Pulses, Atta, Oils &amp; Feed</p>
                  </div>
                  <div>
                    <p className="font-extrabold text-white text-sm">Same-Day Sopore</p>
                    <p className="mt-0.5 text-slate-400">Main Bazar 193201 Delivery</p>
                  </div>
                  <div>
                    <p className="font-extrabold text-white text-sm tabular-nums">
                      {settings.openingHours} – {settings.closingHours}
                    </p>
                    <p className="mt-0.5 text-slate-400">Open Daily (IST)</p>
                  </div>
                </div>
              </div>

              <div className="lg:col-span-6 relative z-10">
                <div className="relative h-60 sm:h-72 lg:h-80 rounded-2xl overflow-hidden border border-white/15 shadow-xl bg-slate-900">
                  <img
                    src={primaryBanner?.imageUrl || STORE_IMAGES.hero}
                    alt={primaryBanner?.title || 'KUKA TRADERS Grocery Store Sopore'}
                    className="w-full h-full object-cover"
                  />
                  {primaryBanner && (
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-[#0B1324]/95 via-[#0B1324]/60 to-transparent p-5 text-white">
                      <span className="inline-block px-2.5 py-0.5 rounded-full bg-[#FF9900] text-slate-950 text-[10px] font-extrabold uppercase tracking-wide mb-1.5">
                        Featured Offer
                      </span>
                      <p className="text-sm sm:text-base font-extrabold">
                        {primaryBanner.title}
                      </p>
                      <p className="text-xs text-slate-200 mt-0.5 line-clamp-2">
                        {primaryBanner.subtitle}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </section>

          {/* Screen 3 Circular Quick Action Row */}
          <section className="max-w-7xl mx-auto px-4 sm:px-6 pt-6">
            <div className="grid grid-cols-4 gap-2 sm:gap-4 max-w-2xl mx-auto">
              <button
                type="button"
                onClick={() => {
                  setShowcaseTab('offers');
                  scrollToSection('shop-catalog');
                }}
                className="flex flex-col items-center gap-1.5 p-2 rounded-2xl hover:bg-white/70 transition-colors"
              >
                <div className="w-12 h-12 rounded-full bg-[#131921] text-[#FF9900] flex items-center justify-center shadow-xs">
                  <Star className="w-5 h-5 fill-[#FF9900]" />
                </div>
                <span className="text-xs font-bold text-slate-800">Deals</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowcaseTab('essentials');
                  scrollToSection('shop-catalog');
                }}
                className="flex flex-col items-center gap-1.5 p-2 rounded-2xl hover:bg-white/70 transition-colors"
              >
                <div className="w-12 h-12 rounded-full bg-[#FF9900] text-slate-950 flex items-center justify-center shadow-xs">
                  <ShoppingBag className="w-5 h-5" />
                </div>
                <span className="text-xs font-bold text-slate-800">Essentials</span>
              </button>
              <button
                type="button"
                onClick={() => scrollToSection('categories-section')}
                className="flex flex-col items-center gap-1.5 p-2 rounded-2xl hover:bg-white/70 transition-colors"
              >
                <div className="w-12 h-12 rounded-full bg-white border border-slate-200 text-[#131921] flex items-center justify-center shadow-xs">
                  <LayoutGrid className="w-5 h-5" />
                </div>
                <span className="text-xs font-bold text-slate-800">Categories</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setViewMode('track');
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                className="flex flex-col items-center gap-1.5 p-2 rounded-2xl hover:bg-white/70 transition-colors"
              >
                <div className="w-12 h-12 rounded-full bg-emerald-600 text-white flex items-center justify-center shadow-xs">
                  <Truck className="w-5 h-5" />
                </div>
                <span className="text-xs font-bold text-slate-800">Track Order</span>
              </button>
            </div>
          </section>

          {/* Screen 4 Shop by Category Cards Grid */}
          <section id="categories-section" className="max-w-7xl mx-auto px-4 sm:px-6 pt-8">
            <div className="flex items-end justify-between mb-4">
              <div>
                <h2 className="font-display text-xl sm:text-2xl font-extrabold text-slate-900">
                  Categories
                </h2>
                <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
                  Kitchen staples, cooking oils, snacks, household care &amp; cattle feed
                </p>
              </div>
              {selectedCategoryId !== 'all' && (
                <button
                  type="button"
                  onClick={() => setSelectedCategoryId('all')}
                  className="text-xs font-bold text-[#E68A00] hover:underline whitespace-nowrap"
                >
                  See All Categories →
                </button>
              )}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3.5">
              {activeCategories.map((cat) => {
                const isSelected = selectedCategoryId === cat.id;
                const count = visibleProducts.filter((p) => p.categoryId === cat.id).length;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => {
                      setSelectedCategoryId(isSelected ? 'all' : cat.id);
                      scrollToSection('shop-catalog');
                    }}
                    className={`group text-left rounded-2xl border p-3 transition-all shadow-xs ${
                      isSelected
                        ? 'bg-amber-50/70 border-[#FF9900] ring-2 ring-[#FF9900]'
                        : 'bg-white border-slate-200/80 hover:border-slate-300 hover:shadow-md'
                    }`}
                  >
                    <div className="aspect-[16/10] rounded-xl overflow-hidden bg-[#F5F7FA] mb-2.5">
                      <img
                        src={cat.imageUrl || STORE_IMAGES.pulsesRice}
                        alt={cat.name}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                    </div>
                    <p className="text-xs sm:text-sm font-bold text-slate-900 line-clamp-1">
                      {lang === 'ur' && cat.nameUrdu ? cat.nameUrdu : cat.name}
                    </p>
                    <p className="text-[11px] text-slate-500 mt-0.5 tabular-nums">
                      {count} items
                    </p>
                  </button>
                );
              })}
            </div>
          </section>

          {/* Main Product Catalog (Screens 3 & 5) */}
          <section id="shop-catalog" className="max-w-7xl mx-auto px-4 sm:px-6 pt-10 pb-12">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-5">
              <div>
                <h2 className="font-display text-xl sm:text-2xl font-extrabold text-slate-900">
                  Recommended for You
                </h2>
                <p className="text-xs text-slate-500 tabular-nums mt-0.5">
                  Showing {filteredProducts.length} of {visibleProducts.length} products
                </p>
              </div>

              {/* Screen 4 & 5 Rounded-Full Pill Tabs */}
              <div className="flex items-center gap-2 overflow-x-auto pb-1">
                {(
                  [
                    { id: 'all', label: t.allProductsTab },
                    { id: 'featured', label: t.featuredTab },
                    { id: 'best_sellers', label: t.bestSellersTab },
                    { id: 'new_arrivals', label: t.newArrivalsTab },
                    { id: 'offers', label: t.offersTab },
                    { id: 'essentials', label: t.essentialsTab },
                  ] as Array<{ id: ShowcaseTab; label: string }>
                ).map((tab) => {
                  const active = showcaseTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setShowcaseTab(tab.id)}
                      className={`px-4 py-2 rounded-full text-xs font-bold whitespace-nowrap transition-colors shadow-xs ${
                        active
                          ? 'bg-[#FF9900] text-slate-950'
                          : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      {tab.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {!catalogLoaded && products.length === 0 ? (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-5">
                {Array.from({ length: 8 }).map((_, idx) => (
                  <div
                    key={idx}
                    className="bg-white border border-slate-200/80 rounded-2xl p-4 h-72 animate-pulse"
                  />
                ))}
              </div>
            ) : filteredProducts.length === 0 ? (
              <div className="bg-white border border-slate-200/80 rounded-3xl p-10 text-center shadow-xs">
                <Package className="w-10 h-10 text-slate-400 mx-auto mb-3" />
                <h3 className="text-base font-extrabold text-slate-900">
                  No matching grocery products found
                </h3>
                <p className="text-sm text-slate-600 mt-1">
                  Try clearing your search term or selecting another category.
                </p>
                <button
                  type="button"
                  onClick={resetAllFilters}
                  className="mt-4 px-5 py-2.5 rounded-full bg-[#FF9900] text-slate-950 text-sm font-extrabold hover:bg-[#E68A00]"
                >
                  Reset Filters
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-5">
                {filteredProducts.map((product) => (
                  <ProductCard
                    key={product.id}
                    product={product}
                    lang={lang}
                    whatsappNumber={settings.whatsappNumber}
                    isWishlisted={wishlist.includes(product.id)}
                    cartQuantity={cartCountMap[product.id] || 0}
                    onToggleWishlist={handleToggleWishlist}
                    onAddToCart={(p) => handleAddToCart(p, 1)}
                    onBuyNow={(p) => handleBuyNow(p, 1)}
                    onOpenDetail={setSelectedProduct}
                  />
                ))}
              </div>
            )}
          </section>

          {/* Secondary Promo Banners */}
          {activeBanners.length > 1 && (
            <section className="max-w-7xl mx-auto px-4 sm:px-6 pb-12">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {activeBanners.slice(1).map((b) => (
                  <div
                    key={b.id}
                    className="bg-white border border-slate-200/80 rounded-2xl overflow-hidden flex flex-col sm:flex-row items-stretch shadow-xs"
                  >
                    <div className="sm:w-44 h-40 sm:h-auto shrink-0 bg-[#F5F7FA]">
                      <img src={b.imageUrl} alt={b.title} className="w-full h-full object-cover" />
                    </div>
                    <div className="p-5 flex flex-col justify-between">
                      <div>
                        <h3 className="font-bold text-slate-900 text-base">{b.title}</h3>
                        <p className="text-xs sm:text-sm text-slate-600 mt-1">{b.subtitle}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          if (b.targetCategory) setSelectedCategoryId(b.targetCategory);
                          scrollToSection('shop-catalog');
                        }}
                        className="mt-4 self-start inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-[#FF9900] text-slate-950 text-xs font-extrabold hover:bg-[#E68A00]"
                      >
                        {b.ctaText || 'Explore'}
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Sopore Store Location & Delivery Zones Band */}
          <section id="store-location" className="max-w-7xl mx-auto px-4 sm:px-6 pb-12 space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
              <div className="lg:col-span-7">
                <SoporeStoreMap settings={settings} getDirectionsLabel={t.getDirections} />
              </div>

              <div className="lg:col-span-5 bg-white border border-slate-200/80 rounded-2xl shadow-xs p-6 flex flex-col justify-between">
                <div>
                  <div className="flex items-center gap-2 text-xs font-bold text-[#E68A00]">
                    <Truck className="w-4 h-4" />
                    Sopore &amp; Baramulla Delivery
                  </div>
                  <h2 className="font-display text-xl font-extrabold text-slate-900 mt-1">
                    Delivery Zones &amp; Store Hours
                  </h2>
                  <p className="text-xs text-slate-600 mt-1">
                    Free delivery on orders above <strong className="tabular-nums">{formatINR(settings.freeDeliveryThreshold)}</strong> ·
                    Min order <strong className="tabular-nums">{formatINR(settings.minOrderAmount)}</strong>
                  </p>

                  <div className="mt-4 border-t border-slate-100">
                    <table className="w-full text-xs text-left">
                      <thead className="text-slate-500 border-b border-slate-100">
                        <tr>
                          <th className="py-2.5 pr-3 font-semibold">Locality</th>
                          <th className="py-2.5 px-3 font-semibold">ETA</th>
                          <th className="py-2.5 pl-3 font-semibold text-right">Fee</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {settings.deliveryZones.map((z) => (
                          <tr key={z.name}>
                            <td className="py-2.5 pr-3 font-semibold text-slate-900">{z.name}</td>
                            <td className="py-2.5 px-3 text-slate-600">{z.estimatedTime}</td>
                            <td className={`py-2.5 pl-3 text-right font-mono font-bold tabular-nums ${z.charge === 0 ? 'text-emerald-600' : 'text-slate-900'}`}>
                              {z.charge === 0 ? 'FREE' : formatINR(z.charge)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="mt-5 pt-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-600">
                  <span className="inline-flex items-center gap-1.5 font-semibold text-slate-800 tabular-nums">
                    <Clock className="w-4 h-4 text-[#FF9900]" />
                    {t.openHours}: {settings.openingHours} – {settings.closingHours}
                  </span>
                  <a
                    href={buildWhatsAppLink(
                      settings.whatsappNumber,
                      'Assalamu Alaikum KUKA TRADERS, I want to check delivery availability for my area in Sopore.'
                    )}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-bold text-emerald-700 hover:underline"
                  >
                    Ask Delivery ETA
                  </a>
                </div>
              </div>
            </div>
          </section>

          {/* Verified Customer Reviews */}
          <section className="max-w-7xl mx-auto px-4 sm:px-6 pb-12">
            <div className="flex items-end justify-between mb-5">
              <div>
                <h2 className="font-display text-xl sm:text-2xl font-extrabold text-slate-900">
                  Customer Reviews
                </h2>
                <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
                  Verified reviews from KUKA TRADERS Sopore shoppers
                </p>
              </div>
            </div>

            {approvedReviews.length === 0 ? (
              <div className="bg-white border border-slate-200/80 rounded-2xl shadow-xs p-6 text-sm text-slate-600 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <span>
                  Reviews appear here once customers verify a purchase and an admin approves their feedback. Click any product to share your review!
                </span>
                <button
                  type="button"
                  onClick={() => scrollToSection('shop-catalog')}
                  className="px-4 py-2 rounded-full bg-[#131921] text-white text-xs font-bold hover:bg-slate-800 self-start whitespace-nowrap"
                >
                  Browse Products
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {approvedReviews.slice(0, 6).map((rev) => (
                  <div
                    key={rev.id}
                    className="bg-white border border-slate-200/80 rounded-2xl shadow-xs p-5 flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <div className="flex items-center gap-0.5 text-[#FF9900]">
                          {Array.from({ length: 5 }).map((_, i) => (
                            <Star
                              key={i}
                              className={`w-4 h-4 ${i < rev.rating ? 'fill-[#FF9900]' : 'text-slate-200'}`}
                            />
                          ))}
                        </div>
                        {rev.verifiedPurchase && (
                          <span className="text-[11px] font-bold text-emerald-600">
                            Verified Purchase
                          </span>
                        )}
                      </div>
                      <p className="text-xs font-bold text-[#E68A00] mb-1">
                        {rev.productName}
                      </p>
                      <p className="text-sm text-slate-700 leading-relaxed">{rev.comment}</p>
                      {rev.adminReply && (
                        <div className="mt-3 pt-2.5 border-t border-slate-100 text-xs text-slate-600">
                          <span className="font-bold text-slate-900">KUKA TRADERS: </span>
                          {rev.adminReply}
                        </div>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 mt-4 pt-3 border-t border-slate-100">
                      {rev.userName} · {formatISTDateTime(rev.createdAt)}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* About KUKA TRADERS & Interactive FAQs */}
          <section id="about-section" className="max-w-7xl mx-auto px-4 sm:px-6 pb-8">
            <div className="bg-white border border-slate-200/80 rounded-3xl shadow-xs grid grid-cols-1 lg:grid-cols-12 divide-y lg:divide-y-0 lg:divide-x divide-slate-200 overflow-hidden">
              <div className="lg:col-span-5 p-6 sm:p-8 flex flex-col justify-between">
                <div>
                  <h2 className="font-display text-xl sm:text-2xl font-extrabold text-slate-900">
                    {settings.aboutUsTitle}
                  </h2>
                  <div className="mt-4 space-y-3 text-sm text-slate-700 leading-relaxed">
                    {settings.aboutUsParagraphs.map((para, idx) => (
                      <p key={idx}>{para}</p>
                    ))}
                  </div>
                </div>
                <div className="mt-6 pt-5 border-t border-slate-100 grid grid-cols-2 gap-6 text-xs">
                  <div>
                    <p className="font-bold text-slate-900">Transparent Pricing</p>
                    <p className="text-slate-600 mt-0.5">Clear INR billing &amp; no hidden markups</p>
                  </div>
                  <div>
                    <p className="font-bold text-slate-900">Household &amp; Farm Feed</p>
                    <p className="text-slate-600 mt-0.5">Daily groceries plus livestock feed</p>
                  </div>
                </div>
              </div>

              <div className="lg:col-span-7 p-6 sm:p-8">
                <h2 className="font-display text-xl sm:text-2xl font-extrabold text-slate-900 mb-4">
                  Frequently Asked Questions
                </h2>
                <div className="divide-y divide-slate-100">
                  {faqs
                    .filter((f) => f.isActive)
                    .map((faq) => {
                      const isOpen = openFaqId === faq.id;
                      return (
                        <div key={faq.id} className="py-3.5">
                          <button
                            type="button"
                            onClick={() => setOpenFaqId(isOpen ? null : faq.id)}
                            className="w-full flex items-center justify-between gap-4 text-left"
                          >
                            <span className="text-sm font-bold text-slate-900">
                              {faq.question}
                            </span>
                            {isOpen ? (
                              <ChevronUp className="w-4 h-4 text-slate-500 shrink-0" />
                            ) : (
                              <ChevronDown className="w-4 h-4 text-slate-500 shrink-0" />
                            )}
                          </button>
                          {isOpen && (
                            <p className="mt-2 text-sm text-slate-600 leading-relaxed">
                              {faq.answer}
                            </p>
                          )}
                        </div>
                      );
                    })}
                </div>
              </div>
            </div>
          </section>
        </main>
      )}

      {/* Footer & Contact (Midnight Navy) */}
      <footer
        id="contact-section"
        className="mt-16 bg-[#131921] text-slate-300 border-t border-slate-800"
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-12 grid grid-cols-1 md:grid-cols-4 gap-8">
          <div className="md:col-span-2 space-y-3">
            <div className="inline-flex items-center gap-2 bg-white px-3.5 py-2 rounded-xl shadow-xs">
              <KukaLogo logoUrl={settings.logoUrl} storeName={settings.storeName} />
            </div>
            <p className="text-sm text-slate-400 max-w-md leading-relaxed">
              {settings.tagline} Serving Sopore and nearby Baramulla neighborhoods with groceries,
              cooking oils, tea, household cleaning essentials, and cattle feed.
            </p>
            <div className="flex flex-wrap gap-3 pt-1">
              <a
                href={buildWhatsAppLink(
                  settings.whatsappNumber,
                  'Assalamu Alaikum KUKA TRADERS, I have a question about an order.'
                )}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700"
              >
                <MessageCircle className="w-4 h-4" />
                WhatsApp {settings.phone}
              </a>
              <a
                href={`tel:${settings.phone.replace(/\s+/g, '')}`}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-slate-700 text-slate-200 text-xs font-bold hover:bg-slate-800"
              >
                <Phone className="w-4 h-4" />
                Call Store
              </a>
            </div>
          </div>

          <div className="space-y-2.5 text-sm">
            <h3 className="font-bold text-white">Store Contact</h3>
            <p className="flex items-start gap-2 text-xs text-slate-400">
              <MapPin className="w-4 h-4 text-[#FF9900] shrink-0 mt-0.5" />
              <span>{settings.address} — {settings.pinCode}</span>
            </p>
            <p className="flex items-center gap-2 text-xs text-slate-400">
              <Phone className="w-4 h-4 text-[#FF9900] shrink-0" />
              <span className="tabular-nums">{settings.phone}</span>
            </p>
            <p className="flex items-center gap-2 text-xs text-slate-400">
              <Mail className="w-4 h-4 text-[#FF9900] shrink-0" />
              <span>{settings.email}</span>
            </p>
            <p className="flex items-center gap-2 text-xs text-slate-400">
              <Clock className="w-4 h-4 text-[#FF9900] shrink-0" />
              <span className="tabular-nums">
                {settings.openingHours} – {settings.closingHours} IST
              </span>
            </p>
          </div>

          <div className="space-y-2 text-xs">
            <h3 className="text-sm font-bold text-white">Policies &amp; Portal</h3>
            <button
              type="button"
              onClick={() => {
                setViewMode('track');
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              className="block text-slate-200 hover:text-[#FF9900] font-bold"
            >
              Track Order by ID
            </button>
            <button
              type="button"
              onClick={() => setActivePolicy('return')}
              className="block text-slate-400 hover:text-white"
            >
              Return &amp; Exchange Policy
            </button>
            <button
              type="button"
              onClick={() => setActivePolicy('privacy')}
              className="block text-slate-400 hover:text-white"
            >
              Privacy Policy
            </button>
            <button
              type="button"
              onClick={() => setActivePolicy('terms')}
              className="block text-slate-400 hover:text-white"
            >
              Terms &amp; Conditions
            </button>
            <button
              type="button"
              onClick={() => {
                if (isAdminUser) {
                  setViewMode('admin');
                } else {
                  setAuthModalOpen(true);
                }
              }}
              className="inline-flex items-center gap-1.5 pt-2 text-[#FF9900] hover:text-amber-300 font-bold"
            >
              <Lock className="w-3.5 h-3.5" />
              {isAdminUser ? 'Open Admin Dashboard' : 'Admin Sign In'}
            </button>
          </div>
        </div>

        <div className="border-t border-slate-800 py-4 px-4 text-center text-xs text-slate-500">
          © {new Date().getFullYear()} KUKA TRADERS · Main Bazar, near Jamia Masjid, Sopore · PIN 193201 · All prices in INR (₹)
        </div>
      </footer>

      {/* Mobile Bottom Navigation (Screens 3 & 10 style) */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-slate-200 h-16 px-2 grid grid-cols-5 items-center shadow-lg">
        <button
          type="button"
          onClick={() => {
            setViewMode('store');
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
          className={`flex flex-col items-center justify-center gap-0.5 text-[11px] font-bold ${
            viewMode === 'store' ? 'text-[#FF9900]' : 'text-slate-500'
          }`}
        >
          <Home className="w-5 h-5" />
          <span>Home</span>
        </button>
        <button
          type="button"
          onClick={() => scrollToSection('categories-section')}
          className="flex flex-col items-center justify-center gap-0.5 text-[11px] font-semibold text-slate-500"
        >
          <LayoutGrid className="w-5 h-5" />
          <span>Categories</span>
        </button>
        <button
          type="button"
          onClick={() => setCartDrawerOpen(true)}
          className="relative flex flex-col items-center justify-center gap-0.5 text-[11px] font-semibold text-slate-600"
        >
          <ShoppingCart className="w-5 h-5 text-[#FF9900]" />
          <span>Cart ({cartCount})</span>
        </button>
        <button
          type="button"
          onClick={() => {
            setViewMode('track');
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
          className={`flex flex-col items-center justify-center gap-0.5 text-[11px] font-bold ${
            viewMode === 'track' ? 'text-[#FF9900]' : 'text-slate-500'
          }`}
        >
          <Package className="w-5 h-5" />
          <span>Track</span>
        </button>
        <button
          type="button"
          onClick={() => {
            if (isAdminUser) setViewMode('admin');
            else if (firebaseUser) setViewMode('account');
            else setAuthModalOpen(true);
          }}
          className={`flex flex-col items-center justify-center gap-0.5 text-[11px] font-bold ${
            viewMode === 'account' ? 'text-[#FF9900]' : 'text-slate-500'
          }`}
        >
          <UserIcon className="w-5 h-5" />
          <span>{isAdminUser ? 'Admin' : 'Account'}</span>
        </button>
      </nav>

      {/* Floating WhatsApp Support Button */}
      <a
        href={buildWhatsAppLink(
          settings.whatsappNumber,
          'Assalamu Alaikum KUKA TRADERS, I would like assistance with my grocery order.'
        )}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Chat with KUKA TRADERS on WhatsApp"
        className="fixed bottom-20 md:bottom-5 left-4 sm:left-5 z-40 inline-flex items-center gap-2 px-4 py-3 rounded-full bg-emerald-600 text-white shadow-lg hover:bg-emerald-700 transition-colors"
      >
        <MessageCircle className="w-5 h-5" />
        <span className="hidden sm:inline text-xs font-bold">WhatsApp</span>
      </a>

      {/* Gemini Store Assistant Chat */}
      <GeminiAssistantChat products={visibleProducts} language={lang} />

      {/* Modals & Drawers */}
      <AuthModal
        isOpen={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
      />

      <CartDrawer
        isOpen={cartDrawerOpen}
        cart={cart}
        products={visibleProducts}
        coupons={coupons}
        settings={settings}
        appliedCouponCode={appliedCouponCode}
        onApplyCoupon={setAppliedCouponCode}
        onUpdateQty={handleUpdateCartQty}
        onRemoveItem={handleRemoveCartItem}
        onClose={() => setCartDrawerOpen(false)}
        onProceedCheckout={() => {
          setCartDrawerOpen(false);
          if (!firebaseUser) {
            setAuthModalOpen(true);
          } else {
            setCheckoutOpen(true);
          }
        }}
      />

      <CheckoutModal
        isOpen={checkoutOpen}
        cart={directBuyCart ?? cart}
        products={visibleProducts}
        coupons={coupons}
        appliedCouponCode={appliedCouponCode}
        settings={settings}
        paymentConfig={paymentConfig}
        user={
          firebaseUser
            ? {
                uid: firebaseUser.uid,
                email: firebaseUser.email || '',
                displayName: firebaseUser.displayName || '',
                emailVerified: firebaseUser.emailVerified,
              }
            : null
        }
        profile={userProfile}
        onClose={() => {
          setCheckoutOpen(false);
          setDirectBuyCart(null);
        }}
        onOpenAuth={() => {
          setPendingCheckoutAfterAuth(true);
          setCheckoutOpen(false);
          setAuthModalOpen(true);
        }}
        onOrderSuccess={(info) => {
          if (!directBuyCart) {
            setCart([]);
            setAppliedCouponCode('');
          }
          setDirectBuyCart(null);
          setCheckoutOpen(false);
          setOrderConfirmation(info);
        }}
      />

      <ProductDetailModal
        product={selectedProduct}
        reviews={reviews}
        userOrders={orders}
        currentUser={
          firebaseUser
            ? {
                uid: firebaseUser.uid,
                name: userProfile?.name || firebaseUser.displayName || 'Customer',
                email: firebaseUser.email || userProfile?.email || '',
                emailVerified: firebaseUser.emailVerified,
              }
            : null
        }
        whatsappNumber={settings.whatsappNumber}
        isWishlisted={selectedProduct ? wishlist.includes(selectedProduct.id) : false}
        onClose={() => setSelectedProduct(null)}
        onAddToCart={handleAddToCart}
        onBuyNow={handleBuyNow}
        onToggleWishlist={handleToggleWishlist}
        onOpenAuth={() => setAuthModalOpen(true)}
      />

      {/* Policy Modal */}
      {activePolicy && (
        <div className="fixed inset-0 z-50 bg-[#0B1324]/65 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border border-slate-200 max-w-lg w-full p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-display text-lg font-extrabold text-slate-900">
                {activePolicy === 'return'
                  ? 'Return & Exchange Policy'
                  : activePolicy === 'privacy'
                    ? 'Privacy Policy'
                    : 'Terms & Conditions'}
              </h3>
              <button
                type="button"
                onClick={() => setActivePolicy(null)}
                className="p-2 rounded-full text-slate-500 hover:bg-slate-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-sm text-slate-700 leading-relaxed">
              {activePolicy === 'return'
                ? settings.returnPolicy
                : activePolicy === 'privacy'
                  ? settings.privacyPolicy
                  : settings.termsConditions}
            </p>
            <div className="mt-5 text-right">
              <button
                type="button"
                onClick={() => setActivePolicy(null)}
                className="px-5 py-2.5 rounded-full bg-[#FF9900] text-slate-950 text-xs font-extrabold hover:bg-[#E68A00]"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
