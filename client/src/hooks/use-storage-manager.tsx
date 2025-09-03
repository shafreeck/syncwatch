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

  // 获取WebTorrent相关的存储信息（包括文件系统和IndexedDB）
  const getWebTorrentStorage = useCallback(async (): Promise<WebTorrentStorage | null> => {
    try {
      console.log('🔍 检查存储分布...');
      
      // 1. 检查 IndexedDB 数据库
      const databases = await indexedDB.databases();
      console.log('📊 所有 IndexedDB 数据库:', databases.map(db => ({ name: db.name, version: db.version })));
      
      // 2. 尝试获取详细的存储分布信息
      let totalSize = 0;
      let estimatedWebTorrentSize = 0;
      
      // 检查 navigator.storage 的详细信息
      if (navigator.storage && navigator.storage.estimate) {
        const estimate = await navigator.storage.estimate();
        const usage = estimate.usage || 0;
        const quota = estimate.quota || 0;
        
        console.log('💾 浏览器存储详情:', {
          usage: formatBytes(usage),
          quota: formatBytes(quota),
          usageBytes: usage,
          quotaBytes: quota
        });
        
        // 如果使用量很大（超过10GB），很可能包含视频缓存
        if (usage > 10 * 1024 * 1024 * 1024) {
          // 估算 WebTorrent 占用：假设大部分大文件存储都是视频相关
          estimatedWebTorrentSize = Math.max(0, usage - (500 * 1024 * 1024)); // 减去500MB基础使用量
          console.log('🎬 估算 WebTorrent 缓存大小:', formatBytes(estimatedWebTorrentSize));
        }
      }
      
      // 3. 检查可能的 WebTorrent 相关数据库
      const webTorrentDbs = databases.filter(db => {
        const name = db.name?.toLowerCase() || '';
        return name.includes('webtorrent') || 
               name.includes('torrent') ||
               name.includes('wt-') ||
               name.includes('chunk') ||
               name.includes('file') ||
               name.includes('cache');
      });
      
      console.log('🎯 可能的 WebTorrent 数据库:', webTorrentDbs.map(db => db.name));
      
      // 4. 检查 Origin Private File System API（如果支持）
      let opfsSize = 0;
      try {
        if ('storage' in navigator && 'getDirectory' in navigator.storage) {
          console.log('🗂️ 检查 Origin Private File System...');
          // @ts-ignore - OPFS API可能不在类型定义中
          const opfsRoot = await navigator.storage.getDirectory();
          // 这里可以遍历文件系统，但比较复杂，暂时跳过
          console.log('✅ OPFS 可用，但跳过详细扫描');
        }
      } catch (err) {
        console.log('❌ OPFS 不可用或访问失败:', err);
      }
      
      const torrents: Array<{
        name: string;
        size: number;
        lastAccessed: number;
        infoHash: string;
      }> = [];
      
      // 如果估算的大小很大，创建一个虚拟的 torrent 条目表示缓存
      if (estimatedWebTorrentSize > 1024 * 1024 * 1024) { // 大于1GB
        torrents.push({
          name: '视频缓存文件',
          size: estimatedWebTorrentSize,
          lastAccessed: Date.now(),
          infoHash: 'cached-videos'
        });
      }

      const dbNames = webTorrentDbs.map(db => db.name || 'unknown');

      return {
        databases: dbNames,
        totalSize: estimatedWebTorrentSize,
        torrents,
      };
    } catch (err) {
      console.error('Failed to get WebTorrent storage info:', err);
      return null;
    }
  }, [formatBytes]);

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