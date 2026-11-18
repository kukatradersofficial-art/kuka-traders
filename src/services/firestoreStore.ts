import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import type { User } from 'firebase/auth';
import {
  db,
  handleFirestoreError,
  isAuthorizedAdminEmail,
  OperationType,
} from '../firebase';
import {
  DEFAULT_PAYMENT_CONFIG,
  DEFAULT_STORE_SETTINGS,
  INITIAL_BANNERS,
  INITIAL_CATEGORIES,
  INITIAL_COUPONS,
  INITIAL_FAQS,
  INITIAL_PRICE_RESEARCH,
  INITIAL_PRODUCTS,
} from '../data/seedCatalog';
import type {
  Banner,
  Category,
  Coupon,
  FaqItem,
  Order,
  OrderItemSnapshot,
  OrderStatus,
  PaymentConfig,
  PaymentMethod,
  PaymentStatus,
  PriceAlert,
  PriceResearchItem,
  Product,
  Review,
  StoreSettings,
  UserProfile,
} from '../types';
import { slugifyId } from '../utils/format';

export async function ensureAdminRecord(user: User): Promise<void> {
  if (!user.email || !user.emailVerified || !isAuthorizedAdminEmail(user.email)) return;
  const path = `admins/${user.uid}`;
  try {
    const ref = doc(db, 'admins', user.uid);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      await setDoc(ref, {
        uid: user.uid,
        email: user.email.trim().toLowerCase(),
        name: user.displayName || 'KUKA Admin',
        role: 'admin',
        createdAt: serverTimestamp(),
      });
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function ensureUserProfile(user: User): Promise<UserProfile | null> {
  const path = `users/${user.uid}`;
  try {
    const ref = doc(db, 'users', user.uid);
    const snap = await getDoc(ref);
    if (snap.exists()) {
      return snap.data() as UserProfile;
    }
    if (!user.emailVerified) {
      return null;
    }
    const newProfile: Record<string, unknown> = {
      uid: user.uid,
      name: user.displayName || user.email?.split('@')[0] || 'Customer',
      email: user.email || '',
      phone: user.phoneNumber || '',
      role: 'customer',
      status: 'active',
      preferredLang: 'en',
      savedAddresses: [],
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    await setDoc(ref, newProfile);
    const created = await getDoc(ref);
    return created.data() as UserProfile;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function updateUserProfile(
  uid: string,
  updates: Pick<UserProfile, 'name' | 'phone' | 'savedAddresses' | 'preferredLang'>
): Promise<void> {
  const path = `users/${uid}`;
  try {
    await updateDoc(doc(db, 'users', uid), {
      name: updates.name.trim().slice(0, 120),
      phone: updates.phone.trim().slice(0, 20),
      savedAddresses: updates.savedAddresses.slice(0, 5),
      preferredLang: updates.preferredLang,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function seedDatabaseIfEmpty(force = false): Promise<boolean> {
  const settingsPath = 'settings/store_config';
  try {
    const settingsSnap = await getDoc(doc(db, 'settings', 'store_config'));
    const catsSnap = await getDocs(collection(db, 'categories'));
    if (!force && settingsSnap.exists() && !catsSnap.empty) {
      return false;
    }

    const batch = writeBatch(db);

    batch.set(doc(db, 'settings', 'store_config'), {
      ...DEFAULT_STORE_SETTINGS,
      updatedAt: serverTimestamp(),
    });

    for (const cat of INITIAL_CATEGORIES) {
      batch.set(doc(db, 'categories', cat.id), {
        name: cat.name,
        nameUrdu: cat.nameUrdu,
        slug: cat.slug,
        description: cat.description,
        imageUrl: cat.imageUrl,
        sortOrder: cat.sortOrder,
        isActive: cat.isActive,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    for (const prod of INITIAL_PRODUCTS) {
      batch.set(doc(db, 'products', prod.id), {
        name: prod.name,
        nameUrdu: prod.nameUrdu,
        description: prod.description,
        categoryId: prod.categoryId,
        categoryName: prod.categoryName,
        brand: prod.brand,
        sku: prod.sku,
        barcode: prod.barcode,
        imageUrl: prod.imageUrl,
        purchaseCost: prod.purchaseCost,
        sellingPrice: prod.sellingPrice,
        originalPrice: prod.originalPrice,
        packSize: prod.packSize,
        unit: prod.unit,
        stockQuantity: prod.stockQuantity,
        lowStockThreshold: prod.lowStockThreshold,
        discountPercent: prod.discountPercent,
        priceStatus: prod.priceStatus,
        isPublished: prod.isPublished,
        isFeatured: prod.isFeatured,
        isBestSeller: prod.isBestSeller,
        isNewArrival: prod.isNewArrival,
        isDailyEssential: prod.isDailyEssential,
        isDeleted: prod.isDeleted,
        salesCount: prod.salesCount,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    for (const pr of INITIAL_PRICE_RESEARCH) {
      batch.set(doc(db, 'priceResearch', pr.id), {
        productId: pr.productId,
        productName: pr.productName,
        brand: pr.brand,
        packSize: pr.packSize,
        unit: pr.unit,
        priceScope: pr.priceScope,
        mrp: pr.mrp,
        observedPrice: pr.observedPrice,
        purchaseCost: pr.purchaseCost,
        proposedSellingPrice: pr.proposedSellingPrice,
        sourceLabel: pr.sourceLabel,
        sourceUrl: pr.sourceUrl,
        locationMarket: pr.locationMarket,
        researchDate: pr.researchDate,
        verificationStatus: pr.verificationStatus,
        notes: pr.notes,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    for (const faq of INITIAL_FAQS) {
      batch.set(doc(db, 'faqs', faq.id), {
        question: faq.question,
        answer: faq.answer,
        sortOrder: faq.sortOrder,
        isActive: faq.isActive,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    for (const banner of INITIAL_BANNERS) {
      batch.set(doc(db, 'banners', banner.id), {
        title: banner.title,
        subtitle: banner.subtitle,
        imageUrl: banner.imageUrl,
        ctaText: banner.ctaText,
        targetCategory: banner.targetCategory,
        isActive: banner.isActive,
        sortOrder: banner.sortOrder,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    for (const coupon of INITIAL_COUPONS) {
      batch.set(doc(db, 'coupons', coupon.id), {
        code: coupon.code,
        description: coupon.description,
        discountType: coupon.discountType,
        discountValue: coupon.discountValue,
        minOrderAmount: coupon.minOrderAmount,
        isActive: coupon.isActive,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    await batch.commit();
    return true;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, settingsPath);
  }
}

export async function placeOrderTransaction(params: {
  userId: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  deliveryAddress: string;
  locality: string;
  landmark: string;
  pinCode: string;
  deliveryInstructions: string;
  cartItems: Array<{ productId: string; quantity: number }>;
  deliveryCharge: number;
  discountAmount: number;
  couponCode: string;
  paymentMethod: PaymentMethod;
  paymentReference: string;
}): Promise<{ orderId: string; orderNumber: string; totalAmount: number }> {
  const orderId = slugifyId('ord', 'ord');
  const orderNumber = `KT-${Date.now().toString().slice(-6)}`;
  const path = `orders/${orderId}`;

  try {
    const result = await runTransaction(db, async (tx) => {
      const productDocs: Array<{
        ref: ReturnType<typeof doc>;
        data: Product;
        qty: number;
      }> = [];

      for (const item of params.cartItems) {
        const prodRef = doc(db, 'products', item.productId);
        const prodSnap = await tx.get(prodRef);
        if (!prodSnap.exists()) {
          throw new Error(
            'Selected product is not yet synced in the live store database. Please ask an admin to sign in once or contact us on WhatsApp (+91 7006183435).'
          );
        }
        const prod = { id: prodSnap.id, ...(prodSnap.data() as Omit<Product, 'id'>) };
        if (!prod.isPublished || prod.isDeleted || prod.priceStatus !== 'approved' || prod.sellingPrice <= 0) {
          throw new Error(`${prod.name} is not currently published for online purchase.`);
        }
        if (prod.stockQuantity < item.quantity || item.quantity <= 0) {
          throw new Error(
            `Insufficient stock for ${prod.name}. Available: ${prod.stockQuantity}.`
          );
        }
        productDocs.push({ ref: prodRef, data: prod, qty: item.quantity });
      }

      let verifiedSubtotal = 0;
      const snapshotItems: OrderItemSnapshot[] = productDocs.map(({ data, qty }) => {
        const lineTotal = Number((data.sellingPrice * qty).toFixed(2));
        verifiedSubtotal += lineTotal;
        return {
          productId: data.id,
          name: data.name,
          brand: data.brand,
          packSize: data.packSize,
          unit: data.unit,
          sku: data.sku,
          imageUrl: data.imageUrl,
          unitPrice: data.sellingPrice,
          originalPrice: data.originalPrice,
          quantity: qty,
          lineTotal,
        };
      });

      const verifiedTotal = Math.max(
        0,
        Number((verifiedSubtotal + params.deliveryCharge - params.discountAmount).toFixed(2))
      );

      // Payment never auto-marked Paid on client!
      const initialPaymentStatus: PaymentStatus =
        params.paymentMethod === 'COD' ? 'COD Pending' : 'Pending';

      for (const { ref, data, qty } of productDocs) {
        const newStock = data.stockQuantity - qty;
        tx.update(ref, {
          stockQuantity: newStock,
          salesCount: (data.salesCount || 0) + qty,
          updatedAt: serverTimestamp(),
        });

        const logId = slugifyId(`${data.id}_deduct`, 'inv');
        tx.set(doc(db, 'inventory', logId), {
          productId: data.id,
          productName: data.name,
          changeType: 'order_deduction',
          quantityDelta: -qty,
          previousStock: data.stockQuantity,
          newStock,
          reason: `Order ${orderNumber}`,
          performedBy: params.userId,
          createdAt: serverTimestamp(),
        });
      }

      tx.set(doc(db, 'orders', orderId), {
        orderNumber,
        userId: params.userId,
        customerName: params.customerName.trim().slice(0, 120),
        customerEmail: params.customerEmail.trim().slice(0, 160),
        customerPhone: params.customerPhone.trim().slice(0, 20),
        deliveryAddress: params.deliveryAddress.trim().slice(0, 400),
        locality: params.locality.trim().slice(0, 120),
        landmark: params.landmark.trim().slice(0, 160),
        pinCode: params.pinCode.trim().slice(0, 6),
        deliveryInstructions: params.deliveryInstructions.trim().slice(0, 400),
        items: snapshotItems,
        subtotal: verifiedSubtotal,
        deliveryCharge: params.deliveryCharge,
        discountAmount: params.discountAmount,
        couponCode: params.couponCode.trim().slice(0, 40),
        totalAmount: verifiedTotal,
        paymentMethod: params.paymentMethod,
        paymentStatus: initialPaymentStatus,
        paymentReference: params.paymentReference.trim().slice(0, 120),
        orderStatus: 'Order Placed',
        adminNotes: '',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      const notifId = slugifyId(orderNumber, 'notif');
      tx.set(doc(db, 'notifications', notifId), {
        targetRole: 'admin',
        targetUserId: '',
        title: `New Order ${orderNumber}`,
        message: `${params.customerName.trim()} placed an order of ₹${verifiedTotal} (${params.locality}).`,
        type: 'order',
        isRead: false,
        createdAt: serverTimestamp(),
      });

      return { orderId, orderNumber, totalAmount: verifiedTotal };
    });

    return result;
  } catch (err) {
    if (err instanceof Error && !err.message.includes('Missing or insufficient permissions')) {
      throw err;
    }
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function customerCancelOrder(orderId: string): Promise<void> {
  const path = `orders/${orderId}`;
  try {
    await updateDoc(doc(db, 'orders', orderId), {
      orderStatus: 'Cancelled',
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function adminUpdateOrder(
  orderId: string,
  updates: {
    orderStatus?: OrderStatus;
    paymentStatus?: PaymentStatus;
    paymentReference?: string;
    adminNotes?: string;
  },
  orderUserId?: string,
  orderNumber?: string
): Promise<void> {
  const path = `orders/${orderId}`;
  try {
    await updateDoc(doc(db, 'orders', orderId), {
      ...updates,
      updatedAt: serverTimestamp(),
    });
    if (orderUserId && updates.orderStatus) {
      const notifId = slugifyId(`ord_upd_${orderId}`, 'notif');
      await setDoc(doc(db, 'notifications', notifId), {
        targetRole: 'customer',
        targetUserId: orderUserId,
        title: `Order ${orderNumber || ''} Updated`,
        message: `Your order status is now: ${updates.orderStatus}.`,
        type: 'order',
        isRead: false,
        createdAt: serverTimestamp(),
      });
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function adminCancelAndRestoreOrder(
  order: Order,
  adminUid: string
): Promise<void> {
  const path = `orders/${order.id}`;
  try {
    await runTransaction(db, async (tx) => {
      const orderRef = doc(db, 'orders', order.id);
      const orderSnap = await tx.get(orderRef);
      if (!orderSnap.exists()) throw new Error('Order not found.');
      const current = orderSnap.data() as Order;
      if (current.orderStatus === 'Cancelled') {
        throw new Error('Order is already cancelled.');
      }

      for (const item of current.items) {
        const prodRef = doc(db, 'products', item.productId);
        const prodSnap = await tx.get(prodRef);
        if (prodSnap.exists()) {
          const prod = prodSnap.data() as Product;
          const newStock = (prod.stockQuantity || 0) + item.quantity;
          tx.update(prodRef, {
            stockQuantity: newStock,
            updatedAt: serverTimestamp(),
          });
          const logId = slugifyId(`${item.productId}_restore`, 'inv');
          tx.set(doc(db, 'inventory', logId), {
            productId: item.productId,
            productName: item.name,
            changeType: 'order_restore',
            quantityDelta: item.quantity,
            previousStock: prod.stockQuantity || 0,
            newStock,
            reason: `Cancelled Order ${current.orderNumber}`,
            performedBy: adminUid,
            createdAt: serverTimestamp(),
          });
        }
      }

      tx.update(orderRef, {
        orderStatus: 'Cancelled',
        updatedAt: serverTimestamp(),
      });

      if (current.userId) {
        const notifId = slugifyId(`ord_cancel_${order.id}`, 'notif');
        tx.set(doc(db, 'notifications', notifId), {
          targetRole: 'customer',
          targetUserId: current.userId,
          title: `Order ${current.orderNumber || ''} Cancelled`,
          message: 'Your order status is now: Cancelled.',
          type: 'order',
          isRead: false,
          createdAt: serverTimestamp(),
        });
      }
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function saveProduct(
  product: Omit<Product, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }
): Promise<string> {
  const id = product.id || slugifyId(product.name, 'prod');
  const path = `products/${id}`;
  try {
    const ref = doc(db, 'products', id);
    const existing = await getDoc(ref);
    const payload = {
      name: product.name.trim().slice(0, 160),
      nameUrdu: product.nameUrdu.trim().slice(0, 160),
      description: product.description.trim().slice(0, 1500),
      categoryId: product.categoryId,
      categoryName: product.categoryName.slice(0, 100),
      brand: product.brand.trim().slice(0, 100),
      sku: product.sku.trim().slice(0, 64),
      barcode: product.barcode.trim().slice(0, 64),
      imageUrl: product.imageUrl.trim().slice(0, 500),
      purchaseCost: Number(product.purchaseCost) || 0,
      sellingPrice: Number(product.sellingPrice) || 0,
      originalPrice: Number(product.originalPrice) || 0,
      packSize: product.packSize.trim().slice(0, 64),
      unit: product.unit.trim().slice(0, 32),
      stockQuantity: Math.max(0, Number(product.stockQuantity) || 0),
      lowStockThreshold: Math.max(0, Number(product.lowStockThreshold) || 0),
      discountPercent: Math.min(100, Math.max(0, Number(product.discountPercent) || 0)),
      priceStatus: product.priceStatus,
      isPublished: Boolean(product.isPublished && product.priceStatus === 'approved' && product.sellingPrice > 0),
      isFeatured: Boolean(product.isFeatured),
      isBestSeller: Boolean(product.isBestSeller),
      isNewArrival: Boolean(product.isNewArrival),
      isDailyEssential: Boolean(product.isDailyEssential),
      isDeleted: Boolean(product.isDeleted),
      salesCount: Math.max(0, Number(product.salesCount) || 0),
      updatedAt: serverTimestamp(),
    };

    if (existing.exists()) {
      await updateDoc(ref, payload);
    } else {
      await setDoc(ref, { ...payload, createdAt: serverTimestamp() });
    }
    return id;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function deleteProductPermanently(productId: string): Promise<void> {
  const path = `products/${productId}`;
  try {
    await deleteDoc(doc(db, 'products', productId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

export async function toggleProductSoftDelete(productId: string, isDeleted: boolean): Promise<void> {
  const path = `products/${productId}`;
  try {
    await updateDoc(doc(db, 'products', productId), {
      isDeleted,
      isPublished: isDeleted ? false : undefined,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function adjustInventoryStock(params: {
  productId: string;
  quantityDelta: number;
  changeType: 'restock' | 'adjustment';
  reason: string;
  adminUid: string;
}): Promise<void> {
  const path = `products/${params.productId}`;
  try {
    await runTransaction(db, async (tx) => {
      const prodRef = doc(db, 'products', params.productId);
      const snap = await tx.get(prodRef);
      if (!snap.exists()) throw new Error('Product does not exist.');
      const prod = snap.data() as Product;
      const prev = prod.stockQuantity || 0;
      const next = Math.max(0, prev + params.quantityDelta);

      tx.update(prodRef, {
        stockQuantity: next,
        updatedAt: serverTimestamp(),
      });

      const logId = slugifyId(params.productId, 'inv');
      tx.set(doc(db, 'inventory', logId), {
        productId: params.productId,
        productName: prod.name,
        changeType: params.changeType,
        quantityDelta: next - prev,
        previousStock: prev,
        newStock: next,
        reason: params.reason.trim().slice(0, 300) || 'Admin stock adjustment',
        performedBy: params.adminUid,
        createdAt: serverTimestamp(),
      });
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function saveCategory(
  category: Omit<Category, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }
): Promise<string> {
  const id = category.id || slugifyId(category.name, 'cat');
  const path = `categories/${id}`;
  try {
    const ref = doc(db, 'categories', id);
    const existing = await getDoc(ref);
    const payload = {
      name: category.name.trim().slice(0, 100),
      nameUrdu: category.nameUrdu.trim().slice(0, 120),
      slug: category.slug.trim().slice(0, 100),
      description: category.description.trim().slice(0, 500),
      imageUrl: category.imageUrl.trim().slice(0, 500),
      sortOrder: Number(category.sortOrder) || 99,
      isActive: Boolean(category.isActive),
      updatedAt: serverTimestamp(),
    };
    if (existing.exists()) {
      await updateDoc(ref, payload);
    } else {
      await setDoc(ref, { ...payload, createdAt: serverTimestamp() });
    }
    return id;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function deleteCategory(id: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'categories', id));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `categories/${id}`);
  }
}

export async function savePriceResearch(
  item: Omit<PriceResearchItem, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }
): Promise<string> {
  const id = item.id || slugifyId(item.productName, 'pr');
  const path = `priceResearch/${id}`;
  try {
    const ref = doc(db, 'priceResearch', id);
    const existing = await getDoc(ref);
    const payload = {
      productId: item.productId.trim().slice(0, 128),
      productName: item.productName.trim().slice(0, 160),
      brand: item.brand.trim().slice(0, 100),
      packSize: item.packSize.trim().slice(0, 64),
      unit: item.unit.trim().slice(0, 32),
      priceScope: item.priceScope,
      mrp: Math.max(0, Number(item.mrp) || 0),
      observedPrice: Math.max(0, Number(item.observedPrice) || 0),
      purchaseCost: Math.max(0, Number(item.purchaseCost) || 0),
      proposedSellingPrice: Math.max(0, Number(item.proposedSellingPrice) || 0),
      sourceLabel: item.sourceLabel.trim().slice(0, 200),
      sourceUrl: item.sourceUrl.trim().slice(0, 500),
      locationMarket: item.locationMarket.trim().slice(0, 160),
      researchDate: item.researchDate.trim().slice(0, 40),
      verificationStatus: item.verificationStatus,
      notes: item.notes.trim().slice(0, 500),
      updatedAt: serverTimestamp(),
    };
    if (existing.exists()) {
      await updateDoc(ref, payload);
    } else {
      await setDoc(ref, { ...payload, createdAt: serverTimestamp() });
    }
    return id;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function approveAndPublishPrice(params: {
  researchItem: PriceResearchItem;
  purchaseCost: number;
  mrp: number;
  sellingPrice: number;
}): Promise<void> {
  const { researchItem, purchaseCost, mrp, sellingPrice } = params;
  if (sellingPrice <= 0) {
    throw new Error('Selling price must be greater than ₹0 before publishing.');
  }
  const discountPercent =
    mrp > sellingPrice ? Math.round(((mrp - sellingPrice) / mrp) * 100) : 0;

  const path = `priceResearch/${researchItem.id}`;
  try {
    const batch = writeBatch(db);
    batch.update(doc(db, 'priceResearch', researchItem.id), {
      purchaseCost,
      mrp,
      proposedSellingPrice: sellingPrice,
      verificationStatus: 'approved_published',
      updatedAt: serverTimestamp(),
    });

    if (researchItem.productId) {
      batch.update(doc(db, 'products', researchItem.productId), {
        purchaseCost,
        originalPrice: mrp,
        sellingPrice,
        discountPercent,
        priceStatus: 'approved',
        isPublished: true,
        updatedAt: serverTimestamp(),
      });
    }

    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function saveStoreSettings(settings: StoreSettings): Promise<void> {
  const path = 'settings/store_config';
  try {
    await setDoc(doc(db, 'settings', 'store_config'), {
      ...DEFAULT_STORE_SETTINGS,
      ...settings,
      logoUrl: (settings.logoUrl ?? DEFAULT_STORE_SETTINGS.logoUrl ?? '').trim().slice(0, 80000),
      codLabel: (settings.codLabel ?? DEFAULT_STORE_SETTINGS.codLabel ?? 'Cash on Delivery (COD)').trim().slice(0, 80),
      codInstructions: (settings.codInstructions ?? DEFAULT_STORE_SETTINGS.codInstructions ?? '').trim().slice(0, 240),
      upiLabel: (settings.upiLabel ?? DEFAULT_STORE_SETTINGS.upiLabel ?? 'UPI Payment (Merchant QR / Zap UPI)').trim().slice(0, 80),
      upiInstructions: (settings.upiInstructions ?? DEFAULT_STORE_SETTINGS.upiInstructions ?? '').trim().slice(0, 240),
      merchantUpiId: (settings.merchantUpiId ?? '').trim().slice(0, 120),
      merchantUpiName: (settings.merchantUpiName ?? '').trim().slice(0, 120),
      zapUpiMerchantId: (settings.zapUpiMerchantId ?? '').trim().slice(0, 120),
      zapUpiCreateUrl: (settings.zapUpiCreateUrl ?? DEFAULT_STORE_SETTINGS.zapUpiCreateUrl ?? '').trim().slice(0, 300),
      zapUpiVerifyUrl: (settings.zapUpiVerifyUrl ?? DEFAULT_STORE_SETTINGS.zapUpiVerifyUrl ?? '').trim().slice(0, 300),
      otherGatewayLabel: (settings.otherGatewayLabel ?? DEFAULT_STORE_SETTINGS.otherGatewayLabel).trim().slice(0, 80),
      otherGatewayInstructions: (settings.otherGatewayInstructions ?? DEFAULT_STORE_SETTINGS.otherGatewayInstructions ?? '').trim().slice(0, 240),
      orderStatusEmailsEnabled: settings.orderStatusEmailsEnabled !== false,
      emailNotifyStatuses: Array.isArray(settings.emailNotifyStatuses)
        ? settings.emailNotifyStatuses.slice(0, 6)
        : DEFAULT_STORE_SETTINGS.emailNotifyStatuses,
      emailReplyTo: (settings.emailReplyTo ?? DEFAULT_STORE_SETTINGS.emailReplyTo ?? '').trim().slice(0, 160),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function savePaymentConfig(
  config: PaymentConfig,
  currentStoreSettings?: StoreSettings
): Promise<void> {
  const path = 'settings/payment_config';
  try {
    const cleanConfig = {
      codEnabled: Boolean(config.codEnabled),
      codLabel: (config.codLabel.trim() || DEFAULT_PAYMENT_CONFIG.codLabel).slice(0, 80),
      codInstructions: config.codInstructions.trim().slice(0, 240),
      upiEnabled: Boolean(config.upiEnabled),
      upiLabel: (config.upiLabel.trim() || DEFAULT_PAYMENT_CONFIG.upiLabel).slice(0, 80),
      upiInstructions: config.upiInstructions.trim().slice(0, 240),
      upiVerificationMode:
        config.upiVerificationMode === 'manual_utr' ? 'manual_utr' : 'require_zap_upi',
      netBankingEnabled: Boolean(config.netBankingEnabled),
      netBankingLabel: (config.netBankingLabel.trim() || DEFAULT_PAYMENT_CONFIG.netBankingLabel).slice(0, 80),
      netBankingInstructions: config.netBankingInstructions.trim().slice(0, 240),
      netBankingRequireGateway: Boolean(config.netBankingRequireGateway),
      merchantUpiId: config.merchantUpiId.trim().slice(0, 120),
      merchantUpiName: config.merchantUpiName.trim().slice(0, 120),
      zapUpiEnvironment: config.zapUpiEnvironment === 'sandbox' ? 'sandbox' : 'production',
      zapUpiMerchantId: config.zapUpiMerchantId.trim().slice(0, 120),
      zapUpiCreateUrl: (
        config.zapUpiCreateUrl.trim() || DEFAULT_PAYMENT_CONFIG.zapUpiCreateUrl
      ).slice(0, 300),
      zapUpiVerifyUrl: (
        config.zapUpiVerifyUrl.trim() || DEFAULT_PAYMENT_CONFIG.zapUpiVerifyUrl
      ).slice(0, 300),
      updatedAt: serverTimestamp(),
    };

    const batch = writeBatch(db);
    batch.set(doc(db, 'settings', 'payment_config'), cleanConfig);

    if (currentStoreSettings) {
      batch.set(doc(db, 'settings', 'store_config'), {
        ...DEFAULT_STORE_SETTINGS,
        ...currentStoreSettings,
        logoUrl: (currentStoreSettings.logoUrl ?? DEFAULT_STORE_SETTINGS.logoUrl ?? '')
          .trim()
          .slice(0, 80000),
        codEnabled: cleanConfig.codEnabled,
        codLabel: cleanConfig.codLabel,
        codInstructions: cleanConfig.codInstructions,
        upiEnabled: cleanConfig.upiEnabled,
        upiLabel: cleanConfig.upiLabel,
        upiInstructions: cleanConfig.upiInstructions,
        merchantUpiId: cleanConfig.merchantUpiId,
        merchantUpiName: cleanConfig.merchantUpiName,
        zapUpiMerchantId: cleanConfig.zapUpiMerchantId,
        zapUpiCreateUrl: cleanConfig.zapUpiCreateUrl,
        zapUpiVerifyUrl: cleanConfig.zapUpiVerifyUrl,
        otherGatewayEnabled: cleanConfig.netBankingEnabled,
        otherGatewayLabel: cleanConfig.netBankingLabel,
        otherGatewayInstructions: cleanConfig.netBankingInstructions,
        orderStatusEmailsEnabled: currentStoreSettings.orderStatusEmailsEnabled !== false,
        emailNotifyStatuses: Array.isArray(currentStoreSettings.emailNotifyStatuses)
          ? currentStoreSettings.emailNotifyStatuses.slice(0, 6)
          : DEFAULT_STORE_SETTINGS.emailNotifyStatuses,
        emailReplyTo: (
          currentStoreSettings.emailReplyTo ??
          DEFAULT_STORE_SETTINGS.emailReplyTo ??
          ''
        )
          .trim()
          .slice(0, 160),
        updatedAt: serverTimestamp(),
      });
    }

    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function submitCustomerReview(params: {
  productId: string;
  productName: string;
  userId: string;
  userName: string;
  orderId: string;
  rating: number;
  comment: string;
  verifiedPurchase: boolean;
}): Promise<void> {
  const id = slugifyId(params.productId, 'rev');
  const path = `reviews/${id}`;
  try {
    await setDoc(doc(db, 'reviews', id), {
      productId: params.productId,
      productName: params.productName.slice(0, 160),
      userId: params.userId,
      userName: params.userName.slice(0, 120),
      orderId: params.orderId,
      rating: Math.min(5, Math.max(1, Math.round(params.rating))),
      comment: params.comment.trim().slice(0, 1000),
      verifiedPurchase: params.verifiedPurchase,
      status: 'pending',
      adminReply: '',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}

export async function moderateReview(
  reviewId: string,
  updates: Pick<Review, 'status' | 'adminReply'>
): Promise<void> {
  try {
    await updateDoc(doc(db, 'reviews', reviewId), {
      status: updates.status,
      adminReply: updates.adminReply.trim().slice(0, 600),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `reviews/${reviewId}`);
  }
}

export async function deleteReview(reviewId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'reviews', reviewId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `reviews/${reviewId}`);
  }
}

export async function saveFaq(
  faq: Omit<FaqItem, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }
): Promise<void> {
  const id = faq.id || slugifyId('faq', 'faq');
  const path = `faqs/${id}`;
  try {
    const ref = doc(db, 'faqs', id);
    const existing = await getDoc(ref);
    const payload = {
      question: faq.question.trim().slice(0, 300),
      answer: faq.answer.trim().slice(0, 1500),
      sortOrder: Number(faq.sortOrder) || 1,
      isActive: Boolean(faq.isActive),
      updatedAt: serverTimestamp(),
    };
    if (existing.exists()) {
      await updateDoc(ref, payload);
    } else {
      await setDoc(ref, { ...payload, createdAt: serverTimestamp() });
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function deleteFaq(id: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'faqs', id));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `faqs/${id}`);
  }
}

export async function saveBanner(
  banner: Omit<Banner, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }
): Promise<void> {
  const id = banner.id || slugifyId('banner', 'ban');
  const path = `banners/${id}`;
  try {
    const ref = doc(db, 'banners', id);
    const existing = await getDoc(ref);
    const payload = {
      title: banner.title.trim().slice(0, 160),
      subtitle: banner.subtitle.trim().slice(0, 300),
      imageUrl: banner.imageUrl.trim().slice(0, 500),
      ctaText: banner.ctaText.trim().slice(0, 60),
      targetCategory: banner.targetCategory.trim().slice(0, 128),
      isActive: Boolean(banner.isActive),
      sortOrder: Number(banner.sortOrder) || 1,
      updatedAt: serverTimestamp(),
    };
    if (existing.exists()) {
      await updateDoc(ref, payload);
    } else {
      await setDoc(ref, { ...payload, createdAt: serverTimestamp() });
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function deleteBanner(id: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'banners', id));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `banners/${id}`);
  }
}

export async function saveCoupon(
  coupon: Omit<Coupon, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }
): Promise<void> {
  const id = coupon.id || slugifyId(coupon.code, 'cpn');
  const path = `coupons/${id}`;
  try {
    const ref = doc(db, 'coupons', id);
    const existing = await getDoc(ref);
    const payload = {
      code: coupon.code.trim().toUpperCase().slice(0, 32),
      description: coupon.description.trim().slice(0, 200),
      discountType: coupon.discountType,
      discountValue: Math.max(0, Number(coupon.discountValue) || 0),
      minOrderAmount: Math.max(0, Number(coupon.minOrderAmount) || 0),
      isActive: Boolean(coupon.isActive),
      updatedAt: serverTimestamp(),
    };
    if (existing.exists()) {
      await updateDoc(ref, payload);
    } else {
      await setDoc(ref, { ...payload, createdAt: serverTimestamp() });
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function deleteCoupon(id: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'coupons', id));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `coupons/${id}`);
  }
}

export async function updateCustomerStatus(
  uid: string,
  status: 'active' | 'suspended'
): Promise<void> {
  try {
    await updateDoc(doc(db, 'users', uid), {
      status,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `users/${uid}`);
  }
}

export async function markNotificationRead(id: string): Promise<void> {
  try {
    await updateDoc(doc(db, 'notifications', id), { isRead: true });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `notifications/${id}`);
  }
}

export function buildPriceAlertDocId(userId: string, productId: string): string {
  const safeUid = userId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 60);
  const safeProd = productId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64);
  return `${safeUid}_${safeProd}`.slice(0, 128);
}

export async function getUserProductPriceAlert(
  userId: string,
  productId: string
): Promise<PriceAlert | null> {
  const id = buildPriceAlertDocId(userId, productId);
  const path = `priceAlerts/${id}`;
  try {
    const snap = await getDoc(doc(db, 'priceAlerts', id));
    if (!snap.exists()) return null;
    return { id: snap.id, ...(snap.data() as Omit<PriceAlert, 'id'>) };
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, path);
  }
}

export async function savePriceDropAlert(params: {
  userId: string;
  userEmail: string;
  userName: string;
  productId: string;
  productName: string;
  baselinePrice: number;
  targetPrice?: number;
}): Promise<PriceAlert> {
  const id = buildPriceAlertDocId(params.userId, params.productId);
  const path = `priceAlerts/${id}`;
  try {
    const ref = doc(db, 'priceAlerts', id);
    const existing = await getDoc(ref);
    const baselinePrice = Math.max(0, Number(params.baselinePrice) || 0);
    const targetPrice = Math.max(0, Number(params.targetPrice) || 0);

    const basePayload = {
      userEmail: params.userEmail.trim().slice(0, 160),
      userName: (params.userName.trim() || 'Customer').slice(0, 120),
      productName: params.productName.trim().slice(0, 160),
      baselinePrice,
      targetPrice,
      status: 'active' as const,
      updatedAt: serverTimestamp(),
    };

    if (existing.exists()) {
      await updateDoc(ref, basePayload);
    } else {
      await setDoc(ref, {
        userId: params.userId,
        productId: params.productId,
        ...basePayload,
        createdAt: serverTimestamp(),
      });
    }

    const updated = await getDoc(ref);
    return { id: updated.id, ...(updated.data() as Omit<PriceAlert, 'id'>) };
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function cancelPriceDropAlert(userId: string, productId: string): Promise<void> {
  const id = buildPriceAlertDocId(userId, productId);
  const path = `priceAlerts/${id}`;
  try {
    await updateDoc(doc(db, 'priceAlerts', id), {
      status: 'cancelled',
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

