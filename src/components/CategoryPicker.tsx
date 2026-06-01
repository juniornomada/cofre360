import { useState } from "react";
import { categoryTree, getCategoryValue, parseCategoryValue } from "@/lib/categories";
import { ChevronLeft } from "lucide-react";

interface CategoryPickerProps {
  value: string;
  onChange: (value: string, icon: string) => void;
  className?: string;
  defaultExpanded?: boolean;
  type?: "expense" | "income";
}

export function CategoryPicker({ value, onChange, className, defaultExpanded = false, type = "expense" }: CategoryPickerProps) {
  const parsed = parseCategoryValue(value);
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  const filteredTree = categoryTree.filter(g => g.type === type);
  const activeGroup = selectedGroup || null;
  const group = activeGroup ? filteredTree.find(g => g.label === activeGroup) : null;

  return (
    <div className={className}>
      <label className="text-[11px] font-semibold text-foreground mb-1 block">Categoria</label>

      {/* Current value display as a toggle */}
      <button 
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex w-full items-center justify-between gap-2 mb-2 px-3 py-2 rounded-xl bg-card text-sm text-foreground hover:bg-accent transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="font-bold text-foreground">{parseCategoryValue(value).group}</span>
          <span className="text-muted-foreground opacity-30 mx-0.5">›</span>
          <span className="text-muted-foreground font-medium">{parseCategoryValue(value).sub}</span>
        </div>
        <div className={`text-[10px] font-bold px-2 py-0.5 rounded-full bg-primary/10 text-primary transition-transform duration-300`}>
          {isExpanded ? 'Recolher' : 'Alterar'}
        </div>
      </button>

      {isExpanded && (
        <div className="animate-in fade-in slide-in-from-top-2 duration-300">
          {!group ? (
            /* Main categories grid */
            <div className="grid grid-cols-5 gap-1 max-h-48 overflow-y-auto">
              {filteredTree.map((g) => (
                <button
                  key={g.label}
                  type="button"
                  onClick={() => {
                    if (g.subcategories.length === 1) {
                      const sub = g.subcategories[0];
                      onChange(getCategoryValue(g.label, sub.label), sub.icon);
                    }
                    setSelectedGroup(g.label);
                  }}
                  className={`flex flex-col items-center gap-0.5 rounded-xl px-1.5 py-2 text-[10px] font-medium transition-colors ${
                    parsed.group === g.label
                      ? "bg-primary/15 text-primary ring-1 ring-primary/30"
                      : "bg-card text-muted-foreground hover:bg-accent"
                  }`}
                >
                  <span className="text-base">{g.icon}</span>
                  <span className="truncate w-full text-center">{g.label}</span>
                </button>
              ))}
            </div>
          ) : (
            /* Subcategories */
            <div>
              <button
                type="button"
                onClick={() => setSelectedGroup(null)}
                className="flex items-center gap-1 text-xs text-primary mb-2 hover:underline"
              >
                <ChevronLeft className="h-3 w-3" />
                {group.label}
              </button>
              {(() => {
                const count = group.subcategories.length;
                const cols = Math.min(5, Math.max(2, Math.ceil(Math.sqrt(count))));
                return (
                  <div
                    className="grid gap-1"
                    style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
                  >
                    {group.subcategories.map((sub) => (
                      <button
                        key={sub.label}
                        type="button"
                        onClick={() => {
                          onChange(getCategoryValue(group.label, sub.label), sub.icon);
                        }}
                        className={`flex flex-col items-center justify-center gap-0.5 rounded-lg px-1 py-1.5 text-[10px] font-medium leading-tight transition-colors ${
                          parsed.group === group.label && parsed.sub === sub.label
                            ? "bg-primary/15 text-primary ring-1 ring-primary/30"
                            : "bg-card text-muted-foreground hover:bg-accent"
                        }`}
                      >
                        <span className="text-base leading-none">{sub.icon}</span>
                        <span className="truncate w-full text-center">{sub.label}</span>
                      </button>
                    ))}
                  </div>
                );
              })()}
            </div>
          )}
        </div>
      )}
    </div>
  );
}