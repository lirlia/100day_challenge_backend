import React from 'react';
import { RaftNodeData, NodeState } from '../../lib/types/raft'; // Adjust path as needed

interface NodeViewProps {
  node: RaftNodeData;
  onDragStart: (e: React.DragEvent<HTMLDivElement>, id: string) => void;
  onDrag: (e: React.DragEvent<HTMLDivElement>) => void;
  onDragEnd: (e: React.DragEvent<HTMLDivElement>) => void;
  onClick: (id: string) => void; // Added for stopping/resuming nodes
}

export const NodeView: React.FC<NodeViewProps> = ({ node, onDragStart, onDrag, onDragEnd, onClick }) => {
  const getStateColor = (state: NodeState): string => {
    switch (state) {
      case NodeState.Leader: return 'bg-yellow-500';
      case NodeState.Candidate: return 'bg-blue-500';
      case NodeState.Follower: return 'bg-green-500';
      case NodeState.Stopped: return 'bg-gray-500';
      default: return 'bg-gray-300';
    }
  };

  const stateIndicatorColor = getStateColor(node.state);

  return (
    <div
      id={String(node.id)}
      className={`absolute p-4 border rounded-lg shadow-md cursor-grab flex flex-col items-center justify-center ${stateIndicatorColor} text-white select-none`}
      style={{ left: `${node.position.x}px`, top: `${node.position.y}px`, width: '100px', height: '100px' }}
      draggable="true"
      onDragStart={(e) => onDragStart(e, String(node.id))}
      onDrag={onDrag}
      onDragEnd={onDragEnd}
      onClick={() => onClick(String(node.id))}
      title={`ID: ${node.id}
State: ${node.state}
Term: ${node.currentTerm}
Commit: ${node.commitIndex}
Applied: ${node.lastApplied}
Log Size: ${node.log.length}
Timeout: ${node.electionTimeoutRemaining ?? '-'}`}
    >
      <span className="font-bold text-lg">{node.id}</span>
      <span className="text-sm capitalize">{node.state}</span>
      <span className="text-xs">T: {node.currentTerm}</span>
       {/* Display log index for debugging */}
       {/* <span className="text-xs">Log: {node.log.length > 0 ? node.log[node.log.length-1].index : 0}</span> */}
       <span className="text-xs">CI: {node.commitIndex}</span>

    </div>
  );
};

export default NodeView;
