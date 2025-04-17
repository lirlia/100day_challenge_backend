'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
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
  const originalLocalStream = useRef<MediaStream | null>(null);
  const modifiedLocalStream = useRef<MediaStream | null>(null);
  const remoteStream = useRef<MediaStream | null>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const hiddenVideoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const signaling = useRef<EventSource | null>(null);
  const iceCandidateQueue = useRef<RTCIceCandidateInit[]>([]);
  const animationFrameId = useRef<number | null>(null);

  const [status, setStatus] = useState('Initializing...');
  const [isConnected, setIsConnected] = useState(false);
  const [isMosaicEnabled, setIsMosaicEnabled] = useState(false);
  const [mosaicIntensity, setMosaicIntensity] = useState(10);

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

  const drawMosaicFrame = useCallback(() => {
    if (!hiddenVideoRef.current || !canvasRef.current || !originalLocalStream.current) {
      animationFrameId.current = requestAnimationFrame(drawMosaicFrame);
      return;
    }

    const video = hiddenVideoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      animationFrameId.current = requestAnimationFrame(drawMosaicFrame);
      return;
    }

    if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
    }

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    if (isMosaicEnabled && mosaicIntensity > 1 && canvas.width > 0 && canvas.height > 0) {
      const blockSize = Math.max(2, Math.floor(mosaicIntensity));
      const w = canvas.width;
      const h = canvas.height;

      ctx.imageSmoothingEnabled = false;

      for (let y = 0; y < h; y += blockSize) {
        for (let x = 0; x < w; x += blockSize) {
          const pixelData = ctx.getImageData(x, y, 1, 1).data;
          ctx.fillStyle = `rgb(${pixelData[0]}, ${pixelData[1]}, ${pixelData[2]})`;
          ctx.fillRect(x, y, blockSize, blockSize);
        }
      }
    }

    animationFrameId.current = requestAnimationFrame(drawMosaicFrame);
  }, [isMosaicEnabled, mosaicIntensity]);

  useEffect(() => {
    if (!userId || !peerId) {
      alert('User ID and Peer ID are required.');
      router.push('/');
      return;
    }

    const initializeMediaAndConnection = async () => {
      try {
        setStatus('Getting media devices...');
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true,
        });
        originalLocalStream.current = stream;

        if (hiddenVideoRef.current) {
          hiddenVideoRef.current.srcObject = stream;
          hiddenVideoRef.current.play().catch(e => console.error("Error playing hidden video:", e));
          await new Promise<void>((resolve) => {
            if (hiddenVideoRef.current) {
              hiddenVideoRef.current.onloadedmetadata = () => resolve();
            } else { resolve(); }
          });
        } else {
          throw new Error("Hidden video element not found");
        }

        setStatus('Media acquired. Initializing connection & Canvas...');

        if (canvasRef.current) {
          modifiedLocalStream.current = canvasRef.current.captureStream();
          const audioTracks = originalLocalStream.current.getAudioTracks();
          audioTracks.forEach(track => modifiedLocalStream.current?.addTrack(track));
        } else {
          throw new Error("Canvas element not found");
        }

        if (localVideoRef.current && modifiedLocalStream.current) {
          localVideoRef.current.srcObject = modifiedLocalStream.current;
        } else {
          console.warn("Local video ref or modified stream not ready for display");
        }

        peerConnection.current = new RTCPeerConnection(ICE_SERVERS);
        iceCandidateQueue.current = [];

        modifiedLocalStream.current?.getTracks().forEach((track) => {
          peerConnection.current?.addTrack(track, modifiedLocalStream.current!);
          console.log('Added track:', track.kind);
        });

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
            console.error('Connection failed or closed.');
          }
        };

        animationFrameId.current = requestAnimationFrame(drawMosaicFrame);

        setupSignaling();

        if (!userId || !peerId) {
          console.error('User ID or Peer ID is missing!');
          return;
        }
        const isPolite = userId < peerId;
        if (!isPolite) {
          console.log(`Acting as IMPOLITE peer (${userId}). Sending offer...`);
          setStatus('Creating offer...');
          const offer = await peerConnection.current.createOffer();
          await peerConnection.current.setLocalDescription(offer);
          setStatus('Sending offer...');
          sendSignalingMessage({ type: 'offer', sdp: offer });
        } else {
          console.log(`Acting as POLITE peer (${userId}). Waiting for offer...`);
          setStatus('Waiting for peer to send offer...');
        }

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

    return () => {
      console.log('Cleaning up WebRTC resources...');
      if (animationFrameId.current) {
        cancelAnimationFrame(animationFrameId.current);
        animationFrameId.current = null;
      }

      originalLocalStream.current?.getTracks().forEach(track => track.stop());
      modifiedLocalStream.current?.getTracks().forEach(track => track.stop());
      remoteStream.current?.getTracks().forEach(track => track.stop());

      peerConnection.current?.close();
      peerConnection.current = null;

      signaling.current?.close();
      signaling.current = null;

      originalLocalStream.current = null;
      modifiedLocalStream.current = null;
      remoteStream.current = null;
      iceCandidateQueue.current = [];

      setStatus('Disconnected');
      setIsConnected(false);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, peerId, router, drawMosaicFrame]);

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
    router.push('/');
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white flex flex-col items-center justify-center p-4">
      <h1 className="text-3xl font-bold mb-4">WebRTC Chat</h1>
      <p className="mb-4">Your ID: {userId} | Peer ID: {peerId}</p>
      <p className="mb-4 text-yellow-400">Status: {status}</p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full max-w-4xl mb-6">
        <div className="bg-gray-800 p-4 rounded-lg shadow-lg relative">
          <h2 className="text-xl font-semibold mb-2 text-center">You</h2>
          <video ref={localVideoRef} autoPlay playsInline muted className="w-full h-auto rounded bg-black"></video>
          <video ref={hiddenVideoRef} autoPlay playsInline muted className="absolute top-0 left-0 w-1 h-1 opacity-0 pointer-events-none"></video>
          <canvas ref={canvasRef} className="absolute top-0 left-0 w-1 h-1 opacity-0 pointer-events-none"></canvas>
          <div className="absolute bottom-2 left-2 right-2 bg-black bg-opacity-50 p-2 rounded">
            <div className="flex items-center justify-between text-sm">
              <label htmlFor="mosaicToggle" className="flex items-center cursor-pointer">
                <input
                  id="mosaicToggle"
                  type="checkbox"
                  checked={isMosaicEnabled}
                  onChange={(e) => setIsMosaicEnabled(e.target.checked)}
                  className="mr-2 h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
                Mosaic
              </label>
              {isMosaicEnabled && (
                <div className="flex items-center">
                  <label htmlFor="mosaicIntensity" className="mr-2">Intensity:</label>
                  <input
                    id="mosaicIntensity"
                    type="range"
                    min="2"
                    max="32"
                    step="1"
                    value={mosaicIntensity}
                    onChange={(e) => setMosaicIntensity(Number(e.target.value))}
                    className="w-24 h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                  />
                  <span className="ml-2 w-4 text-right">{mosaicIntensity}</span>
                </div>
              )}
            </div>
          </div>
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
