import React from 'react';
import {
  Zap,
  ZapOff,
  Sun,
  Focus,
  Lock,
  Unlock,
  Sparkles,
  ZoomIn,
  ZoomOut,
  SlidersHorizontal,
} from 'lucide-react';
import {
  CameraOpticsCapabilities,
  CameraOpticsConfig,
} from '../utils/atkCameraOptics';

interface AtkCameraOpticsBarProps {
  config: CameraOpticsConfig;
  capabilities: CameraOpticsCapabilities;
  isRefocusing: boolean;
  onChangeConfig: (next: CameraOpticsConfig) => void;
  onTriggerRefocus: () => void;
}

export const AtkCameraOpticsBar: React.FC<AtkCameraOpticsBarProps> = ({
  config,
  capabilities,
  isRefocusing,
  onChangeConfig,
  onTriggerRefocus,
}) => {
  const handleToggleFlash = () => {
    onChangeConfig({
      ...config,
      flashEnabled: !config.flashEnabled,
    });
  };

  const handleToggleTorch = () => {
    onChangeConfig({
      ...config,
      torchModeEnabled: !config.torchModeEnabled,
    });
  };

  const handleToggleFullMegapixel = () => {
    const nextMp = !config.fullMegapixelEnabled;
    onChangeConfig({
      ...config,
      fullMegapixelEnabled: nextMp,
      denoiseMacroEnabled: nextMp ? true : config.denoiseMacroEnabled,
    });
  };

  const handleToggleDenoise = () => {
    onChangeConfig({
      ...config,
      denoiseMacroEnabled: !config.denoiseMacroEnabled,
    });
  };

  const handleToggleAutoFocus = () => {
    const nextAf = !config.autoFocusEnabled;
    onChangeConfig({
      ...config,
      autoFocusEnabled: nextAf,
      focusLocked: nextAf ? false : config.focusLocked,
    });
  };

  const handleToggleFocusLock = () => {
    const nextLock = !config.focusLocked;
    onChangeConfig({
      ...config,
      focusLocked: nextLock,
      autoFocusEnabled: nextLock ? false : true,
    });
  };

  const handleSelectZoom = (zoomVal: number) => {
    const clamped = Math.max(1, Math.min(3, Number(zoomVal.toFixed(1))));
    onChangeConfig({
      ...config,
      macroZoom: clamped,
    });
  };

  return (
    <div className="bg-slate-950/95 border border-indigo-500/50 rounded-xl p-2.5 sm:p-3 space-y-2.5 text-xs shrink-0">
      {/* Header Status Resolusi 100% Megapiksel & Anti-Noise */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="px-2 py-0.5 rounded bg-indigo-600 text-white font-mono font-extrabold text-[10px] uppercase">
            Optik Macro 15×5mm
          </span>
          <span className="font-bold text-slate-200 text-[11px]">
            Flash · Mode Torch · 100% MP Anti-Noise · Autofocus & Focus Lock
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 text-[10px] font-mono">
          <span
            className={`px-2 py-0.5 rounded border font-bold ${
              config.fullMegapixelEnabled
                ? 'bg-emerald-950/90 border-emerald-400 text-emerald-300'
                : 'bg-slate-900 border-slate-700 text-slate-400'
            }`}
          >
            📷 Sensor: {capabilities.activeMegapixels}
          </span>
          {config.denoiseMacroEnabled && (
            <span className="px-2 py-0.5 rounded bg-sky-950 border border-sky-400/60 text-sky-300 font-bold">
              ✨ Denoise 15×5mm ON
            </span>
          )}
        </div>
      </div>

      {/* Baris 1: Toggle Lampu Flash, Mode Torch, 100% Megapiksel, Autofocus, & Focus Lock */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-1.5">
        {/* 1. Toggle On/Off Lampu Flash */}
        <button
          type="button"
          onClick={handleToggleFlash}
          className={`min-h-[40px] px-2.5 py-1.5 rounded-lg border font-bold text-[11px] flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
            config.flashEnabled
              ? 'bg-amber-400 text-slate-950 border-amber-200 shadow-[0_0_12px_rgba(251,191,36,0.5)]'
              : 'bg-slate-900 hover:bg-slate-800 text-slate-200 border-slate-700'
          }`}
          title="Toggle On/Off Lampu Flash Kamera & Penerangan Layar"
        >
          {config.flashEnabled ? (
            <Zap className="w-3.5 h-3.5 fill-slate-950 shrink-0" />
          ) : (
            <ZapOff className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          )}
          <span>Flash: {config.flashEnabled ? 'ON' : 'OFF'}</span>
        </button>

        {/* 2. Toggle On/Off Mode Torch (Senter Menyala Terus) */}
        <button
          type="button"
          onClick={handleToggleTorch}
          className={`min-h-[40px] px-2.5 py-1.5 rounded-lg border font-bold text-[11px] flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
            config.torchModeEnabled
              ? 'bg-orange-500 text-white border-amber-300 shadow-[0_0_14px_rgba(249,115,22,0.6)]'
              : 'bg-slate-900 hover:bg-slate-800 text-slate-200 border-slate-700'
          }`}
          title="Toggle Mode Torch (Lampu Senter Kamera Menyala Terus untuk Scan Barcode Kecil)"
        >
          <Sun
            className={`w-3.5 h-3.5 shrink-0 ${
              config.torchModeEnabled ? 'text-white animate-spin' : 'text-orange-400'
            }`}
          />
          <span>Torch: {config.torchModeEnabled ? 'ON' : 'OFF'}</span>
        </button>

        {/* 3. Toggle Optimasi 100% Megapiksel Kamera */}
        <button
          type="button"
          onClick={handleToggleFullMegapixel}
          className={`min-h-[40px] px-2.5 py-1.5 rounded-lg border font-bold text-[11px] flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
            config.fullMegapixelEnabled
              ? 'bg-emerald-600 text-white border-emerald-400 shadow-xs'
              : 'bg-slate-900 hover:bg-slate-800 text-slate-300 border-slate-700'
          }`}
          title="Optimalkan 100% Megapiksel Sensor Kamera (Resolusi Maksimal & Ketajaman Baris Barcode)"
        >
          <Sparkles className="w-3.5 h-3.5 shrink-0" />
          <span>100% MP: {config.fullMegapixelEnabled ? 'ON' : 'OFF'}</span>
        </button>

        {/* 4. Toggle Anti-Noise Filter (Khusus Barcode Kecil 15x5mm) */}
        <button
          type="button"
          onClick={handleToggleDenoise}
          className={`min-h-[40px] px-2.5 py-1.5 rounded-lg border font-bold text-[11px] flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
            config.denoiseMacroEnabled
              ? 'bg-sky-600 text-white border-sky-400 shadow-xs'
              : 'bg-slate-900 hover:bg-slate-800 text-slate-300 border-slate-700'
          }`}
          title="Filter Anti-Noise & Penajam Garis Barcode Kecil 15×5mm"
        >
          <SlidersHorizontal className="w-3.5 h-3.5 shrink-0" />
          <span>Anti-Noise: {config.denoiseMacroEnabled ? 'ON' : 'OFF'}</span>
        </button>

        {/* 5. Toggle Autofocus + Trigger Refocus */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={handleToggleAutoFocus}
            className={`flex-1 min-h-[40px] px-2 py-1.5 rounded-lg border font-bold text-[11px] flex items-center justify-center gap-1 transition-all cursor-pointer ${
              config.autoFocusEnabled && !config.focusLocked
                ? 'bg-indigo-600 text-white border-indigo-400'
                : 'bg-slate-900 hover:bg-slate-800 text-slate-300 border-slate-700'
            }`}
            title="Aktifkan Continuous Autofocus Otomatis"
          >
            <Focus className="w-3.5 h-3.5 shrink-0" />
            <span>AF: {config.autoFocusEnabled && !config.focusLocked ? 'ON' : 'OFF'}</span>
          </button>

          <button
            type="button"
            onClick={onTriggerRefocus}
            disabled={isRefocusing}
            className="min-h-[40px] px-2 py-1.5 rounded-lg bg-indigo-950 hover:bg-indigo-800 border border-indigo-400/70 text-indigo-200 font-bold text-[10px] shrink-0 cursor-pointer"
            title="Paksa Kamera Fokus Ulang Sekarang (Tap-to-Focus)"
          >
            {isRefocusing ? '...' : 'Fokus!'}
          </button>
        </div>

        {/* 6. Toggle Focus Lock (Kunci Fokus) */}
        <button
          type="button"
          onClick={handleToggleFocusLock}
          className={`min-h-[40px] px-2.5 py-1.5 rounded-lg border font-bold text-[11px] flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
            config.focusLocked
              ? 'bg-rose-600 text-white border-rose-300 ring-2 ring-rose-400/40'
              : 'bg-slate-900 hover:bg-slate-800 text-slate-200 border-slate-700'
          }`}
          title="Focus Lock: Kunci jarak fokus kamera agar tidak berubah-ubah (hunting) saat scan barcode kecil 15×5mm"
        >
          {config.focusLocked ? (
            <Lock className="w-3.5 h-3.5 shrink-0" />
          ) : (
            <Unlock className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          )}
          <span>Focus Lock: {config.focusLocked ? 'ON' : 'OFF'}</span>
        </button>
      </div>

      {/* Baris 2: Macro Zoom (Khusus Barcode Kecil 15x5mm) & Manual Focus Distance Slider saat Focus Lock Aktif */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-1 border-t border-slate-800/80">
        {/* Preset & Slider Zoom Macro untuk Barcode 15x5mm */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] font-bold text-slate-300 flex items-center gap-1">
            <ZoomIn className="w-3.5 h-3.5 text-emerald-400" />
            Zoom Macro 15×5mm:
          </span>
          {([1, 1.5, 2, 2.5, 3] as const).map((z) => (
            <button
              key={z}
              type="button"
              onClick={() => handleSelectZoom(z)}
              className={`min-h-[30px] px-2 py-0.5 rounded-md font-mono text-[10.5px] font-bold border transition-all cursor-pointer ${
                Math.abs(config.macroZoom - z) < 0.08
                  ? 'bg-emerald-500 text-slate-950 border-emerald-300 font-extrabold'
                  : 'bg-slate-900 text-slate-300 border-slate-700 hover:text-white'
              }`}
            >
              {z}x{z === 2 ? ' (15×5mm)' : ''}
            </button>
          ))}
          {config.macroZoom > 1 && (
            <button
              type="button"
              onClick={() => handleSelectZoom(1)}
              className="min-h-[30px] px-2 py-0.5 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] flex items-center gap-1"
              title="Reset Zoom ke 1x"
            >
              <ZoomOut className="w-3 h-3" />
              <span>Reset</span>
            </button>
          )}
        </div>

        {/* Slider Jarak Fokus Manual / Fine-Tune saat Focus Lock Aktif */}
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-semibold text-slate-400 whitespace-nowrap">
            {config.focusLocked ? '🔒 Jarak Kunci Fokus Macro:' : '💡 Tips 15×5mm: Gunakan Zoom 2x & Kunci Fokus'}
          </span>
          {(config.focusLocked || capabilities.supportsFocusDistance) && (
            <input
              type="range"
              min={capabilities.focusDistanceMin || 0}
              max={capabilities.focusDistanceMax || 1}
              step={capabilities.focusDistanceStep || 0.02}
              value={
                config.manualFocusDistance !== null
                  ? config.manualFocusDistance
                  : (capabilities.focusDistanceMin || 0) +
                    ((capabilities.focusDistanceMax || 1) -
                      (capabilities.focusDistanceMin || 0)) *
                      0.2
              }
              onChange={(e) => {
                const val = parseFloat(e.target.value);
                onChangeConfig({
                  ...config,
                  focusLocked: true,
                  autoFocusEnabled: false,
                  manualFocusDistance: Number.isNaN(val) ? 0.2 : val,
                });
              }}
              className="w-24 sm:w-32 accent-rose-500 cursor-pointer"
              title="Geser untuk mengatur jarak fokus lensa secara presisi pada stiker barcode kecil 15×5mm"
            />
          )}
        </div>
      </div>
    </div>
  );
};
