// lib/opnet.ts
// Kết nối thật với OP_NET thông qua SDK chính thức

import { JSONRpcProvider } from 'opnet';
import { Network } from '@btc-vision/bitcoin';

// ─── Config ──────────────────────────────────────────────────────────────────

export const NETWORK = Network.Testnet; // đổi thành Network.Mainnet khi lên production
export const RPC_URL = 'https://testnet.opnet.org';

// Địa chỉ contracts — điền sau khi deploy
export const CONTRACTS = {
  FACTORY:  process.env.NEXT_PUBLIC_FACTORY_ADDRESS  || '',
  // Map: meme_id => { token, revenue }
};

// ─── Provider singleton ───────────────────────────────────────────────────────

let _provider: JSONRpcProvider | null = null;

export function getProvider(): JSONRpcProvider {
  if (!_provider) {
    _provider = new JSONRpcProvider(RPC_URL, NETWORK);
  }
  return _provider;
}

// ─── ABI cho RevenueSharingV2 ─────────────────────────────────────────────────

export const REVENUE_ABI = [
  {
    name: 'claimSlot',
    inputs: [
      { name: 'slotId', type: 'uint16' },
      { name: 'payAmount', type: 'uint256' },
    ],
    outputs: [{ type: 'bool' }],
  },
  {
    name: 'takeoverSlot',
    inputs: [
      { name: 'slotId', type: 'uint16' },
      { name: 'payAmount', type: 'uint256' },
    ],
    outputs: [
      { name: 'currentCycle', type: 'uint256' },
      { name: 'cycleEndBlock', type: 'uint256' },
    ],
  },
  {
    name: 'claimRevenue',
    inputs: [],
    outputs: [{ name: 'amount', type: 'uint256' }],
  },
  {
    name: 'receiveRevenue',
    inputs: [{ name: 'amount', type: 'uint256' }],
    outputs: [{ type: 'bool' }],
  },
  {
    name: 'getSlotInfo',
    inputs: [{ name: 'slotId', type: 'uint16' }],
    outputs: [
      { name: 'isEmpty', type: 'bool' },
      { name: 'price', type: 'uint256' },
      { name: 'sinceCycle', type: 'uint256' },
      { name: 'lastClaim', type: 'uint256' },
      { name: 'currentCycle', type: 'uint256' },
      { name: 'cycleEndBlock', type: 'uint256' },
      { name: 'blocksLeft', type: 'uint256' },
      { name: 'owner', type: 'address' },
    ],
  },
  {
    name: 'getCurrentCycle',
    inputs: [],
    outputs: [
      { name: 'cycle', type: 'uint256' },
      { name: 'startBlock', type: 'uint256' },
      { name: 'endBlock', type: 'uint256' },
      { name: 'blocksLeft', type: 'uint256' },
      { name: 'cycleRevenue', type: 'uint256' },
    ],
  },
  {
    name: 'getPendingRevenue',
    inputs: [{ name: 'user', type: 'address' }],
    outputs: [{ name: 'pending', type: 'uint256' }],
  },
  {
    name: 'getUserBalance',
    inputs: [{ name: 'user', type: 'address' }],
    outputs: [{ name: 'balance', type: 'uint256' }],
  },
  {
    name: 'getSlotsByOwner',
    inputs: [{ name: 'user', type: 'address' }],
    outputs: [
      { name: 'count', type: 'uint16' },
      { name: 'slotIds', type: 'uint16[]' },
    ],
  },
] as const;

// ─── ABI cho MemeFactoryV2 ────────────────────────────────────────────────────

export const FACTORY_ABI = [
  {
    name: 'registerMeme',
    inputs: [
      { name: 'tokenAddr', type: 'address' },
      { name: 'revenueAddr', type: 'address' },
      { name: 'name', type: 'string' },
      { name: 'symbol', type: 'string' },
      { name: 'imageUrl', type: 'string' },
      { name: 'description', type: 'string' },
      { name: 'floorPrice', type: 'uint256' },
      { name: 'feePaid', type: 'uint256' },
    ],
    outputs: [{ name: 'index', type: 'uint256' }],
  },
  {
    name: 'getMeme',
    inputs: [{ name: 'index', type: 'uint256' }],
    outputs: [
      { name: 'index', type: 'uint256' },
      { name: 'tokenAddr', type: 'address' },
      { name: 'revenueAddr', type: 'address' },
      { name: 'creator', type: 'address' },
      { name: 'floorPrice', type: 'uint256' },
      { name: 'takeovers', type: 'uint256' },
      { name: 'createdBlock', type: 'uint256' },
    ],
  },
  {
    name: 'getMemeCount',
    inputs: [],
    outputs: [{ name: 'count', type: 'uint256' }],
  },
  {
    name: 'getMemesPaginated',
    inputs: [
      { name: 'offset', type: 'uint256' },
      { name: 'limit', type: 'uint256' },
    ],
    outputs: [
      { name: 'total', type: 'uint256' },
      { name: 'count', type: 'uint256' },
      { name: 'indices', type: 'uint256[]' },
    ],
  },
  {
    name: 'getHotMemes',
    inputs: [{ name: 'topN', type: 'uint256' }],
    outputs: [
      { name: 'count', type: 'uint256' },
      { name: 'indices', type: 'uint256[]' },
    ],
  },
  {
    name: 'getMemesByCreator',
    inputs: [
      { name: 'creator', type: 'address' },
      { name: 'offset', type: 'uint256' },
      { name: 'limit', type: 'uint256' },
    ],
    outputs: [
      { name: 'total', type: 'uint256' },
      { name: 'count', type: 'uint256' },
      { name: 'indices', type: 'uint256[]' },
    ],
  },
  {
    name: 'getProtocolFee',
    inputs: [],
    outputs: [
      { name: 'fee', type: 'uint256' },
      { name: 'totalEarned', type: 'uint256' },
    ],
  },
] as const;
