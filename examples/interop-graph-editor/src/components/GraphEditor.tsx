/** @jsxImportSource react */
import { Background, Controls, ReactFlow, ReactFlowProvider, type Connection, type Edge, type Node } from '@xyflow/react';

export interface GraphNode {
  id: string;
  label: string;
  x: number;
  y: number;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
}

export interface GraphEditorProps {
  nodes: GraphNode[];
  edges: GraphEdge[];
  onNodeDragStop?: (event: unknown, node: Node) => void;
  onConnect?: (connection: Connection) => void;
}

const toNodes = (nodes: GraphNode[]): Node[] =>
  nodes.map((node) => ({ id: node.id, position: { x: node.x, y: node.y }, data: { label: node.label } }));

const toEdges = (edges: GraphEdge[]): Edge[] =>
  edges.map((edge) => ({ id: edge.id, source: edge.source, target: edge.target }));

function Canvas({ nodes, edges, onNodeDragStop, onConnect }: GraphEditorProps) {
  return (
    <ReactFlow
      nodes={toNodes(nodes)}
      edges={toEdges(edges)}
      onNodeDragStop={onNodeDragStop}
      onConnect={onConnect}
      fitView
      proOptions={{ hideAttribution: true }}
    >
      <Background />
      <Controls showInteractive={false} />
    </ReactFlow>
  );
}

/** A plain React Flow canvas — no Janux in this file. */
export function GraphEditor(props: GraphEditorProps) {
  return (
    <ReactFlowProvider>
      <Canvas {...props} />
    </ReactFlowProvider>
  );
}
