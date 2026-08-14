'use client';
import { useEffect, useRef, useState } from 'react';
import { BrowserMultiFormatReader } from '@zxing/browser';
import { useTranslations } from 'next-intl';

// Full-screen camera scanner for serial-number barcodes (Code128, EAN, UPC, QR...).
// zxing decodes in software so it works on iPhone Safari too, unlike the native
// BarcodeDetector API which Safari doesn't implement.
export default function BarcodeScanner({ onScan, onClose }) {
  const t = useTranslations('shared.barcodeScanner');
  const videoRef = useRef(null);
  const controlsRef = useRef(null);
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;
  const [error, setError] = useState('');

  useEffect(() => {
    const reader = new BrowserMultiFormatReader();
    let stopped = false;
    reader.decodeFromConstraints(
      { video: { facingMode: 'environment' } },
      videoRef.current,
      (result) => {
        if (result && !stopped) {
          stopped = true;
          controlsRef.current?.stop();
          onScanRef.current(result.getText());
        }
      }
    ).then(controls => { controlsRef.current = controls; })
      .catch(() => setError(t('cameraError')));
    return () => {
      stopped = true;
      controlsRef.current?.stop();
    };
  }, []);

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.92)', zIndex: 400, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
      <button onClick={onClose} aria-label={t('closeLabel')} style={{ position: 'absolute', top: 20, right: 20, background: 'rgba(255,255,255,0.2)', border: 'none', color: '#fff', fontSize: 24, borderRadius: '50%', width: 40, height: 40, cursor: 'pointer', zIndex: 2 }}>✕</button>
      {error ? (
        <p style={{ color: '#fff', padding: '0 30px', textAlign: 'center', fontSize: 14 }}>{error}</p>
      ) : (
        <>
          <video ref={videoRef} onClick={e => e.stopPropagation()} muted playsInline
            style={{ width: '100%', maxWidth: 430, borderRadius: 12, background: '#000' }} />
          <p style={{ color: '#fff', marginTop: 16, fontSize: 14 }}>{t('instructions')}</p>
        </>
      )}
    </div>
  );
}
