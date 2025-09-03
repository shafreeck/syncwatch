import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, HardDrive, Trash2, RefreshCw, Database, FileVideo, Folder } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useStorageManager } from "@/hooks/use-storage-manager";
import { useToast } from "@/hooks/use-toast";

export function StorageMonitor() {
  const {
    storageInfo,
    webTorrentStorage,
    isLoading,
    error,
    cleanupAllWebTorrentData,
    refreshStorageInfo,
  } = useStorageManager();
  
  const [isCleanupLoading, setIsCleanupLoading] = useState(false);
  const { toast } = useToast();

  const handleCleanupAll = async () => {
    if (!confirm('确定要清理所有WebTorrent下载的内容吗？这将删除所有已下载的视频文件。')) {
      return;
    }

    setIsCleanupLoading(true);
    try {
      const success = await cleanupAllWebTorrentData();
      if (success) {
        toast({
          title: "清理完成",
          description: "所有WebTorrent数据已成功清理",
        });
        // 刷新存储信息
        await refreshStorageInfo();
      } else {
        throw new Error('清理失败');
      }
    } catch (err) {
      toast({
        title: "清理失败",
        description: err instanceof Error ? err.message : "未知错误",
        variant: "destructive",
      });
    } finally {
      setIsCleanupLoading(false);
    }
  };

  const getStorageStatusColor = (percentage: number) => {
    if (percentage >= 90) return "destructive";
    if (percentage >= 75) return "default";
    return "secondary";
  };

  const getStorageStatusText = (percentage: number) => {
    if (percentage >= 90) return "存储空间严重不足";
    if (percentage >= 75) return "存储空间不足";
    return "存储空间充足";
  };

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>存储监控错误</AlertTitle>
        <AlertDescription>
          无法获取存储信息: {error}
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <Card data-testid="card-storage-monitor">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <HardDrive className="h-5 w-5" />
              存储管理
            </CardTitle>
            <CardDescription>
              监控和管理WebTorrent下载内容的存储空间
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={refreshStorageInfo}
            disabled={isLoading}
            data-testid="button-refresh-storage"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            刷新
          </Button>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-6">
        {/* 浏览器存储总览 */}
        {storageInfo && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium">浏览器存储使用情况</h3>
              <Badge variant={getStorageStatusColor(storageInfo.usagePercentage)}>
                {getStorageStatusText(storageInfo.usagePercentage)}
              </Badge>
            </div>
            
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span data-testid="text-storage-used">已使用: {storageInfo.formattedUsed}</span>
                <span data-testid="text-storage-available">可用: {storageInfo.formattedAvailable}</span>
              </div>
              <Progress 
                value={storageInfo.usagePercentage} 
                className="w-full" 
                data-testid="progress-storage-usage"
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>0%</span>
                <span data-testid="text-storage-percentage">
                  {storageInfo.usagePercentage.toFixed(1)}%
                </span>
                <span>100%</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">总配额:</span>
                <span className="ml-2 font-medium" data-testid="text-storage-quota">
                  {storageInfo.formattedQuota}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground">使用率:</span>
                <span className="ml-2 font-medium" data-testid="text-storage-usage-rate">
                  {storageInfo.usagePercentage.toFixed(1)}%
                </span>
              </div>
            </div>
          </div>
        )}

        {/* WebTorrent存储信息 */}
        {webTorrentStorage && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium flex items-center gap-2">
                <FileVideo className="h-4 w-4" />
                WebTorrent 缓存文件
              </h3>
              <span className="text-xs text-muted-foreground" data-testid="text-cache-size">
                {webTorrentStorage.totalSize > 0 ? 
                  `约 ${(webTorrentStorage.totalSize / (1024 * 1024 * 1024)).toFixed(1)} GB` : 
                  '暂无缓存'}
              </span>
            </div>

            {webTorrentStorage.torrents && webTorrentStorage.torrents.length > 0 ? (
              <div className="space-y-2">
                {webTorrentStorage.torrents.map((torrent, index) => (
                  <div 
                    key={index} 
                    className="flex items-center justify-between p-3 bg-muted/50 rounded text-sm"
                    data-testid={`item-torrent-${index}`}
                  >
                    <div className="flex items-center gap-2">
                      <Folder className="h-4 w-4 text-blue-500" />
                      <span className="text-sm">{torrent.name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="text-xs">
                        {(torrent.size / (1024 * 1024 * 1024)).toFixed(1)} GB
                      </Badge>
                      <Badge variant="outline" className="text-xs">视频缓存</Badge>
                    </div>
                  </div>
                ))}
              </div>
            ) : webTorrentStorage.databases.length > 0 ? (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  检测到 {webTorrentStorage.databases.length} 个相关数据库，但暂无大文件缓存
                </p>
                {webTorrentStorage.databases.map((dbName, index) => (
                  <div 
                    key={index} 
                    className="flex items-center justify-between p-2 bg-muted/50 rounded text-sm"
                    data-testid={`item-database-${index}`}
                  >
                    <span className="font-mono text-xs">{dbName}</span>
                    <Badge variant="outline" className="text-xs">数据库</Badge>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground" data-testid="text-no-cache">
                暂无 WebTorrent 缓存文件
              </p>
            )}
          </div>
        )}

        {/* 清理操作 */}
        {storageInfo && storageInfo.usagePercentage > 50 && (
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>存储空间建议</AlertTitle>
            <AlertDescription>
              当前存储使用率为 {storageInfo.usagePercentage.toFixed(1)}%，
              建议清理不需要的视频文件以释放空间。
            </AlertDescription>
          </Alert>
        )}

        <div className="flex gap-2">
          <Button
            variant="destructive"
            size="sm"
            onClick={handleCleanupAll}
            disabled={isCleanupLoading || (!webTorrentStorage?.databases.length && !webTorrentStorage?.torrents.length)}
            className="flex items-center gap-2"
            data-testid="button-cleanup-all"
          >
            <Trash2 className={`h-4 w-4 ${isCleanupLoading ? 'animate-pulse' : ''}`} />
            {isCleanupLoading ? '清理中...' : '清理所有数据'}
          </Button>
          
          {storageInfo && storageInfo.usagePercentage > 90 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                toast({
                  title: "存储空间不足",
                  description: "建议清理WebTorrent数据或减少缓存文件数量",
                  variant: "destructive",
                });
              }}
              data-testid="button-storage-warning"
            >
              <AlertTriangle className="h-4 w-4" />
              紧急清理
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}