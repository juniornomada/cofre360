import type React from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  id: string;
  children: React.ReactNode;
  animationDelay: number;
}

export function SortableCardWrapper({ id, children, animationDelay }: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : "auto",
    animationDelay: `${animationDelay}ms`,
    touchAction: "manipulation" as const,
  } as React.CSSProperties;
  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={cn(
        "animate-stagger-in cursor-grab active:cursor-grabbing relative select-none",
        isDragging && "ring-2 ring-primary ring-offset-2 ring-offset-background rounded-2xl shadow-2xl scale-[1.02] transition-transform",
      )}
    >
      {children}
      {isDragging && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-2xl bg-black/30 backdrop-blur-[1px] animate-fade-in">
          <div className="flex items-center gap-1.5 rounded-full bg-white/95 px-3 py-1.5 text-xs font-bold text-gray-900 shadow-lg ring-2 ring-primary">
            <GripVertical className="h-4 w-4" />
            Mover cartão
          </div>
        </div>
      )}
    </div>
  );
}
