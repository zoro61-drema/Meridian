// ExpandedField — full-resolution tactical-field overlay.
//
// Spec §2.1 (v1.1): double-clicking the MiniField grows the
// field to fill the workspace for inspection. Esc dismisses.
// Rendered as a layered absolute overlay on top of the
// CommandScreen body so the focused-agent panel can be hidden
// while it's active. Sprite interaction (click-to-select) still
// works inside the overlay.

import { Minimize2 } from "lucide-react";
import { useEffect } from "react";

import { Button } from "@/components/ui/button";
import { TacticalField } from "./TacticalField";

interface ExpandedFieldProps {
  onClose: () => void;
}

export function ExpandedField({ onClose }: ExpandedFieldProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Expanded tactical field"
      className="absolute inset-0 z-30 flex flex-col bg-background/95 p-3 backdrop-blur-sm"
    >
      <div className="mb-2 flex items-center justify-between">
        <h2 className="font-mono text-[11px] uppercase tracking-wider text-white/60">
          Tactical Field — Expanded
        </h2>
        <Button
          size="sm"
          variant="outline"
          onClick={onClose}
          aria-label="Collapse field"
        >
          <Minimize2 className="mr-1 h-3.5 w-3.5" />
          Collapse (Esc)
        </Button>
      </div>
      <div className="flex-1 min-h-0">
        <TacticalField />
      </div>
    </div>
  );
}
