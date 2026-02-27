'use client';
// components/WalletButton.tsx

import { useState } from 'react';
import { useOpnetWallet } from '@/hooks/useOpnetWallet';

export default function WalletButton() {
  const { address, isConnected, connectWallet, disconnect } = useOpnetWallet();
  const [showModal, setShowModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConnect = async (type: 'opwallet' | 'unisat') => {
    setLoading(true);
    setError(null);
    try {
      await connectWallet(type);
      setShowModal(false);
    } catch (e: any) {
      setError(e.message || 'Connection failed');
    } finally {
      setLoading(false);
    }
  };

  const trunc = (a: string) =>
    a.length > 14 ? a.slice(0, 8) + '…' + a.slice(-5) : a;

  if (isConnected && address) {
    return (
      <button
        onClick={disconnect}
        style={{
          fontFamily: "'Space Mono', monospace",
          fontSize: 10,
          letterSpacing: 2,
          padding: '9px 16px',
          background: 'var(--s2)',
          color: 'var(--acc)',
          border: '1px solid var(--border2)',
          transition: '.15s',
          cursor: 'pointer',
        }}
        title="Click to disconnect"
      >
        {trunc(address)}
      </button>
    );
  }

  return (
    <>
      <button
        onClick={() => setShowModal(true)}
        style={{
          fontFamily: "'Space Mono', monospace",
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: 2,
          padding: '9px 18px',
          background: 'var(--acc)',
          color: '#000',
          border: 'none',
          transition: '.15s',
          clipPath: 'polygon(0 0,calc(100% - 7px) 0,100% 7px,100% 100%,7px 100%,0 calc(100% - 7px))',
          cursor: 'pointer',
        }}
      >
        CONNECT WALLET
      </button>

      {/* Modal */}
      {showModal && (
        <div
          style={{
            position: 'fixed', inset: 0,
            background: 'rgba(0,0,0,.88)',
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          onClick={() => setShowModal(false)}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: 'var(--s1)',
              border: '1px solid var(--border2)',
              padding: 36,
              width: 380,
              maxWidth: '92vw',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontFamily: "'Bebas Neue'", fontSize: 22, letterSpacing: 3, color: 'var(--acc)' }}>
                CONNECT WALLET
              </span>
              <button
                onClick={() => setShowModal(false)}
                style={{ background: 'none', border: 'none', color: 'var(--muted)', fontSize: 20, cursor: 'pointer' }}
              >✕</button>
            </div>
            <p style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.7, marginBottom: 22 }}>
              Connect your Bitcoin wallet to claim slots and earn revenue on OP_NET Bitcoin L1.
            </p>

            {error && (
              <div style={{
                background: 'rgba(255,60,0,.1)', border: '1px solid var(--acc2)',
                padding: '10px 14px', marginBottom: 14,
                fontFamily: "'Space Mono'", fontSize: 10, color: 'var(--acc2)',
              }}>
                {error}
              </div>
            )}

            {/* OP_WALLET */}
            <div
              onClick={() => handleConnect('opwallet')}
              style={{
                display: 'flex', alignItems: 'center', gap: 13,
                padding: '13px 15px', border: '1px solid var(--border)',
                cursor: loading ? 'wait' : 'pointer', marginBottom: 8,
                transition: '.15s', opacity: loading ? .6 : 1,
              }}
              onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--acc)')}
              onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}
            >
              <div style={{
                width: 36, height: 36, background: 'var(--bg)',
                border: '1px solid var(--border)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 17, flexShrink: 0,
              }}>₿</div>
              <div>
                <div style={{ fontFamily: "'Space Mono'", fontSize: 11, letterSpacing: 1 }}>OP_WALLET</div>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                  Official OP_NET browser extension
                </div>
              </div>
            </div>

            {/* Unisat */}
            <div
              onClick={() => handleConnect('unisat')}
              style={{
                display: 'flex', alignItems: 'center', gap: 13,
                padding: '13px 15px', border: '1px solid var(--border)',
                cursor: loading ? 'wait' : 'pointer', marginBottom: 8,
                transition: '.15s', opacity: loading ? .6 : 1,
              }}
              onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--acc)')}
              onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}
            >
              <div style={{
                width: 36, height: 36, background: 'var(--bg)',
                border: '1px solid var(--border)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 17, flexShrink: 0,
              }}>🟠</div>
              <div>
                <div style={{ fontFamily: "'Space Mono'", fontSize: 11, letterSpacing: 1 }}>UNISAT</div>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                  Bitcoin wallet with OP_NET support
                </div>
              </div>
            </div>

            <div style={{ marginTop: 14, fontFamily: "'Space Mono'", fontSize: 10, color: 'var(--muted)', lineHeight: 2 }}>
              No OP_WALLET?{' '}
              <a
                href="https://chromewebstore.google.com/detail/opwallet/pmbjpcmaaladnfpacpmhmnfmpklgbdjb"
                target="_blank"
                rel="noreferrer"
                style={{ color: 'var(--acc)' }}
              >
                → Install from Chrome Web Store
              </a>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
