// Workflow icons drawn in the same line-art language as PipelineProgress —
// thin strokes, dots, arcs. All use currentColor so they inherit text colour
// from the surrounding card.
//
// Each icon is a 32x32 viewBox; size and stroke width can be overridden.

import type { ComponentProps } from "react";

type IconProps = ComponentProps<"svg"> & { strokeWidth?: number };

function IconBase({
  children,
  strokeWidth = 1.4,
  ...rest
}: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...rest}
    >
      {children}
    </svg>
  );
}

// 1. Review a Pull Request — magnifier with concentric meridian arcs
export function ReviewPrIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <circle cx="13" cy="13" r="7" />
      <circle cx="13" cy="13" r="3.5" opacity="0.6" />
      <circle cx="13" cy="13" r="1" fill="currentColor" />
      <path d="M19 19 L26 26" />
      <circle cx="26" cy="26" r="1" fill="currentColor" />
    </IconBase>
  );
}

// 3. Sprint Dashboard — fill-based dashboard report silhouette: monitor
// frame containing a bar chart and two list rows, with a pie chart on the
// left. Departs from the line-art language because the source artwork is a
// single fill path; uses currentColor so it still inherits text colour.
export function SprintDashboardIcon({ strokeWidth: _strokeWidth, ...rest }: IconProps) {
  return (
    <svg
      viewBox="0 0 122.9 85.6"
      fill="currentColor"
      stroke="none"
      fillRule="evenodd"
      clipRule="evenodd"
      {...rest}
    >
      <path d="M7.5,0h107.9c4.1,0,7.5,3.4,7.5,7.5v70.6c0,4.1-3.4,7.5-7.5,7.5H7.5c-4.1,0-7.5-3.4-7.5-7.5V7.5C0,3.4,3.4,0,7.5,0L7.5,0z M69.9,63.3h28.5v4H69.9V63.3L69.9,63.3z M69.9,53.1H109v4H69.9V53.1L69.9,53.1z M92.1,35h5.6c0.3,0,0.5,0.2,0.5,0.5v11c0,0.3-0.2,0.5-0.5,0.5h-5.6c-0.3,0-0.5-0.2-0.5-0.5v-11C91.6,35.3,91.8,35,92.1,35L92.1,35L92.1,35z M70.5,28.3h5.6c0.3,0,0.5,0.2,0.5,0.5v17.8c0,0.3-0.2,0.5-0.5,0.5h-5.6c-0.3,0-0.5-0.2-0.5-0.5V28.8C69.9,28.5,70.2,28.3,70.5,28.3L70.5,28.3L70.5,28.3L70.5,28.3z M81.3,24.5h5.6c0.3,0,0.5,0.2,0.5,0.5v21.6c0,0.3-0.2,0.5-0.5,0.5h-5.6c-0.3,0-0.5-0.2-0.5-0.5V25C80.8,24.7,81,24.5,81.3,24.5L81.3,24.5L81.3,24.5z M39.3,48.2l17,0.3c0,6.1-3,11.7-8,15.1L39.3,48.2L39.3,48.2L39.3,48.2z M37.6,45.3l-0.2-19.8l0-1.3l1.3,0.1h0h0c1.6,0.1,3.2,0.4,4.7,0.8c1.5,0.4,2.9,1,4.3,1.7c6.9,3.6,11.7,10.8,12.1,19l0.1,1.3l-1.3,0l-19.7-0.6l-1.1,0L37.6,45.3L37.6,45.3L37.6,45.3z M39.8,26.7L40,44.1l17.3,0.5c-0.7-6.8-4.9-12.7-10.7-15.8c-1.2-0.6-2.5-1.1-3.8-1.5C41.7,27.1,40.8,26.9,39.8,26.7L39.8,26.7L39.8,26.7z M35.9,47.2L45.6,64c-3,1.7-6.3,2.6-9.7,2.6c-10.7,0-19.4-8.7-19.4-19.4c0-10.4,8.2-19,18.6-19.4L35.9,47.2L35.9,47.2L35.9,47.2z M115.6,14.1H7.2v64.4h108.4V14.1L115.6,14.1L115.6,14.1z" />
    </svg>
  );
}

// 4. Sprint Retrospectives — telescope on a tripod, tube angled toward the sky.
// Filled silhouette (departs from the line-art language); uses currentColor so
// it inherits text colour from the surrounding card.
export function RetrospectivesIcon({
  strokeWidth: _strokeWidth,
  ...rest
}: IconProps) {
  return (
    <svg
      viewBox="-90 -65 170 180"
      fill="currentColor"
      stroke="none"
      {...rest}
    >
      {/* Tripod legs */}
      <g stroke="currentColor" strokeWidth="5" strokeLinecap="round" fill="none">
        <line x1="0" y1="34" x2="-32" y2="100" />
        <line x1="0" y1="34" x2="0" y2="106" />
        <line x1="0" y1="34" x2="32" y2="100" />
      </g>
      {/* Mount block */}
      <rect x="-14" y="18" width="28" height="14" rx="2.5" />
      {/* Telescope tube tilted upward */}
      <g transform="rotate(-32)">
        <rect x="-62" y="-18" width="124" height="36" rx="5" />
        {/* Objective lens cap */}
        <rect x="59" y="-21" width="10" height="42" rx="2.5" />
        {/* Eyepiece body */}
        <rect x="-78" y="-10" width="17" height="20" rx="2" />
        {/* Eyepiece tip */}
        <rect x="-88" y="-7" width="10" height="14" rx="1.2" />
      </g>
    </svg>
  );
}

// 5. Groom Tickets — diagonal comb silhouette (filled). Departs from the
// other line-art icons because the source artwork is a single fill path; uses
// currentColor so it still inherits text colour from the surrounding card.
export function GroomTicketIcon({
  strokeWidth: _strokeWidth,
  ...rest
}: IconProps) {
  return (
    <svg
      viewBox="0 0 512 512"
      fill="currentColor"
      stroke="none"
      fillRule="evenodd"
      clipRule="evenodd"
      {...rest}
    >
      <path d="M8.67 148.09c-4.95 3.02-9.47-2.72-8.55-6.42C22.44 85.3 69.22 20.18 122.27 3.58c20.46-6.4 18.86-4.71 32.63 9.07l167.22 167.21 10.02 10.02L499.35 357.1c13.78 13.77 15.47 12.17 9.07 32.63-16.6 53.05-81.72 99.83-138.09 122.15-3.7.92-9.44-3.6-6.42-8.55l88.39-88.39-8.69-8.69-86.85 86.85c-2.77 2.76-7.29 2.72-10.1-.1-2.82-2.82-2.87-7.34-.11-10.1l86.85-86.85-11.5-11.5-86.85 86.84c-2.76 2.76-7.28 2.72-10.1-.1-2.82-2.81-2.86-7.34-.1-10.1l86.85-86.85-9.86-9.85-86.85 86.85c-2.76 2.76-7.28 2.71-10.1-.1-2.81-2.82-2.86-7.34-.1-10.1l86.85-86.85-9.85-9.85-86.85 86.85c-2.76 2.76-7.28 2.71-10.1-.11-2.82-2.81-2.86-7.34-.1-10.1l86.85-86.85-9.85-9.85-86.86 86.85c-2.76 2.76-7.28 2.71-10.09-.1-2.82-2.82-2.87-7.34-.11-10.1l86.85-86.85-9.85-9.85-86.85 86.85c-2.76 2.76-7.28 2.71-10.1-.11-2.82-2.81-2.86-7.34-.1-10.1l86.85-86.85-9.86-9.85-86.84 86.85c-2.77 2.76-7.29 2.71-10.1-.1-2.82-2.82-2.87-7.34-.11-10.1l86.85-86.85-9.85-9.85-86.85 86.85c-2.76 2.76-7.28 2.71-10.1-.11-2.82-2.81-2.86-7.34-.1-10.1l86.85-86.85-11.68-11.67-86.85 86.85c-2.76 2.76-7.28 2.71-10.1-.11-2.81-2.81-2.86-7.33-.1-10.09l86.85-86.85-11.5-11.51-86.85 86.85c-2.76 2.76-7.29 2.72-10.1-.1-2.82-2.82-2.87-7.34-.11-10.1l86.85-86.85-9.85-9.85-86.85 86.85c-2.76 2.76-7.28 2.71-10.1-.11-2.81-2.81-2.86-7.34-.1-10.1l86.85-86.84-9.85-9.86-86.85 86.85c-2.76 2.76-7.29 2.72-10.1-.1-2.82-2.82-2.87-7.34-.11-10.1l86.85-86.85-9.85-9.85-86.85 86.85c-2.76 2.76-7.28 2.71-10.1-.11-2.81-2.81-2.86-7.33-.1-10.09l86.85-86.86-9.85-9.85-86.85 86.85c-2.76 2.76-7.29 2.72-10.1-.1-2.82-2.82-2.87-7.34-.11-10.1l86.85-86.85-9.85-9.85-86.85 86.85c-2.76 2.76-7.28 2.71-10.1-.1-2.81-2.82-2.86-7.34-.1-10.1l86.85-86.85-9.85-9.86-86.85 86.85c-2.76 2.76-7.29 2.72-10.1-.1-2.82-2.82-2.86-7.34-.1-10.1l86.84-86.85-11.5-11.5-86.85 86.85c-2.76 2.76-7.28 2.71-10.1-.11-2.82-2.81-2.86-7.34-.1-10.1l86.85-86.85-8.69-8.69-88.39 88.39z" />
    </svg>
  );
}

// 8. Time Tracking — analog stopwatch silhouette: round face, top stem +
// crown, two clock hands and a tick mark at 12. Reads as a stopwatch even
// at small sizes thanks to the stem.
export function TimeTrackingIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      {/* Crown / stem on top */}
      <line x1="14" y1="3" x2="18" y2="3" />
      <line x1="16" y1="3" x2="16" y2="6" />
      {/* Optional side button (gives it the stopwatch silhouette) */}
      <line x1="22.5" y1="6" x2="24" y2="7.5" />
      {/* Watch face */}
      <circle cx="16" cy="18" r="10" />
      {/* 12 o'clock tick */}
      <line x1="16" y1="9" x2="16" y2="11" />
      {/* Hour hand pointing to ~10 */}
      <line x1="16" y1="18" x2="11.5" y2="14.5" />
      {/* Minute hand pointing to 12 */}
      <line x1="16" y1="18" x2="16" y2="11.5" />
      {/* Center pin */}
      <circle cx="16" cy="18" r="0.9" fill="currentColor" />
    </IconBase>
  );
}

// 7. Meetings — audio waveform (variable-height vertical strokes)
export function MeetingsIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M4 16 V16" />
      <path d="M7 12 V20" />
      <path d="M10 9 V23" />
      <path d="M13 14 V18" />
      <path d="M16 7 V25" />
      <path d="M19 11 V21" />
      <path d="M22 14 V18" />
      <path d="M25 10 V22" />
      <path d="M28 13 V19" />
    </IconBase>
  );
}

// Commander — three small unit dots on a tactical-field square with
// a connecting tether line, evoking the multi-agent dashboard.
export function CommanderIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      {/* Five-point star — commander's insignia (general's rank
          symbol). Filled in currentColor so it inherits text colour
          from the card. */}
      <polygon
        points="16,3 17.57,7.45 22.66,7.84 18.54,10.83 20.11,15.66 16,12.67 11.89,15.66 13.46,10.83 9.34,7.84 14.43,7.45"
        fill="currentColor"
        stroke="none"
      />
      {/* Two rank chevrons below the star — inverted-V military
          stripes. Drawn as thick filled wedges so they read at
          small sizes without relying on stroke width. */}
      <path
        d="M8 20 L16 16 L24 20 L24 23 L16 19 L8 23 Z"
        fill="currentColor"
        stroke="none"
      />
      <path
        d="M8 26 L16 22 L24 26 L24 29 L16 25 L8 29 Z"
        fill="currentColor"
        stroke="none"
      />
    </IconBase>
  );
}

// ── Map from WorkflowId → Icon component ───────────────────────────────────────

import type { WorkflowId } from "@/screens/WorkflowScreen";

export const WORKFLOW_ICONS: Record<WorkflowId, React.FC<IconProps>> = {
  "review-pr": ReviewPrIcon,
  "sprint-dashboard": SprintDashboardIcon,
  retrospectives: RetrospectivesIcon,
  "ticket-quality": GroomTicketIcon,
  meetings: MeetingsIcon,
  "time-tracking": TimeTrackingIcon,
  command: CommanderIcon,
};
