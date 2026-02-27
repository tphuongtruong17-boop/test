'use client';
// hooks/useOpnetWallet.ts
// Dùng @btc-vision/walletconnect chính thức để kết nối ví

import { useState, useCallback, useEffect } from 'react';
import { SupportedWallets, useWallet as useWCWallet } from '@btc-vision/walletconnect';
import { getProvider, NETWORK, REVENUE_ABI, FACTORY_ABI, CONTRACTS } from '@/lib/opnet';
import { getContract } from 'opnet';
import { Address } from '@btc-vision/transaction';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SlotInfo {
  id: number;
  isEmpty: boolean;
  owner: string;
  price: bigint;
  sinceCycle: bigint;
  ismine: boolean;
}

export interface CycleInfo {
  cycle: bigint;
  startBlock: bigint;
  endBlock: bigint;
  blocksLeft: bigint;
  cycleRevenue: bigint;
  progressPct: number;
}

export interface MemeInfo {
  index: bigint;
  tokenAddr: string;
  revenueAddr: string;
  creator: string;
  floorPrice: bigint;
  takeovers: bigint;
  createdBlock: bigint;
  // Metadata từ event/off-chain
  name?: string;
  symbol?: string;
  imageUrl?: string;
  description?: string;
}

// ─── Hook chính ───────────────────────────────────────────────────────────────

export function useOpnetWallet() {
  // Dùng hook từ @btc-vision/walletconnect
  const { account, connect, disconnect, sendTransaction } = useWCWallet();

  const address = account?.addressTyped ?? null;
  const isConnected = !!account;

  const connectWallet = useCallback(async (walletType: 'opwallet' | 'unisat') => {
    try {
      const wallet = walletType === 'opwallet'
        ? SupportedWallets.OP_WALLET
        : SupportedWallets.UNISAT;
      await connect(wallet);
    } catch (err: any) {
      throw new Error(err?.message || 'Failed to connect wallet');
    }
  }, [connect]);

  return {
    address,
    isConnected,
    connectWallet,
    disconnect,
    sendTransaction,
    account,
  };
}

// ─── Hook: Factory data ───────────────────────────────────────────────────────

export function useFactory() {
  const [memes, setMemes] = useState<MemeInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchMemes = useCallback(async (tab: 'all' | 'hot' | 'new' = 'all') => {
    if (!CONTRACTS.FACTORY) {
      // Factory chưa deploy — dùng empty state
      setMemes([]);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const provider = getProvider();
      const factory = getContract(
        CONTRACTS.FACTORY,
        FACTORY_ABI as any,
        provider,
        NETWORK,
      );

      let indices: bigint[] = [];

      if (tab === 'hot') {
        const result = await (factory as any).getHotMemes(10n);
        indices = result.properties.indices ?? [];
      } else {
        const result = await (factory as any).getMemesPaginated(0n, 20n);
        indices = result.properties.indices ?? [];
      }

      // Fetch chi tiết từng meme
      const details = await Promise.allSettled(
        indices.map(async (idx) => {
          const r = await (factory as any).getMeme(idx);
          const p = r.properties;
          return {
            index: idx,
            tokenAddr:   p.tokenAddr,
            revenueAddr: p.revenueAddr,
            creator:     p.creator,
            floorPrice:  p.floorPrice,
            takeovers:   p.takeovers,
            createdBlock:p.createdBlock,
          } as MemeInfo;
        })
      );

      const valid = details
        .filter((r): r is PromiseFulfilledResult<MemeInfo> => r.status === 'fulfilled')
        .map(r => r.value);

      setMemes(valid);
    } catch (err: any) {
      setError(err?.message || 'Failed to fetch memes');
      console.error('Factory fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchMemes(); }, [fetchMemes]);

  return { memes, loading, error, refetch: fetchMemes };
}

// ─── Hook: Revenue contract data ─────────────────────────────────────────────

export function useRevenue(revenueAddr: string | null, userAddr: string | null) {
  const [slots, setSlots] = useState<SlotInfo[]>(Array(100).fill(null).map((_,i) => ({
    id: i, isEmpty: true, owner: '', price: 0n, sinceCycle: 0n, ismine: false,
  })));
  const [cycleInfo, setCycleInfo] = useState<CycleInfo | null>(null);
  const [pendingRevenue, setPendingRevenue] = useState<bigint>(0n);
  const [loading, setLoading] = useState(false);

  const fetchAll = useCallback(async () => {
    if (!revenueAddr) return;

    setLoading(true);
    try {
      const provider = getProvider();
      const contract = getContract(
        revenueAddr,
        REVENUE_ABI as any,
        provider,
        NETWORK,
        userAddr ? new Address(Buffer.from(userAddr.replace('0x',''), 'hex')) : undefined,
      );

      // 1. Cycle info
      const cycleResult = await (contract as any).getCurrentCycle();
      const cp = cycleResult.properties;
      const total = Number(cp.endBlock - cp.startBlock);
      const elapsed = total - Number(cp.blocksLeft);
      setCycleInfo({
        cycle:        cp.cycle,
        startBlock:   cp.startBlock,
        endBlock:     cp.endBlock,
        blocksLeft:   cp.blocksLeft,
        cycleRevenue: cp.cycleRevenue,
        progressPct:  Math.min(Math.round((elapsed / total) * 100), 100),
      });

      // 2. Tất cả 100 slots (song song)
      const slotPromises = Array.from({ length: 100 }, (_, i) =>
        (contract as any).getSlotInfo(i).then((r: any) => {
          const p = r.properties;
          return {
            id:         i,
            isEmpty:    p.isEmpty,
            owner:      p.owner ?? '',
            price:      p.price ?? 0n,
            sinceCycle: p.sinceCycle ?? 0n,
            ismine:     userAddr
              ? p.owner?.toLowerCase() === userAddr.toLowerCase()
              : false,
          } as SlotInfo;
        }).catch(() => ({
          id: i, isEmpty: true, owner: '', price: 0n, sinceCycle: 0n, ismine: false,
        }))
      );

      const slotResults = await Promise.all(slotPromises);
      setSlots(slotResults);

      // 3. Pending revenue của user
      if (userAddr) {
        const revResult = await (contract as any).getPendingRevenue(userAddr);
        setPendingRevenue(revResult.properties.pending ?? 0n);

        const balResult = await (contract as any).getUserBalance(userAddr);
        const bal = balResult.properties.balance ?? 0n;
        setPendingRevenue(prev => prev + bal);
      }
    } catch (err) {
      console.error('Revenue fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [revenueAddr, userAddr]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  return { slots, cycleInfo, pendingRevenue, loading, refetch: fetchAll };
}

// ─── Hook: Thực hiện transaction ──────────────────────────────────────────────

export function useRevenueTx(revenueAddr: string | null) {
  const { account, sendTransaction } = useWCWallet();
  const [pending, setPending] = useState(false);

  const buildAndSend = useCallback(async (
    method: string,
    args: any[],
    satAmount: bigint = 0n,
  ) => {
    if (!account || !revenueAddr) throw new Error('Wallet not connected');

    setPending(true);
    try {
      const provider = getProvider();
      const userAddr = new Address(Buffer.from(
        account.addressTyped.replace('0x',''), 'hex'
      ));

      const contract = getContract(
        revenueAddr,
        REVENUE_ABI as any,
        provider,
        NETWORK,
        userAddr,
      );

      // Simulate dùng SDK để lấy calldata
      const simulation = await (contract as any)[method](...args);

      // Gửi transaction qua ví đã connect
      const txParams = {
        signer: account.keypair,
        refundTo: account.p2tr,
        maximumAllowedSatToSpend: satAmount + 10000n, // buffer
        feeRate: 10,
        network: NETWORK,
      };

      const tx = await simulation.sendTransaction(txParams);
      return tx;
    } finally {
      setPending(false);
    }
  }, [account, revenueAddr]);

  const claimSlot = (slotId: number, amount: bigint) =>
    buildAndSend('claimSlot', [slotId, amount], amount);

  const takeoverSlot = (slotId: number, amount: bigint) =>
    buildAndSend('takeoverSlot', [slotId, amount], amount);

  const claimRevenue = () =>
    buildAndSend('claimRevenue', []);

  return { claimSlot, takeoverSlot, claimRevenue, pending };
}
