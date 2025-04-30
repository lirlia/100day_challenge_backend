import { clusterManager } from './cluster-manager';
import type { CacheKey, CacheValue, CacheSetOptions, CacheItemResponse } from './types';

/**
 * キャッシュストア
 * アプリケーション向けのシンプルなキャッシュ操作インターフェースを提供
 */
export class CacheStore {
  /**
   * キャッシュから値を取得
   * @param key キャッシュキー
   * @returns キャッシュアイテムまたはnull
   */
  public async get(key: CacheKey): Promise<CacheItemResponse | null> {
    try {
      return await clusterManager.get(key);
    } catch (error) {
      console.error(`Error getting cache key ${key}:`, error);
      return null;
    }
  }

  /**
   * キャッシュに値を設定
   * @param key キャッシュキー
   * @param value キャッシュ値
   * @param options 設定オプション（TTL等）
   * @returns 成功したかどうか
   */
  public async set(
    key: CacheKey,
    value: CacheValue,
    options?: CacheSetOptions
  ): Promise<boolean> {
    try {
      return await clusterManager.set(key, value, options);
    } catch (error) {
      console.error(`Error setting cache key ${key}:`, error);
      return false;
    }
  }

  /**
   * キャッシュから値を削除
   * @param key キャッシュキー
   * @returns 成功したかどうか
   */
  public async delete(key: CacheKey): Promise<boolean> {
    try {
      return await clusterManager.delete(key);
    } catch (error) {
      console.error(`Error deleting cache key ${key}:`, error);
      return false;
    }
  }

  /**
   * TTL付きでキャッシュに値を設定
   * @param key キャッシュキー
   * @param value キャッシュ値
   * @param ttl 有効期限（秒）
   * @returns 成功したかどうか
   */
  public async setWithTTL(
    key: CacheKey,
    value: CacheValue,
    ttl: number
  ): Promise<boolean> {
    return this.set(key, value, { ttl });
  }

  /**
   * 指定されたキーが存在するか確認
   * @param key キャッシュキー
   * @returns 存在するかどうか
   */
  public async exists(key: CacheKey): Promise<boolean> {
    const result = await this.get(key);
    return result !== null;
  }
}

// デフォルトのキャッシュストアインスタンスをエクスポート
export const cacheStore = new CacheStore();
export default cacheStore;
