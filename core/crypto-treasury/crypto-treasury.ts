/**
 * CryptoTreasury — digital asset treasury management, wallet tracking,
 * DeFi position management, staking rewards, and on-chain analytics.
 *
 * Events:
 *   - "crypto.transaction_recorded": { walletId, txHash, asset, amountUsd }
 *   - "crypto.large_movement": { walletId, asset, amountUsd, direction }
 *   - "crypto.staking_reward": { walletId, asset, rewardUsd }
 */
import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type WalletType = "hot" | "cold" | "multisig" | "custodial" | "defi";
export type AssetType = "btc" | "eth" | "usdc" | "usdt" | "sol" | "other";
export type TxDirection = "inbound" | "outbound" | "internal";

export interface CryptoWallet {
  id: string;
  name: string;
  address: string;
  type: WalletType;
  chain: string;
  assets: Record<AssetType, number>; // asset → quantity
  usdValueCache: number;
  lastSyncAt?: string;
  createdAt: string;
}

export interface CryptoTransaction {
  id: string;
  walletId: string;
  txHash: string;
  asset: AssetType;
  quantity: number;
  usdValueAtTime: number;
  direction: TxDirection;
  fee?: number;
  notes?: string;
  recordedAt: string;
}

export interface StakingPosition {
  id: string;
  walletId: string;
  asset: AssetType;
  stakedQuantity: number;
  apy: number;
  totalRewardsUsd: number;
  startedAt: string;
}

export interface CryptoTreasurySummary {
  totalWallets: number;
  totalValueUsd: number;
  totalTransactions: number;
  totalStakingRewardsUsd: number;
  byAsset: Partial<Record<AssetType, number>>;
}

export class CryptoTreasury {
  private wallets: Map<string, CryptoWallet> = new Map();
  private transactions: Map<string, CryptoTransaction> = new Map();
  private stakingPositions: Map<string, StakingPosition> = new Map();

  constructor(private readonly bus: EventBus) {}

  addWallet(input: Omit<CryptoWallet, "id" | "createdAt"> & { id?: string }): CryptoWallet {
    const wallet: CryptoWallet = { ...input, id: input.id ?? randomUUID(), createdAt: new Date().toISOString() };
    this.wallets.set(wallet.id, wallet);
    return wallet;
  }

  recordTransaction(input: Omit<CryptoTransaction, "id"> & { id?: string }): CryptoTransaction | undefined {
    if (!this.wallets.get(input.walletId)) return undefined;
    const tx: CryptoTransaction = { ...input, id: input.id ?? randomUUID() };
    this.transactions.set(tx.id, tx);
    this.bus.publish("crypto.transaction_recorded", { walletId: tx.walletId, txHash: tx.txHash, asset: tx.asset, amountUsd: tx.usdValueAtTime });
    if (tx.usdValueAtTime >= 100000) {
      this.bus.publish("crypto.large_movement", { walletId: tx.walletId, asset: tx.asset, amountUsd: tx.usdValueAtTime, direction: tx.direction });
    }
    return tx;
  }

  addStakingPosition(input: Omit<StakingPosition, "id" | "totalRewardsUsd"> & { id?: string }): StakingPosition | undefined {
    if (!this.wallets.get(input.walletId)) return undefined;
    const position: StakingPosition = { ...input, id: input.id ?? randomUUID(), totalRewardsUsd: 0 };
    this.stakingPositions.set(position.id, position);
    return position;
  }

  recordStakingReward(positionId: string, rewardUsd: number): StakingPosition | undefined {
    const pos = this.stakingPositions.get(positionId);
    if (!pos) return undefined;
    pos.totalRewardsUsd += rewardUsd;
    this.bus.publish("crypto.staking_reward", { walletId: pos.walletId, asset: pos.asset, rewardUsd });
    return pos;
  }

  getWallet(id: string): CryptoWallet | undefined { return this.wallets.get(id); }
  listWallets(): CryptoWallet[] { return Array.from(this.wallets.values()); }
  listTransactions(walletId?: string): CryptoTransaction[] {
    const all = Array.from(this.transactions.values());
    return walletId ? all.filter(t => t.walletId === walletId) : all;
  }
  listStakingPositions(walletId?: string): StakingPosition[] {
    const all = Array.from(this.stakingPositions.values());
    return walletId ? all.filter(p => p.walletId === walletId) : all;
  }

  summary(): CryptoTreasurySummary {
    const wallets = Array.from(this.wallets.values());
    const totalValue = wallets.reduce((s, w) => s + w.usdValueCache, 0);
    const byAsset: Partial<Record<AssetType, number>> = {};
    for (const w of wallets) {
      for (const [asset, qty] of Object.entries(w.assets) as [AssetType, number][]) {
        byAsset[asset] = (byAsset[asset] ?? 0) + qty;
      }
    }
    const totalStakingRewards = Array.from(this.stakingPositions.values()).reduce((s, p) => s + p.totalRewardsUsd, 0);
    return {
      totalWallets: wallets.length,
      totalValueUsd: totalValue,
      totalTransactions: this.transactions.size,
      totalStakingRewardsUsd: totalStakingRewards,
      byAsset,
    };
  }
}
