/** @jsxImportSource react */
import { closestCenter, DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

export interface Card {
  id: string;
  label: string;
}

export interface SortableBoardProps {
  cards: Card[];
  onDragEnd?: (event: DragEndEvent) => void;
}

function SortableCard({ card, position }: { card: Card; position: number }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: card.id });

  return (
    <li
      ref={setNodeRef}
      className={isDragging ? 'card card-dragging' : 'card'}
      data-card={card.id}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      {...attributes}
      {...listeners}
    >
      <span className="card-pos">{position + 1}</span>
      {card.label}
    </li>
  );
}

/** A plain dnd-kit sortable list — no Janux in this file. */
export function SortableBoard({ cards, onDragEnd }: SortableBoardProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={cards.map((card) => card.id)} strategy={verticalListSortingStrategy}>
        <ul className="board">
          {cards.map((card, index) => (
            <SortableCard key={card.id} card={card} position={index} />
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  );
}
