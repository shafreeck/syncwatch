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
      
      // 打印所有数据库名称用于调试
      console.log('🔍 All IndexedDB databases:', databases.map(db => ({ name: db.name, version: db.version })));
      
      // 扩展过滤条件，包含更多可能的WebTorrent相关数据库
      const webTorrentDbs = databases.filter(db => {
        const name = db.name?.toLowerCase() || '';
        return name.includes('webtorrent') || 
               name.includes('torrent') ||
               name.includes('wt-') ||
               name.includes('chunk') ||
               name.includes('peer') ||
               name.includes('storage') ||
               name.includes('cache') ||
               // 通用的可能存储大文件的数据库
               (db.version && db.version > 1) || // 版本较高的数据库可能是应用数据库
               name.length > 20; // 长名称的数据库可能是hash-based
      });

      console.log('🎯 Filtered WebTorrent databases:', webTorrentDbs.map(db => db.name));

      let totalSize = 0;
      const torrents: Array<{
        name: string;
        size: number;
        lastAccessed: number;
        infoHash: string;
      }> = [];

      // 尝试计算每个数据库的估算大小
      for (const dbInfo of webTorrentDbs) {
        if (!dbInfo.name) continue;
        
        try {
          // 简单的大小估算：基于数据库版本和名称特征
          const estimatedSize = await estimateDatabaseSize(dbInfo.name);
          totalSize += estimatedSize;
          
          if (estimatedSize > 100 * 1024 * 1024) { // 大于100MB的被认为是torrent数据
            torrents.push({
              name: dbInfo.name,
              size: estimatedSize,
              lastAccessed: Date.now(),
              infoHash: dbInfo.name.slice(-40) || 'unknown'
            });
          }
        } catch (err) {
          console.warn(`Failed to estimate size for ${dbInfo.name}:`, err);
        }
      }

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

  // 估算单个数据库大小的辅助函数
  const estimateDatabaseSize = useCallback(async (dbName: string): Promise<number> => {
    return new Promise((resolve) => {
      const request = indexedDB.open(dbName);
      
      request.onsuccess = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        let estimatedSize = 0;
        
        try {
          // 基于对象存储的数量和名称估算大小
          const storeNames = Array.from(db.objectStoreNames);
          
          for (const storeName of storeNames) {
            // 如果存储名称暗示是块数据或文件数据，估算较大的大小
            if (storeName.includes('chunk') || storeName.includes('data') || storeName.includes('file')) {
              estimatedSize += 10 * 1024 * 1024; // 每个这样的存储估算10MB
            } else {
              estimatedSize += 1024 * 1024; // 其他存储估算1MB
            }
          }
          
          // 如果数据库有很多对象存储，可能包含大量数据
          if (storeNames.length > 5) {
            estimatedSize *= storeNames.length;
          }
          
          db.close();
          resolve(estimatedSize);
        } catch (err) {
          db.close();
          resolve(0);
        }
      };
      
      request.onerror = () => {
        resolve(0);
      };
      
      // 5秒超时
      setTimeout(() => resolve(0), 5000);
    });
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