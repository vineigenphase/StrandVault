// Host / projector extras for THE VAULT: a neon "SCAN TO PULL UP" QR (phones join from it), which you can
// also click to open the join flow in a side panel ("new person joins" on the projector), plus fullscreen.
'use client';

import QRCode from 'qrcode';
import { useEffect, useState } from 'react';

export const PANEL_W = 400;

export default function HostOverlay({ open, onToggle, code, hideQr = false }: { open: boolean; onToggle(v: boolean): void; code: string; hideQr?: boolean }) {
  const [svg, setSvg] = useState('');
  const [joinUrl, setJoinUrl] = useState('');
  const [slot, setSlot] = useState(1); // each "someone new" gets its own identity on this device
  const [full, setFull] = useState(false);

  useEffect(() => {
    const base = (process.env.NEXT_PUBLIC_SITE_URL || window.location.origin).replace(/\/$/, '');
    const url = `${base}/join?code=${encodeURIComponent(code)}`;
    let live = true;
    QRCode.toString(url, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#0B0620', light: '#F4E8C1' } })
      .then((s) => {
        if (live) {
          setSvg(s);
          setJoinUrl(url);
        }
      })
      .catch(() => {});
    const onFs = () => setFull(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFs);
    return () => {
      live = false;
      document.removeEventListener('fullscreenchange', onFs);
    };
  }, [code]);

  const toggleFull = () => {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    else void document.documentElement.requestFullscreen?.().catch(() => {});
  };

  const panelSrc = `/join?code=${encodeURIComponent(code)}&as=side-${slot}&embed=1`;

  return (
    <>
      {/* Fullscreen toggle (top-right) */}
      <button
        onClick={toggleFull}
        className="fixed top-3 z-50 flex h-11 w-11 items-center justify-center rounded-full border border-cream/20 bg-night/60 font-hud text-[12px] text-cream backdrop-blur hover:border-neon-pink"
        style={{ right: open ? PANEL_W + 12 : 12 }}
        aria-label={full ? 'Exit fullscreen' : 'Fullscreen'}
        title={full ? 'Exit fullscreen' : 'Fullscreen (projector)'}
      >
        {full ? '⤡' : '⤢'}
      </button>

      {/* QR card (bottom-left): scan on a phone, or click to open the join flow on the side */}
      {svg && !open && !hideQr && (
        <button
          onClick={() => onToggle(true)}
          className="fixed bottom-4 left-4 z-50 flex flex-col items-center gap-2 rounded-2xl border-2 border-neon-pink bg-night/80 p-3 backdrop-blur transition-transform hover:scale-105"
          style={{ boxShadow: '0 0 18px var(--neon-pink), inset 0 0 12px rgba(255,46,136,.35)' }}
          title={joinUrl}
          aria-label="Scan to pull up, or click to join on this screen"
        >
          <span className="font-hud text-[10px] tracking-wider text-neon-pink" style={{ textShadow: '0 0 6px var(--neon-pink)' }}>
            SCAN TO PULL UP
          </span>
          <span className="block h-[120px] w-[120px] overflow-hidden rounded-md" dangerouslySetInnerHTML={{ __html: svg }} />
          <span className="font-term text-base leading-none text-cream/80">or click to join here ▸</span>
        </button>
      )}

      {/* Side panel: the phone join flow, as a brand-new person */}
      <aside
        className="fixed right-0 top-0 z-50 flex h-full flex-col border-l-2 border-neon-pink bg-night transition-transform duration-500"
        style={{ width: PANEL_W, transform: open ? 'translateX(0)' : `translateX(${PANEL_W + 8}px)`, boxShadow: '-8px 0 30px rgba(255,46,136,.25)' }}
        aria-hidden={!open}
      >
        <header className="flex items-center gap-2 border-b border-cream/10 px-3 py-2">
          <span className="font-hud text-[10px] text-neon-pink">NEW PERSON · PULL UP</span>
          <button
            onClick={() => setSlot((n) => n + 1)}
            className="ml-auto min-h-11 rounded-full border border-cream/20 px-3 font-term text-lg text-cream hover:border-neon-cyan"
            title="Join as someone else"
          >
            ↺ Someone new
          </button>
          <button onClick={() => onToggle(false)} className="min-h-11 min-w-11 rounded-full font-hud text-sm text-cream hover:text-neon-pink" aria-label="Close panel">
            ×
          </button>
        </header>
        {open && <iframe key={slot} src={panelSrc} title="Join THE VAULT" className="w-full flex-1 border-0 bg-night" allow="fullscreen" />}
      </aside>
    </>
  );
}
