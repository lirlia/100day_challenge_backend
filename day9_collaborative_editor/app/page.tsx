'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import ShareDBClient from 'sharedb/lib/client';
import richText from 'rich-text';
import ReconnectingWebSocket from 'reconnecting-websocket';
import Delta from 'quill-delta';

ShareDBClient.types.register(richText.type);

const WS_URL = 'ws://localhost:8080'; // WebSocket server URL

export default function Home() {
  const [hasMounted, setHasMounted] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [text, setText] = useState(''); // Local editor content (derived from ShareDB)
  const docRef = useRef<ShareDBClient.Doc | null>(null); // Ref to store the ShareDB document object
  const connectionRef = useRef<ShareDBClient.Connection | null>(null); // Ref for ShareDB connection
  const editorRef = useRef<HTMLTextAreaElement>(null); // Ref for the textarea element
  const applyingServerOp = useRef(false); // Flag to prevent feedback loop

  // Initialize ShareDB connection and document subscription
  useEffect(() => {
    console.log('[Debug] Setting up ShareDB connection...');
    const socket = new ReconnectingWebSocket(WS_URL);
    console.log('[Debug] ReconnectingWebSocket instance created:', socket);

    socket.addEventListener('open', () => {
        console.log('[Debug] WebSocket connection opened.');
    });
    socket.addEventListener('close', (event) => {
        console.log('[Debug] WebSocket connection closed:', event.code, event.reason);
    });
    socket.addEventListener('error', (event) => {
        console.error('[Debug] WebSocket connection error:', event);
    });

    const connection = new ShareDBClient.Connection(socket as any);
    console.log('[Debug] ShareDB Connection instance created:', connection);
    connectionRef.current = connection;

    // Get the document
    const doc = connection.get('documents', 'default');
    console.log('[Debug] ShareDB document instance obtained:', doc);
    docRef.current = doc;

    console.log('[Debug] Calling doc.subscribe...');
    doc.subscribe((err) => {
      if (err) {
        console.error('[Debug] Failed to subscribe to document:', err);
        setIsConnected(false); // Ensure disconnected state on subscribe error
        return;
      }
      console.log('[Debug] Successfully subscribed to document');
      setIsConnected(true);
      // Initial document load
      if (doc.data) {
         // ShareDB rich-text data is an array of ops (Delta format)
         // We need plain text for the textarea
         const initialText = doc.data.ops.map((op: any) => op.insert).join('');
         setText(initialText);
         console.log('Document loaded:', initialText);
      } else {
        console.log('Document is empty or not yet loaded');
      }
    });

    // Listen for changes from the server
    doc.on('op', (op, source) => {
      if (source) {
          console.log('[Debug] Ignoring op from self:', op);
          return; // Don't apply our own operations
      }
      console.log('[Debug] Received op from server:', op);
      try {
        applyingServerOp.current = true; // Set flag before applying
        // Apply op to local state (rich-text ops are deltas)
        // We need to calculate the new full text based on the delta
        // This is a simplified approach; a proper rich-text editor would handle this better.
        // For plain text, applying diffs is complex with rich-text deltas.
        // Let's refetch the full text for simplicity here, though less efficient.
        const currentDocData = doc.data; // Get the latest data after the op was applied by ShareDB
        if (currentDocData?.ops) {
            const newText = currentDocData.ops.map((op: any) => op.insert).join('');
            setText(newText);
            console.log('Applied server op, new text:', newText);
        } else {
            console.warn('Could not get text from doc data after op');
        }
      } catch (e) {
          console.error("[Debug] Error applying server op:", e);
      } finally {
          applyingServerOp.current = false; // Reset flag
      }
    });

    doc.on('error', (err) => {
        console.error('[Debug] ShareDB document error:', err);
    });

    // Listen for connection state changes
    connection.on('connected', () => {
        console.log('[Debug] ShareDB state: connected');
        setIsConnected(true);
        // Re-subscribe or ensure subscription is active if needed
        if (docRef.current && !docRef.current.subscribed) {
            console.log('[Debug] Attempting to re-subscribe...');
            docRef.current.subscribe((err) => {
                if (err) console.error('[Debug] Error re-subscribing:', err);
                else console.log('[Debug] Re-subscribed successfully');
            });
        }
    });
    connection.on('disconnected', () => {
        console.log('[Debug] ShareDB state: disconnected');
        setIsConnected(false);
    });
    connection.on('error', (err) => {
        console.error('[Debug] ShareDB connection error event:', err);
        setIsConnected(false);
    });
    connection.on('connection error', (err) => {
        console.error('[Debug] ShareDB connection error (explicit event):', err);
        setIsConnected(false);
    });
    connection.on('state', (newState, reason) => {
        console.log(`[Debug] ShareDB state changed to: ${newState}, Reason: ${reason}`);
        if (newState === 'disconnected' || newState === 'closed' || newState === 'stopped') {
            setIsConnected(false);
        }
    });

    // Cleanup on unmount
    return () => {
      console.log('Cleaning up ShareDB connection');
      connection.close();
      docRef.current = null;
      connectionRef.current = null;
      setIsConnected(false);
    };
  }, []);

  // Mount state logic
  useEffect(() => {
    setHasMounted(true);
  }, []);

  // Text area change handler - submits OT ops to ShareDB
  const handleTextChange = useCallback((event: React.ChangeEvent<HTMLTextAreaElement>) => {
    if (applyingServerOp.current) return; // Don't process change if it came from the server

    const newText = event.target.value;
    const doc = docRef.current;
    const previousText = text; // Use the state value *before* this change as previousText

    if (!doc || !doc.type) { // Removed doc.data check here, as we use previousText state
        console.warn('[Debug] Doc or doc.type not available in handleTextChange');
        return;
    }

    // Explicitly check if strings are identical before diffing
    if (previousText === newText) {
        console.log('[Debug] Texts are identical according to ===, skipping diff.');
        setText(newText); // Still update local state if needed (e.g., cursor move)
        return; // No diff to calculate or submit
    }

    // Calculate the diff using Quill Delta
    const previousDelta = new Delta().insert(previousText);
    const newDelta = new Delta().insert(newText);
    const diffDelta = previousDelta.diff(newDelta);

    console.log(`[Debug] Diffing Deltas: Previous=${JSON.stringify(previousDelta)}, New=${JSON.stringify(newDelta)}`);
    console.log('[Debug] Calculated Delta diff:', diffDelta);

    // Submit the operation if there's a change
    if (diffDelta && diffDelta.ops && diffDelta.ops.length > 0) {
      console.log('[Debug] Delta diff has ops, attempting to submit...', diffDelta.ops);
      try {
        doc.submitOp(diffDelta.ops); // Submit the calculated Delta ops
        console.log('[Debug] doc.submitOp called successfully with Delta ops.');
      } catch (submitError) {
        console.error('[Debug] Error calling doc.submitOp:', submitError);
      }
    } else {
        console.log('[Debug] No ops in diff, not submitting.');
    }
    // Update local state immediately (though ShareDB will eventually send the op back)
    // This makes the UI feel more responsive.
    setText(newText);

  }, [text]); // Add text to dependency array

  if (!hasMounted) {
    return (
      <main className="flex h-screen justify-center items-center bg-gray-100">
        <div>Loading Editor...</div>
      </main>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-white">
      {/* Navigation Bar */}
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
        {/* Left Panel: Text Input Area */}
        <div className="w-1/2 border-r border-gray-200 flex flex-col">
          <div className="py-2 px-4 border-b border-gray-200 bg-gray-50 flex items-center justify-center">
            <span className="text-gray-700 font-medium">MARKDOWN</span>
          </div>
          <div className="flex-1 flex flex-col bg-gray-50">
            {/* Removed the header within the panel */}
            <textarea
              ref={editorRef}
              className="flex-1 w-full p-4 border-none resize-none font-mono text-sm outline-none bg-gray-50"
              value={text}
              onChange={handleTextChange}
              placeholder="# Start typing in Markdown..."
              disabled={!isConnected}
              spellCheck="false"
            />
          </div>
        </div>

        {/* Right Panel: Preview Area */}
        <div className="w-1/2 flex flex-col">
          <div className="py-2 px-4 border-b border-gray-200 bg-gray-50 flex items-center justify-center">
            <span className="text-gray-700 font-medium">PREVIEW</span>
          </div>
          <div className="flex-1 flex flex-col bg-gray-50">
            {/* Removed the header within the panel */}
            <div className="flex-1 p-4 overflow-y-auto bg-gray-50">
              {/* Simple preview using pre for now */}
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