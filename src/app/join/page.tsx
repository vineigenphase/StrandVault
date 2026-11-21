// QR landing: name + look → pull up into THE VAULT (CLAUDE.md §0 step 2). Lane UI (fast version).
// Works full-page on a phone, or inside the host's side panel (?embed=1&as=side-N) as a separate person.
'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { api } from '@/lib/api';
import type { Look } from '@/lib/types';
import { HAIR_STYLES, LOOK_OPTIONS, sheetFor, WALK_FPS } from '@/game/sprites/characters';
import { SHEET_KEYFRAMES, sheetAnim } from '@/game/sprites/pixel';
import { loadProfile, profileKey, saveProfile } from '@/vault/profile';

const noop = () => () => {};
const useIsClient = () => useSyncExternalStore(noop, () => true, () => false);

const pick = <T,>(arr: readonly T[]) => arr[Math.floor(Math.random() * arr.length)];

export default function Join() {
  const client = useIsClient();
  const router = useRouter();
  const [name, setName] = useState('');
  const [look, setLook] = useState<Look>({ jacket: '#FF2E88', hair: 'mullet', hairColor: '#3B1F0E', skin: '#E0AC69', shades: true });
  const [busy, setBusy] = useState(false);
  const [params, setParams] = useState<{ code: string; as: string | null; embed: boolean }>({ code: 'KCL', as: null, embed: false });

  // Read the query once on the client (no useSearchParams → no Suspense boundary needed).
  useEffect(() => {
    const qs = new URLSearchParams(window.location.search);
    const as = qs.get('as');
    const prev = loadProfile(profileKey(as));
    const t = window.setTimeout(() => {
      setParams({ code: qs.get('code') || 'KCL', as, embed: qs.has('embed') });
      if (prev.name) setName(prev.name);
      setLook(prev.look ?? {
        jacket: pick(LOOK_OPTIONS.jackets), hair: pick(HAIR_STYLES), hairColor: pick(LOOK_OPTIONS.hairColors),
        skin: pick(LOOK_OPTIONS.skins), shades: Math.random() < 0.5,
      });
    }, 0);
    return () => window.clearTimeout(t);
  }, []);

  const sheet = useMemo(() => (client ? sheetFor(look) : null), [client, look]);
  const cleanName = name.toUpperCase().replace(/[^A-Z0-9 ]/g, '').trim().slice(0, 12);

  const submit = async () => {
    if (!cleanName || busy) return;
    setBusy(true);
    const key = profileKey(params.as);
    const prev = loadProfile(key);
    const res = await api.join({ name: cleanName, look, favId: null, code: params.code, userId: prev.userId });
    saveProfile(key, { userId: res.userId, name: res.presence.name, look });
    const q = new URLSearchParams();
    if (params.as) q.set('as', params.as);
    if (params.code !== 'KCL') q.set('code', params.code);
    router.push(`/play${q.size ? `?${q}` : ''}`);
  };

  const swatch = (color: string, active: boolean, onClick: () => void, label: string) => (
    <button
      key={color}
      onClick={onClick}
      aria-label={label}
      aria-pressed={active}
      className="h-11 w-11 rounded-full border-2 transition-transform hover:scale-110"
      style={{ background: color, borderColor: active ? 'var(--cream)' : 'transparent', boxShadow: active ? `0 0 10px ${color}` : 'none' }}
    />
  );

  return (
    <main
      className="flex min-h-full flex-1 flex-col items-center gap-5 overflow-y-auto px-5 py-6 text-cream"
      style={{ background: 'linear-gradient(180deg, var(--dusk), var(--night) 70%)' }}
    >
      <style>{SHEET_KEYFRAMES}</style>
      <header className="flex flex-col items-center gap-1 text-center">
        <h1 className="font-neon text-4xl text-neon-pink" style={{ textShadow: '0 0 12px var(--neon-pink)' }}>PULL UP</h1>
        <p className="font-term text-xl text-cream/80">to THE VAULT · store {params.code}</p>
      </header>

      {/* Live sprite preview */}
      <div className="flex h-28 items-end justify-center">
        {sheet && <div style={sheetAnim(sheet, sheet.walk, WALK_FPS, 4)} aria-hidden />}
      </div>

      <label className="flex w-full max-w-sm flex-col gap-2">
        <span className="font-hud text-[10px] text-neon-cyan">YOUR NAME</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          maxLength={12}
          autoFocus
          autoComplete="off"
          placeholder="e.g. ALEX"
          className="min-h-12 rounded-xl border-2 border-cream/20 bg-night/70 px-4 font-hud text-sm uppercase text-cream outline-none placeholder:text-cream/30 focus:border-neon-pink"
        />
      </label>

      <section className="flex w-full max-w-sm flex-col gap-2">
        <span className="font-hud text-[10px] text-neon-cyan">JACKET</span>
        <div className="flex flex-wrap gap-2">{LOOK_OPTIONS.jackets.map((c) => swatch(c, look.jacket === c, () => setLook({ ...look, jacket: c }), `Jacket ${c}`))}</div>
      </section>

      <section className="flex w-full max-w-sm flex-col gap-2">
        <span className="font-hud text-[10px] text-neon-cyan">HAIR</span>
        <div className="flex flex-wrap gap-2">
          {HAIR_STYLES.map((h) => (
            <button
              key={h}
              onClick={() => setLook({ ...look, hair: h })}
              aria-pressed={look.hair === h}
              className="min-h-11 rounded-full border-2 px-4 font-hud text-[10px] uppercase"
              style={{ borderColor: look.hair === h ? 'var(--neon-pink)' : 'rgba(244,232,193,.2)', color: look.hair === h ? 'var(--neon-pink)' : 'var(--cream)' }}
            >
              {h}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">{LOOK_OPTIONS.hairColors.map((c) => swatch(c, look.hairColor === c, () => setLook({ ...look, hairColor: c }), `Hair colour ${c}`))}</div>
      </section>

      <section className="flex w-full max-w-sm flex-col gap-2">
        <span className="font-hud text-[10px] text-neon-cyan">SKIN</span>
        <div className="flex flex-wrap gap-2">{LOOK_OPTIONS.skins.map((c) => swatch(c, look.skin === c, () => setLook({ ...look, skin: c }), `Skin ${c}`))}</div>
      </section>

      <button
        onClick={() => setLook({ ...look, shades: !look.shades })}
        aria-pressed={look.shades}
        className="min-h-11 rounded-full border-2 px-5 font-hud text-[10px]"
        style={{ borderColor: look.shades ? 'var(--neon-cyan)' : 'rgba(244,232,193,.2)', color: look.shades ? 'var(--neon-cyan)' : 'var(--cream)' }}
      >
        {look.shades ? '😎 SHADES ON' : 'SHADES OFF'}
      </button>

      <button
        onClick={submit}
        disabled={!cleanName || busy}
        className="mt-2 min-h-14 w-full max-w-sm rounded-full font-banner text-xl tracking-wide text-night transition-transform enabled:hover:scale-[1.02] disabled:opacity-40"
        style={{ background: 'linear-gradient(90deg, var(--sunset), var(--neon-pink))', boxShadow: '0 0 20px rgba(255,46,136,.5)' }}
      >
        {busy ? 'PULLING UP…' : 'PULL UP ▶'}
      </button>
      {!params.embed && <p className="pb-4 text-center font-term text-lg text-cream/50">You&apos;ll walk into the store on this phone. Tap to walk, tap shelves to browse.</p>}
    </main>
  );
}
