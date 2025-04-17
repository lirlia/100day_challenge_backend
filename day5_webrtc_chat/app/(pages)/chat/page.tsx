'use client';

import { useEffect, useRef, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';

const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    // 必要に応じて TURN サーバーを追加
  ],
};

type SignalingMessage = {
  type: 'offer' | 'answer' | 'candidate' | 'connected' | 'error';
  sdp?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
  senderId?: string;
  message?: string;
};

export default function ChatPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const userId = searchParams.get('userId');
  const peerId = searchParams.get('peerId');

  const peerConnection = useRef<RTCPeerConnection | null>(null);
  const localStream = useRef<MediaStream | null>(null);
  const remoteStream = useRef<MediaStream | null>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const signaling = useRef<EventSource | null>(null);
  const iceCandidateQueue = useRef<RTCIceCandidateInit[]>([]);

  const [status, setStatus] = useState('Initializing...');
  const [isConnected, setIsConnected] = useState(false);

  const processIceCandidateQueue = async () => {
    if (!peerConnection.current) return;
    while(iceCandidateQueue.current.length > 0) {
      const candidate = iceCandidateQueue.current.shift();
      if (candidate) {
        try {
          await peerConnection.current.addIceCandidate(new RTCIceCandidate(candidate));
          console.log('Processed queued ICE candidate');
        } catch (e) {
          console.error('Error adding queued ICE candidate', e);
        }
      }
    }
  }

  useEffect(() => {
    if (!userId || !peerId) {
      alert('User ID and Peer ID are required.');
      router.push('/');
      return;
    }

    const initializeMediaAndConnection = async () => {
      try {
        setStatus('Getting media devices...');
        // 1. メディア取得
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true,
        });
        localStream.current = stream;
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }
        setStatus('Media acquired. Initializing connection...');

        // 2. RTCPeerConnection 初期化
        peerConnection.current = new RTCPeerConnection(ICE_SERVERS);
        iceCandidateQueue.current = [];

        // 3. トラック追加
        stream.getTracks().forEach((track) => {
          peerConnection.current?.addTrack(track, stream);
        });

        // 4. イベントリスナー設定
        peerConnection.current.onicecandidate = (event) => {
          if (event.candidate) {
            sendSignalingMessage({ type: 'candidate', candidate: event.candidate.toJSON() });
          }
        };

        peerConnection.current.ontrack = (event) => {
          setStatus('Remote track received.');
          console.log('Remote track received:', event.streams[0]);
          if (event.streams && event.streams[0]) {
            if (remoteVideoRef.current) {
              remoteStream.current = event.streams[0];
              remoteVideoRef.current.srcObject = event.streams[0];
            }
          } else {
            // Safari などでは `event.streams` が空の場合がある
            let inboundStream = new MediaStream(event.track ? [event.track] : []);
            if (remoteVideoRef.current) {
                remoteStream.current = inboundStream;
                remoteVideoRef.current.srcObject = inboundStream;
            }
          }
        };

        peerConnection.current.onconnectionstatechange = () => {
          const state = peerConnection.current?.connectionState;
          console.log('Connection state change:', state);
          setStatus(`Connection: ${state}`);
          if (state === 'connected') {
              setIsConnected(true);
          } else {
              setIsConnected(false);
          }
          if (state === 'failed' || state === 'disconnected' || state === 'closed') {
              // 必要に応じて再接続処理などを追加
              console.error('Connection failed or closed.');
          }
        };

        // 5. シグナリング接続開始
        setupSignaling();

        // --- 6. Role Determination & Offer/Wait Logic --- (修正箇所)
        if (!userId || !peerId) {
            console.error('User ID or Peer ID is missing!');
            return; // 念のため
        }
        const isPolite = userId < peerId; // アルファベット順で役割決定

        if (!isPolite) {
          // IMPOLITE PEER (例: user2 vs user1) - Offer を送信
          console.log(`Acting as IMPOLITE peer (${userId}). Sending offer...`);
          setStatus('Creating offer...');
          const offer = await peerConnection.current.createOffer();
          await peerConnection.current.setLocalDescription(offer); // State -> have-local-offer
          setStatus('Sending offer...');
          sendSignalingMessage({ type: 'offer', sdp: offer });
        } else {
          // POLITE PEER (例: user1 vs user2) - Offer を待機
          console.log(`Acting as POLITE peer (${userId}). Waiting for offer...`);
          setStatus('Waiting for peer to send offer...');
        }
        // --- End Offer/Wait Logic ---

      } catch (error) {
        console.error('Error initializing WebRTC:', error);
        setStatus(`Error: ${error instanceof Error ? error.message : String(error)}`);
        alert('Failed to initialize WebRTC connection.');
      }
    };

    const setupSignaling = () => {
        if (signaling.current) {
            signaling.current.close();
        }
        setStatus('Connecting to signaling server...');
        signaling.current = new EventSource(`/api/signaling?userId=${userId}`);

        signaling.current.onopen = () => {
          console.log('Signaling connected.');
          setStatus('Signaling connected. Waiting for peer...');
        };

        signaling.current.onerror = (event) => {
          console.error('Signaling EventSource error occurred. Event:', event);
          setStatus('Signaling connection error.');
          // エラー時にも閉じる
          signaling.current?.close();
        };

        signaling.current.onmessage = async (event) => {
          try {
            const message: SignalingMessage = JSON.parse(event.data);
            console.log('Received signaling message:', message);

            if (!peerConnection.current) {
              console.warn('PeerConnection not initialized yet.');
              return;
            }

            switch (message.type) {
              case 'offer':
                if (message.sdp) {
                  setStatus('Received offer. Setting remote description...');
                  await peerConnection.current.setRemoteDescription(new RTCSessionDescription(message.sdp));
                  setStatus('Remote description set. Creating answer...');
                  await processIceCandidateQueue();

                  const answer = await peerConnection.current.createAnswer();
                  await peerConnection.current.setLocalDescription(answer);
                  setStatus('Sending answer...');
                  sendSignalingMessage({ type: 'answer', sdp: answer });
                }
                break;
              case 'answer':
                if (message.sdp) {
                  setStatus('Received answer. Setting remote description...');
                  await peerConnection.current.setRemoteDescription(new RTCSessionDescription(message.sdp));
                  setStatus('Remote description set.');
                  await processIceCandidateQueue();
                }
                break;
              case 'candidate':
                if (message.candidate) {
                  const candidate = new RTCIceCandidate(message.candidate);
                  if (peerConnection.current.remoteDescription) {
                    try {
                      await peerConnection.current.addIceCandidate(candidate);
                    } catch (e) {
                      console.error('Error adding received ICE candidate', e);
                    }
                  } else {
                    iceCandidateQueue.current.push(candidate);
                    console.log('Queued ICE candidate');
                  }
                }
                break;
              case 'connected':
                 // サーバー接続確認メッセージ（何もしない）
                 break;
              default:
                console.warn('Unknown message type:', message.type);
            }
          } catch (error) {
            console.error('Error processing signaling message:', error);
          }
        };
    };

    initializeMediaAndConnection();

    // クリーンアップ関数
    return () => {
      console.log('Cleaning up WebRTC resources...');
      // ストリーム停止
      localStream.current?.getTracks().forEach(track => track.stop());
      remoteStream.current?.getTracks().forEach(track => track.stop());

      // PeerConnection 閉じる
      peerConnection.current?.close();
      peerConnection.current = null;

      // シグナリング接続閉じる
      signaling.current?.close();
      signaling.current = null;

      // Ref クリア
      localStream.current = null;
      remoteStream.current = null;
      iceCandidateQueue.current = [];

      setStatus('Disconnected');
      setIsConnected(false);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, peerId, router]); // router も依存配列に追加

  const sendSignalingMessage = async (message: Omit<SignalingMessage, 'senderId'>) => {
    if (!peerId) return;
    const messageWithSender = { ...message, senderId: userId };
    try {
      const response = await fetch(`/api/signaling?targetUserId=${peerId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(messageWithSender),
      });
      if (!response.ok) {
          const errorText = await response.text();
          console.error('Failed to send signaling message:', response.status, errorText);
          setStatus(`Error sending message: ${errorText || response.statusText}`);
      }
    } catch (error) {
      console.error('Error sending signaling message:', error);
      setStatus(`Error sending message: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const handleHangup = () => {
    console.log('Hanging up...');
    router.push('/'); // トップページに戻る (これにより useEffect のクリーンアップが実行される)
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white flex flex-col items-center justify-center p-4">
      <h1 className="text-3xl font-bold mb-4">WebRTC Chat</h1>
      <p className="mb-4">Your ID: {userId} | Peer ID: {peerId}</p>
      <p className="mb-4 text-yellow-400">Status: {status}</p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full max-w-4xl mb-6">
        <div className="bg-gray-800 p-4 rounded-lg shadow-lg">
          <h2 className="text-xl font-semibold mb-2 text-center">You</h2>
          <video ref={localVideoRef} autoPlay playsInline muted className="w-full h-auto rounded bg-black"></video>
        </div>
        <div className="bg-gray-800 p-4 rounded-lg shadow-lg">
          <h2 className="text-xl font-semibold mb-2 text-center">Peer</h2>
          <video ref={remoteVideoRef} autoPlay playsInline className="w-full h-auto rounded bg-black"></video>
        </div>
      </div>

      <button
        onClick={handleHangup}
        className="mt-4 bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-6 rounded-lg shadow-md transition duration-150 ease-in-out"
      >
        Hang Up
      </button>
    </div>
  );
}
