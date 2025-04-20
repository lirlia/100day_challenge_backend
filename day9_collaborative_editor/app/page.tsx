'use client';

import { useState, useEffect, useRef } from 'react';

export default function Home() {
  const [hasMounted, setHasMounted] = useState(false); // マウント状態
  const [isConnected, setIsConnected] = useState(false);
  const [messageLog, setMessageLog] = useState<string[]>([]);
  const [text, setText] = useState('');
  const ws = useRef<WebSocket | null>(null);

  // WebSocket 接続とクリーンアップの useEffect
  useEffect(() => {
    // マウント後にのみ WebSocket 接続を初期化
    console.log('Attempting WebSocket connection...');
    ws.current = new WebSocket('ws://localhost:8080');

    ws.current.onopen = () => {
      console.log('WebSocket connected');
      setIsConnected(true);
      setMessageLog((prev) => ['Connected to WebSocket server']); // Reset log on connect
    };

    ws.current.onclose = () => {
      console.log('WebSocket disconnected');
      setIsConnected(false);
      // Avoid adding disconnect message immediately after error/close during init
      if (ws.current) { // Only add if it wasn't an immediate close after failed init
          setMessageLog((prev) => [...prev, 'Disconnected from WebSocket server']);
      }
      ws.current = null; // Ensure ref is cleared
    };

    ws.current.onerror = (event) => {
      console.error('WebSocket error event:', event);
      setMessageLog((prev) => [...prev, 'WebSocket error occurred. Check console.']);
    };

    ws.current.onmessage = (event) => {
      console.log('Message from server:', event.data);
      try {
        const data = JSON.parse(event.data);
        setMessageLog((prev) => [...prev, `Received: ${JSON.stringify(data)}`]); // Log parsed data
        if (data.type === 'init') {
          setText(data.document);
          console.log('Initialized with data:', data);
          // TODO: Handle revision, clientId, clientColor, clients
        } else {
          // TODO: Handle other message types
        }
      } catch (e) {
        console.error("Failed to parse message or invalid JSON", event.data, e);
        setMessageLog((prev) => [...prev, `Received raw: ${event.data}`]); // Log raw on parse failure
      }
    };

    const currentWs = ws.current; // Capture current ref for cleanup

    // クリーンアップ関数
    return () => {
      console.log('WebSocket effect cleanup - closing connection');
      currentWs?.close();
      setIsConnected(false); // Ensure disconnected state on cleanup
    };
  }, []); // この Effect はマウント/アンマウントで一度だけ実行されるべき

  // マウント状態を設定する Effect
  useEffect(() => {
    setHasMounted(true);
  }, []);

  // テキストエリアの変更ハンドラ
  const handleTextChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newText = event.target.value;
    setText(newText);
    // TODO: Generate OT operation and send to server
  };

  // マウントされるまでローディング表示
  if (!hasMounted) {
    return (
      <main className="flex flex-col min-h-screen p-8 bg-gray-50 justify-center items-center">
        <div>Loading Editor...</div>
      </main>
    );
  }

  // マウント後に実際の UI をレンダリング
  return (
    <main className="flex flex-col min-h-screen p-8 bg-gray-50">
      <h1 className="text-2xl font-bold mb-4 text-center w-full">Day 9: Collaborative Editor</h1>
      <div className="mb-2 w-full max-w-6xl mx-auto">
        Status: {isConnected ? <span className="text-green-600">Connected</span> : <span className="text-red-600">Disconnected</span>}
      </div>
      <div className="flex flex-1 w-full max-w-6xl mx-auto gap-4 overflow-hidden">
        {/* Left Panel: Text Area */}
        <div className="w-1/2 flex flex-col">
          <div className="relative flex-1 border border-gray-300 rounded-md shadow-sm overflow-hidden">
            {/* TODO: カーソル表示レイヤー */}
            <textarea
              className="absolute top-0 left-0 w-full h-full p-2 border-none outline-none resize-none font-mono text-sm bg-white z-10"
              value={text} // マウント後なので直接 text を使える
              onChange={handleTextChange}
              placeholder="Start typing..."
              disabled={!isConnected} // 接続中のみ有効 (hasMounted は不要)
            />
          </div>
        </div>
        {/* Right Panel: Message Log */}
        <div className="w-1/2 flex flex-col">
          <div className="flex-1 p-4 border border-gray-200 rounded-md bg-white shadow-sm overflow-y-auto text-sm">
            <h2 className="font-semibold mb-2 sticky top-0 bg-white pb-2">Message Log:</h2>
            {messageLog.map((msg, index) => (
              <div key={index} className="font-mono break-all mb-1">{msg}</div>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}