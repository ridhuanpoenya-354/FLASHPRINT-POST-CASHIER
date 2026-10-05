# Security Specification — CetakPro Ledger (Digital Printing ERP & Accounting)

## 1. Data Invariants
1. **Strict Multi-Tenant Ownership (`ownerId`)**: Every document in `/orders/{orderId}`, `/inventory/{itemId}`, `/transactions/{txId}`, `/payables/{payableId}`, and `/stockLogs/{logId}` must contain an `ownerId` string that strictly equals `request.auth.uid`.
2. **Verified Identity Requirement**: All read and write operations require `request.auth != null && request.auth.token.email_verified == true`.
3. **Immutable Ownership & Creation Timestamps**: During `update` operations, `ownerId` and `createdAt` must never change (`incoming().ownerId == existing().ownerId && incoming().createdAt == existing().createdAt`).
4. **Server-Authoritative Timestamps**: On `create`, `createdAt == request.time && updatedAt == request.time`. On `update`, `updatedAt == request.time`.
5. **Path ID Hardening**: All single-document target operations (`get`, `create`, `update`, `delete`) must validate the path document ID via `isValidId(docId)` (`^[a-zA-Z0-9_\-]+$`, max 128 chars).
6. **Terminal State Locking**:
   - In `/orders/{orderId}`, once `existing().productionStatus == 'Dibatalkan'`, no further updates are permitted.
   - In `/payables/{payableId}`, once `existing().status == 'Lunas'`, no further updates are permitted.
7. **Zero Client Query Trust**: Every `allow list` rule enforces `resource.data.ownerId == request.auth.uid`.

## 2. The "Dirty Dozen" Payloads (Adversarial Test Vectors)
1. **Payload 1 (Identity Spoofing on Create)**: Authenticated user `user_A` creates an `/orders/ord_1` document with `ownerId: "user_B"`. -> `PERMISSION_DENIED`
2. **Payload 2 (Unverified Email Write)**: User with `email_verified: false` attempts to create an `/inventory/item_1` document. -> `PERMISSION_DENIED`
3. **Payload 3 (Shadow Field Injection on Create)**: User creates `/transactions/tx_1` with an undeclared field `isAdminBypass: true`. -> `PERMISSION_DENIED`
4. **Payload 4 (Shadow Field Injection on Update)**: User updates `/orders/ord_1` adding a ghost field `vipOverride: true`. -> `PERMISSION_DENIED`
5. **Payload 5 (Ownership Hijack on Update)**: User attempts to update `ownerId` on an existing `/inventory/item_1` document. -> `PERMISSION_DENIED`
6. **Payload 6 (Timestamp Forgery on Create)**: User sends a forged past/future timestamp for `createdAt` instead of `request.time`. -> `PERMISSION_DENIED`
7. **Payload 7 (Immutable `createdAt` Mutation on Update)**: User modifies `createdAt` during an order status update. -> `PERMISSION_DENIED`
8. **Payload 8 (Terminal State Re-opening on Orders)**: User attempts to update an order whose `existing().productionStatus` is already `'Dibatalkan'`. -> `PERMISSION_DENIED`
9. **Payload 9 (Terminal State Re-opening on Payables)**: User attempts to update a supplier payable whose `existing().status` is already `'Lunas'`. -> `PERMISSION_DENIED`
10. **Payload 10 (Resource Poisoning / Oversized String)**: User attempts to inject a 5,000-character string into `customerName` (max 120 chars). -> `PERMISSION_DENIED`
11. **Payload 11 (Cross-Tenant PII/Financial Read)**: `user_B` attempts `get` on `/orders/ord_1` owned by `user_A`. -> `PERMISSION_DENIED`
12. **Payload 12 (Unconstrained List Query Scraping)**: `user_A` attempts an unfiltered `list` query on `/transactions` without filtering `ownerId == request.auth.uid`. -> `PERMISSION_DENIED`

## 3. Conflict & Red Team Audit Summary
- **Identity Spoofing**: Blocked by `data.ownerId == request.auth.uid` inside every validation blueprint and `existing().ownerId == request.auth.uid` on updates/deletes/reads.
- **State Shortcutting / Terminal State**: Blocked by terminal guards `existing().productionStatus != 'Dibatalkan'` and `existing().status != 'Lunas'`.
- **Resource Poisoning**: Blocked by `isValidId()` regex and explicit `.size()` & numeric range bounds on every single field in `isValidPrintOrder`, `isValidInventoryItem`, `isValidCashTransaction`, `isValidSupplierPayable`, and `isValidStockMutationLog`.
- **Value Poisoning on Updates**: Blocked because every `allow update` begins with `isValid[Entity](incoming())` in addition to `affectedKeys().hasOnly(...)`.
