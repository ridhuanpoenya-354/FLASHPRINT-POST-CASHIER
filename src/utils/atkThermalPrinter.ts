import {
  PrintOrder,
  StoreSettings,
  extractOrderCartItems,
  extractItemDetailedBreakdown,
  extractOrderPaymentDetail,
  roundFinalOrderAmount,
  cleanProductJobTitle,
  formatNumberID,
  formatIDR,
  formatDateID,
} from '../types';

export type DirectPrinterMode = 'BLUETOOTH' | 'USB' | 'FALLBACK_BROWSER' | 'FALLBACK_PDF';

export interface SavedBluetoothPrinterInfo {
  deviceId: string;
  deviceName: string;
  serviceUuid?: string;
  characteristicUuid?: string;
  chunkByteSize: number; // 20 - 50 bytes
  paperColumns: 32 | 48; // 32 cols (58mm) or 48 cols (80mm)
  lastConnectedAt: string;
}

export interface SavedUsbPrinterInfo {
  vendorId: number;
  productId: number;
  productName: string;
  manufacturerName?: string;
  serialNumber?: string;
  paperColumns: 32 | 48;
  lastConnectedAt: string;
}

export const BT_PRINTER_STORAGE_KEY = 'cetakpro_atk_bt_printer_v1';
export const USB_PRINTER_STORAGE_KEY = 'cetakpro_atk_usb_printer_v1';
export const PREFERRED_ATK_PRINT_MODE_KEY = 'cetakpro_atk_preferred_print_mode_v1';

const THERMAL_BT_SERVICE_UUIDS = [
  '000018f0-0000-1000-8000-00805f9b34fb',
  'e7810a71-73ae-499d-8c15-faa9aef0c3f2',
  '49535343-fe7d-4ae5-8fa9-9fafd205e455',
  '0000ff00-0000-1000-8000-00805f9b34fb',
  '0000ffe0-0000-1000-8000-00805f9b34fb',
  '00001101-0000-1000-8000-00805f9b34fb',
];

// In-memory active GATT & USB session cache for instant zero-popup reconnect
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let activeBtDevice: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let activeBtCharacteristic: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let activeUsbDevice: any = null;

export function getSavedBluetoothPrinter(): SavedBluetoothPrinterInfo | null {
  try {
    const raw = localStorage.getItem(BT_PRINTER_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SavedBluetoothPrinterInfo;
    if (!parsed || !parsed.deviceId) return null;
    return {
      ...parsed,
      chunkByteSize: Math.min(50, Math.max(20, Number(parsed.chunkByteSize) || 32)),
      paperColumns: parsed.paperColumns === 32 ? 32 : 48,
    };
  } catch {
    return null;
  }
}

export function saveBluetoothPrinter(info: SavedBluetoothPrinterInfo): void {
  try {
    const normalized: SavedBluetoothPrinterInfo = {
      ...info,
      chunkByteSize: Math.min(50, Math.max(20, Number(info.chunkByteSize) || 32)),
    };
    localStorage.setItem(BT_PRINTER_STORAGE_KEY, JSON.stringify(normalized));
  } catch {
    // Ignore storage error
  }
}

export function clearSavedBluetoothPrinter(): void {
  try {
    localStorage.removeItem(BT_PRINTER_STORAGE_KEY);
    if (activeBtDevice?.gatt?.connected) {
      activeBtDevice.gatt.disconnect();
    }
  } catch {
    // Ignore
  }
  activeBtDevice = null;
  activeBtCharacteristic = null;
}

export function getSavedUsbPrinter(): SavedUsbPrinterInfo | null {
  try {
    const raw = localStorage.getItem(USB_PRINTER_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SavedUsbPrinterInfo;
    if (!parsed || typeof parsed.vendorId !== 'number') return null;
    return {
      ...parsed,
      paperColumns: parsed.paperColumns === 32 ? 32 : 48,
    };
  } catch {
    return null;
  }
}

export function saveUsbPrinter(info: SavedUsbPrinterInfo): void {
  try {
    localStorage.setItem(USB_PRINTER_STORAGE_KEY, JSON.stringify(info));
  } catch {
    // Ignore storage error
  }
}

export function clearSavedUsbPrinter(): void {
  try {
    localStorage.removeItem(USB_PRINTER_STORAGE_KEY);
    if (activeUsbDevice?.opened) {
      activeUsbDevice.close().catch(() => {});
    }
  } catch {
    // Ignore
  }
  activeUsbDevice = null;
}

export function getPreferredAtkPrintMode(): DirectPrinterMode {
  try {
    const val = localStorage.getItem(PREFERRED_ATK_PRINT_MODE_KEY) as DirectPrinterMode | null;
    if (
      val === 'BLUETOOTH' ||
      val === 'USB' ||
      val === 'FALLBACK_BROWSER' ||
      val === 'FALLBACK_PDF'
    ) {
      return val;
    }
  } catch {
    // Ignore
  }
  return 'BLUETOOTH';
}

export function setPreferredAtkPrintMode(mode: DirectPrinterMode): void {
  try {
    localStorage.setItem(PREFERRED_ATK_PRINT_MODE_KEY, mode);
  } catch {
    // Ignore
  }
}

export function isWebBluetoothSupported(): boolean {
  return typeof navigator !== 'undefined' && 'bluetooth' in navigator;
}

export function isWebUsbSupported(): boolean {
  return typeof navigator !== 'undefined' && 'usb' in navigator;
}

function formatTwoColLine(left: string, right: string, width: number): string {
  const cleanLeft = left.trim();
  const cleanRight = right.trim();
  const spaceLeft = width - cleanLeft.length - cleanRight.length;
  if (spaceLeft >= 1) {
    return cleanLeft + ' '.repeat(spaceLeft) + cleanRight;
  }
  const maxLeftLen = Math.max(4, width - cleanRight.length - 1);
  return cleanLeft.slice(0, maxLeftLen) + ' ' + cleanRight;
}

/**
 * Builds complete ESC/POS thermal receipt bytes for ATK & POS orders.
 */
export function buildEscPosReceiptBytes(
  order: PrintOrder,
  storeSettings: Omit<StoreSettings, 'ownerId' | 'createdAt' | 'updatedAt'>,
  cols: 32 | 48 = 48
): Uint8Array {
  const encoder = new TextEncoder();
  const chunks: number[] = [];

  const pushBytes = (...bytes: number[]) => {
    chunks.push(...bytes);
  };
  const pushText = (text: string) => {
    const safeAscii = text
      .replace(/[×]/g, 'x')
      .replace(/[—–]/g, '-')
      .replace(/[•]/g, '*')
      .replace(/[^\x20-\x7E\n\r]/g, '');
    const encoded = encoder.encode(safeAscii);
    encoded.forEach((b) => chunks.push(b));
  };
  const pushLine = (text = '') => {
    pushText(text + '\n');
  };

  const divider = '-'.repeat(cols);
  const doubleDivider = '='.repeat(cols);

  const items = extractOrderCartItems(order);
  const itemDetails = items.map((it) => ({
    item: it,
    detail: extractItemDetailedBreakdown(it),
  }));
  const paymentDetail = extractOrderPaymentDetail(order);
  const itemsGross = itemDetails.reduce((acc, x) => acc + x.detail.itemSubtotal, 0);
  const orderDiscount = Number(order.discount) || 0;
  const rawBeforeRounding = Math.max(0, itemsGross - orderDiscount);
  const roundingInfo = roundFinalOrderAmount(rawBeforeRounding);
  const remainingDebt = Math.max(0, order.totalAmount - order.paidAmount);

  // ESC @ (Init)
  pushBytes(0x1b, 0x40);

  // Center align + Bold + Store Name
  pushBytes(0x1b, 0x61, 0x01);
  pushBytes(0x1b, 0x45, 0x01);
  pushLine((storeSettings.storeName || 'CetakPro Digital Printing').toUpperCase());
  pushBytes(0x1b, 0x45, 0x00);

  if (storeSettings.address) {
    pushLine(storeSettings.address.slice(0, cols * 2));
  }
  if (storeSettings.phone) {
    pushLine(`Telp/WA: ${storeSettings.phone}`);
  }
  pushLine(doubleDivider);

  // Left align: 4-line compact header
  pushBytes(0x1b, 0x61, 0x00);
  pushLine(
    formatTwoColLine(
      `No.Nota: ${order.invoiceNumber}`,
      `Kasir: ${(order.cashierName || storeSettings.activeCashierName || 'Admin').slice(0, 14)}`,
      cols
    )
  );
  pushLine(
    formatTwoColLine(
      `Masuk: ${formatDateID(order.orderDate)}`,
      `Selesai: ${formatDateID(order.deadlineDate)}`,
      cols
    )
  );
  pushLine(
    formatTwoColLine(
      `Plg: ${(order.customerName || 'Pelanggan Umum').slice(0, 18)}`,
      `WA: ${order.customerPhone || '-'}`,
      cols
    )
  );
  pushLine(
    formatTwoColLine(
      `Status: ${order.paymentStatus.toUpperCase()}`,
      `${paymentDetail.shortPaymentMethodDisplay}`,
      cols
    )
  );
  pushLine(divider);

  // Items
  itemDetails.forEach(({ item, detail }, idx) => {
    const isAtkItem =
      (item.category || order.category || item.materialName || '')
        .toLowerCase()
        .includes('atk') ||
      (item.category || '').toLowerCase().includes('perlengkapan');

    if (isAtkItem) {
      const unitStr = (item.unitType || 'pcs').toLowerCase().trim() || 'pcs';
      // Baris 1: #1 Lakban Bening / Coklat 2 Inch
      pushBytes(0x1b, 0x45, 0x01);
      pushLine(`#${idx + 1} ${cleanProductJobTitle(item.jobTitle)}`);
      pushBytes(0x1b, 0x45, 0x00);

      // Baris 2: Sub Total #1 - 2 roll × Rp 16.000/roll   Rp 32.000
      const leftCol = `Sub Total #${idx + 1} - ${formatNumberID(item.qty)} ${unitStr} x ${formatIDR(item.unitPrice)}/${unitStr}`;
      pushBytes(0x1b, 0x45, 0x01);
      pushLine(formatTwoColLine(leftCol, formatIDR(detail.itemSubtotal), cols));
      pushBytes(0x1b, 0x45, 0x00);
    } else {
      // Produk Cetak: Format tidak diubah apapun
      pushBytes(0x1b, 0x45, 0x01);
      pushLine(`${idx + 1}. ${item.jobTitle}`);
      pushBytes(0x1b, 0x45, 0x00);

      pushLine(
        formatTwoColLine(
          `  ${detail.basePrintLabel}`,
          formatIDR(detail.baseSubtotal),
          cols
        )
      );

      detail.finishingLines.forEach((fl) => {
        pushLine(
          formatTwoColLine(
            `  + ${fl.label}`,
            fl.amount > 0 ? `+${formatIDR(fl.amount)}` : 'Rp 0',
            cols
          )
        );
      });

      if (item.designFee > 0) {
        pushLine(
          formatTwoColLine('  + Jasa Desain', `+${formatIDR(item.designFee)}`, cols)
        );
      }

      if (detail.hasExtraComponents || itemDetails.length > 1) {
        pushBytes(0x1b, 0x45, 0x01);
        pushLine(
          formatTwoColLine(
            `  Sub Total #${idx + 1}`,
            formatIDR(detail.itemSubtotal),
            cols
          )
        );
        pushBytes(0x1b, 0x45, 0x00);
      }
    }
  });

  pushLine(divider);

  if (orderDiscount > 0) {
    pushLine(
      formatTwoColLine('Diskon Potongan', `-${formatIDR(orderDiscount)}`, cols)
    );
  }
  if (roundingInfo.roundingAdjustment !== 0) {
    pushLine(
      formatTwoColLine(
        'Pembulatan Kasir',
        roundingInfo.roundingAdjustment > 0
          ? `+${formatIDR(roundingInfo.roundingAdjustment)}`
          : `-${formatIDR(Math.abs(roundingInfo.roundingAdjustment))}`,
        cols
      )
    );
  }

  // Bold Total
  pushBytes(0x1b, 0x45, 0x01);
  pushLine(formatTwoColLine('TOTAL TAGIHAN', formatIDR(order.totalAmount), cols));
  pushBytes(0x1b, 0x45, 0x00);

  pushLine(
    formatTwoColLine(
      `Dibayar (${paymentDetail.shortPaymentMethodDisplay})`,
      formatIDR(order.paidAmount),
      cols
    )
  );

  if (remainingDebt > 0) {
    pushBytes(0x1b, 0x45, 0x01);
    pushLine(formatTwoColLine('SISA PIUTANG', formatIDR(remainingDebt), cols));
    pushBytes(0x1b, 0x45, 0x00);
  } else {
    pushBytes(0x1b, 0x61, 0x01);
    pushBytes(0x1b, 0x45, 0x01);
    pushLine('*** STATUS TAGIHAN: LUNAS ***');
    pushBytes(0x1b, 0x45, 0x00);
    pushBytes(0x1b, 0x61, 0x00);
  }

  pushLine(divider);
  pushBytes(0x1b, 0x61, 0x01);
  pushLine('Terima kasih atas kunjungan Anda');
  pushLine('\n\n');

  // Partial cut GS V 66 0
  pushBytes(0x1d, 0x56, 0x42, 0x00);

  return new Uint8Array(chunks);
}

// Helper to find writable GATT characteristic from connected server
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function findWritableCharacteristic(gattServer: any): Promise<{
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  characteristic: any;
  serviceUuid: string;
  characteristicUuid: string;
}> {
  const services = await gattServer.getPrimaryServices();
  for (const service of services) {
    try {
      const characteristics = await service.getCharacteristics();
      for (const char of characteristics) {
        if (char.properties?.write || char.properties?.writeWithoutResponse) {
          return {
            characteristic: char,
            serviceUuid: service.uuid,
            characteristicUuid: char.uuid,
          };
        }
      }
    } catch {
      // Continue checking next service
    }
  }
  throw new Error(
    'Tidak ditemukan karakteristik GATT yang mendukung penulisan data cetak (write/writeWithoutResponse).'
  );
}

/**
 * Connects or auto-reconnects to a Web Bluetooth thermal printer and sends ESC/POS bytes
 * using 20-50 byte chunking for rock-solid transmission stability.
 */
export async function printViaWebBluetooth(
  order: PrintOrder,
  storeSettings: Omit<StoreSettings, 'ownerId' | 'createdAt' | 'updatedAt'>,
  options?: {
    forceNewPairing?: boolean;
    chunkByteSize?: number;
    paperColumns?: 32 | 48;
  }
): Promise<{
  printerInfo: SavedBluetoothPrinterInfo;
  autoReconnected: boolean;
}> {
  if (!isWebBluetoothSupported()) {
    throw new Error('Web Bluetooth API tidak didukung di browser/perangkat ini.');
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const navBt = (navigator as any).bluetooth;
  const saved = getSavedBluetoothPrinter();
  const chunkByteSize = Math.min(
    50,
    Math.max(20, options?.chunkByteSize || saved?.chunkByteSize || 32)
  );
  const paperColumns: 32 | 48 =
    options?.paperColumns || saved?.paperColumns || 48;

  let autoReconnected = false;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let targetDevice: any = null;

  // 1. Try in-memory cached BluetoothDevice first (unless forceNewPairing)
  if (!options?.forceNewPairing && activeBtDevice) {
    targetDevice = activeBtDevice;
    autoReconnected = true;
  }

  // 2. Try navigator.bluetooth.getDevices() auto-remembered device from localStorage
  if (
    !options?.forceNewPairing &&
    !targetDevice &&
    saved &&
    typeof navBt.getDevices === 'function'
  ) {
    try {
      const permittedDevices = await navBt.getDevices();
      if (Array.isArray(permittedDevices) && permittedDevices.length > 0) {
        targetDevice =
          permittedDevices.find(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (d: any) =>
              d.id === saved.deviceId ||
              (saved.deviceName && d.name === saved.deviceName)
          ) || permittedDevices[0];
        if (targetDevice) {
          autoReconnected = true;
        }
      }
    } catch {
      // Fallback to requestDevice
    }
  }

  // 3. Request pairing if no auto-reconnect device is available
  if (!targetDevice) {
    targetDevice = await navBt.requestDevice({
      acceptAllDevices: true,
      optionalServices: THERMAL_BT_SERVICE_UUIDS,
    });
    autoReconnected = false;
  }

  activeBtDevice = targetDevice;

  // Connect GATT server
  if (!targetDevice.gatt.connected) {
    await targetDevice.gatt.connect();
    activeBtCharacteristic = null;
  }

  let charToUse = activeBtCharacteristic;
  let serviceUuid = saved?.serviceUuid || '';
  let characteristicUuid = saved?.characteristicUuid || '';

  if (!charToUse) {
    const found = await findWritableCharacteristic(targetDevice.gatt);
    charToUse = found.characteristic;
    serviceUuid = found.serviceUuid;
    characteristicUuid = found.characteristicUuid;
    activeBtCharacteristic = charToUse;
  }

  const printerInfo: SavedBluetoothPrinterInfo = {
    deviceId: targetDevice.id || `bt_${Date.now()}`,
    deviceName: targetDevice.name || 'Bluetooth Thermal Printer',
    serviceUuid,
    characteristicUuid,
    chunkByteSize,
    paperColumns,
    lastConnectedAt: new Date().toISOString(),
  };
  saveBluetoothPrinter(printerInfo);

  // Build ESC/POS receipt data and send in 20-50 byte chunks
  const receiptBytes = buildEscPosReceiptBytes(order, storeSettings, paperColumns);

  for (let offset = 0; offset < receiptBytes.length; offset += chunkByteSize) {
    const slice = receiptBytes.slice(offset, offset + chunkByteSize);
    if (charToUse.properties?.writeWithoutResponse && charToUse.writeValueWithoutResponse) {
      await charToUse.writeValueWithoutResponse(slice);
    } else if (charToUse.writeValue) {
      await charToUse.writeValue(slice);
    } else {
      await charToUse.writeValueWithResponse(slice);
    }
    // Brief 18ms pause between chunks to prevent printer buffer overflow
    await new Promise((resolve) => setTimeout(resolve, 18));
  }

  return { printerInfo, autoReconnected };
}

/**
 * Connects or auto-reconnects to a USB thermal printer via WebUSB API (Desktop & USB OTG)
 * and transmits ESC/POS receipt bytes directly without OS driver overhead.
 */
export async function printViaWebUsb(
  order: PrintOrder,
  storeSettings: Omit<StoreSettings, 'ownerId' | 'createdAt' | 'updatedAt'>,
  options?: {
    forceNewPairing?: boolean;
    paperColumns?: 32 | 48;
  }
): Promise<{
  printerInfo: SavedUsbPrinterInfo;
  autoReconnected: boolean;
}> {
  if (!isWebUsbSupported()) {
    throw new Error('WebUSB API tidak didukung di browser/perangkat ini.');
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const navUsb = (navigator as any).usb;
  const saved = getSavedUsbPrinter();
  const paperColumns: 32 | 48 =
    options?.paperColumns || saved?.paperColumns || 48;

  let autoReconnected = false;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let usbDevice: any = null;

  if (!options?.forceNewPairing && activeUsbDevice) {
    usbDevice = activeUsbDevice;
    autoReconnected = true;
  }

  if (!options?.forceNewPairing && !usbDevice && typeof navUsb.getDevices === 'function') {
    try {
      const permitted = await navUsb.getDevices();
      if (Array.isArray(permitted) && permitted.length > 0) {
        if (saved) {
          usbDevice =
            permitted.find(
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              (d: any) =>
                d.vendorId === saved.vendorId && d.productId === saved.productId
            ) || permitted[0];
        } else {
          usbDevice = permitted[0];
        }
        if (usbDevice) {
          autoReconnected = true;
        }
      }
    } catch {
      // Fallback to requestDevice
    }
  }

  if (!usbDevice) {
    usbDevice = await navUsb.requestDevice({ filters: [] });
    autoReconnected = false;
  }

  activeUsbDevice = usbDevice;

  if (!usbDevice.opened) {
    await usbDevice.open();
  }
  if (!usbDevice.configuration) {
    await usbDevice.selectConfiguration(1);
  }

  // Find interface and bulk OUT endpoint
  let targetInterfaceNumber = 0;
  let targetEndpointNumber = 1;
  let foundEndpoint = false;

  const interfaces = usbDevice.configuration?.interfaces || [];
  for (const iface of interfaces) {
    for (const alt of iface.alternates || []) {
      for (const ep of alt.endpoints || []) {
        if (ep.direction === 'out' && ep.type === 'bulk') {
          targetInterfaceNumber = iface.interfaceNumber;
          targetEndpointNumber = ep.endpointNumber;
          foundEndpoint = true;
          break;
        }
      }
      if (foundEndpoint) break;
    }
    if (foundEndpoint) break;
  }

  await usbDevice.claimInterface(targetInterfaceNumber);

  const printerInfo: SavedUsbPrinterInfo = {
    vendorId: usbDevice.vendorId || 0,
    productId: usbDevice.productId || 0,
    productName: usbDevice.productName || 'USB Thermal Printer',
    manufacturerName: usbDevice.manufacturerName || '',
    serialNumber: usbDevice.serialNumber || '',
    paperColumns,
    lastConnectedAt: new Date().toISOString(),
  };
  saveUsbPrinter(printerInfo);

  const receiptBytes = buildEscPosReceiptBytes(order, storeSettings, paperColumns);
  const usbChunkSize = 48;
  for (let offset = 0; offset < receiptBytes.length; offset += usbChunkSize) {
    const slice = receiptBytes.slice(offset, offset + usbChunkSize);
    await usbDevice.transferOut(targetEndpointNumber, slice);
    await new Promise((resolve) => setTimeout(resolve, 10));
  }

  return { printerInfo, autoReconnected };
}
