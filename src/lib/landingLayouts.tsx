// Shared types for the landing-page layout.
//
// Only the orbital layout exists; this module just provides the card shape
// passed into it.

import React from "react";
import type { WorkflowId } from "@/screens/WorkflowScreen";

export type WorkflowBadge =
  | { kind: "session"; label: string }
  | { kind: "attention"; label: string };

export interface RenderableCard {
  id: WorkflowId;
  Icon: React.FC<{ className?: string }>;
  title: string;
  description: string;
  badge: WorkflowBadge | null;
}

export interface LandingLayoutProps {
  cards: RenderableCard[];
  onNavigate: (id: WorkflowId) => void;
}
