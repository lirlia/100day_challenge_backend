'use client';

import { useState, useEffect, useRef } from 'react';

export default function Home() {
  const [hasMounted, setHasMounted] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [text, setText] = useState(''); // Editor content
  const ws = useRef<WebSocket | null>(null);

  // WebSocket connection logic
  useEffect(() => {
    console.log('Attempting WebSocket connection...');
    ws.current = new WebSocket('ws://localhost:8080');

    ws.current.onopen = () => {
      console.log('WebSocket connected');
      setIsConnected(true);
    };

    ws.current.onclose = () => {
      console.log('WebSocket disconnected');
      setIsConnected(false);
      ws.current = null;
    };

    ws.current.onerror = (event) => {
      console.error('WebSocket error event:', event);
    };

    ws.current.onmessage = (event) => {
      console.log('Message from server:', event.data);
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'init') {
          setText(data.document);
          console.log('Initialized with document:', data.document);
          // TODO: Handle revision, clientId, clientColor, clients for cursor/OT
        } else if (data.type === 'operation') {
          // TODO: Apply incoming operation using ot.js
          console.log('Received operation:', data);
        } else if (data.type === 'selection_update') {
           // TODO: Handle cursor updates
           console.log('Received selection update:', data);
        }
        // Ignore user_joined/user_left for now as user list is removed
      } catch (e) {
        console.error("Failed to parse message or invalid JSON", event.data, e);
      }
    };

    const currentWs = ws.current;
    return () => {
      console.log('WebSocket effect cleanup - closing connection');
      currentWs?.close();
      setIsConnected(false);
    };
  }, []);

  // Mount state logic
  useEffect(() => {
    setHasMounted(true);
  }, []);

  // Text area change handler
  const handleTextChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newText = event.target.value;
    // TODO: Generate OT operation BEFORE updating state locally?
    // For now, just update local state. OT logic will handle diffing later.
    setText(newText);
    // TODO: Send OT operation to server
    console.log("Text changed, sending operation should happen here.");
  };

  if (!hasMounted) {
    return (
      <main className="flex h-screen justify-center items-center bg-gray-100">
        <div>Loading Editor...</div>
      </main>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-white">
      {/* HackMD-style Navigation Bar - Changed to black background */}
      <nav className="bg-black text-white h-12 flex items-center px-4">
        <div className="flex items-center">
          <span className="font-bold text-xl">Day9 Collaborative Editor</span>
        </div>
        <div className="flex-1"></div>
        <div className="text-sm">
          <span>
            Status: {isConnected ?
              <span className="ml-1 inline-flex items-center">
                <span className="h-2 w-2 rounded-full bg-green-500 mr-1"></span>
                Connected
              </span> :
              <span className="ml-1 inline-flex items-center">
                <span className="h-2 w-2 rounded-full bg-red-500 mr-1"></span>
                Disconnected
              </span>}
          </span>
        </div>
      </nav>

      {/* Editor Container */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Panel: Text Input Area (HackMD Style) */}
        <div className="w-1/2 border-r border-gray-200 flex flex-col">
          <div className="py-2 px-4 border-b border-gray-200 bg-gray-50 flex items-center justify-center">
            <span className="text-gray-700 font-medium">MARKDOWN</span>
          </div>
          <div className="flex-1 flex flex-col">
            <div className="px-4 py-2 bg-gray-50 border-b border-gray-200">
              <span className="text-gray-500 text-sm"># aaa</span>
            </div>
            <textarea
              className="flex-1 w-full p-4 border-none resize-none font-mono text-sm outline-none bg-gray-50"
              value={text}
              onChange={handleTextChange}
              placeholder="# Start typing in Markdown..."
              disabled={!isConnected}
              spellCheck="false"
            />
          </div>
        </div>

        {/* Right Panel: Preview Area (HackMD Style) */}
        <div className="w-1/2 flex flex-col">
          <div className="py-2 px-4 border-b border-gray-200 bg-gray-50 flex items-center justify-center">
            <span className="text-gray-700 font-medium">PREVIEW</span>
          </div>
          <div className="flex-1 flex flex-col">
            <div className="px-4 py-2 bg-gray-50 border-b border-gray-200">
              <span className="text-gray-500 text-sm"># aaa</span>
            </div>
            <div className="flex-1 p-4 overflow-y-auto bg-gray-50">
              {/* This would normally use a Markdown parser like react-markdown */}
              {/* For simplicity, we just display the raw text for now */}
              {text ? (
                <pre className="whitespace-pre-wrap break-words font-sans text-base">
                  {text}
                </pre>
              ) : (
                <div className="text-gray-400 italic">
                  Nothing to preview
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}