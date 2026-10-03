'use client';
import { useEffect, useRef, useState } from 'react';
import { useT } from '@/i18n';

/** Světlý skener QR kódu přímo v aplikaci (fotoaparát zůstává v zařízení, nic se neodesílá). */
export default function QrScanner({ onCode, onClose, label }: { onCode: (text: string) => void; onClose: () => void; label: string }) {
  const t = useT();
  const video = useRef<HTMLVideoElement>(null);
  const [err, setErr] = useState<string | null>(null);
  const [hit, setHit] = useState(false);
  useEffect(() => {
    let stream: MediaStream | null = null, timer: ReturnType<typeof setInterval> | null = null, alive = true;
    (async () => {
      try {
        const jsQR = (await import('jsqr')).default;
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1280 } }, audio: false });
        if (!alive || !video.current) return;
        video.current.srcObject = stream; await video.current.play();
        const canvas = document.createElement('canvas'), ctx = canvas.getContext('2d', { willReadFrequently: true });
        timer = setInterval(() => {
          const v = video.current;
          if (!v || !ctx || v.videoWidth === 0) return;
          const w = 480, h = Math.round((v.videoHeight / v.videoWidth) * w);
          canvas.width = w; canvas.height = h; ctx.drawImage(v, 0, 0, w, h);
          const r = jsQR(ctx.getImageData(0, 0, w, h).data, w, h, { inversionAttempts: 'dontInvert' });
          if (r?.data && /#p=[0-9a-f-]{36}\./.test(r.data)) { setHit(true); if (timer) clearInterval(timer); setTimeout(() => onCode(r.data), 450); }
        }, 220);
      } catch { setErr(t('fam_camErr')); }
    })();
    return () => { alive = false; if (timer) clearInterval(timer); stream?.getTracks().forEach((tr) => tr.stop()); };
  }, [onCode, t]);
  return (
    <div className={`fam-scanner${hit ? ' hit' : ''}`}>
      <video ref={video} playsInline muted aria-label={label} />
      <span className="fam-brk" aria-hidden><i /><i /><i /><i /></span><span className="fam-laser" aria-hidden />
      {hit && <span className="fam-hit" aria-hidden>✓</span>}
      <p>{err ?? label}</p>
      <button type="button" className="fam-x" aria-label={t('close')} onClick={onClose}>×</button>
    </div>
  );
}
