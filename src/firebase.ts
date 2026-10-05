// CetakPro Ledger - Standalone Local Storage & Auth Adapter (Firebase Unlinked)

export const db = null as any;

export interface LocalUser {
  uid: string;
  email: string | null;
  displayName: string | null;
}

export const auth = {
  currentUser: {
    uid: 'local_admin',
    email: 'admin@cetakpro.local',
    displayName: 'Admin CetakPro',
  } as LocalUser,
  signOut: async () => {},
} as any;

export const SCOPES = ['https://www.googleapis.com/auth/drive.file'];

export const subscribeAccessToken = (
  listener: (token: string | null) => void
): (() => void) => {
  listener(null);
  return () => {};
};

// Auto-authenticated for local standalone mode
export const initAuth = (
  onAuthSuccess?: (user: any, token: string | null) => void,
  _onAuthFailure?: () => void
) => {
  const localUser: LocalUser = {
    uid: 'local_admin',
    email: 'admin@cetakpro.local',
    displayName: 'Admin CetakPro',
  };
  if (onAuthSuccess) {
    // Schedule on microtask so listeners are attached first
    queueMicrotask(() => {
      onAuthSuccess(localUser, null);
    });
  }
  return () => {};
};

export const googleSignIn = async (
  _forceConsent = false
): Promise<{ user: any; accessToken: string } | null> => {
  return null;
};

export const getAccessToken = async (): Promise<string | null> => {
  return null;
};

export const clearAccessToken = () => {};

export const logout = async () => {};

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
) {
  console.warn(`[LocalStorage] Operation ${operationType} on ${path}:`, error);
}
