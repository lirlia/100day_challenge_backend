'use client';

import { useState, useReducer, useCallback, useEffect, useRef } from 'react';

type Protocol = 'HTTP/1.1' | 'HTTP/2' | 'HTTP/3';
const protocols: Protocol[] = ['HTTP/1.1', 'HTTP/2', 'HTTP/3'];

// --- Types ---
type ResourceStatus = 'idle' | 'requesting' | 'downloading' | 'completed';

interface ResourceType {
  id: number;
  status: ResourceStatus;
  error?: string;
  startTime?: number;
  endTime?: number;
  // ★ APIからの情報を追加 (HTTP/2, HTTP/3で利用)
  simulatedPacketLoss?: boolean;
  delayApplied?: number;
}

// interface ConnectionType { // Not used currently
//   id: number;
//   activeRequestId: number | null;
// }

// interface RequestStateType { // Not used currently
//     resourceId: number;
//     status: ResourceStatus;
//     progress?: number;
//     startTime?: number;
//     endTime?: number;
// }

interface SimulationState {
    protocol: Protocol; // どのプロトコルの状態か
    resources: ResourceType[];
    isRunning: boolean;
    startTime: number | null;
    endTime: number | null;
    error?: string;
    // ★ HTTP/1.1用: 接続数を保持 (UIから渡される)
    maxConnections?: number;
}

// ★ 各プロトコルの状態を保持する型
type AllSimulationStates = {
    [key in Protocol]: SimulationState;
};

// ★ Actionに protocol を追加
type EnhancedSimulationAction =
  | ({ type: 'START_SIMULATION'; numResources: number; maxConnections?: number; startTime?: number } & { protocol: Protocol }) // maxConnections追加
  | ({ type: 'SET_RUNNING'; isRunning: boolean } & { protocol: Protocol })
  | ({ type: 'INIT_RESOURCES'; resources: ResourceType[] } & { protocol: Protocol })
  | ({ type: 'UPDATE_RESOURCE_STATUS'; id: number; status: Exclude<ResourceStatus, 'error'>; time?: number; resourceData?: Partial<ResourceType> } & { protocol: Protocol })
  | ({ type: 'SIMULATION_COMPLETE'; time: number } & { protocol: Protocol });

// --- Helper: Create Initial State ---
const createInitialState = (protocol: Protocol, maxConnections?: number): SimulationState => ({
  protocol: protocol,
  resources: [],
  isRunning: false,
  startTime: null,
  endTime: null,
  maxConnections: protocol === 'HTTP/1.1' ? maxConnections : undefined,
});

// --- Reducer Logic (Single Protocol) ---
// error 状態を扱わないように修正
const singleSimulationReducerLogic = (state: SimulationState, action: EnhancedSimulationAction): SimulationState => {
  if (action.protocol !== state.protocol) {
    return state;
  }

  switch (action.type) {
    case 'START_SIMULATION':
      const initialResources = Array.from({ length: action.numResources }, (_, i) => ({
        id: i + 1,
        status: 'idle' as ResourceStatus, // error はもう発生しない
      }));
      return {
        ...state,
        resources: initialResources,
        isRunning: true,
        startTime: action.startTime ?? Date.now(),
        endTime: null,
        maxConnections: action.maxConnections ?? state.maxConnections,
      };
    case 'SET_RUNNING':
        return { ...state, isRunning: action.isRunning };
    case 'UPDATE_RESOURCE_STATUS':
      return {
        ...state,
        resources: state.resources.map(r =>
          r.id === action.id ? {
            ...r,
            ...action.resourceData,
            status: action.status,
            startTime: r.startTime ?? (action.status === 'requesting' ? action.time : undefined),
            endTime: action.status === 'completed' ? action.time : r.endTime,
          } : r
        ),
      };
    case 'SIMULATION_COMPLETE':
      return { ...state, isRunning: false, endTime: action.time };
    default:
      return state;
  }
}

// --- Main Reducer (All Protocols) ---
// SIMULATION_ERROR を扱わないため変更不要だが、呼び出し元でエラーが起きない前提
function simulationReducer(state: AllSimulationStates, action: EnhancedSimulationAction): AllSimulationStates {
    const targetProtocol = action.protocol;
    // Action の型から 'error' が除外されたので、singleSimulationReducerLogic に渡ることはない
    return {
        ...state,
        [targetProtocol]: singleSimulationReducerLogic(state[targetProtocol], action)
    };
}


// --- API Call Helper ---
// エラー時もnullではなく情報を返すようにする
const fetchResource = async (resourceId: number): Promise<{ id: number; data: string | null; simulatedPacketLoss: boolean; delayApplied: number; error?: string } | null> => {
  try {
    const response = await fetch(`/api/resource/${resourceId}`);
    if (!response.ok) {
      // エラーでもthrowせず、エラー情報を含めて返す
      console.warn(`Failed to fetch resource ${resourceId}: ${response.statusText}`);
      return {
        id: resourceId,
        data: null,
        simulatedPacketLoss: false,
        delayApplied: 0,
        error: `HTTP Error: ${response.status} ${response.statusText}`
      };
    }
    const data = await response.json();
    return {
        id: data.resourceId,
        data: data.content,
        simulatedPacketLoss: data.simulatedPacketLoss ?? false,
        delayApplied: data.delayApplied ?? 0
    };
  } catch (error: any) {
    // ネットワークエラーなども捕捉
    console.error(`Network or other error fetching resource ${resourceId}:`, error);
    return {
      id: resourceId,
      data: null,
      simulatedPacketLoss: false,
      delayApplied: 0,
      error: error.message || 'Unknown fetch error'
    };
  }
};


// --- Simulation Logic ---

// HTTP/1.1 シミュレーション: エラーハンドリングを削除
const simulateHttp1_1 = async (dispatch: React.Dispatch<EnhancedSimulationAction>, numResources: number, maxConnections: number = 6) => {
  const protocol: Protocol = 'HTTP/1.1';
  const resourceIds = Array.from({ length: numResources }, (_, i) => i + 1);
  let activeConnections = 0;
  const requestQueue = [...resourceIds];
  const processing = new Set<number>();
  const simulationStartTime = Date.now();
  let completedCount = 0; // 完了数をカウント

  const processNext = async () => {
    while (activeConnections < maxConnections && requestQueue.length > 0) {
      activeConnections++;
      const resourceId = requestQueue.shift()!;
      processing.add(resourceId);
      const startDelay = activeConnections * 100;
      const startTime = simulationStartTime + startDelay;
      dispatch({ type: 'UPDATE_RESOURCE_STATUS', protocol, id: resourceId, status: 'requesting', time: startTime });

      // fetchResourceはエラーでもオブジェクトを返すようになった
      const result = await fetchResource(resourceId);
      activeConnections--; // ここでデクリメント
      processing.delete(resourceId);
      completedCount++; // 完了カウントをインクリメント

      if (result && !result.error) {
        const endTime = startTime + result.delayApplied;
        dispatch({ type: 'UPDATE_RESOURCE_STATUS', protocol, id: resourceId, status: 'completed', time: endTime, resourceData: result });
      } else {
        // エラーの場合はログ出力のみ（statusは 'requesting' のまま or 'error' にしない）
        console.warn(`HTTP/1.1: Resource ${resourceId} failed.`, result?.error);
        // 必要であれば 'idle' などに戻すディスパッチを行うことも可能
        // dispatch({ type: 'UPDATE_RESOURCE_STATUS', protocol, id: resourceId, status: 'idle', time: Date.now() });
      }

      // 完了チェック
      if (completedCount === numResources) {
        dispatch({ type: 'SIMULATION_COMPLETE', protocol, time: Date.now() });
      } else if (requestQueue.length > 0) {
        processNext(); // 次の処理へ
      }
    }
  };

  // 最初の並列度分だけ開始
  for (let i = 0; i < Math.min(maxConnections, numResources); i++) {
    processNext();
  }
};

// HTTP/2 シミュレーション: エラーハンドリングを簡略化
const simulateHttp2 = async (dispatch: React.Dispatch<EnhancedSimulationAction>, numResources: number) => {
  const protocol: Protocol = 'HTTP/2';
  const resourceIds = Array.from({ length: numResources }, (_, i) => i + 1);
  const promises: Promise<any>[] = [];
  const startTimes: { [key: number]: number } = {};
  const simulationStartTime = Date.now();

  resourceIds.forEach(resourceId => {
    const startDelay = Math.random() * 50;
    const startTime = simulationStartTime + startDelay;
    startTimes[resourceId] = startTime;
    dispatch({ type: 'UPDATE_RESOURCE_STATUS', protocol, id: resourceId, status: 'requesting', time: startTime });
    // fetchResourceの呼び出し自体は残す
    promises.push(
      fetchResource(resourceId)
        .then(result => ({ ...result, type: 'success' as const, startTime }))
        // キャッチは不要（fetchResourceがエラー情報を返すため）
    );
  });

  // Promise.allSettled はすべての結果を待つ
  const results = await Promise.allSettled(promises);
  let tcpHolBlockEndTime = 0;
  const finalResults: Array<{ id: number, status: ResourceStatus, startTime: number, actualEndTime: number, effectiveEndTime: number, resourceData?: Partial<ResourceType> }> = [];

  results.forEach((settledResult, index) => {
    const resourceId = resourceIds[index]; // IDをインデックスから取得
    const startTime = startTimes[resourceId];

    if (settledResult.status === 'fulfilled' && settledResult.value && !settledResult.value.error) {
      const result = settledResult.value;
      const actualEndTime = startTime + (result.delayApplied ?? 0);
      if (result.simulatedPacketLoss) {
          tcpHolBlockEndTime = Math.max(tcpHolBlockEndTime, actualEndTime);
      }
      finalResults.push({ id: result.id, status: 'completed', startTime: startTime, actualEndTime, effectiveEndTime: 0, resourceData: result });
    } else {
      // 失敗した場合はログ表示のみ
      const errorMsg = settledResult.status === 'rejected' ? settledResult.reason : settledResult.value?.error;
      console.warn(`HTTP/2: Resource ${resourceId} failed.`, errorMsg);
      // finalResults には追加しない or 'idle' 状態で追加するなど選択可能
      // ここでは追加しないことで、完了タイムラインに表示されないようにする
    }
  });

  let overallLatestEndTime = 0;

  finalResults.forEach(res => {
    // エラーは finalResults に含まれないので 'completed' のみ処理
    res.effectiveEndTime = Math.max(res.actualEndTime, tcpHolBlockEndTime);
    dispatch({ type: 'UPDATE_RESOURCE_STATUS', protocol, id: res.id, status: 'completed', time: res.effectiveEndTime, resourceData: res.resourceData });
    overallLatestEndTime = Math.max(overallLatestEndTime, res.effectiveEndTime);
  });

  // すべてのリソース（成功/失敗問わず）が処理された時点で完了
  dispatch({ type: 'SIMULATION_COMPLETE', protocol, time: Date.now() });
};


// HTTP/3 シミュレーション: エラーハンドリングを削除
const simulateHttp3 = async (dispatch: React.Dispatch<EnhancedSimulationAction>, numResources: number) => {
  const protocol: Protocol = 'HTTP/3';
  const resourceIds = Array.from({ length: numResources }, (_, i) => i + 1);
  const promises: Promise<any>[] = [];
  const simulationStartTime = Date.now();

  resourceIds.forEach(resourceId => {
    const startDelay = Math.random() * 50;
    const startTime = simulationStartTime + startDelay;
    dispatch({ type: 'UPDATE_RESOURCE_STATUS', protocol, id: resourceId, status: 'requesting', time: startTime });

    const promise = fetchResource(resourceId)
      .then((result) => {
        if (result && !result.error) {
          const endTime = startTime + result.delayApplied;
          dispatch({ type: 'UPDATE_RESOURCE_STATUS', protocol, id: resourceId, status: 'completed', time: endTime, resourceData: result });
        } else {
          console.warn(`HTTP/3: Resource ${resourceId} failed.`, result?.error);
        }
      })
      // catch は不要
      ;
    promises.push(promise);
  });

  await Promise.allSettled(promises);
  // 完了ディスパッチ（エラーがあっても完了とする）
  dispatch({ type: 'SIMULATION_COMPLETE', protocol, time: Date.now() });
};


// --- Visualization Component ---
// state の型を SimulationState に変更
function SimulationVisualizer({ state }: { state: SimulationState }) {
  const { protocol, resources, isRunning, startTime, endTime, error } = state;
  const [currentTime, setCurrentTime] = useState<number>(Date.now());

  // リソースIDごとに「これまでに表示された最大幅」を保持するref
  const maxWidthRef = useRef<{ [id: number]: number }>({});

  // 前のリソース状態を保持するためのref
  const prevResourcesRef = useRef<ResourceType[]>([]);

  // 前回のisRunning状態を保持するref
  const wasRunningRef = useRef<boolean>(false);

  useEffect(() => {
    // シミュレーション開始時にリセット（isRunning が false→true に変わったとき）
    if (isRunning && !wasRunningRef.current) {
      maxWidthRef.current = {};
      console.log(`${protocol}: リセットしました`);
    }
    wasRunningRef.current = isRunning;

    // 現在のリソース状態を保存
    prevResourcesRef.current = [...resources];

    // アニメーションフレーム処理
    let animationFrameId: number;

    if (isRunning && startTime) {
      const update = () => {
        setCurrentTime(Date.now());
        animationFrameId = requestAnimationFrame(update);
      };
      animationFrameId = requestAnimationFrame(update);
    }

    return () => {
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
    };
  }, [isRunning, startTime, resources, protocol]);

  if (!startTime) {
    return <div className="p-4 text-center text-gray-500 italic h-full flex items-center justify-center">{protocol} Ready</div>;
  }

  const totalDuration = endTime ? endTime - startTime : currentTime - startTime;
  const safeTotalDuration = Math.max(1, totalDuration);

  const getStatusColor = (status: ResourceStatus, simulatedPacketLoss?: boolean) => {
    if (status === 'completed') return simulatedPacketLoss ? 'bg-orange-500' : 'bg-green-500';
    if (status === 'requesting') return 'bg-yellow-500';
    return 'bg-gray-600'; // idle or other
  };

  const timelineScaleMax = 10000; // Fixed scale

  return (
    <div className="p-4 flex flex-col bg-gray-800 rounded-lg border border-gray-700 min-h-[300px]">
      <h3 className="text-lg font-bold mb-2 flex-shrink-0">{protocol}</h3>
      <div className="mb-4 text-sm flex-shrink-0">
        Status: {isRunning ? 'Running...' : 'Completed'} (Total Time: {(safeTotalDuration / 1000).toFixed(2)}s)
      </div>

      <div className="flex-grow overflow-y-auto pr-2 space-y-2">
        {resources.map(resource => {
          const resourceStartTime = resource.startTime ? resource.startTime - startTime : 0;

          // 現在のリソース表示幅を計算
          let currentWidth = 0;
          let currentEndTime = resourceStartTime;

          if (resource.startTime) {
            // このリソースの実際の終了時間または現在時刻
            const endTimeValue = resource.endTime || currentTime;
            // 表示幅 = 終了時間 - 開始時間
            currentWidth = endTimeValue - resource.startTime;
            currentEndTime = endTimeValue - startTime;

            // 現在の幅と保存された最大幅を比較し、大きい方を記録
            if (!maxWidthRef.current[resource.id] || currentWidth > maxWidthRef.current[resource.id]) {
              maxWidthRef.current[resource.id] = currentWidth;
            }
          }

          // 表示用の幅（ピクセル単位ではなくミリ秒単位）
          const displayWidth = resource.startTime ? maxWidthRef.current[resource.id] || currentWidth : 0;
          // 表示用の終了時間
          const displayEndTime = resource.startTime ? resourceStartTime + displayWidth : resourceStartTime;

          // パーセンテージと表示幅の計算
          const leftPercent = (resourceStartTime / timelineScaleMax) * 100;
          const widthPercent = (displayWidth / timelineScaleMax) * 100;
          const minWidthPx = 2;

          const containerWidthEstimate = 500; // 仮の幅推定値
          const displayWidthPercent = displayWidth > 0 && widthPercent * containerWidthEstimate / 100 < minWidthPx
             ? (minWidthPx / containerWidthEstimate) * 100
             : widthPercent;

          return (
            <div key={resource.id} className="flex items-center text-xs group">
              <span className="w-20 shrink-0 pr-2 text-right font-mono">Resource {resource.id}:</span>
              <div className="flex-grow h-5 bg-gray-700 rounded relative overflow-hidden">
                {resource.startTime && (
                  <div
                    className={`absolute top-0 h-full rounded transition-colors duration-150 ${getStatusColor(resource.status, resource.simulatedPacketLoss)} ${resource.status === 'requesting' ? 'animate-pulse' : ''}`}
                    style={{
                      left: `${Math.max(0, leftPercent)}%`,
                      width: `${Math.min(100 - Math.max(0, leftPercent), displayWidthPercent)}%`,
                      minWidth: displayWidth > 0 ? `${minWidthPx}px` : '0px'
                    }}
                    title={`ID: ${resource.id}, Status: ${resource.status}${resource.simulatedPacketLoss ? ' (Loss Simulated)' : ''}, Start: ${(resourceStartTime / 1000).toFixed(2)}s, End: ${(displayEndTime / 1000).toFixed(2)}s, Duration: ${(displayWidth / 1000).toFixed(2)}s`}
                  >
                  </div>
                )}
                {resource.endTime && resource.status === 'completed' && (
                  <span className="absolute right-1 top-0 text-gray-300 text-[10px] opacity-0 group-hover:opacity-100 transition-opacity">
                    ({(displayWidth / 1000).toFixed(2)}s){resource.simulatedPacketLoss ? ' L' : ''}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex-shrink-0 pt-2 mt-2 border-t border-gray-700 text-xs text-gray-400">
        Timeline Scale: 0s to {(timelineScaleMax / 1000).toFixed(1)}s
      </div>
    </div>
  );
}


// --- Main Page Component ---
export default function Home() {
  // ★ selectedProtocol 削除
  const [maxConnections, setMaxConnections] = useState<number>(6);
  const numResources = 10;

   // ★ Initial state for all protocols
  const initialAllState: AllSimulationStates = {
      'HTTP/1.1': createInitialState('HTTP/1.1', maxConnections),
      'HTTP/2': createInitialState('HTTP/2'),
      'HTTP/3': createInitialState('HTTP/3'),
  };
  // ★ Reducer を新しいものに変更
  const [state, dispatch] = useReducer(simulationReducer, initialAllState);

  // ★ useCallback の依存配列変更、関数名変更、処理内容変更
  const runAllSimulations = useCallback(async () => {
     console.log(`Starting all simulations... (HTTP/1.1 Max Conn: ${maxConnections})`);

     // 共通の開始時間を設定（すべてのプロトコルで同じ値を使用）
     const commonStartTime = Date.now();

     // Start all simulations with the same startTime
     protocols.forEach(p => {
         dispatch({
           type: 'START_SIMULATION',
           protocol: p,
           numResources,
           maxConnections: p === 'HTTP/1.1' ? maxConnections : undefined,
           startTime: commonStartTime // 共通の開始時間を使用
         });
     });

    try {
        await Promise.allSettled([
            simulateHttp1_1(dispatch, numResources, maxConnections),
            simulateHttp2(dispatch, numResources),
            simulateHttp3(dispatch, numResources),
        ]);
        console.log("All simulation functions have settled.");
         // Individual COMPLETE/ERROR actions are dispatched within each simulate function
    } catch (error: any) {
      console.error(`Critical error running simulations:`, error);
      // Optionally dispatch a general error to all states? Or handle globally.
       protocols.forEach(p => {
            dispatch({ type: 'SIMULATION_COMPLETE', protocol: p, time: Date.now() });
       });
    }
  }, [dispatch, numResources, maxConnections]); // ★ 依存配列更新

  // ★ startSimulation -> startAllSimulations に変更
  const startAllSimulations = () => {
      // ★ 実行中判定を変更
    if (Object.values(state).some(s => s.isRunning)) return;
    runAllSimulations();
  };


  const getProtocolDescription = (protocol: Protocol): string => {
    switch (protocol) {
      case 'HTTP/1.1':
        return "複数のTCP接続を使い、各接続内でリクエストを順番に処理します。接続数には上限があり、前のリクエストが完了しないと次のリクエストがブロックされる (Head-of-line Blocking) ことがあります。";
      case 'HTTP/2':
        return "単一のTCP接続上で複数のリクエスト/レスポンスを並行処理 (多重化) します。これによりHTTPレベルのHOLブロッキングは解消されますが、TCPレベルのHOLブロッキングの影響は受けます (パケットロス時に他のストリームも停止)。"; // ★ 説明更新
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

    // ★ 実行中かどうかを判定するヘルパー
   const isAnyRunning = Object.values(state).some(s => s.isRunning);

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 flex flex-col items-center p-4 md:p-8">
      <h1 className="text-4xl font-bold mb-6">Day27 - HTTP Protocol Simulator</h1>

      {/* ★ Controls Area (Start Button & Config) */}
      <div className="mb-8 flex flex-col md:flex-row items-center justify-center space-y-4 md:space-y-0 md:space-x-6">
          {/* Start Button */}
         <button
           onClick={startAllSimulations} // ★ 関数名変更
           disabled={isAnyRunning} // ★ 判定変更
           className={`px-6 py-3 rounded-md font-semibold text-white transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900 disabled:opacity-50 disabled:cursor-not-allowed ${isAnyRunning ? 'bg-gray-600' : 'bg-indigo-600 hover:bg-indigo-700 focus:ring-indigo-500'}`} // ★ ボタン色変更
         >
           {isAnyRunning ? (
              <span className="flex items-center">
                 <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                   <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                   <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                 </svg>
                 Simulating...
               </span>
           ) : `Start All Simulations`} {/* ★ テキスト変更 */}
         </button>

         {/* HTTP/1.1 Config */}
         <div className="flex items-center space-x-2">
             <label htmlFor="maxConnections" className="text-sm font-medium text-gray-300">
               Max Connections (HTTP/1.1):
             </label>
             <input
               type="number"
               id="maxConnections"
               name="maxConnections"
               min="1"
               max="20"
               value={maxConnections}
               onChange={(e) => {
                   const val = parseInt(e.target.value, 10) || 1;
                   setMaxConnections(val);
                   // ★ state も直接更新 (START時に反映される) - 必要なら専用Actionを作る
                   // dispatch({ type: 'UPDATE_HTTP1_CONFIG', protocol: 'HTTP/1.1', maxConnections: val });
               }}
               disabled={isAnyRunning} // ★ 判定変更
               className="w-16 px-2 py-1 bg-gray-700 border border-gray-600 rounded-md text-sm text-center focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
             />
         </div>
      </div>


      {/* ★ Simulation Area (3 Columns) */}
      {/* ★ max-width 変更 */}
      <div className="w-full max-w-7xl grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          {protocols.map(protocol => (
              // ★ state[protocol] を渡す
              <SimulationVisualizer key={protocol} state={state[protocol]} />
          ))}
      </div>

      {/* ★ Descriptions Area (3 Columns) */}
      <div className="w-full max-w-7xl grid grid-cols-1 md:grid-cols-3 gap-4">
         {protocols.map(protocol => (
             <div key={protocol} className={`p-4 border-l-4 ${protocolTextColors[protocol].replace('text-', 'border-').replace('-300', '-500')} bg-gray-800 rounded-r-lg`}>
                <p className="text-sm text-gray-300">
                  <strong className={`${protocolTextColors[protocol]}`}>{protocol}:</strong> {getProtocolDescription(protocol)}
                </p>
             </div>
         ))}
      </div>
    </div>
  );
}
