import {
  StoreSettings,
  PrintPaperSize,
  PrintOrder,
  InventoryItem,
  CashTransaction,
  SupplierPayable,
  StockMutationLog,
} from '../types';
import { clearAccessToken, auth } from '../firebase';

export const DEFAULT_DRIVE_SETTINGS_FILENAME = 'cetakpro-settings-sync.json';

export interface DriveUserInfo {
  displayName: string;
  emailAddress: string;
  photoLink?: string;
}

export interface DriveFileMetadata {
  id: string;
  name: string;
  modifiedTime: string;
  size?: string;
  description?: string;
}

export interface DriveExtraPreferences {
  printPaperSize: PrintPaperSize;
  offlineAutoBackupEnabled: boolean;
  preferredExternalCameraId?: string;
  remotePhoneSendMode?: 'AUTO_SEND' | 'MANUAL_SEND';
  desktopCameraSessionCode?: string;
  googleDriveAutoSyncEnabled?: boolean;
}

export interface DriveSettingsSyncPayload {
  app: string;
  schemaVersion: number;
  syncedAtIso: string;
  syncedAtLabel: string;
  storeSettings: Omit<StoreSettings, 'ownerId' | 'createdAt' | 'updatedAt'>;
  preferences: DriveExtraPreferences;
  includesFullLedger?: boolean;
  counts?: {
    orders: number;
    inventory: number;
    transactions: number;
    payables: number;
    stockLogs: number;
  };
  orders?: PrintOrder[];
  inventory?: InventoryItem[];
  transactions?: CashTransaction[];
  payables?: SupplierPayable[];
  stockLogs?: StockMutationLog[];
}

export async function checkGoogleDriveTokenStatus(
  accessToken: string
): Promise<{
  valid: boolean;
  user?: DriveUserInfo;
  error?: string;
}> {
  if (!accessToken) {
    return { valid: false, error: 'Token akses belum tersedia di memori sesi.' };
  }

  const fbUser = auth.currentUser;
  const fallbackUser: DriveUserInfo = {
    displayName: fbUser?.displayName || 'Pengguna Google Drive',
    emailAddress: fbUser?.email || '',
    photoLink: fbUser?.photoURL || undefined,
  };

  try {
    const res = await fetch(
      'https://www.googleapis.com/drive/v3/about?fields=user(displayName,emailAddress,photoLink)',
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    if (res.ok) {
      const data = await res.json();
      return {
        valid: true,
        user: {
          displayName:
            data.user?.displayName || fallbackUser.displayName,
          emailAddress:
            data.user?.emailAddress || fallbackUser.emailAddress,
          photoLink: data.user?.photoLink || fallbackUser.photoLink,
        },
      };
    }

    if (res.status === 401) {
      clearAccessToken();
      return {
        valid: false,
        error:
          'Token Google Drive sudah kedaluwarsa. Silakan klik tombol Sign in with Google untuk memperbarui token.',
      };
    }

    // If 'about' returned 403 or non-401 (e.g. scope restricted to per-file), test file listing
    const testFilesRes = await fetch(
      'https://www.googleapis.com/drive/v3/files?pageSize=1&fields=files(id)',
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    if (testFilesRes.ok) {
      return {
        valid: true,
        user: fallbackUser,
      };
    }

    if (testFilesRes.status === 401) {
      clearAccessToken();
      return {
        valid: false,
        error:
          'Token Google Drive sudah kedaluwarsa. Silakan klik tombol Sign in with Google untuk memperbarui token.',
      };
    }

    return {
      valid: false,
      error: `Gagal memeriksa status Google Drive (HTTP ${res.status}).`,
    };
  } catch (err) {
    return {
      valid: false,
      error:
        err instanceof Error
          ? err.message
          : 'Gagal menghubungi server Google Drive.',
    };
  }
}

export async function listGoogleDriveSettingsFiles(
  accessToken: string
): Promise<DriveFileMetadata[]> {
  if (!accessToken) {
    throw new Error('Token Google Drive tidak tersedia. Silakan Sign in with Google terlebih dahulu.');
  }
  const queryParams = new URLSearchParams({
    q: "trashed = false and mimeType = 'application/json'",
    fields: 'files(id,name,modifiedTime,size,description)',
    orderBy: 'modifiedTime desc',
    pageSize: '25',
  });
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files?${queryParams.toString()}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );
  if (res.status === 401 || res.status === 403) {
    clearAccessToken();
    throw new Error(
      'Sesi token Google Drive telah kedaluwarsa. Silakan klik Sign in with Google kembali.'
    );
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Gagal memuat daftar file dari Google Drive: ${text}`);
  }
  const data = await res.json();
  return Array.isArray(data.files) ? data.files : [];
}

export async function saveSettingsToGoogleDrive(params: {
  accessToken: string;
  payload: DriveSettingsSyncPayload;
  existingFileId?: string;
  customFileName?: string;
}): Promise<DriveFileMetadata> {
  const { accessToken, payload, existingFileId, customFileName } = params;
  if (!accessToken) {
    throw new Error('Token Google Drive belum tersedia. Silakan Sign in with Google.');
  }

  const fileName = customFileName || DEFAULT_DRIVE_SETTINGS_FILENAME;
  const metadata = {
    name: fileName,
    mimeType: 'application/json',
    description: `Sinkronisasi Pengaturan Toko & Konfigurasi ${payload.storeSettings.storeName} (${payload.syncedAtLabel})`,
  };

  const boundary = '-------cetakpro_drive_sync_boundary_98214';
  const delimiter = `\r\n--${boundary}\r\n`;
  const closeDelimiter = `\r\n--${boundary}--`;

  const jsonContent = JSON.stringify(payload, null, 2);
  const multipartBody =
    delimiter +
    'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
    JSON.stringify(metadata) +
    delimiter +
    'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
    jsonContent +
    closeDelimiter;

  const uploadUrl = existingFileId
    ? `https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(
        existingFileId
      )}?uploadType=multipart&fields=id,name,modifiedTime,size,description`
    : 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,modifiedTime,size,description';

  const res = await fetch(uploadUrl, {
    method: existingFileId ? 'PATCH' : 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': `multipart/related; boundary=${boundary}`,
    },
    body: multipartBody,
  });

  if (res.status === 401 || res.status === 403) {
    clearAccessToken();
    throw new Error(
      'Token akses Google Drive kedaluwarsa. Silakan klik Sign in with Google untuk memperbarui token.'
    );
  }

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gagal menyimpan ke Google Drive: ${errText}`);
  }

  return (await res.json()) as DriveFileMetadata;
}

export async function downloadSettingsFromGoogleDrive(
  accessToken: string,
  fileId: string
): Promise<DriveSettingsSyncPayload> {
  if (!accessToken) {
    throw new Error('Token Google Drive belum tersedia. Silakan Sign in with Google.');
  }

  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(
      fileId
    )}?alt=media`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  if (res.status === 401 || res.status === 403) {
    clearAccessToken();
    throw new Error(
      'Token akses Google Drive kedaluwarsa. Silakan klik Sign in with Google untuk memperbarui token.'
    );
  }

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gagal mengunduh pengaturan dari Google Drive: ${errText}`);
  }

  const rawData = await res.json();
  const snap = rawData.snapshot || rawData;
  if (!snap.storeSettings) {
    throw new Error(
      'File JSON di Google Drive tidak berisi data pengaturan toko (storeSettings).'
    );
  }
  return snap as DriveSettingsSyncPayload;
}

export async function deleteSettingsFileFromGoogleDrive(
  accessToken: string,
  fileId: string
): Promise<void> {
  if (!accessToken) {
    throw new Error('Token Google Drive belum tersedia. Silakan Sign in with Google.');
  }

  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}`,
    {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  if (res.status === 401 || res.status === 403) {
    clearAccessToken();
    throw new Error(
      'Token akses Google Drive kedaluwarsa. Silakan klik Sign in with Google untuk memperbarui token.'
    );
  }

  if (!res.ok && res.status !== 204) {
    const errText = await res.text();
    throw new Error(`Gagal menghapus file dari Google Drive: ${errText}`);
  }
}
