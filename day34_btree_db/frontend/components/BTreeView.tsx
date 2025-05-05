"use client";

import React, { useMemo } from 'react';
import { BTreeNode } from '@/lib/btree'; // Import the actual type

interface BTreeViewProps {
  node: BTreeNode | null;
}

// Helper function to get highlight colors
const getHighlightStyles = (highlight: BTreeNode['highlight']) => {
  switch (highlight) {
    case 'search':
      return 'bg-yellow-100 border-yellow-400';
    case 'insert':
    case 'split': // Split often related to insert
    case 'borrow': // Borrow/Merge related to insert/delete balance
    case 'merge':
      return 'bg-green-100 border-green-400';
    case 'delete':
      return 'bg-red-100 border-red-400';
    case 'path':
      return 'bg-indigo-100 border-indigo-400';
    case 'found':
      return 'bg-lime-200 border-lime-500 font-bold';
    default:
      return 'bg-blue-100 border-blue-400'; // Default style
  }
};

const NODE_WIDTH = 50; // Approximate width for line calculation
const NODE_HEIGHT = 30; // Approximate height
const HORIZONTAL_SPACING = 20;
const VERTICAL_SPACING = 60;

const BTreeView: React.FC<BTreeViewProps> = ({ node }) => {

  // Calculate layout positions using memoization
  const layout = useMemo(() => {
    const positions = new Map<string, { x: number; y: number; width: number }>();
    const subtreeWidths = new Map<string, number>();

    function calculateSubtreeWidth(n: BTreeNode): number {
        if (subtreeWidths.has(n.id)) {
            return subtreeWidths.get(n.id)!;
        }

        const selfWidth = n.keys.length * 20 + (n.keys.length - 1) * 5 + 20; // Estimate width based on keys
        if (n.isLeaf) {
            const width = Math.max(NODE_WIDTH, selfWidth);
            subtreeWidths.set(n.id, width);
            return width;
        }

        let childrenWidth = 0;
        n.children.forEach((child, index) => {
            childrenWidth += calculateSubtreeWidth(child);
            if (index < n.children.length - 1) {
                childrenWidth += HORIZONTAL_SPACING;
            }
        });

        const width = Math.max(selfWidth, childrenWidth);
        subtreeWidths.set(n.id, width);
        return width;
    }

    function assignPositions(n: BTreeNode | null, x: number, y: number): void {
        if (!n) return;

        const subtreeWidth = calculateSubtreeWidth(n);
        const selfWidth = n.keys.length * 20 + (n.keys.length -1) * 5 + 20;
        const nodeWidth = Math.max(NODE_WIDTH, selfWidth);
        const currentX = x + (subtreeWidth - nodeWidth) / 2;

        positions.set(n.id, { x: currentX, y, width: nodeWidth });

        if (!n.isLeaf) {
            let childX = x;
            n.children.forEach((child) => {
                const childSubtreeWidth = calculateSubtreeWidth(child);
                assignPositions(child, childX, y + NODE_HEIGHT + VERTICAL_SPACING);
                childX += childSubtreeWidth + HORIZONTAL_SPACING;
            });
        }
    }

    if (node) {
        calculateSubtreeWidth(node);
        assignPositions(node, 0, 0);
    }
    return positions;
  }, [node]);

  // Calculate overall dimensions for SVG viewBox
   const dimensions = useMemo(() => {
    let minX = 0, maxX = 0, maxY = 0;
    if (!node) return { width: 500, height: 300, offsetX: 0, offsetY: 0 };

    for (const [_, pos] of layout.entries()) {
      minX = Math.min(minX, pos.x);
      maxX = Math.max(maxX, pos.x + pos.width);
      maxY = Math.max(maxY, pos.y + NODE_HEIGHT);
    }
    const width = Math.max(500, maxX - minX + 100); // Add padding
    const height = Math.max(300, maxY + 50); // Add padding
    const offsetX = -minX + 50; // Center horizontally
    const offsetY = 20; // Top padding

    return { width, height, offsetX, offsetY };
  }, [layout, node]);

  // NEW: Recursive function to render nodes and lines hierarchically
  const renderNodeGroup = (n: BTreeNode | null): React.ReactElement | null => {
    if (!n) return null;

    const nodePos = layout.get(n.id);
    if (!nodePos) return null;

    const nodeStyles = getHighlightStyles(n.highlight);
    const isTarget = n.operationTarget;
    const comparingIndex = n.comparingKeyIndex;
    const transientVal = n.transientValue;

    // Render the node itself
    const nodeElement = (
      <foreignObject
        key={n.id} // Key for the node itself
        x={nodePos.x + dimensions.offsetX}
        y={nodePos.y + dimensions.offsetY}
        width={nodePos.width}
        height={NODE_HEIGHT + (n.statusText ? 15 : 0)}
        style={{ overflow: 'visible' }}
      >
         <div
            {...({ xmlns: "http://www.w3.org/1999/xhtml" } as any)}
            className={`flex flex-col items-center border-2 rounded-md shadow-md px-2 py-1 text-sm font-mono ${nodeStyles}`}
           >
              <div className="flex gap-1 justify-center items-center min-h-[1.2em]">
                {transientVal && transientVal.keyIndex === -1 && (
                    <span className="text-xs text-purple-600 mr-1">({transientVal.value})</span>
                )}
                {n.keys.map((key, index) => (
                    <React.Fragment key={index}>
                      <span
                          className={`inline-block px-1 rounded
                              ${isTarget && index === comparingIndex ? 'ring-2 ring-pink-500 bg-pink-200' : ''}
                              ${isTarget && index !== comparingIndex ? 'underline decoration-pink-500' : ''}
                              ${!isTarget && index === comparingIndex ? 'bg-yellow-300 ring-1 ring-yellow-500' : ''}
                          `}
                      >
                          {key}
                      </span>
                      {transientVal && transientVal.keyIndex === index && (
                          <span className="text-xs text-purple-600 ml-1">({transientVal.value})</span>
                      )}
                    </React.Fragment>
                ))}
                 {n.keys.length === 0 && (
                     <>
                         {transientVal && transientVal.keyIndex === -1 && (
                             <span className="text-xs text-purple-600 mr-1">({transientVal.value})</span>
                         )}
                         <span className="text-gray-400 italic text-xs">(empty)</span>
                     </>
                  )}
              </div>
               {n.statusText && (
                  <div className="text-xs text-purple-700 mt-1">{n.statusText}</div>
               )}
           </div>
      </foreignObject>
    );

    // Render lines and recursively render children groups
    const childrenElements = n.isLeaf ? [] : n.children.map(child => {
      const childPos = layout.get(child.id);
      if (!childPos) return null;

      const parentX = nodePos.x + nodePos.width / 2 + dimensions.offsetX;
      const parentY = nodePos.y + NODE_HEIGHT + dimensions.offsetY;
      const childX = childPos.x + childPos.width / 2 + dimensions.offsetX;
      const childY = childPos.y + dimensions.offsetY;

      const lineElement = (
        <line
          key={`line-${n.id}-${child.id}`} // Unique key for the line
          x1={parentX}
          y1={parentY}
          x2={childX}
          y2={childY}
          stroke={child.highlight === 'path' || child.highlight === 'borrow' || child.highlight === 'merge' ? '#6366F1' : '#9CA3AF'}
          strokeWidth="1.5"
        />
      );

      const childGroup = renderNodeGroup(child); // Recursive call

      // Return a group containing the line and the child's group
      // Use child.id for the fragment key as it's unique for each child connection
      return (
        <React.Fragment key={`fragment-${child.id}`}>
            {lineElement}
            {childGroup}
        </React.Fragment>
      );
    }).filter(el => el !== null); // Filter out potential nulls if childPos is missing

    // Return a group containing the node itself and all children elements
    // Use n.id as the key for this node's group
    return (
      <g key={`group-${n.id}`}>
        {nodeElement}
        {childrenElements}
      </g>
    );
  };

  if (!node) {
    return <div className="text-center text-gray-400 italic p-10">Tree is empty. Enter a value and click Insert.</div>;
  }

  return (
    <div className="w-full h-full flex justify-center items-center overflow-auto p-4">
       <svg
          width={dimensions.width}
          height={dimensions.height}
          viewBox={`0 0 ${dimensions.width} ${dimensions.height}`}
          className="min-w-full min-h-full"
       >
            {/* Use the new hierarchical rendering function */}
            {renderNodeGroup(node)}
       </svg>
    </div>
  );
};

export default BTreeView;
