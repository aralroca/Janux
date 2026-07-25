/** @jsxImportSource react */
import { Background, Controls, ReactFlow, ReactFlowProvider, useReactFlow, type Node } from '@xyflow/react';

export interface FlowStep {
  id: string;
  label: string;
}

export interface FlowCanvasProps {
  steps: FlowStep[];
}

const toNodes = (steps: FlowStep[]): Node[] =>
  steps.map((step, index) => ({
    id: step.id,
    position: { x: 120, y: 20 + index * 90 },
    data: { label: step.label },
    type: index === 0 ? 'input' : undefined,
  }));

const toEdges = (steps: FlowStep[]) =>
  steps.slice(1).map((step, index) => ({
    id: `e-${steps[index]!.id}-${step.id}`,
    source: steps[index]!.id,
    target: step.id,
  }));

function Canvas({ steps }: FlowCanvasProps) {
  const { fitView } = useReactFlow();

  // Keep the newest node in view as the flow grows.
  return (
    <ReactFlow
      nodes={toNodes(steps)}
      edges={toEdges(steps)}
      fitView
      onNodesChange={() => fitView({ duration: 200 })}
      proOptions={{ hideAttribution: true }}
    >
      <Background />
      <Controls showInteractive={false} />
    </ReactFlow>
  );
}

/** A plain React Flow canvas — Janux mounts it unchanged through `foreign()`. */
export function FlowCanvas({ steps }: FlowCanvasProps) {
  return (
    <ReactFlowProvider>
      <Canvas steps={steps} />
    </ReactFlowProvider>
  );
}
