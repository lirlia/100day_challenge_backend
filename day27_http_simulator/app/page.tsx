'use client';

import { useState, useReducer, useCallback, useEffect } from 'react';

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
const fetchResource = async (resourceId: number): Promise<{ id: number; data: string; simulatedPacketLoss: boolean; delayApplied: number }> => {
  const response = await fetch(`/api/resource/${resourceId}`);
  if (!response.ok) {
    throw new Error(`Failed to fetch resource ${resourceId}: ${response.statusText}`);
  }
  const data = await response.json();
  console.log(`Fetched resource ${resourceId}`, data); // Log fetched data
  return {
      id: data.resourceId,
      data: data.content,
      simulatedPacketLoss: data.simulatedPacketLoss ?? false,
      delayApplied: data.delayApplied ?? 0
  };
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


// HTTP/2 シミュレーション (修正: TCP HOL Blocking シミュレーション追加)
const simulateHttp2 = async (dispatch: React.Dispatch<SimulationAction>, numResources: number) => {
  const resourceIds = Array.from({ length: numResources }, (_, i) => i + 1);
  const promises: Promise<any>[] = [];
  const startTimes: { [key: number]: number } = {};

  console.log("--- Starting HTTP/2 Simulation ---");

  // リクエストを並行して開始し、開始時間を記録
  resourceIds.forEach(resourceId => {
    const startTime = Date.now();
    startTimes[resourceId] = startTime;
    dispatch({ type: 'UPDATE_RESOURCE_STATUS', id: resourceId, status: 'requesting', time: startTime });
    console.log(`HTTP/2: Requesting resource ${resourceId}`);
    promises.push(fetchResource(resourceId).then(result => ({ ...result, type: 'success' as const })).catch(error => ({ id: resourceId, error, type: 'error' as const })));
  });

  // すべての結果を待つ (成功/失敗問わず)
  const results = await Promise.allSettled(promises);
  const completionTime = Date.now(); // 全リクエストが完了したおおよその時間
  console.log("HTTP/2: All promises settled.", results);

  let tcpHolBlockEndTime = 0; // パケットロスによるブロックが発生した場合の完了時間
  const finalResults: Array<{ id: number, status: ResourceStatus, startTime: number, actualEndTime: number, effectiveEndTime: number, error?: string, simulatedPacketLoss?: boolean }> = [];

  // 1回目のループ: パケットロスが発生したリクエストの最大完了時間を見つける
  results.forEach((settledResult, index) => {
    const resourceId = resourceIds[index]; // ID特定
    const startTime = startTimes[resourceId];

    if (settledResult.status === 'fulfilled' && settledResult.value.type === 'success') {
        const result = settledResult.value;
        const actualEndTime = startTime + (result.delayApplied ?? 0); // APIが返した遅延から計算 (より正確な値)
        // 本来は Date.now() を使うべきだが、API遅延を使う方がシミュレーションとして意図を反映しやすい
        // const actualEndTime = Date.now(); // もし実際のfetch完了時間を使う場合

        if (result.simulatedPacketLoss) {
            tcpHolBlockEndTime = Math.max(tcpHolBlockEndTime, actualEndTime);
            console.log(`HTTP/2: Packet loss detected for resource ${resourceId}, potential block until ${tcpHolBlockEndTime}`);
        }
         finalResults.push({ id: resourceId, status: 'completed', startTime, actualEndTime, effectiveEndTime: 0, simulatedPacketLoss: result.simulatedPacketLoss });
    } else {
        // fulfilledだがtype:errorの場合 or rejectedの場合
        const errorTime = Date.now(); // エラー発生時間
        const errorMsg = settledResult.status === 'rejected' ? settledResult.reason?.message : settledResult.value?.error?.message;
        console.error(`HTTP/2: Error for resource ${resourceId}:`, errorMsg);
         finalResults.push({ id: resourceId, status: 'error', startTime, actualEndTime: errorTime, effectiveEndTime: errorTime, error: errorMsg });
    }
  });

  console.log(`HTTP/2: TCP HOL Block end time determined: ${tcpHolBlockEndTime}`);

  let overallLatestEndTime = 0;

  // 2回目のループ: 各リソースの最終的な完了時間を決定し、dispatch する
  finalResults.forEach(res => {
      if (res.status === 'completed') {
          res.effectiveEndTime = Math.max(res.actualEndTime, tcpHolBlockEndTime);
          dispatch({ type: 'UPDATE_RESOURCE_STATUS', id: res.id, status: 'completed', time: res.effectiveEndTime });
          console.log(`HTTP/2: Completed resource ${res.id} (Actual: ${res.actualEndTime}, Effective: ${res.effectiveEndTime})`);
      } else if (res.status === 'error') {
          // エラーの場合は tcpHolBlockEndTime の影響を受けない
          dispatch({ type: 'UPDATE_RESOURCE_STATUS', id: res.id, status: 'error', time: res.effectiveEndTime, error: res.error });
      }
      overallLatestEndTime = Math.max(overallLatestEndTime, res.effectiveEndTime);
  });


  // シミュレーション完了を通知
  dispatch({ type: 'SIMULATION_COMPLETE', time: overallLatestEndTime });
  console.log(`--- HTTP/2 Simulation Complete (Overall End Time: ${overallLatestEndTime}) ---`);

};


// HTTP/3 シミュレーション (修正: 独立したストリーム処理、HOL Blockingなし)
const simulateHttp3 = async (dispatch: React.Dispatch<SimulationAction>, numResources: number) => {
  const resourceIds = Array.from({ length: numResources }, (_, i) => i + 1);
  const promises: Promise<void>[] = [];

  console.log("--- Starting HTTP/3 Simulation ---");

  resourceIds.forEach(resourceId => {
    const startTime = Date.now();
    dispatch({ type: 'UPDATE_RESOURCE_STATUS', id: resourceId, status: 'requesting', time: startTime });
    console.log(`HTTP/3: Requesting resource ${resourceId}`);

    const promise = fetchResource(resourceId)
      .then((result) => {
         //const endTime = Date.now(); // 実際の完了時間を使う
         const endTime = startTime + (result.delayApplied ?? 0); // APIの遅延を使う場合
        dispatch({ type: 'UPDATE_RESOURCE_STATUS', id: resourceId, status: 'completed', time: endTime });
        console.log(`HTTP/3: Completed resource ${resourceId} in ${endTime - startTime}ms (Loss: ${result.simulatedPacketLoss})`);
      })
      .catch(error => {
        const errorTime = Date.now();
        dispatch({ type: 'UPDATE_RESOURCE_STATUS', id: resourceId, status: 'error', time: errorTime, error: error.message });
        console.error(`HTTP/3: Error fetching resource ${resourceId}:`, error);
      });
    promises.push(promise);
  });

  // すべての処理が終わるのを待つ（完了ディスパッチは個々に行われる）
  await Promise.allSettled(promises);

  // 完了を通知 (すべてのPromiseがsettledした後)
  const completionTime = Date.now();
  dispatch({ type: 'SIMULATION_COMPLETE', time: completionTime });
   console.log(`--- HTTP/3 Simulation Complete (All Settled Time: ${completionTime}) ---`);
};


// --- Visualization Component ---
function SimulationVisualizer({ state }: { state: SimulationState }) {
  console.log('Rendering SimulationVisualizer with state:', state);
  const { protocol, resources, isRunning, startTime, endTime, error } = state;
  const [currentTime, setCurrentTime] = useState<number>(Date.now()); // For animation

  useEffect(() => {
    let animationFrameId: number;
    if (isRunning) {
      const update = () => {
        setCurrentTime(Date.now());
        animationFrameId = requestAnimationFrame(update);
      };
      animationFrameId = requestAnimationFrame(update);
    } else if (startTime && !endTime) {
       // If stopped due to error, ensure current time reflects end
       setCurrentTime(Date.now());
    }
    return () => cancelAnimationFrame(animationFrameId);
  }, [isRunning, startTime, endTime]);


  if (!startTime) {
    return <div className="p-4 text-center text-gray-500 italic h-full flex items-center justify-center">Click Start Simulation</div>;
  }

  const totalDuration = endTime ? endTime - startTime : currentTime - startTime;
  const safeTotalDuration = Math.max(1, totalDuration);


  const getStatusColor = (status: ResourceStatus) => {
    switch (status) {
      case 'idle': return 'bg-gray-600';
      case 'requesting': return 'bg-yellow-500'; // Adjusted color slightly
      // case 'downloading': return 'bg-blue-600'; // Not used yet
      case 'completed': return 'bg-green-500'; // Adjusted color slightly
      case 'error': return 'bg-red-500'; // Adjusted color slightly
      default: return 'bg-gray-700';
    }
  };

  // Max duration to scale the timeline width
  // ★ 固定値に変更 (例: 10秒 = 10000ms)
  const timelineScaleMax = 10000; // Fixed scale in milliseconds


  return (
    <div className="p-4 h-full flex flex-col">
      <h3 className="text-lg font-semibold mb-2 flex-shrink-0">{protocol} Simulation Status</h3>
      <div className="mb-4 text-sm flex-shrink-0">
        Status: {isRunning ? 'Running...' : error ? 'Error!' : 'Completed'} (Total Time: {(safeTotalDuration / 1000).toFixed(2)}s)
      </div>
      {error && <div className="text-red-400 mb-2 flex-shrink-0">Error: {error}</div>}

      {/* Timeline Visualization Area */}
      <div className="flex-grow overflow-y-auto pr-2 space-y-2">
        {resources.map(resource => {
          const resourceStartTime = resource.startTime ? resource.startTime - startTime : 0;
          // If running, end time is now; if completed/error, use resource.endTime; otherwise 0
          const resourceEndTime = resource.endTime
             ? resource.endTime - startTime
             : resource.startTime && isRunning
               ? currentTime - startTime
               : resourceStartTime; // If not started or not running, end is same as start (0 length)

          const duration = Math.max(0, resourceEndTime - resourceStartTime);
          // Calculate position and width as percentage of the timeline scale
          const leftPercent = (resourceStartTime / timelineScaleMax) * 100;
          const widthPercent = (duration / timelineScaleMax) * 100;

           // Ensure minimum width for visibility if duration is very small but non-zero
           const minWidthPx = 2;
           const displayWidthPercent = duration > 0 && widthPercent * (document.getElementById(`timeline-${resource.id}`)?.clientWidth ?? 1000) / 100 < minWidthPx
             ? (minWidthPx / (document.getElementById(`timeline-${resource.id}`)?.clientWidth ?? 1000)) * 100
             : widthPercent;


          return (
            <div key={resource.id} id={`timeline-${resource.id}`} className="flex items-center text-xs group">
              <span className="w-20 shrink-0 pr-2 text-right font-mono">Resource {resource.id}:</span>
              {/* Timeline Track */}
              <div className="flex-grow h-5 bg-gray-700 rounded relative overflow-hidden">
                {resource.startTime && ( // Only render bar if started
                  <div
                    className={`absolute top-0 h-full rounded transition-colors duration-150 ${getStatusColor(resource.status)} ${resource.status === 'requesting' ? 'animate-pulse' : ''}`}
                    style={{
                      left: `${Math.max(0, leftPercent)}%`,
                      width: `${Math.min(100 - Math.max(0, leftPercent), displayWidthPercent)}%`, // Ensure bar doesn't exceed 100%
                      minWidth: duration > 0 ? `${minWidthPx}px` : '0px' // Apply min width directly if needed
                    }}
                    title={`Status: ${resource.status}, Start: ${(resourceStartTime / 1000).toFixed(2)}s, Duration: ${(duration / 1000).toFixed(2)}s`}
                  >
                    {/* Optional: Text inside bar */}
                    {/* <span className="absolute left-1 top-0 text-white text-opacity-80 text-[10px] whitespace-nowrap">
                      {resource.status} ({(duration / 1000).toFixed(1)}s)
                    </span> */}
                  </div>
                )}
                 {/* Display time only when completed or error */}
                 {resource.endTime && (resource.status === 'completed' || resource.status === 'error') && (
                   <span className="absolute right-1 top-0 text-gray-300 text-[10px] opacity-0 group-hover:opacity-100 transition-opacity">
                     ({(duration / 1000).toFixed(2)}s)
                   </span>
                 )}
              </div>
            </div>
          );
        })}
      </div>
      {/* Optional: Add a time scale legend */}
      <div className="flex-shrink-0 pt-2 mt-2 border-t border-gray-700 text-xs text-gray-400">
        Timeline Scale: 0s to {(timelineScaleMax / 1000).toFixed(1)}s
      </div>
    </div>
  );
}


// --- Main Page Component ---
export default function Home() {
  const [selectedProtocol, setSelectedProtocol] = useState<Protocol>('HTTP/1.1');
  const [maxConnections, setMaxConnections] = useState<number>(6); // ★ 追加: HTTP/1.1 の最大接続数
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
          // ★ maxConnections を引数として渡す
          await simulateHttp1_1(dispatch, numResources, maxConnections);
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
    // ★ useCallback の依存配列に maxConnections を追加
  }, [dispatch, numResources, maxConnections]);

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

      {/* Protocol Selection & Config */}
      <div className="mb-8 flex flex-col items-center space-y-4 md:flex-row md:space-y-0 md:space-x-4">
        <div className="flex space-x-4">
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

        {/* ★ HTTP/1.1 Config: Max Connections Input */}
        {selectedProtocol === 'HTTP/1.1' && (
          <div className="flex items-center space-x-2">
            <label htmlFor="maxConnections" className="text-sm font-medium text-gray-300">
              Max Connections (HTTP/1.1):
            </label>
            <input
              type="number"
              id="maxConnections"
              name="maxConnections"
              min="1"
              max="20" // Sensible upper limit for demo
              value={maxConnections}
              onChange={(e) => setMaxConnections(parseInt(e.target.value, 10) || 1)} // Ensure positive integer
              disabled={state.isRunning}
              className="w-16 px-2 py-1 bg-gray-700 border border-gray-600 rounded-md text-sm text-center focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
            />
          </div>
        )}
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
