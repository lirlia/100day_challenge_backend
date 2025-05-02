'use client';

import React, { useState, useEffect, useCallback } from 'react';
import ReactFlow, {
  Controls,
  Background,
  applyNodeChanges,
  applyEdgeChanges,
  NodeChange,
  EdgeChange,
  Node,
  Edge,
  Connection,
  addEdge,
  MarkerType,
  useReactFlow,
  ReactFlowProvider,
  Position,
  BackgroundVariant,
  XYPosition,
} from 'reactflow';
import 'reactflow/dist/style.css'; // スタイルをインポート
import { useAutomatonStore, AutomatonDefinition, AutomatonState } from '../lib/store';

// ハイライト用スタイル
const highlightedNodeStyle = {
    boxShadow: '0 0 15px 5px rgba(0, 255, 0, 0.7)', // 緑色の光彩
    border: '4px solid #00ff00', // 強調された緑枠
};

const highlightedEdgeStyle = {
    stroke: '#00ff00', // 緑色の線
    strokeWidth: 5, // 少し太く
};

// Zustand ストアから取得した定義を React Flow のノード/エッジに変換するヘルパー関数 (ハイライト対応)
const definitionToFlow = (
    definition: AutomatonDefinition | null,
    highlightedStateId: string | null,
    highlightedEdgeId: string | null
): { nodes: Node[], edges: Edge[] } => {
  if (!definition) {
    return { nodes: [], edges: [] };
  }

  const nodes: Node<any>[] = definition.states.map((state): Node => {
    const isHighlighted = state.id === highlightedStateId;
    const isStart = state.id === definition.startStateId;
    const isAccepting = state.isAccepting;

    let nodeBorderColor = 'black';
    if (isHighlighted) {
        nodeBorderColor = '#00ff00'; // ハイライト色 (緑)
    } else if (isStart) {
        nodeBorderColor = '#34D399'; // 通常の開始状態色 (エメラルド)
    }

    return {
        id: state.id,
        position: state.position || { x: Math.random() * 400, y: Math.random() * 400 },
        data: { label: state.label },
        type: 'default',
        style: {
            border: `4px solid ${nodeBorderColor}`,
            borderRadius: '0',
            padding: '15px 25px',
            fontSize: '1.1rem',
            fontWeight: 'bold',
            background: 'white',
            minWidth: '80px',
            textAlign: 'center',
            boxShadow: isHighlighted
                ? highlightedNodeStyle.boxShadow
                : '5px 5px 0px rgba(0,0,0,1)',
            transition: 'all 0.2s ease-out', // スタイルの変化を滑らかに
        },
        className: isAccepting ? 'accepting-node' : '',
        zIndex: isHighlighted ? 1000 : undefined, // ハイライトされたノードを最前面に
    };
  });

  const edges: Edge[] = definition.transitions.map((transition): Edge => {
    const isHighlighted = transition.id === highlightedEdgeId;
    return {
        id: transition.id,
        source: transition.fromStateId,
        target: transition.toStateId,
        label: transition.input,
        type: 'smoothstep',
        markerEnd: { type: MarkerType.ArrowClosed, width: 20, height: 20, color: isHighlighted ? highlightedEdgeStyle.stroke : '#000000' },
        style: {
            strokeWidth: isHighlighted ? highlightedEdgeStyle.strokeWidth : 3,
            stroke: isHighlighted ? highlightedEdgeStyle.stroke : '#000000',
            transition: 'all 0.2s ease-out', // スタイルの変化を滑らかに
        },
        labelStyle: {
            fontSize: '1.2rem',
            fontWeight: 'bold',
            fill: '#ffffff',
            stroke: isHighlighted ? highlightedEdgeStyle.stroke : '#000000',
            strokeWidth: 0.5,
        },
        labelBgStyle: { // ラベルの背景
            fill: isHighlighted ? highlightedEdgeStyle.stroke : '#000000',
            fillOpacity: 0.8,
        },
        labelBgPadding: [4, 2],
        labelBgBorderRadius: 2,
        animated: isHighlighted, // ハイライトされたエッジをアニメーションさせる
        zIndex: isHighlighted ? 1000 : undefined, // ハイライトされたエッジを最前面に
    };
  });

  return { nodes, edges };
};

// このコンポーネントは ReactFlowProvider の中で使われる必要があるため、
// Provider は呼び出し元 (page.tsx など) で配置する
function AutomatonGraphInternal() {
  const {
      automata,
      activeAutomatonId,
      updateState,
      highlightedStateId, // ストアからハイライトIDを取得
      highlightedEdgeId,
  } = useAutomatonStore();
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const { fitView } = useReactFlow(); // useReactFlow は Provider 内部で呼び出す

  useEffect(() => {
    const activeAutomaton = activeAutomatonId ? automata[activeAutomatonId] : null;
    // definitionToFlow にハイライトIDを渡す
    const { nodes: newNodes, edges: newEdges } = definitionToFlow(activeAutomaton, highlightedStateId, highlightedEdgeId);
    setNodes(newNodes);
    setEdges(newEdges);

     // fitView のロジック (変更なし)
     if (newNodes.length > 0 && !highlightedStateId && !highlightedEdgeId) { // ハイライト中は fitView しない
        setTimeout(() => {
           try {
             fitView({ duration: 300, padding: 0.1 });
           } catch (e) {
              console.warn("fitView failed, likely due to DOM not being ready:", e);
           }
        }, 100);
     }

  }, [activeAutomatonId, automata, fitView, highlightedStateId, highlightedEdgeId]); // 依存配列にハイライトIDを追加

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => setNodes((nds) => applyNodeChanges(changes, nds)),
    [setNodes]
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => setEdges((eds) => applyEdgeChanges(changes, eds)),
    [setEdges]
  );

   // ノードのドラッグ終了時に Zustand ストアの位置情報を更新
   const onNodeDragStop = useCallback(
     (_event: React.MouseEvent, node: Node) => {
       // node.position は XYPosition であるはず
       if (node.position) {
         updateState(node.id, { position: node.position }); // 型アサーション不要
       }
     },
     [updateState]
   );

  // TODO: Implement onConnect for adding transitions (Step 4)

  return (
    <div style={{ width: '100%', height: '100%' }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeDragStop={onNodeDragStop}
        // onConnect={onConnect} // Step 4 で実装
        fitView // 初期表示時にグラフ全体を表示 (初回useEffectで制御)
        // fitViewOptions={{ padding: 0.1, duration: 300 }} // useEffect で制御するため不要かも
        nodesDraggable={true} // ノードをドラッグ可能に
        selectNodesOnDrag={false}
      >
        <Controls
           style={{
             border: '2px solid black',
             borderRadius: '0',
             boxShadow: '3px 3px 0px rgba(0,0,0,1)',
             // ボタンのスタイルは個別に設定するか、内部要素をターゲットにするCSSが必要
           }}
           // buttonClassName="bg-white hover:bg-gray-200 border-r-2 border-black last:border-r-0 p-2" // このプロパティはない
         />
        <Background variant={BackgroundVariant.Dots} gap={24} size={2} color="#e0e0e0" />
      </ReactFlow>
       {/* 受理状態の二重円などを表現するためのCSS */}
       <style jsx global>{`
         .react-flow__node.accepting-node {
           border: 4px solid black; /* 基本の枠線 */
           border-radius: 50%;
           position: relative; /* 疑似要素の位置決めの基点 */
         }
         .react-flow__node.accepting-node::after {
           content: '';
           position: absolute;
           top: -8px; /* 外側の円の位置調整 (ボーダー幅考慮) */
           left: -8px;
           right: -8px;
           bottom: -8px;
           border: 4px solid black; /* 外側の円 */
           border-radius: 50%;
           pointer-events: none; /* クリックイベントを透過 */
           box-sizing: border-box; /* ボーダーを含めてサイズ計算 */
         }
         /* 開始状態の緑枠は style prop で適用 */

         /* Controls のボタンのスタイル調整 (例) */
         .react-flow__controls-button {
            background-color: white !important;
            border-bottom: 2px solid black !important;
            border-radius: 0 !important;
            box-shadow: 2px 2px 0px rgba(0,0,0,1) !important;
            margin-bottom: 5px !important;
            fill: black !important;
         }
         .react-flow__controls-button:hover {
            background-color: #eeeeee !important;
         }
          .react-flow__controls-button:last-child {
            border-bottom: none !important; /* 最後のボタンの下線は消す */
          }
       `}</style>
    </div>
  );
}

// React Flow Provider を含むラッパーコンポーネント
export default function AutomatonGraph() {
    return (
        <ReactFlowProvider>
            <AutomatonGraphInternal />
        </ReactFlowProvider>
    );
}
