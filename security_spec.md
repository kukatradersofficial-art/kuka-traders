# KUKA TRADERS — Firestore Security Specification (Phase 0)

## 1. Data Invariants
1. **Admin Identity**: Only verified accounts (`email_verified == true`) matching `mursaleewandroo@gmail.com` or `kukatraders.official@gmail.com` (or registered inside `/admins/{uid}` by a bootstrapped admin) have administrative privileges.
2. **No Self-Privilege Escalation**: Customers creating `/users/{uid}` must have `role == 'customer'` and `status == 'active'`, and cannot modify `role` or `status` on updates.
3. **PII Isolation**: `/users/{uid}` and `/orders/{orderId}` can only be read by the document owner (`userId == request.auth.uid`) or an authorized admin. Customers cannot list all users or other customers' orders.
4. **Price & Payment Integrity**: Customers can never create or edit product prices (`sellingPrice`, `originalPrice`, `purchaseCost`, `priceStatus`), and can never mark an order `paymentStatus == 'Paid'` from the client.
5. **Atomic Stock Deduction**: Customers placing an order may only decrement `products/{id}.stockQuantity` (`newStock >= 0 && newStock < oldStock`) without altering any price or visibility field.
6. **Admin-Only Price Research**: `/priceResearch/{id}` is completely inaccessible (read or write) to non-admin users.
7. **Temporal Integrity**: All `createdAt` and `updatedAt` timestamps are enforced against `request.time`.
8. **System-Only Email Audit Logs**: `/emailLogs/{logId}` is written exclusively by the Firebase Cloud Function (`onOrderStatusUpdated`) via the Admin SDK; all client writes (`create`, `update`, `delete`) are strictly denied, and reads are restricted to the order owner (`userId == request.auth.uid`) or an authorized admin.
9. **Price Alert Owner & Product Integrity**: `/priceAlerts/{alertId}` requests must belong to `request.auth.uid`, reference an existing `/products/{productId}`, start with `status == 'active'`, and restrict reads/writes to the alert owner or an authorized admin.

## 2. The "Dirty Dozen" Adversarial Payloads (Expected: PERMISSION_DENIED)
1. **Role Escalation on Registration**: Customer writes `/users/{uid}` with `role: "admin"`.
2. **Shadow Field Injection on Profile**: Customer updates `/users/{uid}` adding `{ isVerified: true }`.
3. **Cross-Customer PII Read**: Customer A attempts `get(/users/customerB)`.
4. **Customer Scraping Users List**: Customer A attempts `list(/users)`.
5. **Email Spoofing Attack**: Attacker signs in with `email: "mursaleewandroo@gmail.com"` where `email_verified: false` and tries to write `/products/p1`.
6. **Customer Price Tampering**: Customer updates `/products/p1` changing `sellingPrice: 1` alongside `stockQuantity`.
7. **Self-Marking Order Paid**: Customer creates `/orders/o1` with `paymentStatus: "Paid"`.
8. **Order Hijacking**: Customer A creates `/orders/o2` with `userId: "customerB"`.
9. **Post-Confirmation Customer Cancel**: Customer updates `/orders/o1` to `orderStatus: "Cancelled"` after admin moved it to `"Preparing"`.
10. **Leaked Price Research Read**: Customer attempts `list(/priceResearch)` or `get(/priceResearch/pr1)`.
11. **Fake Verified Review Auto-Publish**: Customer creates `/reviews/r1` with `status: "approved"` directly.
12. **Resource Exhaustion ID Poisoning**: Attacker writes `/products/<2KB invalid chars>` or injects a >2000 char string into `name`.
13. **Client Forging Email Logs**: Customer or client attempts `create(/emailLogs/log_1)` to spoof transactional email delivery.
14. **Cross-Customer Email Log Scraping**: Customer A attempts `list(/emailLogs)` without scoping `userId == request.auth.uid`.
15. **Price Alert Identity Spoofing / Orphan Product**: Customer A attempts `create(/priceAlerts/alert_1)` with `userId: "customerB"` or a non-existent `productId`.
16. **Cross-Customer Price Alert Read**: Customer A attempts `get(/priceAlerts/custB_prod1)` containing another customer's `userEmail`.
