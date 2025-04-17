import { Post } from '@/lib/types';

type EventCallback = (data: any) => void;

/**
 * SSE接続とイベントリスナーを管理するシングルトンクラス。
 */
class ServerSentEventListener {
  private static instance: ServerSentEventListener;
  private eventSource: EventSource | null = null;
  private listeners: Map<string, Set<EventCallback>> = new Map();
  private isInitializedFlag = false;

  private constructor() { }

  public static getInstance(): ServerSentEventListener {
    if (!ServerSentEventListener.instance) {
      ServerSentEventListener.instance = new ServerSentEventListener();
    }
    return ServerSentEventListener.instance;
  }

  public isInitialized(): boolean {
    return this.isInitializedFlag;
  }

  public initialize(url: string = '/api/posts/stream'): void {
    if (this.eventSource && this.eventSource.readyState !== EventSource.CLOSED) {
      console.warn('SSE Listener is already initialized and connected.');
      return;
    }

    try {
        console.log(`Initializing SSE connection to: ${url}`);
        this.eventSource = new EventSource(url);
        this.isInitializedFlag = true;

        this.eventSource.onopen = () => {
            console.log('SSE connection successfully opened.');
            // 必要であれば接続状態を通知するイベントを発行しても良い
        };

        this.eventSource.onerror = (error) => {
            console.error('SSE connection error:', error);
            // エラー時に再接続を試みるなどのロジックも追加可能
            this.isInitializedFlag = false; // エラー時は初期化フラグを倒す
            this.eventSource?.close(); // エラー時は一旦閉じる
        };

        // 'message' イベントは汎用的なので、特定のイベント名を期待する
        // this.eventSource.onmessage = (event) => {
        //     console.log('SSE generic message received:', event.data);
        //     this.dispatchEvent('message', event.data);
        // };

        // カスタムイベントのリスニング設定 (例: 'newPost')
        // 注意: サーバー側が `event: newPost` の形式で送信する必要がある
        this.eventSource.addEventListener('newPost', (event) => {
            // console.log('SSE newPost event received:', event.data);
            try {
                const postData: Post = JSON.parse(event.data);
                this.dispatchEvent('newPost', postData);
            } catch (e) {
                console.error('Failed to parse newPost data from SSE:', e);
            }
        });

        // 他のカスタムイベントも同様に追加可能
        // this.eventSource.addEventListener('otherEvent', (event) => { ... });

    } catch (error) {
        console.error('Failed to initialize SSE connection:', error);
        this.isInitializedFlag = false;
    }
  }

  public on(eventName: string, callback: EventCallback): void {
    if (!this.listeners.has(eventName)) {
      this.listeners.set(eventName, new Set());
    }
    this.listeners.get(eventName)?.add(callback);
    // console.log(`Listener added for event: ${eventName}`);
  }

  public off(eventName: string, callback: EventCallback): void {
    const eventListeners = this.listeners.get(eventName);
    if (eventListeners) {
      eventListeners.delete(callback);
      // console.log(`Listener removed for event: ${eventName}`);
      if (eventListeners.size === 0) {
        this.listeners.delete(eventName);
      }
    }
  }

  private dispatchEvent(eventName: string, data: any): void {
    const eventListeners = this.listeners.get(eventName);
    if (eventListeners) {
      // console.log(`Dispatching event: ${eventName} to ${eventListeners.size} listeners`);
      eventListeners.forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          console.error(`Error in SSE event listener for ${eventName}:`, error);
        }
      });
    }
  }

  public close(): void {
    if (this.eventSource) {
      console.log('Closing SSE connection.');
      this.eventSource.close();
      this.eventSource = null;
      this.isInitializedFlag = false;
      this.listeners.clear(); // 接続終了時にリスナーもクリア
    } else {
        console.log('SSE connection already closed or not initialized.');
    }
  }
}

// シングルトンインスタンスをエクスポート
export const SSEListener = ServerSentEventListener.getInstance();
