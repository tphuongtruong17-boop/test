# MEMESLOTS — Next.js + OP_NET

dApp meme token trên Bitcoin L1 với kết nối ví thật qua **@btc-vision/walletconnect**.

---

## 🚀 Chạy local

```bash
# 1. Cài dependencies
npm install

# 2. Copy env file
cp .env.local.example .env.local

# 3. Điền địa chỉ contract vào .env.local (sau khi deploy)

# 4. Chạy dev server
npm run dev
# → http://localhost:3000
```

---

## 📦 Deploy Contracts trước

Trước khi chạy dApp, cần deploy 3 contracts:

```bash
# Build contracts
cd ../opnet-meme-dapp
npm install
npm run build:revenue   # → build/RevenueSharingV2.wasm
npm run build:meme      # → build/MemeToken.wasm
npm run build:factory   # → build/MemeFactoryV2.wasm

# Deploy lên testnet
PRIVATE_KEY=your_key npx ts-node scripts/deploy.ts
```

Sau khi deploy xong, copy địa chỉ `MemeFactoryV2` vào `.env.local`:
```
NEXT_PUBLIC_FACTORY_ADDRESS=bc1p...
```

---

## 🔑 Cài OP_WALLET

1. Mở Chrome → [Chrome Web Store](https://chromewebstore.google.com/detail/opwallet/pmbjpcmaaladnfpacpmhmnfmpklgbdjb)
2. Install **OP_WALLET**
3. Tạo ví → chọn Testnet
4. Lấy testnet BTC từ faucet: https://testnet.opnet.org/faucet

---

## 🏗️ Kiến trúc

```
src/
├── app/
│   ├── page.tsx          ← Explore + Create + My Memes
│   ├── layout.tsx        ← WalletProvider wrapper
│   └── meme/[id]/
│       └── page.tsx      ← Meme detail + Slot grid + Actions
├── components/
│   ├── WalletButton.tsx  ← Kết nối OP_WALLET / Unisat
│   └── SlotGrid.tsx      ← Grid 100 slots
├── hooks/
│   └── useOpnetWallet.ts ← Tất cả logic kết nối + contract calls
└── lib/
    └── opnet.ts          ← Provider, ABI, config
```

---

## 🔗 SDK đang dùng

| Package | Mục đích |
|---------|----------|
| `opnet` | JSONRpcProvider, getContract |
| `@btc-vision/walletconnect` | WalletProvider, useWallet hook |
| `@btc-vision/transaction` | Tạo và ký transaction |
| `@btc-vision/bitcoin` | Network enum (Testnet/Mainnet) |

---

## ⚙️ Sau khi deploy contract

Trong `src/app/meme/[id]/page.tsx`, tại hàm `handleDeploy()`:
- Thay `'MemeToken_WASM_HEX'` bằng hex string của file `.wasm` đã compile
- Thay `'RevenueSharingV2_WASM_HEX'` tương tự

```ts
// Đọc wasm file thành hex
const fs = require('fs');
const wasm = fs.readFileSync('./build/MemeToken.wasm');
const hex = wasm.toString('hex');
```

---

## 🌐 Deploy lên Vercel

```bash
npm run build
vercel deploy
# Thêm env vars trong Vercel dashboard
```
