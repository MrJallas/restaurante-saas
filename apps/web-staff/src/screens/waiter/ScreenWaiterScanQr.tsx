'use client';

// ScreenWaiterScanQr — câmera/viewfinder pra escanear o QR da mesa.
// Match com docs/design/canvas/handoff/garcom/garcom-screens-b.jsx ::
// ScreenWaiterScanQr. Fundo SEMPRE escuro.
//
// Tap no fallback ("Inserir número da mesa") leva pro picker.

import * as React from 'react';
import { Icon } from '../../components/waiter/Icons';
import { G_FONT } from '../../components/waiter/tokens';

type DetectedBarcode = { rawValue: string };
type BarcodeDetectorInstance = {
  detect: (source: CanvasImageSource) => Promise<DetectedBarcode[]>;
};
type BarcodeDetectorCtor = new (options?: { formats?: string[] }) => BarcodeDetectorInstance;

declare global {
  interface Window {
    BarcodeDetector?: BarcodeDetectorCtor;
  }
}

interface ScreenWaiterScanQrProps {
  onClose?: () => void;
  onManualEntry?: () => void;
  onScanned?: (tableCode: string) => void;
}

function extractTableCode(raw: string): string {
  const value = raw.trim();
  if (!value) return '';
  try {
    const parsed = JSON.parse(value) as {
      tableCode?: string;
      code?: string;
      table?: string | number;
    };
    const jsonCode = parsed.tableCode ?? parsed.code ?? parsed.table;
    if (jsonCode) return String(jsonCode).trim();
  } catch {
    // not JSON
  }
  try {
    const url = new URL(value);
    const queryCode =
      url.searchParams.get('tableCode') ??
      url.searchParams.get('table') ??
      url.searchParams.get('code');
    if (queryCode) return queryCode.trim();
    const parts = url.pathname.split('/').filter(Boolean);
    const mesaIdx = parts.findIndex((p) => p === 'mesa' || p === 'table');
    if (mesaIdx >= 0 && parts[mesaIdx + 1]) {
      return decodeURIComponent(parts[mesaIdx + 1]).trim();
    }
  } catch {
    // not URL
  }
  const match =
    value.match(/[?&](?:tableCode|table|code)=([^&]+)/i) ??
    value.match(/(?:mesa|table)\/([^/?#]+)/i);
  if (match?.[1]) return decodeURIComponent(match[1]).trim();
  return value;
}

export const ScreenWaiterScanQr: React.FC<ScreenWaiterScanQrProps> = ({
  onClose,
  onManualEntry,
  onScanned,
}) => {
  const bg = '#0a0a0a';
  const videoRef = React.useRef<HTMLVideoElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const detectedRef = React.useRef(false);
  const [status, setStatus] = React.useState('Abrindo câmera…');
  const [cameraError, setCameraError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let stopped = false;
    let raf = 0;
    let stream: MediaStream | null = null;
    let detector: BarcodeDetectorInstance | null = null;

    async function start() {
      if (typeof window === 'undefined') return;
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraError('Câmera indisponível neste navegador.');
        return;
      }
      if (!window.BarcodeDetector) {
        setCameraError('Leitor QR nativo indisponível. Use a entrada manual.');
        return;
      }

      try {
        detector = new window.BarcodeDetector({ formats: ['qr_code'] });
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false,
        });
        if (stopped) return;
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        await video.play();
        setStatus('Procurando QR…');
        raf = window.requestAnimationFrame(scan);
      } catch (err) {
        setCameraError(err instanceof Error ? err.message : 'Não foi possível acessar a câmera.');
      }
    }

    async function scan() {
      if (stopped || detectedRef.current) return;
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (video && canvas && detector && video.readyState >= 2) {
        const width = video.videoWidth || 640;
        const height = video.videoHeight || 480;
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (ctx) {
          ctx.drawImage(video, 0, 0, width, height);
          try {
            const codes = await detector.detect(canvas);
            const raw = codes[0]?.rawValue;
            const tableCode = raw ? extractTableCode(raw) : '';
            if (tableCode) {
              detectedRef.current = true;
              setStatus(`Mesa detectada · ${tableCode}`);
              onScanned?.(tableCode);
              return;
            }
          } catch {
            // Keep scanning. Some browsers throw while the frame is changing.
          }
        }
      }
      raf = window.requestAnimationFrame(scan);
    }

    start();
    return () => {
      stopped = true;
      if (raf) window.cancelAnimationFrame(raf);
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, [onScanned]);

  return (
    <div
      style={{
        width: '100%',
        height: '100vh',
        background: bg,
        color: '#fff',
        fontFamily: G_FONT,
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '54px 16px 12px',
        }}
      >
        <button
          type="button"
          aria-label="Fechar"
          onClick={onClose}
          style={{
            all: 'unset',
            cursor: 'pointer',
            width: 40,
            height: 40,
            borderRadius: 20,
            background: 'rgba(255,255,255,0.15)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
          }}
        >
          {Icon.x(18)}
        </button>
        <div
          style={{
            fontSize: 11,
            letterSpacing: 1.5,
            textTransform: 'uppercase',
            fontWeight: 700,
            color: 'rgba(255,255,255,0.7)',
          }}
        >
          Câmera
        </div>
        <div style={{ width: 40 }} />
      </div>

      <div style={{ padding: '0 24px 18px', textAlign: 'center' }}>
        <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: -0.5, marginTop: 18 }}>
          Escaneie a mesa
        </div>
        <div
          style={{ fontSize: 14, color: 'rgba(255,255,255,0.7)', marginTop: 8, lineHeight: 1.4 }}
        >
          Posicione o QR code da mesa dentro da moldura para começar o atendimento.
        </div>
      </div>

      {/* Viewfinder */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
          minHeight: 320,
        }}
      >
        <div style={{ position: 'relative', width: 240, height: 240 }}>
          <video
            ref={videoRef}
            playsInline
            muted
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              borderRadius: 18,
              background: 'rgba(255,255,255,0.08)',
            }}
          />
          {[
            {
              top: 0,
              left: 0,
              borderTop: '3px solid #fff',
              borderLeft: '3px solid #fff',
              borderTopLeftRadius: 14,
            },
            {
              top: 0,
              right: 0,
              borderTop: '3px solid #fff',
              borderRight: '3px solid #fff',
              borderTopRightRadius: 14,
            },
            {
              bottom: 0,
              left: 0,
              borderBottom: '3px solid #fff',
              borderLeft: '3px solid #fff',
              borderBottomLeftRadius: 14,
            },
            {
              bottom: 0,
              right: 0,
              borderBottom: '3px solid #fff',
              borderRight: '3px solid #fff',
              borderBottomRightRadius: 14,
            },
          ].map((s, i) => (
            <span
              key={i}
              style={{ position: 'absolute', width: 36, height: 36, ...(s as React.CSSProperties) }}
            />
          ))}
          <div
            style={{
              position: 'absolute',
              left: 8,
              right: 8,
              top: '50%',
              height: 2,
              background:
                'linear-gradient(90deg, transparent, rgba(255,255,255,0.85), transparent)',
              boxShadow: '0 0 14px rgba(255,255,255,0.6)',
              animation: 'gPulse 1.6s infinite ease-in-out',
            }}
          />
        </div>
        <canvas ref={canvasRef} style={{ display: 'none' }} />
      </div>

      <div
        style={{
          padding: '8px 16px 36px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 14,
        }}
      >
        <div
          style={{
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: 1,
            textTransform: 'uppercase',
            color: 'rgba(255,255,255,0.45)',
            fontFamily: 'ui-monospace, SF Mono, JetBrains Mono, monospace',
          }}
        >
          {cameraError ?? status}
        </div>
        <button
          type="button"
          onClick={onManualEntry}
          style={{
            all: 'unset',
            cursor: 'pointer',
            fontSize: 13,
            fontWeight: 600,
            color: 'rgba(255,255,255,0.85)',
            letterSpacing: -0.1,
            textDecoration: 'underline',
            textUnderlineOffset: 4,
          }}
        >
          Inserir número da mesa
        </button>
      </div>
    </div>
  );
};

export default ScreenWaiterScanQr;
