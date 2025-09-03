import { useState, useEffect, useCallback } from "react";

interface StorageInfo {
  used: number;
  quota: number;
  usagePercentage: number;
  available: number;
  formattedUsed: string;
  formattedQuota: string;
  formattedAvailable: string;
}

interface WebTorrentStorage {
  databases: string[];
  totalSize: number;
  torrents: Array<{
    name: string;
    size: number;
    lastAccessed: number;
    infoHash: string;
  }>;
}

export function useStorageManager() {
  const [storageInfo, setStorageInfo] = useState<StorageInfo | null>(null);
  const [webTorrentStorage, setWebTorrentStorage] = useState<WebTorrentStorage | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 格式化字节大小
  const formatBytes = useCallback((bytes: number, decimals = 2) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  }, []);

  // 获取浏览器存储配额信息
  const getStorageInfo = useCallback(async (): Promise<StorageInfo | null> => {
    try {
      if (!navigator.storage || !navigator.storage.estimate) {
        throw new Error('Storage API not supported');
      }

      const estimate = await navigator.storage.estimate();
      const used = estimate.usage || 0;
      const quota = estimate.quota || 0;
      const available = quota - used;
      const usagePercentage = quota > 0 ? (used / quota) * 100 : 0;

      return {
        used,
        quota,
        available,
        usagePercentage,
        formattedUsed: formatBytes(used),
        formattedQuota: formatBytes(quota),
        formattedAvailable: formatBytes(available),
      };
    } catch (err) {
      console.error('Failed to get storage info:', err);
      return null;
    }
  }, [formatBytes]);

  // 获取WebTorrent相关的IndexedDB存储信息
  const getWebTorrentStorage = useCallback(async (): Promise<WebTorrentStorage | null> => {
    try {
      const databases = await indexedDB.databases();
      const webTorrentDbs = databases.filter(db => 
        db.name?.includes('webtorrent') || 
        db.name?.includes('torrent') ||
        db.name?.includes('WebTorrent')
      );

      let totalSize = 0;
      const torrents: Array<{
        name: string;
        size: number;
        lastAccessed: number;
        infoHash: string;
      }> = [];

      // 简化版本：只返回数据库名称列表
      // 完整的大小计算需要遍历每个数据库，比较复杂
      const dbNames = webTorrentDbs.map(db => db.name || 'unknown');

      return {
        databases: dbNames,
        totalSize,
        torrents,
      };
    } catch (err) {
      console.error('Failed to get WebTorrent storage info:', err);
      return null;
    }
  }, []);

  // 清理指定的torrent数据
  const cleanupTorrent = useCallback(async (infoHash: string): Promise<boolean> => {
    try {
      // 这里需要与WebTorrent客户端集成来清理特定torrent
      console.log('Cleanup torrent:', infoHash);
      return true;
    } catch (err) {
      console.error('Failed to cleanup torrent:', err);
      return false;
    }
  }, []);

  // 清理所有WebTorrent数据
  const cleanupAllWebTorrentData = useCallback(async (): Promise<boolean> => {
    try {
      const databases = await indexedDB.databases();
      const webTorrentDbs = databases.filter(db => 
        db.name?.includes('webtorrent') || 
        db.name?.includes('torrent') ||
        db.name?.includes('WebTorrent')
      );

      for (const db of webTorrentDbs) {
        if (db.name) {
          const deleteReq = indexedDB.deleteDatabase(db.name);
          await new Promise((resolve, reject) => {
            deleteReq.onsuccess = () => resolve(undefined);
            deleteReq.onerror = () => reject(deleteReq.error);
          });
          console.log(`✅ Deleted database: ${db.name}`);
        }
      }

      return true;
    } catch (err) {
      console.error('Failed to cleanup WebTorrent data:', err);
      return false;
    }
  }, []);

  // 刷新存储信息
  const refreshStorageInfo = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const [storage, webTorrent] = await Promise.all([
        getStorageInfo(),
        getWebTorrentStorage(),
      ]);

      setStorageInfo(storage);
      setWebTorrentStorage(webTorrent);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsLoading(false);
    }
  }, [getStorageInfo, getWebTorrentStorage]);

  // 组件挂载时获取存储信息
  useEffect(() => {
    refreshStorageInfo();
  }, [refreshStorageInfo]);

  return {
    storageInfo,
    webTorrentStorage,
    isLoading,
    error,
    formatBytes,
    cleanupTorrent,
    cleanupAllWebTorrentData,
    refreshStorageInfo,
  };
}