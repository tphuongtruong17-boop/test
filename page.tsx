'use client';
// app/page.tsx

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useOpnetWallet, useFactory, MemeInfo } from '@/hooks/useOpnetWallet';
import { getProvider, FACTORY_ABI, CONTRACTS, NETWORK } from '@/lib/opnet';
import { getContract } from 'opnet';
import { useWallet } from '@btc-vision/walletconnect';
import WalletButton from '@/components/WalletButton';

type Tab  = 'all' | 'hot' | 'new';
type Page = 'explore' | 'create' | 'mine';

// ─── Motoswap deep-link helpers ──────────────────────────────────────────────
// Motoswap là DEX của OP_NET — https://motoswap.org
// Sau khi deploy token, redirect thẳng tới trang Add Liquidity
const motoswapLiquidityUrl = (tokenAddr: string) =>
  `https://motoswap.org/add/${tokenAddr}`;
const motoswapSwapUrl = (tokenAddr: string) =>
  `https://motoswap.org/#/swap?outputCurrency=${tokenAddr}`;

// ─── Supply formatter ────────────────────────────────────────────────────────
function fmtNum(raw: string): string {
  const n = raw.replace(/,/g, '');
  if (!n || isNaN(Number(n))) return raw;
  return Number(n).toLocaleString('en-US');
}
function parseBig(v: string): bigint {
  try { return BigInt(v.replace(/,/g, '')); } catch { return 1_000_000_000n; }
}

// ─── Social config ────────────────────────────────────────────────────────────
const SOCIAL_FIELDS = [
  { key: 'website',  label: 'Website',     icon: '🌐', ph: 'https://yourproject.com' },
  { key: 'twitter',  label: 'X / Twitter', icon: '𝕏',  ph: 'https://x.com/yourtoken' },
  { key: 'telegram', label: 'Telegram',    icon: '✈️', ph: 'https://t.me/yourgroup' },
  { key: 'discord',  label: 'Discord',     icon: '💬', ph: 'https://discord.gg/...' },
  { key: 'github',   label: 'GitHub',      icon: '🐙', ph: 'https://github.com/...' },
] as const;

// ─── SUPPLY PRESETS ───────────────────────────────────────────────────────────
const SUPPLY_PRESETS = [
  { label: '1M',   val: '1,000,000' },
  { label: '100M', val: '100,000,000' },
  { label: '1B ★', val: '1,000,000,000' },
  { label: '10B',  val: '10,000,000,000' },
  { label: '1T',   val: '1,000,000,000,000' },
];

// ─────────────────────────────────────────────────────────────────────────────
export default function Home() {
  const router = useRouter();
  const { address, isConnected } = useOpnetWallet();
  const { account, sendTransaction }  = useWallet();

  const [page, setPage] = useState<Page>('explore');
  const [tab,  setTab]  = useState<Tab>('all');
  const [search, setSearch] = useState('');

  const { memes, loading, refetch } = useFactory();

  // ── Create form ─────────────────────────────────────────────────────────────
  const [fName,    setFName]    = useState('');
  const [fSymbol,  setFSymbol]  = useState('');
  const [fDesc,    setFDesc]    = useState('');
  const [fFloor,   setFFloor]   = useState('1000');
  const [fSupply,  setFSupply]  = useState('1,000,000,000'); // default 1B, editable
  const [fImgUrl,  setFImgUrl]  = useState('');
  const [imgPreview, setImgPreview] = useState('');

  // Social links — dùng object để dễ map
  const [social, setSocial] = useState<Record<string, string>>({
    website: '', twitter: '', telegram: '', discord: '', github: '',
  });
  const updateSocial = (key: string, val: string) =>
    setSocial(prev => ({ ...prev, [key]: val }));

  // Deploy state
  const [deploying,     setDeploying]     = useState(false);
  const [deployStep,    setDeployStep]    = useState(0); // 0=idle 1-3=steps 4=done
  const [deployHashes,  setDeployHashes]  = useState<string[]>([]);
  const [deployError,   setDeployError]   = useState<string | null>(null);
  const [deployedToken, setDeployedToken] = useState<string | null>(null);
  const [deployedIndex, setDeployedIndex] = useState<bigint | null>(null);

  // ── Explore filters ──────────────────────────────────────────────────────────
  const filtered = memes
    .filter(m => {
      const q = search.toLowerCase();
      return !q || m.name?.toLowerCase().includes(q) || m.symbol?.toLowerCase().includes(q);
    })
    .sort((a, b) => {
      if (tab === 'hot') return Number(b.takeovers - a.takeovers);
      if (tab === 'new') return Number(b.createdBlock - a.createdBlock);
      return 0;
    });

  const myMemes = memes.filter(
    m => address && m.creator?.toLowerCase() === address.toLowerCase()
  );

  // ── Validation ───────────────────────────────────────────────────────────────
  function validate(): string | null {
    if (!fName.trim())   return 'Enter token name';
    if (!fSymbol.trim()) return 'Enter symbol (e.g. DOGE2)';
    const floor  = parseBig(fFloor);
    const supply = parseBig(fSupply);
    if (floor  < 500n)                return 'Floor price min 500 SAT';
    if (supply < 1_000_000n)          return 'Supply min 1,000,000';
    if (supply > 1_000_000_000_000n)  return 'Supply max 1 trillion';
    return null;
  }

  // ── Deploy handler ────────────────────────────────────────────────────────────
  const handleDeploy = async () => {
    if (!isConnected || !account) { setDeployError('Connect wallet first'); return; }
    const err = validate();
    if (err) { setDeployError(err); return; }

    setDeploying(true);
    setDeployStep(1);
    setDeployHashes([]);
    setDeployError(null);
    setDeployedToken(null);
    setDeployedIndex(null);

    const floor  = parseBig(fFloor);
    const supply = parseBig(fSupply);

    try {
      const provider = getProvider();

      // Step 1 ── Deploy RevenueSharingV2 (100 slots)
      const revTx = await sendTransaction({
        to: 'DEPLOY',
        // Thực tế: hex của RevenueSharingV2.wasm
        data: '0x' + 'RevenueSharingV2_WASM_HEX',
        value: 0n,
        network: NETWORK,
      });
      setDeployHashes(p => [...p, revTx?.txid ?? 'pending...']);
      setDeployStep(2);
      const revenueAddr = revTx?.contractAddress ?? '';

      // Step 2 ── Deploy MemeToken với supply tùy chỉnh
      // Constructor args: name, symbol, totalSupply (bigint), revenueContractAddress
      const tokenTx = await sendTransaction({
        to: 'DEPLOY',
        // Thực tế: hex của MemeToken.wasm + ABI-encoded constructor(name, symbol, supply, revenueAddr)
        data: encodeMemeTokenDeploy(fName.trim(), fSymbol.trim().toUpperCase(), supply, revenueAddr),
        value: 0n,
        network: NETWORK,
      });
      setDeployHashes(p => [...p, tokenTx?.txid ?? 'pending...']);
      setDeployStep(3);
      const tokenAddr = tokenTx?.contractAddress ?? '';
      setDeployedToken(tokenAddr);

      // Step 3 ── Register in MemeFactory (với social metadata)
      if (!CONTRACTS.FACTORY) throw new Error('Set NEXT_PUBLIC_FACTORY_ADDRESS in .env.local');

      const factory  = getContract(CONTRACTS.FACTORY, FACTORY_ABI as any, provider, NETWORK);
      // Encode social links vào description field dưới dạng JSON suffix
      const socialJson = JSON.stringify(
        Object.fromEntries(Object.entries(social).filter(([, v]) => v.trim()))
      );
      const descWithSocial = fDesc.trim()
        ? `${fDesc.trim()}\n\n__social__:${socialJson}`
        : `__social__:${socialJson}`;

      const regResult = await (factory as any).registerMeme(
        tokenAddr,
        revenueAddr,
        fName.trim(),
        fSymbol.trim().toUpperCase(),
        fImgUrl || '',
        descWithSocial,
        floor,
        10000n,   // protocol fee 10,000 SAT
      );
      const regTx = await regResult.sendTransaction({
        signer:                    account.keypair,
        refundTo:                  account.p2tr,
        maximumAllowedSatToSpend:  20000n,
        feeRate:                   10,
        network:                   NETWORK,
      });
      setDeployHashes(p => [...p, regTx?.txid ?? 'pending...']);

      const idx = regResult.properties?.index ?? 0n;
      setDeployedIndex(idx);
      setDeployStep(4); // ← done!
      refetch();

    } catch (e: any) {
      setDeployError(e.message || 'Deployment failed');
      setDeploying(false);
    }
  };

  // Encode constructor calldata cho MemeToken
  // Thực tế cần ABI encoder của @btc-vision/transaction
  function encodeMemeTokenDeploy(
    name: string, symbol: string, supply: bigint, revenueAddr: string
  ): string {
    // Placeholder — replace với thực tế khi có .wasm compiled
    const supplyHex = supply.toString(16).padStart(64, '0');
    return '0x4D656D65_WASM_PREFIX' + supplyHex;
  }

  // ── Shared styles ─────────────────────────────────────────────────────────────
  const inp: React.CSSProperties = {
    width: '100%', background: 'var(--s1)', border: '1px solid var(--border)',
    color: 'var(--text)', padding: '11px 13px', fontSize: 14,
    outline: 'none', fontFamily: 'inherit',
  };
  const lbl: React.CSSProperties = {
    display: 'block', fontSize: 10, color: 'var(--muted)', marginBottom: 6,
    fontFamily: "'Space Mono',monospace", letterSpacing: 1, textTransform: 'uppercase',
  };
  const secTitle: React.CSSProperties = {
    fontFamily: "'Space Mono',monospace", fontSize: 9, letterSpacing: 2,
    color: 'var(--muted)', marginBottom: 14, paddingBottom: 8,
    borderBottom: '1px solid var(--border)',
  };
  const accBtn = (bg = 'var(--acc)', color = '#000'): React.CSSProperties => ({
    fontFamily: "'Space Mono',monospace", fontSize: 10, fontWeight: 700,
    letterSpacing: 2, padding: '10px 18px', background: bg, color,
    border: 'none', cursor: 'pointer', transition: '.15s',
    clipPath: 'polygon(0 0,calc(100% - 6px) 0,100% 6px,100% 100%,6px 100%,0 calc(100% - 6px))',
  });
  const nb = (active: boolean): React.CSSProperties => ({
    fontFamily: "'Space Mono',monospace", fontSize: 10, letterSpacing: 2,
    padding: '8px 14px', background: 'none', cursor: 'pointer',
    border: active ? '1px solid var(--border2)' : '1px solid transparent',
    color: active ? 'var(--text)' : 'var(--muted)', transition: '.15s',
  });
  const tabStyle = (active: boolean): React.CSSProperties => ({
    fontFamily: "'Space Mono',monospace", fontSize: 9, letterSpacing: 2,
    padding: '10px 12px', cursor: 'pointer',
    background: active ? 'var(--s2)' : 'none',
    border: active ? '1px solid var(--border2)' : '1px solid var(--border)',
    color: active ? 'var(--text)' : 'var(--muted)', transition: '.15s',
  });

  const trunc = (a: string) => a?.length > 12 ? a.slice(0, 8) + '…' + a.slice(-5) : (a || '—');

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div>
      {/* ── HEADER ── */}
      <header style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 32px', height: 60, borderBottom: '1px solid var(--border)',
        position: 'sticky', top: 0, background: 'rgba(8,8,8,.95)',
        backdropFilter: 'blur(16px)', zIndex: 200,
      }}>
        <div
          style={{ fontFamily:"'Bebas Neue'", fontSize: 26, letterSpacing: 4, color: 'var(--acc)', cursor: 'pointer', textShadow: '0 0 24px rgba(245,255,0,.3)' }}
          onClick={() => setPage('explore')}
        >
          MEME<span style={{ color: 'var(--acc2)' }}>SLOTS</span>
        </div>
        <nav style={{ display: 'flex', gap: 4 }}>
          <button style={nb(page==='explore')} onClick={() => setPage('explore')}>EXPLORE</button>
          <button style={nb(page==='create')}  onClick={() => setPage('create')}>+ CREATE</button>
          <button style={nb(page==='mine')}    onClick={() => setPage('mine')}>MY MEMES</button>
        </nav>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div style={{ fontFamily:"'Space Mono'", fontSize: 9, padding: '4px 8px', border: '1px solid #333', borderRadius: 2, color: '#888' }}>● TESTNET</div>
          <WalletButton />
        </div>
      </header>

      {/* ══════════════════════════════════════════════ EXPLORE */}
      {page === 'explore' && (
        <div className="animate-fade">
          <div style={{ padding: '48px 32px 32px', borderBottom: '1px solid var(--border)' }}>
            <h1 style={{ fontFamily:"'Bebas Neue'", fontSize: 54, letterSpacing: 4, lineHeight: 1, marginBottom: 6 }}>
              EVERY MEME<br/>HAS <span style={{ color: 'var(--acc)' }}>100 SLOTS</span>
            </h1>
            <p style={{ color: 'var(--muted)', fontSize: 14, maxWidth: 480 }}>
              Claim a slot on any meme token on Bitcoin L1. Earn 1% of every trade. Takeover anytime.
            </p>
          </div>
          {/* controls */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '18px 32px', borderBottom: '1px solid var(--border)', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 200, display: 'flex', alignItems: 'center', background: 'var(--s1)', border: '1px solid var(--border)', padding: '0 12px', gap: 8 }}>
              <span style={{ color: 'var(--muted)' }}>⌕</span>
              <input
                type="text" value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search name or symbol..."
                style={{ flex: 1, background: 'none', border: 'none', outline: 'none', color: 'var(--text)', fontSize: 13, padding: '10px 0' }}
              />
            </div>
            <div style={{ display: 'flex', gap: 2 }}>
              {(['all','hot','new'] as Tab[]).map(t => (
                <button key={t} style={tabStyle(tab===t)} onClick={() => setTab(t)}>
                  {t==='hot' ? '🔥 HOT' : t.toUpperCase()}
                </button>
              ))}
            </div>
            <button style={accBtn()} onClick={() => setPage('create')}>+ CREATE MEME</button>
          </div>
          {/* grid */}
          {loading ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', gap: 1, background: 'var(--border)', padding: '1px 32px' }}>
              {Array(8).fill(0).map((_,i) => <div key={i} className="skeleton" style={{ height: 280 }}/>)}
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: '70px 32px', textAlign: 'center' }}>
              <div style={{ fontFamily:"'Bebas Neue'", fontSize: 42, letterSpacing: 4, marginBottom: 14, color: 'var(--muted2)' }}>
                {CONTRACTS.FACTORY ? 'NO MEMES YET' : 'FACTORY NOT CONFIGURED'}
              </div>
              {!CONTRACTS.FACTORY && <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 18, fontFamily:"'Space Mono'" }}>Set NEXT_PUBLIC_FACTORY_ADDRESS in .env.local</div>}
              <button style={accBtn()} onClick={() => setPage('create')}>+ CREATE FIRST MEME</button>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', gap: 1, background: 'var(--border)', padding: '1px 32px 32px', marginTop: 1 }}>
              {filtered.map(m => (
                <MemeCard key={m.index.toString()} meme={m} onClick={() => router.push(`/meme/${m.index}`)} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════ CREATE */}
      {page === 'create' && (
        <div className="animate-fade" style={{ maxWidth: 700, margin: '0 auto', padding: '48px 32px 80px' }}>
          <h1 style={{ fontFamily:"'Bebas Neue'", fontSize: 46, letterSpacing: 4, marginBottom: 4 }}>
            LAUNCH YOUR<br/><span style={{ color: 'var(--acc)' }}>MEME TOKEN</span>
          </h1>
          <p style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 36, lineHeight: 1.6 }}>
            Deploy on Bitcoin L1 via OP_NET. 100 slots open for takeover immediately.
            Token auto-listed on <span style={{ color: 'var(--acc)', fontFamily:"'Space Mono'", fontSize: 11 }}>⚡ MOTOSWAP</span> after deploy.
          </p>

          {/* ── 01 TOKEN INFO ── */}
          <Section title="01 — TOKEN INFO">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 11, marginBottom: 13 }}>
              <div>
                <label style={lbl}>Token Name *</label>
                <input style={inp} value={fName} onChange={e => setFName(e.target.value)} placeholder="e.g. DogeCoin2" maxLength={32}/>
              </div>
              <div>
                <label style={lbl}>Symbol *</label>
                <input
                  style={inp} value={fSymbol} maxLength={8}
                  onChange={e => setFSymbol(e.target.value.toUpperCase())}
                  placeholder="DOGE2"
                />
              </div>
            </div>
            <div>
              <label style={lbl}>Description</label>
              <textarea
                style={{ ...inp, resize: 'vertical' } as React.CSSProperties}
                value={fDesc} onChange={e => setFDesc(e.target.value)}
                rows={3} placeholder="What's the vibe of this meme?"
              />
            </div>
          </Section>

          {/* ── 02 MEDIA ── */}
          <Section title="02 — MEDIA">
            <label style={lbl}>Token Logo / Banner URL</label>
            <input
              style={inp} type="url" value={fImgUrl}
              onChange={e => { setFImgUrl(e.target.value); setImgPreview(e.target.value); }}
              placeholder="https://i.imgur.com/yourimage.png"
            />
            {imgPreview && (
              <img
                src={imgPreview} alt="preview"
                style={{ width: '100%', aspectRatio: '16/9', objectFit: 'cover', marginTop: 10, border: '1px solid var(--border)' }}
                onError={() => setImgPreview('')}
              />
            )}
          </Section>

          {/* ── 03 TOKENOMICS ── */}
          <Section title="03 — TOKENOMICS">
            {/* Supply input */}
            <div style={{ marginBottom: 16 }}>
              <label style={lbl}>Total Supply *</label>
              <div style={{ position: 'relative' }}>
                <input
                  style={{ ...inp, paddingRight: 60 }}
                  value={fSupply}
                  onChange={e => {
                    const raw = e.target.value.replace(/,/g, '');
                    if (/^\d*$/.test(raw)) setFSupply(raw ? fmtNum(raw) : '');
                  }}
                  placeholder="1,000,000,000"
                />
                {fSupply && (
                  <div style={{
                    position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                    fontFamily:"'Space Mono'", fontSize: 9, color: 'var(--muted)',
                  }}>
                    {parseBig(fSupply) >= 1_000_000_000_000n ? 'T' :
                     parseBig(fSupply) >= 1_000_000_000n     ? 'B' :
                     parseBig(fSupply) >= 1_000_000n          ? 'M' : ''}
                  </div>
                )}
              </div>
              {/* Quick presets */}
              <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                {SUPPLY_PRESETS.map(p => {
                  const active = fSupply === p.val;
                  return (
                    <button
                      key={p.label}
                      onClick={() => setFSupply(p.val)}
                      style={{
                        fontFamily:"'Space Mono'", fontSize: 9, letterSpacing: 1,
                        padding: '5px 10px', cursor: 'pointer', transition: '.15s',
                        background: active ? 'var(--acc)' : 'var(--s2)',
                        color:      active ? '#000' : 'var(--muted)',
                        border: `1px solid ${active ? 'var(--acc)' : 'var(--border)'}`,
                      }}
                    >{p.label}</button>
                  );
                })}
              </div>
              <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 6 }}>
                Default 1B · Min 1M · Max 1T · Mặc định có thể thay đổi tự do
              </div>
            </div>
            {/* Floor price */}
            <div>
              <label style={lbl}>Slot Floor Price (SAT) *</label>
              <input style={inp} type="number" value={fFloor} onChange={e => setFFloor(e.target.value)} min={500} placeholder="1000"/>
              <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
                Min SAT để claim 1 slot trống — hiện tại {Number(fFloor || 0).toLocaleString()} SAT ≈ {(Number(fFloor || 0) * 0.00000001 * 97000).toFixed(4)} USD
              </div>
            </div>
          </Section>

          {/* ── 04 SOCIAL LINKS ── */}
          <Section title="04 — LINKS & SOCIAL">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 11 }}>
              {SOCIAL_FIELDS.map(f => (
                <div key={f.key}>
                  <label style={lbl}>{f.label}</label>
                  <div style={{ display: 'flex', background: 'var(--s1)', border: '1px solid var(--border)' }}>
                    <span style={{
                      padding: '0 13px', borderRight: '1px solid var(--border)',
                      display: 'flex', alignItems: 'center', fontSize: 15, flexShrink: 0,
                      minWidth: 46, justifyContent: 'center',
                    }}>{f.icon}</span>
                    <input
                      type="url"
                      value={social[f.key]}
                      onChange={e => updateSocial(f.key, e.target.value)}
                      placeholder={f.ph}
                      style={{
                        flex: 1, background: 'none', border: 'none', outline: 'none',
                        color: 'var(--text)', fontSize: 12, padding: '10px 12px',
                        fontFamily: 'inherit',
                      }}
                    />
                    {social[f.key] && (
                      <a
                        href={social[f.key]} target="_blank" rel="noreferrer"
                        style={{ display: 'flex', alignItems: 'center', padding: '0 10px', color: 'var(--acc)', fontSize: 11 }}
                        title="Open link"
                      >↗</a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </Section>

          {/* ── 05 MOTOSWAP ── */}
          <Section title="05 — MOTOSWAP POOL">
            <div style={{
              background: 'var(--s1)', border: '1px solid var(--border2)',
              padding: 18, display: 'flex', gap: 16, alignItems: 'flex-start',
            }}>
              <div style={{ fontSize: 32, flexShrink: 0, lineHeight: 1 }}>⚡</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 6 }}>
                  Auto-launch trading on Motoswap DEX
                </div>
                <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.7 }}>
                  Sau khi 3 bước deploy xong, bạn sẽ được redirect thẳng đến trang <strong style={{ color: 'var(--text)' }}>Add Liquidity</strong> trên{' '}
                  <a href="https://motoswap.org" target="_blank" rel="noreferrer" style={{ color: 'var(--acc)' }}>motoswap.org</a> với token address đã điền sẵn.
                  Chỉ cần deposit BTC + {fSymbol || 'TOKEN'} là pool hoạt động ngay.
                </div>
              </div>
              <div style={{
                fontFamily:"'Space Mono'", fontSize: 8, letterSpacing: 1, padding: '4px 8px',
                background: 'rgba(0,255,170,.08)', border: '1px solid var(--acc3)', color: 'var(--acc3)',
                flexShrink: 0, whiteSpace: 'nowrap',
              }}>AUTO ✓</div>
            </div>
          </Section>

          {/* ── Summary box ── */}
          <div style={{ background: 'var(--s1)', border: '1px solid var(--border2)', padding: 16, marginBottom: 18 }}>
            <div style={{ fontFamily:"'Space Mono'", fontSize: 9, letterSpacing: 2, color: 'var(--muted)', marginBottom: 10 }}>
              DEPLOYMENT SUMMARY
            </div>
            {[
              { l: 'Token name',       v: fName    || '—' },
              { l: 'Symbol',           v: fSymbol  || '—' },
              { l: 'Total supply',     v: fSupply  || '—' },
              { l: 'Slot floor price', v: fFloor   ? Number(fFloor).toLocaleString() + ' SAT' : '—' },
              { l: 'Social links',     v: Object.values(social).filter(Boolean).length + ' added' },
              { l: 'Protocol fee',     v: '10,000 SAT', acc: true },
            ].map(r => (
              <div key={r.l} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderTop: '1px solid var(--border)' }}>
                <span style={{ fontSize: 12, color: 'var(--muted)' }}>{r.l}</span>
                <span style={{ fontFamily:"'Space Mono'", fontSize: 12, color: (r as any).acc ? 'var(--acc)' : 'var(--text)' }}>{r.v}</span>
              </div>
            ))}
          </div>

          {/* Error */}
          {deployError && (
            <div style={{ background: 'rgba(255,60,0,.08)', border: '1px solid var(--acc2)', padding: '11px 14px', marginBottom: 14, fontFamily:"'Space Mono'", fontSize: 10, color: 'var(--acc2)' }}>
              ⚠ {deployError}
            </div>
          )}

          {/* ── CTA / Success ── */}
          {deployStep < 4 ? (
            <button
              onClick={handleDeploy}
              disabled={!isConnected || deploying}
              style={{
                width: '100%', fontFamily:"'Space Mono'", fontSize: 12, fontWeight: 700,
                letterSpacing: 3, padding: '17px 0', background: 'var(--acc)', color: '#000',
                border: 'none', transition: '.15s',
                clipPath: 'polygon(0 0,calc(100% - 10px) 0,100% 10px,100% 100%,10px 100%,0 calc(100% - 10px))',
                opacity: (!isConnected || deploying) ? .4 : 1,
                cursor:  (!isConnected || deploying) ? 'not-allowed' : 'pointer',
              }}
            >
              {!isConnected ? 'CONNECT WALLET FIRST' : deploying ? 'DEPLOYING…' : 'DEPLOY MEME TOKEN →'}
            </button>
          ) : (
            /* Success panel */
            <div style={{ background: 'rgba(0,255,170,.05)', border: '1px solid var(--acc3)', padding: 22 }}>
              <div style={{ fontFamily:"'Bebas Neue'", fontSize: 24, letterSpacing: 3, color: 'var(--acc3)', marginBottom: 8 }}>
                🎉 TOKEN DEPLOYED SUCCESSFULLY!
              </div>
              {deployedToken && (
                <div style={{ fontFamily:"'Space Mono'", fontSize: 10, color: 'var(--muted)', marginBottom: 18, wordBreak: 'break-all' }}>
                  Contract: <span style={{ color: 'var(--acc3)' }}>{deployedToken}</span>
                </div>
              )}
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                {/* View meme page */}
                {deployedIndex !== null && (
                  <button
                    onClick={() => router.push(`/meme/${deployedIndex}`)}
                    style={{ ...accBtn('var(--acc3)', '#000'), flex: 1 }}
                  >
                    VIEW MY MEME →
                  </button>
                )}
                {/* Add liquidity on Motoswap */}
                {deployedToken && (
                  <a
                    href={motoswapLiquidityUrl(deployedToken)}
                    target="_blank" rel="noreferrer"
                    style={{
                      ...accBtn('var(--acc2)', '#fff') as React.CSSProperties,
                      flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    }}
                  >
                    ⚡ ADD LIQUIDITY ON MOTOSWAP
                  </a>
                )}
                {/* Swap link */}
                {deployedToken && (
                  <a
                    href={motoswapSwapUrl(deployedToken)}
                    target="_blank" rel="noreferrer"
                    style={{
                      ...accBtn('var(--s2)', 'var(--text)') as React.CSSProperties,
                      flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                      border: '1px solid var(--border2)',
                    }}
                  >
                    🔄 SWAP ON MOTOSWAP
                  </a>
                )}
              </div>
            </div>
          )}

          {/* Deploy steps progress */}
          {(deploying || deployStep > 0) && deployStep < 4 && (
            <div style={{ marginTop: 28 }}>
              <div style={secTitle}>DEPLOYMENT PROGRESS</div>
              {[
                { n: 1, t: 'Deploy RevenueSharing',    d: '100-slot revenue contract on OP_NET' },
                { n: 2, t: `Deploy ${fSymbol || 'MemeToken'} (OP_20)`, d: `Supply: ${fSupply} · 1% auto fee routing` },
                { n: 3, t: 'Register in Factory',       d: `Name, symbol, social links → MEMESLOTS` },
              ].map(step => {
                const done   = deployStep >  step.n;
                const active = deployStep === step.n;
                return (
                  <div key={step.n} style={{ display: 'flex', gap: 14, marginBottom: 14 }}>
                    <div style={{
                      width: 28, height: 28, border: '1px solid',
                      borderColor: done ? 'var(--acc3)' : active ? 'var(--acc)' : 'var(--border2)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontFamily:"'Space Mono'", fontSize: 11, flexShrink: 0,
                      color: done ? 'var(--acc3)' : active ? 'var(--acc)' : 'var(--muted)',
                      transition: '.3s',
                    }}>
                      {done ? '✓' : step.n}
                    </div>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 2 }}>{step.t}</div>
                      <div style={{ fontSize: 11, color: 'var(--muted)' }}>{step.d}</div>
                      {deployHashes[step.n - 1] && (
                        <div style={{ fontFamily:"'Space Mono'", fontSize: 9, color: 'var(--acc3)', marginTop: 3, wordBreak: 'break-all' }}>
                          TX: {deployHashes[step.n - 1]}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════ MY MEMES */}
      {page === 'mine' && (
        <div className="animate-fade">
          <div style={{ padding: '48px 32px 32px', borderBottom: '1px solid var(--border)' }}>
            <h1 style={{ fontFamily:"'Bebas Neue'", fontSize: 54, letterSpacing: 4, lineHeight: 1, marginBottom: 6 }}>
              MY <span style={{ color: 'var(--acc)' }}>MEMES</span>
            </h1>
            <p style={{ color: 'var(--muted)', fontSize: 14 }}>Tokens you created and slots you own.</p>
          </div>
          {!isConnected ? (
            <div style={{ padding: '70px 32px', textAlign: 'center' }}>
              <div style={{ fontFamily:"'Bebas Neue'", fontSize: 42, letterSpacing: 4, marginBottom: 16, color: 'var(--muted2)' }}>NOT CONNECTED</div>
              <WalletButton />
            </div>
          ) : myMemes.length === 0 ? (
            <div style={{ padding: '70px 32px', textAlign: 'center', color: 'var(--muted)' }}>
              <div style={{ fontFamily:"'Bebas Neue'", fontSize: 42, letterSpacing: 4, marginBottom: 14, color: 'var(--muted2)' }}>NO MEMES YET</div>
              <button style={accBtn()} onClick={() => setPage('create')}>+ CREATE YOUR FIRST MEME</button>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', gap: 1, background: 'var(--border)', padding: '1px 32px 32px', marginTop: 1 }}>
              {myMemes.map(m => (
                <MemeCard key={m.index.toString()} meme={m} mine onClick={() => router.push(`/meme/${m.index}`)} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Section wrapper ────────────────────────────────────────────────────────
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 30 }}>
      <div style={{
        fontFamily:"'Space Mono',monospace", fontSize: 9, letterSpacing: 2,
        color: 'var(--muted)', marginBottom: 14, paddingBottom: 8,
        borderBottom: '1px solid var(--border)',
      }}>{title}</div>
      {children}
    </div>
  );
}

// ─── MemeCard ────────────────────────────────────────────────────────────────
function MemeCard({ meme, onClick, mine = false }: { meme: MemeInfo; onClick: () => void; mine?: boolean }) {
  const trunc = (a: string) => a?.length > 12 ? a.slice(0, 8) + '…' + a.slice(-5) : (a || '—');

  // Parse social links từ description
  let social: Record<string, string> = {};
  try {
    const desc = meme.description || '';
    const m = desc.match(/__social__:(.+)/s);
    if (m) social = JSON.parse(m[1].trim());
  } catch {}

  const hasSocial = Object.values(social).some(Boolean);

  return (
    <div
      onClick={onClick}
      style={{
        background: 'var(--bg)', cursor: 'pointer', overflow: 'hidden', transition: '.15s',
        border: mine ? '1px solid rgba(245,255,0,.18)' : '1px solid var(--border)',
      }}
      onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,0,0,.5)'; }}
      onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = ''; }}
    >
      {/* Banner */}
      {meme.imageUrl ? (
        <img src={meme.imageUrl} alt="" style={{ width: '100%', aspectRatio: '16/9', objectFit: 'cover', display: 'block' }}/>
      ) : (
        <div style={{ width: '100%', aspectRatio: '16/9', background: 'linear-gradient(135deg,var(--s1),var(--s2))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 52, color: 'var(--muted2)' }}>
          {mine ? '🆕' : '🐸'}
        </div>
      )}

      <div style={{ padding: 15 }}>
        {/* Top row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 11 }}>
          <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--s2)', border: '1px solid var(--border2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0, overflow: 'hidden' }}>
            {meme.imageUrl
              ? <img src={meme.imageUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }}/>
              : (mine ? '🆕' : '🐸')
            }
          </div>
          <div style={{ flex: 1, overflow: 'hidden' }}>
            <div style={{ fontWeight: 600, fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {meme.name || `Meme #${meme.index}`}
            </div>
            <div style={{ fontFamily:"'Space Mono'", fontSize: 9, color: 'var(--muted)', letterSpacing: 1 }}>
              {meme.symbol || trunc(meme.tokenAddr)}
            </div>
          </div>
          {mine && (
            <span style={{ fontFamily:"'Space Mono'", fontSize: 8, padding: '2px 6px', background: 'rgba(245,255,0,.08)', border: '1px solid rgba(245,255,0,.2)', color: 'var(--acc)', flexShrink: 0 }}>
              ★ MINE
            </span>
          )}
        </div>

        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 5, marginBottom: hasSocial ? 10 : 0 }}>
          {[
            { l: 'TAKEOVERS', v: meme.takeovers?.toString()               ?? '0', c: 'var(--acc2)' },
            { l: 'FLOOR SAT', v: Number(meme.floorPrice ?? 0).toLocaleString(), c: 'var(--acc)'  },
            { l: 'BLOCK',     v: meme.createdBlock?.toString()            ?? '—', c: 'var(--acc3)' },
          ].map(s => (
            <div key={s.l} style={{ background: 'var(--s1)', padding: '7px 9px' }}>
              <div style={{ fontFamily:"'Space Mono'", fontSize: 8, color: 'var(--muted)', letterSpacing: 1, marginBottom: 2 }}>{s.l}</div>
              <div style={{ fontFamily:"'Space Mono'", fontSize: 10, color: s.c }}>{s.v}</div>
            </div>
          ))}
        </div>

        {/* Social icons */}
        {hasSocial && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {SOCIAL_FIELDS.filter(f => social[f.key]).map(f => (
              <a
                key={f.key}
                href={social[f.key]}
                target="_blank" rel="noreferrer"
                onClick={e => e.stopPropagation()}
                title={`${f.label}: ${social[f.key]}`}
                style={{ fontSize: 14, opacity: .65, transition: '.15s', lineHeight: 1 }}
                onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
                onMouseLeave={e => (e.currentTarget.style.opacity = '.65')}
              >
                {f.icon}
              </a>
            ))}
          </div>
        )}
      </div>

      {/* Footer: creator + Motoswap quick-swap */}
      <div style={{ padding: '10px 15px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontFamily:"'Space Mono'", fontSize: 9, color: 'var(--muted)' }}>
          by {trunc(meme.creator)}
        </span>
        <a
          href={motoswapSwapUrl(meme.tokenAddr)}
          target="_blank" rel="noreferrer"
          onClick={e => e.stopPropagation()}
          style={{ fontFamily:"'Space Mono'", fontSize: 9, letterSpacing: 1, color: 'var(--acc2)', display: 'flex', alignItems: 'center', gap: 4 }}
          title="Swap on Motoswap"
        >
          ⚡ MOTOSWAP
        </a>
      </div>
    </div>
  );
}
