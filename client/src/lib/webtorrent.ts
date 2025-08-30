// WebTorrent utility functions and types

export interface TorrentInfo {
  name: string;
  magnetURI: string;
  infoHash: string;
  length: number;
  files: TorrentFile[];
}

export interface TorrentFile {
  name: string;
  length: number;
  path: string;
}

export interface TorrentStats {
  downloaded: number;
  uploaded: number;
  downloadSpeed: number;
  uploadSpeed: number;
  progress: number;
  peers: number;
  ratio: number;
}

export class WebTorrentManager {
  private client: any;
  private torrents: Map<string, any> = new Map();

  constructor() {
    if (typeof window !== 'undefined' && window.WebTorrent) {
      this.client = new window.WebTorrent();
    }
  }

  async addTorrent(magnetURI: string): Promise<TorrentInfo> {
    return new Promise((resolve, reject) => {
      if (!this.client) {
        reject(new Error('WebTorrent client not initialized'));
        return;
      }

      const torrent = this.client.add(magnetURI, (torrent: any) => {
        this.torrents.set(torrent.infoHash, torrent);
        
        const torrentInfo: TorrentInfo = {
          name: torrent.name,
          magnetURI: torrent.magnetURI,
          infoHash: torrent.infoHash,
          length: torrent.length,
          files: torrent.files.map((file: any) => ({
            name: file.name,
            length: file.length,
            path: file.path,
          })),
        };

        resolve(torrentInfo);
      });

      torrent.on('error', (error: any) => {
        reject(error);
      });
    });
  }

  async seedFile(file: File): Promise<TorrentInfo> {
    return new Promise((resolve, reject) => {
      if (!this.client) {
        reject(new Error('WebTorrent client not initialized'));
        return;
      }

      const torrent = this.client.seed(file, (torrent: any) => {
        this.torrents.set(torrent.infoHash, torrent);
        
        const torrentInfo: TorrentInfo = {
          name: torrent.name,
          magnetURI: torrent.magnetURI,
          infoHash: torrent.infoHash,
          length: torrent.length,
          files: torrent.files.map((file: any) => ({
            name: file.name,
            length: file.length,
            path: file.path,
          })),
        };

        resolve(torrentInfo);
      });

      torrent.on('error', (error: any) => {
        reject(error);
      });
    });
  }

  getTorrentStats(infoHash: string): TorrentStats | null {
    const torrent = this.torrents.get(infoHash);
    if (!torrent) return null;

    return {
      downloaded: torrent.downloaded,
      uploaded: torrent.uploaded,
      downloadSpeed: torrent.downloadSpeed,
      uploadSpeed: torrent.uploadSpeed,
      progress: torrent.progress,
      peers: torrent.numPeers,
      ratio: torrent.uploaded / Math.max(torrent.downloaded, 1),
    };
  }

  streamToVideo(infoHash: string, videoElement: HTMLVideoElement): boolean {
    const torrent = this.torrents.get(infoHash);
    if (!torrent) return false;

    const videoFile = torrent.files.find((file: any) => 
      file.name.match(/\.(mp4|webm|ogg|avi|mov)$/i)
    );

    if (videoFile) {
      videoFile.streamTo(videoElement);
      return true;
    }

    return false;
  }

  removeTorrent(infoHash: string): void {
    const torrent = this.torrents.get(infoHash);
    if (torrent && this.client) {
      this.client.remove(torrent);
      this.torrents.delete(infoHash);
    }
  }

  destroy(): void {
    if (this.client) {
      this.client.destroy();
    }
    this.torrents.clear();
  }
}

export const webTorrentManager = new WebTorrentManager();
