// SessionBreadcrumb — parent/child navigation for the chat panel.
//
// Per spec §5.2: "Selecting the parent or the subagent in the chat
// panel shows that session's stream; an in-panel breadcrumb lets
// the user navigate between related sessions."
//
// Rendered above the transcript when the selected unit has a
// parent and/or children.

import { ChevronRight, CornerDownRight } from "lucide-react";

import { useCommandStore } from "@/stores/command/store";

interface Props {
  unitId: string;
}

export function SessionBreadcrumb({ unitId }: Props) {
  const unit = useCommandStore((s) => s.units[unitId]);
  const units = useCommandStore((s) => s.units);
  const selectUnit = useCommandStore((s) => s.selectUnit);

  if (!unit) return null;
  const parent = unit.parentId ? units[unit.parentId] : null;
  const children = unit.childIds.map((id) => units[id]).filter(Boolean);

  if (!parent && children.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-1 border-b border-white/10 px-3 py-1.5 text-[10px] text-muted-foreground">
      {parent && (
        <>
          <Chip
            label={parent.name}
            onClick={() => selectUnit(parent.id)}
            tint="parent"
          />
          <ChevronRight className="h-3 w-3 text-muted-foreground/60" />
          <span className="font-medium text-white/80">{unit.name}</span>
        </>
      )}
      {!parent && children.length > 0 && (
        <span className="font-medium text-white/80">{unit.name}</span>
      )}
      {children.length > 0 && (
        <>
          <CornerDownRight className="ml-1 h-3 w-3 text-muted-foreground/60" />
          {children.map((c) => (
            <Chip
              key={c.id}
              label={c.name}
              onClick={() => selectUnit(c.id)}
              tint="child"
            />
          ))}
        </>
      )}
    </div>
  );
}

function Chip({
  label,
  onClick,
  tint,
}: {
  label: string;
  onClick: () => void;
  tint: "parent" | "child";
}) {
  const styles =
    tint === "parent"
      ? "border-white/15 bg-white/5 text-white/80 hover:bg-white/10"
      : "border-amber-700/40 bg-amber-900/20 text-amber-200 hover:bg-amber-900/30";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded border px-1.5 py-0.5 transition-colors ${styles}`}
    >
      {label}
    </button>
  );
}
