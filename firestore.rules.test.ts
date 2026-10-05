/**
 * Red Team Security Specification Test Runner ("Dirty Dozen" Payloads)
 * Verifies that all 12 adversarial payloads defined in security_spec.md
 * are rejected with PERMISSION_DENIED by the Firestore Security Rules.
 */

export interface DirtyDozenTestVector {
  id: number;
  name: string;
  collection: string;
  operation: 'create' | 'update' | 'get' | 'list';
  authUid: string | null;
  emailVerified: boolean;
  payload?: Record<string, unknown>;
  expectedResult: 'PERMISSION_DENIED';
}

export const DIRTY_DOZEN_VECTORS: DirtyDozenTestVector[] = [
  {
    id: 1,
    name: 'Identity Spoofing on Create (ownerId mismatch)',
    collection: 'orders',
    operation: 'create',
    authUid: 'user_A',
    emailVerified: true,
    payload: { ownerId: 'user_B', invoiceNumber: 'INV-001' },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 2,
    name: 'Unverified Email Write Attempt',
    collection: 'inventory',
    operation: 'create',
    authUid: 'user_A',
    emailVerified: false,
    payload: { ownerId: 'user_A', sku: 'FLX-280' },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 3,
    name: 'Shadow Field Injection on Create',
    collection: 'transactions',
    operation: 'create',
    authUid: 'user_A',
    emailVerified: true,
    payload: { ownerId: 'user_A', isAdminBypass: true },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 4,
    name: 'Shadow Field Injection on Update',
    collection: 'orders',
    operation: 'update',
    authUid: 'user_A',
    emailVerified: true,
    payload: { ownerId: 'user_A', vipOverride: true },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 5,
    name: 'Ownership Hijack on Update',
    collection: 'inventory',
    operation: 'update',
    authUid: 'user_A',
    emailVerified: true,
    payload: { ownerId: 'user_B' },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 6,
    name: 'Client Timestamp Forgery on Create',
    collection: 'transactions',
    operation: 'create',
    authUid: 'user_A',
    emailVerified: true,
    payload: { ownerId: 'user_A', createdAt: '2020-01-01T00:00:00Z' },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 7,
    name: 'Immutable createdAt Mutation on Update',
    collection: 'orders',
    operation: 'update',
    authUid: 'user_A',
    emailVerified: true,
    payload: { ownerId: 'user_A', createdAt: '2025-01-01T00:00:00Z' },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 8,
    name: 'Terminal State Re-opening on Cancelled Order',
    collection: 'orders',
    operation: 'update',
    authUid: 'user_A',
    emailVerified: true,
    payload: { productionStatus: 'Selesai' },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 9,
    name: 'Terminal State Re-opening on Settled Payable',
    collection: 'payables',
    operation: 'update',
    authUid: 'user_A',
    emailVerified: true,
    payload: { status: 'Belum Lunas' },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 10,
    name: 'Resource Poisoning via Oversized String (>120 chars)',
    collection: 'orders',
    operation: 'create',
    authUid: 'user_A',
    emailVerified: true,
    payload: { customerName: 'X'.repeat(5000) },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 11,
    name: 'Cross-Tenant Document Read (PII / Financial Leak)',
    collection: 'orders',
    operation: 'get',
    authUid: 'user_B',
    emailVerified: true,
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 12,
    name: 'Unconstrained List Query Scraping without ownerId filter',
    collection: 'transactions',
    operation: 'list',
    authUid: 'user_A',
    emailVerified: true,
    expectedResult: 'PERMISSION_DENIED',
  },
];
