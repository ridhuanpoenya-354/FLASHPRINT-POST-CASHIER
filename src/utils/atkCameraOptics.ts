/**
 * High-Precision Barcode Camera Optics & Anti-Noise 15x5mm Macro Engine
 * Supports:
 * - 100% Megapixel Native Sensor Resolution unlocking (4K UHD / QHD / Full HD)
 * - Hardware LED Flash Toggle (ON/OFF + Screen Fill-Light Illuminator fallback)
 * - Hardware Continuous Torch Mode (ON/OFF Senter Kamera)
 * - Continuous Autofocus (AF), Tap-to-Focus / Refocus Trigger, & Focus Lock (AF-Lock)
 * - Manual Macro Focus Distance & Optical/Sensor Zoom (1x - 3x) for 15x5mm small barcodes
 * - 1D Vertical Noise Suppression + Horizontal Contrast Sharpening for noisy camera sensors
 */

export interface CameraOpticsCapabilities {
  supportsTorch: boolean;
  supportsFocusModes: string[];
  supportsFocusDistance: boolean;
  focusDistanceMin: number;
  focusDistanceMax: number;
  focusDistanceStep: number;
  supportsZoom: boolean;
  zoomMin: number;
  zoomMax: number;
  zoomStep: number;
  maxWidth: number;
  maxHeight: number;
  activeWidth: number;
  activeHeight: number;
  activeMegapixels: string;
}

export interface CameraOpticsConfig {
  flashEnabled: boolean;
  torchModeEnabled: boolean;
  fullMegapixelEnabled: boolean;
  denoiseMacroEnabled: boolean;
  autoFocusEnabled: boolean;
  focusLocked: boolean;
  manualFocusDistance: number | null;
  macroZoom: number;
}

export const DEFAULT_CAMERA_OPTICS_CONFIG: CameraOpticsConfig = {
  flashEnabled: false,
  torchModeEnabled: false,
  fullMegapixelEnabled: true,
  denoiseMacroEnabled: true,
  autoFocusEnabled: true,
  focusLocked: false,
  manualFocusDistance: null,
  macroZoom: 1,
};

export const DEFAULT_CAMERA_CAPABILITIES: CameraOpticsCapabilities = {
  supportsTorch: false,
  supportsFocusModes: [],
  supportsFocusDistance: false,
  focusDistanceMin: 0,
  focusDistanceMax: 1,
  focusDistanceStep: 0.01,
  supportsZoom: false,
  zoomMin: 1,
  zoomMax: 3,
  zoomStep: 0.1,
  maxWidth: 1920,
  maxHeight: 1080,
  activeWidth: 0,
  activeHeight: 0,
  activeMegapixels: 'Menyesuaikan...',
};

/**
 * Extracts active video element and its primary MediaStreamTrack from a scanner container.
 */
export function getScannerVideoAndTrack(regionId: string): {
  videoEl: HTMLVideoElement | null;
  track: MediaStreamTrack | null;
} {
  if (typeof document === 'undefined') {
    return { videoEl: null, track: null };
  }
  const container = document.getElementById(regionId);
  const videoEl = container?.querySelector('video') as HTMLVideoElement | null;
  if (!videoEl || !(videoEl.srcObject instanceof MediaStream)) {
    return { videoEl: videoEl || null, track: null };
  }
  const tracks = videoEl.srcObject.getVideoTracks();
  return {
    videoEl,
    track: tracks.length > 0 ? tracks[0] : null,
  };
}

/**
 * Formats pixel dimensions into a human-readable Megapixel & HD badge.
 */
export function formatMegapixelBadge(width: number, height: number): string {
  if (!width || !height) return 'Auto HD';
  const mp = (width * height) / 1_000_000;
  const mpStr = mp >= 1 ? `${mp.toFixed(1)} MP` : `${Math.round(mp * 1000)} KP`;
  let tier = 'SD';
  if (width >= 3800 || height >= 2100) tier = '4K UHD';
  else if (width >= 2500 || height >= 1400) tier = '2K QHD';
  else if (width >= 1900 || height >= 1050) tier = 'Full HD 1080p';
  else if (width >= 1200 || height >= 700) tier = 'HD 720p';
  return `${width}×${height} (${mpStr} · ${tier})`;
}

/**
 * Inspects the active video track capabilities (Torch, Focus, Zoom, Max Sensor Resolution).
 */
export function inspectCameraTrackCapabilities(
  regionId: string
): CameraOpticsCapabilities {
  const { videoEl, track } = getScannerVideoAndTrack(regionId);
  if (!track) return DEFAULT_CAMERA_CAPABILITIES;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let caps: any = {};
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let settings: any = {};
  try {
    if (typeof track.getCapabilities === 'function') {
      caps = track.getCapabilities() || {};
    }
    if (typeof track.getSettings === 'function') {
      settings = track.getSettings() || {};
    }
  } catch {
    // Ignore capability read errors on older browsers
  }

  const activeW = videoEl?.videoWidth || settings.width || 0;
  const activeH = videoEl?.videoHeight || settings.height || 0;
  const maxW = caps.width?.max || Math.max(activeW, 1920);
  const maxH = caps.height?.max || Math.max(activeH, 1080);

  const supportsTorch = Boolean(
    caps.torch === true ||
      (Array.isArray(caps.fillLightMode) &&
        (caps.fillLightMode.includes('torch') || caps.fillLightMode.includes('flash')))
  );

  const supportsFocusModes: string[] = Array.isArray(caps.focusMode)
    ? caps.focusMode
    : [];

  const hasFocusDist =
    caps.focusDistance &&
    typeof caps.focusDistance.min === 'number' &&
    typeof caps.focusDistance.max === 'number' &&
    caps.focusDistance.max > caps.focusDistance.min;

  const hasZoom =
    caps.zoom &&
    typeof caps.zoom.min === 'number' &&
    typeof caps.zoom.max === 'number' &&
    caps.zoom.max > caps.zoom.min;

  return {
    supportsTorch,
    supportsFocusModes,
    supportsFocusDistance: Boolean(hasFocusDist),
    focusDistanceMin: hasFocusDist ? Number(caps.focusDistance.min) : 0,
    focusDistanceMax: hasFocusDist ? Number(caps.focusDistance.max) : 1,
    focusDistanceStep:
      hasFocusDist && caps.focusDistance.step
        ? Number(caps.focusDistance.step)
        : 0.01,
    supportsZoom: Boolean(hasZoom),
    zoomMin: hasZoom ? Math.max(1, Number(caps.zoom.min)) : 1,
    zoomMax: hasZoom ? Math.min(5, Number(caps.zoom.max)) : 3,
    zoomStep: hasZoom && caps.zoom.step ? Number(caps.zoom.step) : 0.1,
    maxWidth: maxW,
    maxHeight: maxH,
    activeWidth: activeW,
    activeHeight: activeH,
    activeMegapixels: formatMegapixelBadge(activeW, activeH),
  };
}

/**
 * Applies 100% Megapixel sensor resolution, Low-Noise Exposure/Sharpness, Flash/Torch,
 * Autofocus / Focus Lock, and Hardware Zoom constraints to the active camera track.
 */
export async function applyCameraOpticsConstraints(
  regionId: string,
  config: CameraOpticsConfig
): Promise<CameraOpticsCapabilities> {
  const { videoEl, track } = getScannerVideoAndTrack(regionId);
  if (!track) return DEFAULT_CAMERA_CAPABILITIES;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let caps: any = {};
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let settings: any = {};
  try {
    if (typeof track.getCapabilities === 'function') {
      caps = track.getCapabilities() || {};
    }
    if (typeof track.getSettings === 'function') {
      settings = track.getSettings() || {};
    }
  } catch {
    // Ignore
  }

  // 1. Resolution optimization: 100% Megapixel Sensor Mode vs Standard HD
  try {
    if (config.fullMegapixelEnabled) {
      const targetW = caps.width?.max
        ? Math.min(4096, Number(caps.width.max))
        : 3840;
      const targetH = caps.height?.max
        ? Math.min(3072, Number(caps.height.max))
        : 2160;
      await track.applyConstraints({
        width: { ideal: targetW },
        height: { ideal: targetH },
        frameRate: { ideal: 30 },
      });
    } else {
      await track.applyConstraints({
        width: { ideal: 1280 },
        height: { ideal: 720 },
      });
    }
  } catch {
    // Fallback to 1080p if 4K/max sensor constraint is rejected by camera driver
    try {
      if (config.fullMegapixelEnabled) {
        await track.applyConstraints({
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        });
      }
    } catch {
      // Ignore resolution constraint fallback error
    }
  }

  // 2. Build advanced hardware constraints (Torch/Flash, Focus Mode, Focus Lock, Zoom, Sharpness)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const advancedObj: Record<string, any> = {};

  // Torch / Flash LED state (either Flash ON or Torch Mode ON activates physical camera LED)
  const shouldLightHardwareLed = Boolean(
    config.flashEnabled || config.torchModeEnabled
  );
  if (caps.torch !== undefined) {
    advancedObj.torch = shouldLightHardwareLed;
  }
  if (Array.isArray(caps.fillLightMode)) {
    if (config.torchModeEnabled && caps.fillLightMode.includes('torch')) {
      advancedObj.fillLightMode = 'torch';
    } else if (config.flashEnabled && caps.fillLightMode.includes('flash')) {
      advancedObj.fillLightMode = 'flash';
    } else if (shouldLightHardwareLed && caps.fillLightMode.includes('torch')) {
      advancedObj.fillLightMode = 'torch';
    } else if (!shouldLightHardwareLed && caps.fillLightMode.includes('off')) {
      advancedObj.fillLightMode = 'off';
    }
  }

  // Focus Mode & Focus Lock
  const focusModes: string[] = Array.isArray(caps.focusMode) ? caps.focusMode : [];
  if (config.focusLocked) {
    // Lock lens focus so it stops hunting to the background when scanning small 15x5mm barcodes
    if (focusModes.includes('manual')) {
      advancedObj.focusMode = 'manual';
    } else if (focusModes.includes('fixed')) {
      advancedObj.focusMode = 'fixed';
    } else if (focusModes.includes('single-shot')) {
      advancedObj.focusMode = 'single-shot';
    }

    if (
      caps.focusDistance &&
      typeof caps.focusDistance.min === 'number' &&
      typeof caps.focusDistance.max === 'number'
    ) {
      const targetDist =
        config.manualFocusDistance !== null
          ? config.manualFocusDistance
          : typeof settings.focusDistance === 'number'
          ? settings.focusDistance
          : caps.focusDistance.min +
            (caps.focusDistance.max - caps.focusDistance.min) * 0.18;
      const clampedDist = Math.max(
        Number(caps.focusDistance.min),
        Math.min(Number(caps.focusDistance.max), targetDist)
      );
      advancedObj.focusDistance = clampedDist;
    }
  } else if (config.autoFocusEnabled) {
    if (focusModes.includes('continuous')) {
      advancedObj.focusMode = 'continuous';
    } else if (focusModes.includes('single-shot')) {
      advancedObj.focusMode = 'single-shot';
    }
  }

  // Hardware Optical / Sensor Zoom (for 15x5mm macro scanning from 10-15cm focal distance)
  if (
    caps.zoom &&
    typeof caps.zoom.min === 'number' &&
    typeof caps.zoom.max === 'number'
  ) {
    const clampedZoom = Math.max(
      Number(caps.zoom.min),
      Math.min(Number(caps.zoom.max), config.macroZoom || 1)
    );
    advancedObj.zoom = clampedZoom;
  }

  // Hardware Sharpness, Contrast & Low-Noise Exposure optimization
  if (config.fullMegapixelEnabled || config.denoiseMacroEnabled) {
    if (caps.sharpness && typeof caps.sharpness.max === 'number') {
      const minS = Number(caps.sharpness.min ?? 0);
      const maxS = Number(caps.sharpness.max);
      advancedObj.sharpness = minS + (maxS - minS) * 0.85;
    }
    if (caps.contrast && typeof caps.contrast.max === 'number') {
      const minC = Number(caps.contrast.min ?? 0);
      const maxC = Number(caps.contrast.max);
      advancedObj.contrast = minC + (maxC - minC) * 0.75;
    }
    if (
      Array.isArray(caps.exposureMode) &&
      caps.exposureMode.includes('continuous')
    ) {
      advancedObj.exposureMode = 'continuous';
    }
    if (
      Array.isArray(caps.whiteBalanceMode) &&
      caps.whiteBalanceMode.includes('continuous')
    ) {
      advancedObj.whiteBalanceMode = 'continuous';
    }
  }

  // Apply each advanced constraint safely (first combined, then individually if driver rejects a combo)
  if (Object.keys(advancedObj).length > 0) {
    try {
      await track.applyConstraints({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        advanced: [advancedObj] as any,
      });
    } catch {
      for (const [key, val] of Object.entries(advancedObj)) {
        try {
          await track.applyConstraints({
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            advanced: [{ [key]: val }] as any,
          });
        } catch {
          // Ignore individual unsupported constraint
        }
      }
    }
  }

  // Wait briefly for video dimensions to update if resolution changed
  if (videoEl) {
    await new Promise((r) => setTimeout(r, 60));
  }

  return inspectCameraTrackCapabilities(regionId);
}

/**
 * Triggers an immediate single-shot Autofocus pulse (Tap-to-Focus or "Fokus Ulang" button)
 * and optionally locks focus afterward or returns to continuous autofocus.
 */
export async function triggerImmediateCameraRefocus(
  regionId: string,
  config: CameraOpticsConfig,
  normPoint?: { x: number; y: number }
): Promise<CameraOpticsCapabilities> {
  const { track } = getScannerVideoAndTrack(regionId);
  if (!track) return DEFAULT_CAMERA_CAPABILITIES;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let caps: any = {};
  try {
    if (typeof track.getCapabilities === 'function') {
      caps = track.getCapabilities() || {};
    }
  } catch {
    // Ignore
  }

  const focusModes: string[] = Array.isArray(caps.focusMode) ? caps.focusMode : [];

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pulseConstraint: Record<string, any> = {};
    if (normPoint && caps.pointsOfInterest) {
      pulseConstraint.pointsOfInterest = [
        {
          x: Math.max(0.05, Math.min(0.95, normPoint.x)),
          y: Math.max(0.05, Math.min(0.95, normPoint.y)),
        },
      ];
    }
    if (focusModes.includes('single-shot')) {
      pulseConstraint.focusMode = 'single-shot';
    } else if (focusModes.includes('continuous')) {
      pulseConstraint.focusMode = 'continuous';
    }

    if (Object.keys(pulseConstraint).length > 0) {
      await track.applyConstraints({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        advanced: [pulseConstraint] as any,
      });
    }
  } catch {
    // Ignore if single-shot pulse not supported
  }

  // Wait 280ms for lens actuator to settle on the barcode target
  await new Promise((r) => setTimeout(r, 280));

  return applyCameraOpticsConstraints(regionId, config);
}

/**
 * Pre-processes a cropped barcode canvas using:
 * 1. 1D Vertical Box Denoising (averages 3 vertical rows to eliminate 2D sensor ISO noise speckles
 *    without blurring horizontal barcode bar edges!)
 * 2. Local Dynamic Range Normalization + High-Contrast Bar Sharpening for tiny 15x5mm barcodes.
 */
export function renderDenoisedSharpMacroCanvas(
  sourceVideo: HTMLVideoElement,
  sx: number,
  sy: number,
  sw: number,
  sh: number,
  targetCanvas: HTMLCanvasElement,
  upscaleFactor = 1.5
): CanvasRenderingContext2D | null {
  const outW = Math.max(240, Math.min(1600, Math.round(sw * upscaleFactor)));
  const outH = Math.max(90, Math.min(600, Math.round(sh * upscaleFactor)));

  if (targetCanvas.width !== outW) targetCanvas.width = outW;
  if (targetCanvas.height !== outH) targetCanvas.height = outH;

  const ctx = targetCanvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(sourceVideo, sx, sy, sw, sh, 0, 0, outW, outH);

  try {
    const imgData = ctx.getImageData(0, 0, outW, outH);
    const data = imgData.data;
    const pixelCount = outW * outH;
    const luma = new Uint8Array(pixelCount);

    // 1. Convert RGB to Luminance (Green-weighted for sharp sensor detail) & find 5th-95th percentile range
    let minL = 255;
    let maxL = 0;
    for (let i = 0, p = 0; i < data.length; i += 4, p += 1) {
      const y = (data[i] * 77 + data[i + 1] * 150 + data[i + 2] * 29) >> 8;
      luma[p] = y;
      if (y < minL) minL = y;
      if (y > maxL) maxL = y;
    }

    const range = Math.max(24, maxL - minL);
    const midThreshold = minL + range * 0.52;

    // 2. Vertical 5-row Noise Suppression + Horizontal 1D Unsharp Masking
    // Since 1D barcodes (Code128 on 15x5mm labels) consist of vertical bars, averaging vertically
    // cancels out random camera sensor grain while keeping horizontal bar transitions razor-sharp.
    for (let y = 2; y < outH - 2; y += 1) {
      const rowOffset = y * outW;
      for (let x = 1; x < outW - 1; x += 1) {
        const idx = rowOffset + x;

        // Vertical 5-pixel average at column x (destroys 2D ISO grain)
        const vAvg =
          (luma[idx - outW * 2] +
            luma[idx - outW] +
            luma[idx] * 2 +
            luma[idx + outW] +
            luma[idx + outW * 2]) /
          6;

        // Horizontal neighbor average for unsharp mask edge boost
        const hLeft = luma[idx - 1];
        const hRight = luma[idx + 1];
        const sharpened = vAvg * 1.65 - (hLeft + hRight) * 0.325;

        // Normalize contrast & apply soft sigmoid curve around local threshold
        let norm = ((sharpened - minL) / range) * 255;
        if (sharpened < midThreshold - range * 0.12) {
          norm = Math.max(0, norm * 0.45);
        } else if (sharpened > midThreshold + range * 0.12) {
          norm = Math.min(255, 255 - (255 - norm) * 0.4);
        }
        const finalVal = norm < 0 ? 0 : norm > 255 ? 255 : norm | 0;

        const dIdx = idx << 2;
        data[dIdx] = finalVal;
        data[dIdx + 1] = finalVal;
        data[dIdx + 2] = finalVal;
      }
    }

    ctx.putImageData(imgData, 0, 0);
  } catch {
    // Fallback to raw high-res crop if ImageData manipulation fails
  }

  return ctx;
}

/**
 * Multi-Pass High-Megapixel & Anti-Noise 15x5mm Macro Barcode Decoder:
 * - Pass 1: Full-Resolution Native Sensor Center Crop via BarcodeDetector (if supported)
 * - Pass 2: 1D Vertically Denoised + Horizontally Sharpened Macro Crop (for tiny 15x5mm barcodes)
 *   via BarcodeDetector AND/OR fallback Html5Qrcode (ZXing) file decoder.
 */
export async function decodeBarcodeFromVideoMultiPass(params: {
  videoEl: HTMLVideoElement;
  config: CameraOpticsConfig;
  rawCropCanvas: HTMLCanvasElement;
  denoisedMacroCanvas: HTMLCanvasElement;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  nativeDetector: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  fallbackMacroScanner?: any;
  runFallbackZxingPass?: boolean;
}): Promise<string | null> {
  const {
    videoEl,
    config,
    rawCropCanvas,
    denoisedMacroCanvas,
    nativeDetector,
    fallbackMacroScanner,
    runFallbackZxingPass,
  } = params;

  const vw = videoEl.videoWidth;
  const vh = videoEl.videoHeight;
  if (!vw || !vh || videoEl.readyState < 2) return null;

  // Calculate effective center crop based on macroZoom (1x .. 3x)
  // Higher zoom crops tighter into the high-megapixel sensor without digital blur
  const zoomDiv = Math.max(1, Math.min(3, config.macroZoom || 1));
  const cropW = Math.max(160, Math.floor((vw * 0.82) / zoomDiv));
  const cropH = Math.max(80, Math.floor((vh * 0.48) / zoomDiv));
  const sx = Math.max(0, Math.floor((vw - cropW) / 2));
  const sy = Math.max(0, Math.floor((vh - cropH) / 2));

  // Pass 1: Raw Native High-MP Crop via Hardware BarcodeDetector
  if (nativeDetector) {
    try {
      const rawCtx = rawCropCanvas.getContext('2d', { willReadFrequently: true });
      if (rawCtx) {
        if (rawCropCanvas.width !== cropW) rawCropCanvas.width = cropW;
        if (rawCropCanvas.height !== cropH) rawCropCanvas.height = cropH;
        rawCtx.drawImage(videoEl, sx, sy, cropW, cropH, 0, 0, cropW, cropH);
        const res1 = await nativeDetector.detect(rawCropCanvas);
        const picked1 = pickCenterMostBarcode(res1, cropW, cropH);
        if (picked1) return picked1;
      }
    } catch {
      // Ignore Pass 1 error
    }
  }

  // Pass 2: Anti-Noise 15x5mm Macro Center Strip (tighter vertical strip where 15x5mm barcode sits)
  if (config.denoiseMacroEnabled || config.macroZoom > 1 || !nativeDetector) {
    const macroW = Math.max(150, Math.floor((vw * 0.72) / zoomDiv));
    const macroH = Math.max(64, Math.floor((vh * 0.28) / zoomDiv));
    const msx = Math.max(0, Math.floor((vw - macroW) / 2));
    const msy = Math.max(0, Math.floor((vh - macroH) / 2));

    renderDenoisedSharpMacroCanvas(
      videoEl,
      msx,
      msy,
      macroW,
      macroH,
      denoisedMacroCanvas,
      config.fullMegapixelEnabled ? 1.5 : 1.75
    );

    if (nativeDetector) {
      try {
        const res2 = await nativeDetector.detect(denoisedMacroCanvas);
        const picked2 = pickCenterMostBarcode(
          res2,
          denoisedMacroCanvas.width,
          denoisedMacroCanvas.height
        );
        if (picked2) return picked2;
      } catch {
        // Ignore Pass 2 nativeDetector error
      }
    }

    // Pass 3: ZXing (Html5Qrcode) decode on Denoised Macro Canvas for 15x5mm barcodes
    if (
      fallbackMacroScanner &&
      runFallbackZxingPass &&
      typeof fallbackMacroScanner.scanFile === 'function'
    ) {
      try {
        const blob = await new Promise<Blob | null>((resolve) =>
          denoisedMacroCanvas.toBlob((b) => resolve(b), 'image/png')
        );
        if (blob) {
          const file = new File([blob], 'macro15x5.png', { type: 'image/png' });
          const decoded = await fallbackMacroScanner.scanFile(file, false);
          if (typeof decoded === 'string' && decoded.trim()) {
            return decoded.trim();
          }
        }
      } catch {
        // Ignore when frame does not contain a barcode
      }
    }
  }

  return null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function pickCenterMostBarcode(results: any, width: number, height: number): string | null {
  if (!Array.isArray(results) || results.length === 0) return null;
  const cx = width / 2;
  const cy = height / 2;
  let bestVal: string | null = null;
  let bestDist = Infinity;

  for (const det of results) {
    const raw = typeof det?.rawValue === 'string' ? det.rawValue.trim() : '';
    if (!raw) continue;
    const bb = det.boundingBox;
    if (bb && typeof bb.x === 'number') {
      const bx = bb.x + (bb.width || 0) / 2;
      const by = bb.y + (bb.height || 0) / 2;
      const d = Math.hypot(bx - cx, by - cy);
      if (d < bestDist) {
        bestDist = d;
        bestVal = raw;
      }
    } else if (!bestVal) {
      bestVal = raw;
    }
  }
  return bestVal;
}

