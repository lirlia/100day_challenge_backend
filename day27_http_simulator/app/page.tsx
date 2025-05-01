'use client';

import { useState, useReducer, useCallback } from 'react';

type Protocol = 'HTTP/1.1' | 'HTTP/2' | 'HTTP/3';

// --- Types (修正) ---
type ResourceStatus = 'idle' | 'requesting' | 'downloading' | 'completed' | 'error';

interface ResourceType {
  id: number;
  status: ResourceStatus;
  error?: string;
  startTime?: number;
  endTime?: number;
}

interface ConnectionType {
  id: number;
  activeRequestId: number | null;
}

interface RequestStateType {
    resourceId: number;
    status: ResourceStatus;
    progress?: number;
    startTime?: number;
    endTime?: number;
}

interface SimulationState {
    protocol: Protocol;
    resources: ResourceType[];
    connections: ConnectionType[];
    requests: RequestStateType[];
    isRunning: boolean;
    startTime: number | null;
    endTime: number | null;
    error?: string;
}

type SimulationAction =
  | { type: 'START_SIMULATION'; protocol: Protocol; numResources: number }
  | { type: 'SET_RUNNING'; isRunning: boolean }
  | { type: 'INIT_RESOURCES'; resources: ResourceType[] }
  | { type: 'UPDATE_RESOURCE_STATUS'; id: number; status: ResourceStatus; time?: number; error?: string }
  | { type: 'UPDATE_CONNECTION_STATUS'; connectionId: number; activeRequestId: number | null }
  | { type: 'ADD_REQUEST'; request: RequestStateType }
  | { type: 'UPDATE_REQUEST_STATUS'; resourceId: number; status: ResourceStatus; time?: number }
  | { type: 'SIMULATION_COMPLETE'; time: number }
  | { type: 'SIMULATION_ERROR'; error: string };

function simulationReducer(state: SimulationState, action: SimulationAction): SimulationState {
  console.log('Reducer Action:', action); // Log all actions
  switch (action.type) {
    case 'START_SIMULATION':
      const initialResources = Array.from({ length: action.numResources }, (_, i) => ({
        id: i + 1,
        status: 'idle' as ResourceStatus,
      }));
      console.log('Reducer: START_SIMULATION - Initial resources:', initialResources);
      return {
        protocol: action.protocol,
        resources: initialResources,
        connections: [],
        requests: [],
        isRunning: true,
        startTime: Date.now(),
        endTime: null,
        error: undefined,
      };
    case 'SET_RUNNING':
      return { ...state, isRunning: action.isRunning };
    case 'INIT_RESOURCES':
      return { ...state, resources: action.resources };
    case 'UPDATE_RESOURCE_STATUS':
      return {
        ...state,
        resources: state.resources.map(r =>
          r.id === action.id ? {
            ...r,
            status: action.status,
            error: action.error,
            startTime: r.startTime ?? (action.status === 'requesting' ? action.time : undefined),
            endTime: action.status === 'completed' || action.status === 'error' ? action.time : r.endTime,
          } : r
        ),
      };
    case 'UPDATE_CONNECTION_STATUS':
      return {
        ...state,
        connections: state.connections.map(c =>
          c.id === action.connectionId ? { ...c, activeRequestId: action.activeRequestId } : c
        ),
      };
    case 'ADD_REQUEST':
      if (state.requests.some(req => req.resourceId === action.request.resourceId)) {
        return state;
      }
      return { ...state, requests: [...state.requests, action.request] };
    case 'UPDATE_REQUEST_STATUS':
      return {
        ...state,
        requests: state.requests.map(req =>
          req.resourceId === action.resourceId ? {
            ...req,
            status: action.status,
            endTime: (action.status === 'completed' || action.status === 'error') ? action.time : req.endTime
          } : req
        ),
      };
    case 'SIMULATION_COMPLETE':
      return { ...state, isRunning: false, endTime: action.time };
    case 'SIMULATION_ERROR':
      return { ...state, isRunning: false, error: action.error, endTime: Date.now() };
    default:
      console.warn('Unhandled action type:', action);
      return state;
  }
}

// --- API Call Helper ---
const fetchResource = async (resourceId: number): Promise<{ id: number; data: string }> => {
  const response = await fetch(`/api/resource/${resourceId}`);
  if (!response.ok) {
    throw new Error(`Failed to fetch resource ${resourceId}: ${response.statusText}`);
  }
  const data = await response.json();
  console.log(`Fetched resource ${resourceId}`, data); // Log fetched data
  return data; // APIは { id: number, message: string, delay: number } を返す想定だが、ここでは { id: number, data: string } に合わせる
};


// --- Simulation Logic ---

// HTTP/1.1 シミュレーション
const simulateHttp1_1 = async (dispatch: React.Dispatch<SimulationAction>, numResources: number, maxConnections: number = 6) => {
  const resourceIds = Array.from({ length: numResources }, (_, i) => i + 1);
  let activeConnections = 0;
  const requestQueue = [...resourceIds];
  const processing = new Set<number>(); // 処理中のリソースID

  const processNext = async () => {
    while (activeConnections < maxConnections && requestQueue.length > 0) {
      activeConnections++;
      const resourceId = requestQueue.shift()!;
      processing.add(resourceId);

      const startTime = Date.now();
      dispatch({ type: 'UPDATE_RESOURCE_STATUS', id: resourceId, status: 'requesting', time: startTime });

      try {
        console.log(`HTTP/1.1: Requesting resource ${resourceId} (Connection ${activeConnections})`);
        await fetchResource(resourceId);
        const endTime = Date.now();
        dispatch({ type: 'UPDATE_RESOURCE_STATUS', id: resourceId, status: 'completed', time: endTime });
        console.log(`HTTP/1.1: Completed resource ${resourceId} in ${endTime - startTime}ms`);
      } catch (error: any) {
        const errorTime = Date.now();
        dispatch({ type: 'UPDATE_RESOURCE_STATUS', id: resourceId, status: 'error', time: errorTime, error: error.message });
        console.error(`HTTP/1.1: Error fetching resource ${resourceId}:`, error);
      } finally {
        activeConnections--;
        processing.delete(resourceId);
        // キューと処理中セットが空になったかチェック
        if (requestQueue.length === 0 && processing.size === 0) {
          dispatch({ type: 'SIMULATION_COMPLETE', time: Date.now() });
          console.log("HTTP/1.1 Simulation complete.");
        } else {
          // 次のリクエストを開始
          processNext();
        }
      }
    }
     // もしループが終わっても処理中のものがあれば完了を待つ必要はない（非同期なので）
     // ただし、すべてのリクエストが完了したかの判定は finally ブロック内で行う
  };

  // 最初の並列リクエストを開始
  for (let i = 0; i < maxConnections && i < resourceIds.length; i++) {
     processNext();
  }
};


// HTTP/2 シミュレーション (仮実装 - HTTP/1.1と同じだが多重化を表現する必要あり)
const simulateHttp2 = async (dispatch: React.Dispatch<SimulationAction>, numResources: number) => {
  const resourceIds = Array.from({ length: numResources }, (_, i) => i + 1);
  const promises: Promise<void>[] = [];

  dispatch({ type: 'SET_RUNNING', isRunning: true }); // Ensure isRunning is true at start

  resourceIds.forEach(resourceId => {
    const startTime = Date.now();
    dispatch({ type: 'UPDATE_RESOURCE_STATUS', id: resourceId, status: 'requesting', time: startTime });
    console.log(`HTTP/2: Requesting resource ${resourceId}`);

    const promise = fetchResource(resourceId)
      .then(() => {
        const endTime = Date.now();
        dispatch({ type: 'UPDATE_RESOURCE_STATUS', id: resourceId, status: 'completed', time: endTime });
        console.log(`HTTP/2: Completed resource ${resourceId} in ${endTime - startTime}ms`);
      })
      .catch(error => {
        const errorTime = Date.now();
        dispatch({ type: 'UPDATE_RESOURCE_STATUS', id: resourceId, status: 'error', time: errorTime, error: error.message });
        console.error(`HTTP/2: Error fetching resource ${resourceId}:`, error);
      });
    promises.push(promise);
  });

  try {
    await Promise.all(promises);
    dispatch({ type: 'SIMULATION_COMPLETE', time: Date.now() });
    console.log("HTTP/2 Simulation complete.");
  } catch (error) {
    // 個々のエラーはcatch済みなので、ここでは全体のエラー処理（必要なら）
    console.error("HTTP/2 Simulation encountered an error during Promise.all:", error);
     // Optionally dispatch a general simulation error if needed, though individual errors are handled
    dispatch({ type: 'SIMULATION_ERROR', error: 'One or more HTTP/2 requests failed' });
  }
};


// HTTP/3 シミュレーション (仮実装 - HTTP/2 と同様)
const simulateHttp3 = async (dispatch: React.Dispatch<SimulationAction>, numResources: number) => {
  console.warn("HTTP/3 simulation is not fully implemented, using HTTP/2 logic as placeholder.");
  await simulateHttp2(dispatch, numResources); // Placeholder
};


// --- Visualization Component ---
function SimulationVisualizer({ state }: { state: SimulationState }) {
  console.log('Rendering SimulationVisualizer with state:', state);
  const { protocol, resources, isRunning, startTime, endTime, error } = state;

  if (!startTime) {
    return <div className="p-4 text-center text-gray-500 italic">Click Start Simulation</div>;
  }

  const totalTime = endTime ? endTime - startTime : Date.now() - startTime;

  const getStatusColor = (status: ResourceStatus) => {
    switch (status) {
      case 'idle': return 'bg-gray-600';
      case 'requesting': return 'bg-yellow-600 animate-pulse';
      case 'downloading': return 'bg-blue-600'; // TODO: Add progress later
      case 'completed': return 'bg-green-600';
      case 'error': return 'bg-red-600';
      default: return 'bg-gray-700';
    }
  };

  return (
    <div className="p-4 h-full overflow-y-auto">
      <h3 className="text-lg font-semibold mb-2">{protocol} Simulation Status</h3>
      <div className="mb-2 text-sm">
        Status: {isRunning ? 'Running...' : error ? 'Error!' : 'Completed'} (Total Time: {(totalTime / 1000).toFixed(2)}s)
      </div>
      {error && <div className="text-red-400 mb-2">Error: {error}</div>}

      <div className="space-y-1">
        {resources.map(resource => (
          <div key={resource.id} className="flex items-center text-xs">
            <span className="w-16 shrink-0">Resource {resource.id}:</span>
            <div className={`h-4 flex-grow rounded ${getStatusColor(resource.status)} transition-colors duration-200`}>
               {/* TODO: Add progress bar visualization later */}
               <span className="ml-2 text-white text-opacity-80">{resource.status}</span>
            </div>
             {resource.startTime && resource.endTime && resource.status === 'completed' && (
                <span className="ml-2 text-gray-400">({(resource.endTime - resource.startTime)}ms)</span>
            )}
             {resource.error && (
                <span className="ml-2 text-red-400 truncate" title={resource.error}>Error!</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}


// --- Main Page Component ---
export default function Home() {
  const [selectedProtocol, setSelectedProtocol] = useState<Protocol>('HTTP/1.1');
  const numResources = 10; // Example: Number of resources to fetch

  const initialState: SimulationState = {
    protocol: selectedProtocol,
    resources: [],
    connections: [],
    requests: [],
    isRunning: false,
    startTime: null,
    endTime: null,
  };

  const [state, dispatch] = useReducer(simulationReducer, initialState);

  // useCallback を使って不要な再生成を防ぐ
  const runSimulation = useCallback(async (protocol: Protocol) => {
    // START_SIMULATION を dispatch して状態を初期化
    dispatch({ type: 'START_SIMULATION', protocol, numResources });
     console.log(`Running simulation for ${protocol}...`);

    try {
      switch (protocol) {
        case 'HTTP/1.1':
          await simulateHttp1_1(dispatch, numResources);
          break;
        case 'HTTP/2':
          await simulateHttp2(dispatch, numResources);
          break;
        case 'HTTP/3':
          await simulateHttp3(dispatch, numResources);
          break;
        default:
          console.warn(`Simulation logic for ${protocol} not implemented.`);
          dispatch({ type: 'SIMULATION_ERROR', error: `Simulation for ${protocol} not implemented.` });
      }
       // 完了ディスパッチは各シミュレーション関数内で行う
      // dispatch({ type: 'SIMULATION_COMPLETE', time: Date.now() });
    } catch (error: any) {
      console.error(`Simulation failed for ${protocol}:`, error);
      dispatch({ type: 'SIMULATION_ERROR', error: error.message || 'Unknown simulation error' });
    }
  }, [dispatch, numResources]); // numResources も依存配列に追加

  const startSimulation = () => {
    if (state.isRunning) return; // Reducer の state を使用
    // setIsSimulating(true); // 不要
    // setSimulationData(null); // 不要
    console.log(`Button Clicked: Starting simulation for ${selectedProtocol}...`);
    runSimulation(selectedProtocol); // runSimulation を呼び出す
  };


  const getProtocolDescription = (protocol: Protocol): string => {
    switch (protocol) {
      case 'HTTP/1.1':
        return "複数のTCP接続を使い、各接続内でリクエストを順番に処理します。接続数には上限があり、前のリクエストが完了しないと次のリクエストがブロックされる (Head-of-line Blocking) ことがあります。";
      case 'HTTP/2':
        return "単一のTCP接続上で複数のリクエスト/レスポンスを並行処理 (多重化) します。これによりHTTPレベルのHOLブロッキングは解消されますが、TCPレベルのHOLブロッキングの影響は受けます。";
      case 'HTTP/3':
        return "QUIC (UDPベース) を使用し、接続確立が高速で、ストリーム間のHOLブロッキングが解消されます。パケットロスが発生しても影響はそのストリームに限定されます。";
      default:
        return '';
    }
  };

  const protocolColors: Record<Protocol, string> = {
    'HTTP/1.1': 'bg-blue-600 hover:bg-blue-700 focus:ring-blue-500',
    'HTTP/2': 'bg-green-600 hover:bg-green-700 focus:ring-green-500',
    'HTTP/3': 'bg-purple-600 hover:bg-purple-700 focus:ring-purple-500',
  };

   const protocolTextColors: Record<Protocol, string> = {
    'HTTP/1.1': 'text-blue-300',
    'HTTP/2': 'text-green-300',
    'HTTP/3': 'text-purple-300',
  };

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 flex flex-col items-center p-4 md:p-8">
      <h1 className="text-4xl font-bold mb-6">Day27 - HTTP Protocol Simulator</h1>

      {/* Protocol Selection */}
      <div className="mb-8 flex space-x-4">
        {( ['HTTP/1.1', 'HTTP/2', 'HTTP/3'] as Protocol[]).map((protocol) => (
          <button
            key={protocol}
            onClick={() => {
                if (!state.isRunning) setSelectedProtocol(protocol) // 実行中でなければ変更可能
            }}
            disabled={state.isRunning} // 実行中は変更不可
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900 disabled:opacity-50 ${
              selectedProtocol === protocol
                ? `${protocolColors[protocol]} text-white shadow-md`
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            } ${state.isRunning ? 'cursor-not-allowed' : ''}`}
          >
            {protocol}
          </button>
        ))}
      </div>

      {/* Simulation Area */}
      <div className="w-full max-w-6xl h-[40rem] bg-gray-800 rounded-lg border border-gray-700 mb-8 shadow-inner overflow-hidden">
         {/* SimulationVisualizer を state.startTime がある場合に表示 */}
         {state.startTime ? (
            <SimulationVisualizer state={state} />
         ) : (
           <div className="p-4 text-center text-gray-500 italic h-full flex items-center justify-center">
             Click Start Simulation
           </div>
         )}
      </div>

      {/* Controls and Description */}
      <div className="w-full max-w-4xl flex flex-col md:flex-row items-center justify-between">
        <button
          onClick={startSimulation}
          disabled={state.isRunning} // Reducer の state を使用
          className={`px-6 py-3 rounded-md font-semibold text-white transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900 disabled:opacity-50 disabled:cursor-not-allowed ${protocolColors[selectedProtocol]}`}
        >
          {state.isRunning ? ( // Reducer の state を使用
             <span className="flex items-center">
                <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Simulating...
              </span>
          ) : `Start ${selectedProtocol} Simulation`}
        </button>

        <div className={`mt-4 md:mt-0 md:ml-6 p-4 border-l-4 ${protocolTextColors[selectedProtocol].replace('text-', 'border-').replace('-300', '-500')} bg-gray-800 rounded-r-lg max-w-md`}>
          <p className="text-sm text-gray-300">
            <strong className={`${protocolTextColors[selectedProtocol]}`}>{selectedProtocol}:</strong> {getProtocolDescription(selectedProtocol)}
          </p>
        </div>
      </div>
    </div>
  );
}
