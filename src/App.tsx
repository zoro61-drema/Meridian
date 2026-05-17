import { AiDebugDock, DockModePicker } from "@/components/AiDebugDock";
import { AiDebugPanel } from "@/components/AiDebugPanel";
import { TasksPanel } from "@/components/TasksPanel";
import { TooltipProvider } from "@/components/ui/tooltip";
import { OpenMeetingsProvider } from "@/context/OpenMeetingsContext";
import { OpenSettingsProvider } from "@/context/OpenSettingsContext";
import { OpenTimeTrackingProvider } from "@/context/OpenTimeTrackingContext";
import { PreviewOnboardingProvider } from "@/context/PreviewOnboardingContext";
import { RecordingContextTagsProvider } from "@/context/RecordingContextTagsContext";
import { startAiDebugListener } from "@/lib/aiDebugListener";
import { AI_DEBUG_SET_DOCK_MODE_EVENT, isAiDebugWindow } from "@/lib/aiDebugWindow";
import type { AiDebugDockMode } from "@/lib/appPreferences";
import { emit } from "@tauri-apps/api/event";
import { APP_PREFERENCE_DEFAULTS, getAppPreferences } from "@/lib/appPreferences";
import { BackgroundRenderer, getBackgroundId, useBgChangeListener } from "@/lib/backgrounds/_registry";
import { startRateLimitListener } from "@/lib/rateLimitListener";
import { clearAllEffects, fireBlackHole, fireComet, fireMeteorShower, firePulsar, fireShootingStar, fireWormhole, getBhGravityEnabled, getSpaceEffectKindToggles, setEffectsEnabled, SPACE_FX_BH_GRAVITY_EVENT, SPACE_FX_TOGGLES_EVENT, toggleBhGravityEnabled, toggleSpaceEffectKind, type SpaceEffectKind } from "@/lib/spaceEffects/_shared";
import { SpaceEffectsOverlay } from "@/lib/spaceEffects/overlay";
import { isMockMode, setJiraBaseUrlCache, setLocalLlmUrlCache, setMockClaudeMode, setMockMode } from "@/lib/tauri/core";
import { bitbucketComplete, credentialStatusComplete, getCredentialStatus, getNonSecretConfig, jiraComplete, type CredentialStatus } from "@/lib/tauri/credentials";
import { cancelAllAgents } from "@/lib/cancelAllAgents";
import { setCurrentScreen } from "@/lib/currentScreen";
import { installWindowFocusTracker } from "@/lib/windowFocus";
import { attachPrReviewToasts } from "@/lib/prReviewNotifications";
import { setRuntimeOverloadPct } from "@/lib/workloadClassifier";
import { ThemeProvider } from "@/providers/ThemeProvider";
import { AgentSkillsScreen } from "@/screens/AgentSkillsScreen";
import { CommandScreen } from "@/screens/CommandScreen";
import { GroomTicketScreen } from "@/screens/GroomTicketScreen";
import { LandingScreen } from "@/screens/LandingScreen";
import { MeetingsScreen } from "@/screens/MeetingsScreen";
import { OnboardingScreen } from "@/screens/OnboardingScreen";
import { PrReviewScreen } from "@/screens/PrReviewScreen";
import { RetrospectivesScreen } from "@/screens/RetrospectivesScreen";
import { SettingsScreen } from "@/screens/SettingsScreen";
import { SprintDashboardScreen } from "@/screens/SprintDashboardScreen";
import { TimeTrackingScreen } from "@/screens/TimeTrackingScreen";
import { WorkflowScreen, type WorkflowId } from "@/screens/WorkflowScreen";
import { useAiDebugStore } from "@/stores/aiDebugStore";
import { useCredentialStatusStore } from "@/stores/credentialStatusStore";
import { hydrateMeetingsStore } from "@/stores/meetings/listeners";
import { attachCommandListeners, hydrateCommandStore } from "@/stores/command/listeners";
import { attachPrQueueListeners } from "@/stores/prQueue/listeners";
import { usePrQueueStore } from "@/stores/prQueue/store";
import { usePrTasksStore } from "@/stores/prTasksStore";
import { hydrateTasksStore, useTasksStore } from "@/stores/tasksStore";
import { hydrateTimeTrackingStore } from "@/stores/timeTrackingStore";
import { POLL_INTERVAL_MS, useWorkloadAlertStore } from "@/stores/workloadAlertStore";
import { listen } from "@tauri-apps/api/event";
import { Loader2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Toaster, toast } from "sonner";

type Screen = "loading" | "onboarding" | "landing" | "settings" | "agent-skills" | WorkflowId;

/** Screens the external control server (POST /navigate) can jump to.
 *  Mirrors the VALID_SCREENS list in `src-tauri/src/control_server.rs` —
 *  the Rust side also validates, but we double-check here so a
 *  protocol-version mismatch can't silently switch to a screen the
 *  React side can't render. "loading" is excluded — that's a boot
 *  state nothing should drive externally. */
const EXTERNAL_NAV_SCREENS: ReadonlySet<Screen> = new Set<Screen>([
  "landing",
  "onboarding",
  "settings",
  "agent-skills",
  "review-pr",
  "sprint-dashboard",
  "retrospectives",
  "ticket-quality",
  "meetings",
  "time-tracking",
  "command",
]);

function LoadingScreen() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );
}

const WORKFLOW_IDS: WorkflowId[] = [
  "review-pr",
  "sprint-dashboard",
  "retrospectives",
  "ticket-quality",
  "meetings",
  "time-tracking",
  "command",
];

function isWorkflowId(s: Screen): s is WorkflowId {
  return WORKFLOW_IDS.includes(s as WorkflowId);
}

function AppInner() {
  const [screen, setScreen] = useState<Screen>("loading");
  useEffect(() => {
    setCurrentScreen(screen);
  }, [screen]);
  const [credStatus, setCredStatusLocal] = useState<CredentialStatus | null>(null);
  const setCredentialStatusInStore = useCredentialStatusStore((s) => s.setStatus);
  const setCredStatus = useCallback(
    (next: CredentialStatus | null) => {
      setCredStatusLocal(next);
      setCredentialStatusInStore(next);
    },
    [setCredentialStatusInStore],
  );
  const [screenBeforeSettings, setScreenBeforeSettings] = useState<Screen>("landing");
  const [screenBeforeOnboardingPreview, setScreenBeforeOnboardingPreview] =
    useState<Screen | null>(null);

  useEffect(() => {
    // When loaded outside a Tauri runtime (e.g. the vite dev URL opened
    // in chrome-devtools for UI inspection), auto-enable mock mode so
    // the credential bootstrap below doesn't strand us on Onboarding.
    // Inside the real Tauri webview `__TAURI_INTERNALS__` is always
    // present, so this branch never fires there. Loud console message
    // so a dev who opened the dev URL by accident isn't confused by
    // mock data.
    const inTauri =
      typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
    if (!inTauri && !isMockMode()) {
      console.info(
        "[meridian] no Tauri runtime detected — auto-enabling mock mode for browser inspection. " +
          "Disable via localStorage.removeItem('meridian_mock_mode').",
      );
      setMockMode(true);
      setMockClaudeMode(true);
    }

    // Hydrate persisted stores from file cache before loading credentials
    Promise.allSettled([
      hydrateMeetingsStore(),
      hydrateTasksStore(),
      hydrateTimeTrackingStore(),
      // Pull saved PR-task filter rules from preferences so the sidebar
      // applies them on the very first render — otherwise the user
      // sees noise tasks flash in for a moment before the filter loads.
      usePrTasksStore.getState().hydrateFilters(),
      // Eagerly hydrate the PR Review queue + start its event listeners
      // so toasts and background pane state work even before the user
      // visits the PR Review screen.
      usePrQueueStore.getState().init(),
    ]);
    // PR Review queue listeners + cross-screen toast — session-long so
    // background agents continue to surface state when the user is on
    // other screens.
    void attachPrQueueListeners();
    void attachPrReviewToasts();
    // Command listener stays attached for the app lifetime so units
    // keep accumulating state and transcript when the user navigates
    // away from the Command screen. Fire-and-forget matches the
    // prQueue pattern; React StrictMode's double-mount is safe
    // because the listener guards against re-attach.
    void attachCommandListeners();
    // Restore previously-persisted units from SQLite. Hydrated
    // units start in `isLive: false`; the chat panel surfaces a
    // Resume button per unit.
    void hydrateCommandStore();

    // Mirror the existing localStorage mock-mode flag into the Rust
    // pref store on boot — covers the case where the user had mock
    // mode enabled before the Rust mirror existed.
    setMockMode(isMockMode());

    // Pause star twinkling + space-FX spawns while the window is
    // unfocused / hidden so animations don't pile up off-screen and
    // stutter the first frame after refocus.
    installWindowFocusTracker();

    // Hydrate runtime flags driven by user preferences. These map to
    // module-level toggles in their respective stores so the listeners
    // can consult them on every event without round-tripping through
    // React state.
    void getAppPreferences().then((prefs) => {
      setRuntimeOverloadPct(prefs.workloadOverloadThresholdPct);
      useAiDebugStore.getState().hydrate({
        enabled: prefs.aiDebugEnabled,
        dockMode: prefs.aiDebugDockMode,
      });
    });

    // Boot the AI traffic listener. Idempotent — it'll no-op if
    // already started (e.g. on hot-reload). When debug is off the
    // sidecar emits no events, so this is essentially free.
    void startAiDebugListener();
    // Boot the global rate-limit listener so the HeaderModelPicker's
    // bars update regardless of which workflow produced the snapshot.
    void startRateLimitListener();

    getCredentialStatus()
      .then((status) => {
        setCredStatus(status);
        setScreen(credentialStatusComplete(status) ? "landing" : "onboarding");
      })
      .catch(() => setScreen("onboarding"));
    // Pre-load the local LLM URL (so toasts can display it) and the JIRA base
    // URL (so the rich-notes editor's Cmd-click handler can build /browse/<KEY>
    // links without an async lookup on every click).
    getNonSecretConfig()
      .then((cfg) => {
        const llmUrl = cfg["local_llm_url"];
        if (llmUrl) setLocalLlmUrlCache(llmUrl);
        const jiraUrl = cfg["jira_base_url"];
        if (jiraUrl) setJiraBaseUrlCache(jiraUrl);
      })
      .catch(() => {});
  }, []);

  // Listen for `meridian:navigate` events emitted by the local control
  // server (127.0.0.1:31415, see src-tauri/src/control_server.rs). The
  // screenshot MCP tool drives navigation via that endpoint so Claude
  // Code can jump to the right screen before capturing a screenshot.
  // No-op in production builds where nothing dials the control server.
  useEffect(() => {
    let dispose: (() => void) | undefined;
    listen<string>("meridian:navigate", (event) => {
      const target = event.payload;
      if (EXTERNAL_NAV_SCREENS.has(target as Screen)) {
        setScreen(target as Screen);
      } else {
        console.warn(
          "[meridian:navigate] ignoring unknown screen id:",
          target,
        );
      }
    })
      .then((unlisten) => {
        dispose = unlisten;
      })
      .catch((err) => console.warn("[meridian:navigate] listen failed", err));
    return () => {
      dispose?.();
    };
  }, []);

  // Browser-side navigation hooks for chrome-devtools and any other
  // external script driving the app from the vite dev URL. Two surfaces:
  //   - `location.hash` — `#sprint-dashboard` lands you there on page
  //     load and on hashchange. Useful for bookmarks and reload-safe
  //     deep links.
  //   - `window.__meridianNavigate(id)` — one-shot JS hook for tools
  //     like chrome-devtools that prefer `evaluate_script` over URL
  //     mutation.
  // Both validate against the same closed enum the Tauri event listener
  // above uses. They coexist with the Tauri event without conflicting;
  // both are no-ops in the production Tauri webview unless something
  // sets the hash.
  useEffect(() => {
    const tryNav = (raw: string | undefined | null) => {
      if (!raw) return;
      const target = raw.replace(/^#\/?/, "").trim();
      if (!target) return;
      if (EXTERNAL_NAV_SCREENS.has(target as Screen)) {
        setScreen(target as Screen);
      } else {
        console.warn("[meridian:hash-nav] ignoring unknown screen id:", target);
      }
    };

    // Apply the current hash on mount (if any).
    tryNav(location.hash);

    const onHashChange = () => tryNav(location.hash);
    window.addEventListener("hashchange", onHashChange);

    type NavHook = (id: string) => void;
    (window as unknown as { __meridianNavigate?: NavHook }).__meridianNavigate =
      (id) => tryNav(id);

    return () => {
      window.removeEventListener("hashchange", onHashChange);
      delete (window as unknown as { __meridianNavigate?: NavHook })
        .__meridianNavigate;
    };
  }, []);

  const checkWorkload = useWorkloadAlertStore((s) => s.checkWorkload);
  const refreshPrTasks = usePrTasksStore((s) => s.refresh);

  useEffect(() => {
    // Poll the workload store so the Sprint Dashboard landing-card badge stays
    // fresh. Only polls when both JIRA and Bitbucket credentials are present.
    if (!credStatus || !jiraComplete(credStatus) || !bitbucketComplete(credStatus)) return;
    void checkWorkload();
    const interval = setInterval(() => void checkWorkload(), POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [credStatus, checkWorkload]);

  useEffect(() => {
    // Pull the user's Bitbucket PR-tasks into the right-hand Tasks panel.
    // Polling cadence is user-configurable (Settings → Tasks → poll
    // interval); we read it once on mount and rebuild the interval if
    // it changes. The Tasks panel triggers its own refresh on open and
    // we also refresh on window focus so freshly-returning-to-the-app
    // users don't see stale data.
    if (!credStatus || !bitbucketComplete(credStatus)) return;
    let cancelled = false;
    let interval: ReturnType<typeof setInterval> | null = null;
    const onFocus = () => void refreshPrTasks();
    void getAppPreferences().then((prefs) => {
      if (cancelled) return;
      const minutes =
        prefs.prTasksPollIntervalMinutes ||
        APP_PREFERENCE_DEFAULTS.prTasksPollIntervalMinutes;
      void refreshPrTasks();
      interval = setInterval(() => void refreshPrTasks(), minutes * 60 * 1000);
      window.addEventListener("focus", onFocus);
    });
    return () => {
      cancelled = true;
      if (interval) clearInterval(interval);
      window.removeEventListener("focus", onFocus);
    };
  }, [credStatus, refreshPrTasks]);

  const openSettings = useCallback(() => {
    if (screen === "settings") return;
    setScreenBeforeSettings(screen);
    setScreen("settings");
  }, [screen]);

  const openMeetings = useCallback(() => {
    setScreen("meetings");
  }, []);

  const openTimeTracking = useCallback(() => {
    setScreen("time-tracking");
  }, []);

  function closeSettings() {
    getCredentialStatus()
      .then((status) => {
        setCredStatus(status);
        const returnTo = screenBeforeSettings === "settings" ? "landing" : screenBeforeSettings;
        setScreen(returnTo);
      })
      .catch(() => setScreen("landing"));
  }

  function completeOnboarding() {
    // When the wizard is being shown as a developer preview from inside
    // Settings, return to whichever screen the user came from rather than
    // forcing them back to the landing card. `screenBeforeOnboardingPreview`
    // is non-null only when previewOnboarding kicked off the visit.
    const restoreTo = screenBeforeOnboardingPreview;
    getCredentialStatus()
      .then((status) => {
        setCredStatus(status);
        if (restoreTo) {
          setScreenBeforeOnboardingPreview(null);
          setScreen(restoreTo);
        } else {
          setScreen("landing");
        }
      })
      .catch(() => {
        if (restoreTo) {
          setScreenBeforeOnboardingPreview(null);
          setScreen(restoreTo);
        } else {
          setScreen("landing");
        }
      });
  }

  const previewOnboarding = useCallback(() => {
    setScreenBeforeOnboardingPreview(screen);
    setScreen("onboarding");
  }, [screen]);

  return (
    <OpenSettingsProvider openSettings={openSettings}>
     <PreviewOnboardingProvider previewOnboarding={previewOnboarding}>
     <OpenMeetingsProvider openMeetings={openMeetings}>
      <OpenTimeTrackingProvider openTimeTracking={openTimeTracking}>
      <RecordingContextTagsProvider tags={recordingContextTagsForScreen(screen)}>
      <ScreenWithTasksPanel>
      {screen === "loading" ? (
        <LoadingScreen />
      ) : screen === "onboarding" ? (
        <OnboardingScreen onComplete={completeOnboarding} />
      ) : screen === "settings" ? (
        <SettingsScreen
          onClose={closeSettings}
          onNavigate={(id) => setScreen(id as Screen)}
        />
      ) : screen === "sprint-dashboard" && credStatus ? (
        <SprintDashboardScreen credStatus={credStatus} onBack={() => setScreen("landing")} />
      ) : screen === "retrospectives" ? (
        <RetrospectivesScreen onBack={() => setScreen("landing")} />
      ) : screen === "ticket-quality" && credStatus ? (
        <GroomTicketScreen credStatus={credStatus} onBack={() => setScreen("landing")} />
      ) : screen === "review-pr" && credStatus ? (
        <PrReviewScreen credStatus={credStatus} onBack={() => setScreen("landing")} />
      ) : screen === "meetings" ? (
        <MeetingsScreen onBack={() => setScreen("landing")} />
      ) : screen === "time-tracking" ? (
        <TimeTrackingScreen onBack={() => setScreen("landing")} />
      ) : screen === "agent-skills" ? (
        <AgentSkillsScreen onBack={() => setScreen("landing")} />
      ) : screen === "command" ? (
        <CommandScreen onBack={() => setScreen("landing")} />
      ) : isWorkflowId(screen) ? (
        <WorkflowScreen workflowId={screen} onBack={() => setScreen("landing")} />
      ) : credStatus ? (
        <LandingScreen credStatus={credStatus} onNavigate={(id) => setScreen(id)} />
      ) : (
        <LoadingScreen />
      )}
      </ScreenWithTasksPanel>
      </RecordingContextTagsProvider>
      </OpenTimeTrackingProvider>
     </OpenMeetingsProvider>
     </PreviewOnboardingProvider>
    </OpenSettingsProvider>
  );
}

// Wraps the active screen and reserves space on the right for the Tasks panel
// when it's open. The panel itself is `position: fixed` so it slots in over
// that reserved column without each individual screen having to know about it.
//
// The reserved width tracks the user's chosen panelWidth — which they can
// drag-resize via the panel's left edge — so the screen content always meets
// the panel exactly at its border, no overlap and no gap.
function ScreenWithTasksPanel({ children }: { children: React.ReactNode }) {
  const open = useTasksStore((s) => s.panelOpen);
  const width = useTasksStore((s) => s.panelWidth);
  return (
    <>
      {/* `h-full` is critical: every screen uses `h-full` for its own root,
          which only resolves correctly when this wrapper has a definite
          height. Without it, `h-full` collapses to content size and screens
          like Meetings render their inner panels at content height — which
          can push the chat input below the visible window when the app is
          short. The parent (AiDebugDock children div) has the dvh-anchored
          height, so h-full propagates from there down through this wrapper
          to each screen. */}
      <div className="h-full" style={{ paddingRight: open ? width : 0 }}>
        {children}
      </div>
      <TasksPanel />
    </>
  );
}

const RECORDING_TAGS_BY_SCREEN: Partial<Record<Screen, string[]>> = {
  "sprint-dashboard": ["standup"],
  retrospectives: ["retro"],
};

function recordingContextTagsForScreen(screen: Screen): string[] {
  return RECORDING_TAGS_BY_SCREEN[screen] ?? [];
}

function GlobalBackground() {
  const [bgId, setBgId] = useState(() => getBackgroundId());
  const handleChange = useCallback((id: string) => setBgId(id), []);
  useBgChangeListener(handleChange);
  return (
    <div aria-hidden className="fixed inset-0 overflow-hidden pointer-events-none select-none">
      <BackgroundRenderer id={bgId} />
    </div>
  );
}

function GlobalForeground() {
  const [bgId, setBgId] = useState(() => getBackgroundId());
  const handleChange = useCallback((id: string) => setBgId(id), []);
  useBgChangeListener(handleChange);
  return (
    <div aria-hidden className="fixed inset-0 overflow-hidden pointer-events-none select-none z-[0]">
      <SpaceEffectsOverlay bgId={bgId} />
    </div>
  );
}

const FX_ENABLED_EVENT = "m-effects-enabled";

function GlobalFxDrawer({ hideUI, onToggleHideUI }: { hideUI: boolean; onToggleHideUI: () => void }) {
  const [open, setOpen] = useState(false);
  const [on, setOn] = useState(true);
  const [kinds, setKinds] = useState<Record<SpaceEffectKind, boolean>>(getSpaceEffectKindToggles);
  const [bhGravityOn, setBhGravityOn] = useState(() => getBhGravityEnabled());

  useEffect(() => {
    const syncEnabled = (e: Event) => setOn((e as CustomEvent<boolean>).detail);
    const syncKinds = (e: Event) =>
      setKinds({ ...(e as CustomEvent<Record<SpaceEffectKind, boolean>>).detail });
    const syncGrav = (e: Event) =>
      setBhGravityOn((e as CustomEvent<boolean>).detail);
    window.addEventListener(FX_ENABLED_EVENT, syncEnabled);
    window.addEventListener(SPACE_FX_TOGGLES_EVENT, syncKinds);
    window.addEventListener(SPACE_FX_BH_GRAVITY_EVENT, syncGrav);
    return () => {
      window.removeEventListener(FX_ENABLED_EVENT, syncEnabled);
      window.removeEventListener(SPACE_FX_TOGGLES_EVENT, syncKinds);
      window.removeEventListener(SPACE_FX_BH_GRAVITY_EVENT, syncGrav);
    };
  }, []);

  function toggle() {
    const next = !on;
    setOn(next);
    setEffectsEnabled(next);
  }

  const spawnRows: { kind: SpaceEffectKind; icon: string; label: string; fn: () => void }[] = [
    { kind: "shootingStars", icon: "✦", label: "shooting star", fn: fireShootingStar },
    { kind: "comets", icon: "☄", label: "comet", fn: fireComet },
    { kind: "meteors", icon: "⁂", label: "meteor shower", fn: fireMeteorShower },
    { kind: "blackHole", icon: "◉", label: "black hole", fn: fireBlackHole },
    { kind: "pulsars", icon: "※", label: "supernova", fn: firePulsar },
    { kind: "wormholes", icon: "⊕", label: "wormhole", fn: fireWormhole },
  ];

  const chk =
    "h-3.5 w-3.5 shrink-0 rounded border border-white/25 bg-black/50 accent-zinc-500 focus:ring-1 focus:ring-white/20 focus:ring-offset-0";

  const gravityFootnote =
    "When on, comets, stars, and other effects drift toward an active black hole. The hole still appears if enabled above; this only toggles the pull.";

  return (
    <div
      className="pointer-events-none fixed left-1/2 z-50 flex -translate-x-1/2 flex-col items-center"
      style={{ bottom: "var(--ai-debug-dock-bottom, 0px)" }}
    >
      {/* fx tab — sits at the TOP of the column. Container is anchored
          at bottom-0; when the drawer below grows, the container's top
          edge (and so the tab) moves up like a pull-tab. The drawer
          fills the new space *below* the tab, all the way down to the
          screen bottom. */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls="fx-drawer-panel"
        className="pointer-events-auto -mb-px z-10 flex h-7 w-14 shrink-0 select-none items-center justify-center gap-1 rounded-t-md border border-b-0 border-white/12 bg-black/55 text-[10px] text-white/50 shadow-lg shadow-black/30 backdrop-blur-md hover:bg-black/70 hover:text-white/80"
      >
        <span>fx</span>
        <span
          className="inline-block transition-transform"
          style={{
            transform: open ? "rotate(180deg)" : "rotate(0deg)",
            transitionDuration: "200ms",
          }}
        >
          ▲
        </span>
      </button>
      {/* Drawer fills downward from below the tab to the screen edge.
          Animated to/from auto height via the grid-template-rows trick
          (0fr ↔ 1fr). When the drawer expands, its parent flex column
          grows upward from bottom-0, which pulls the tab up with it. */}
      <div
        className="grid w-max max-w-[92vw] overflow-hidden transition-[grid-template-rows]"
        style={{
          gridTemplateRows: open ? "1fr" : "0fr",
          transitionDuration: "280ms",
          transitionTimingFunction: "cubic-bezier(0.4,0,0.2,1)",
        }}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="pointer-events-auto w-max max-w-[92vw] rounded-t-md border border-b-0 border-white/12 bg-black/50 px-2 py-2 backdrop-blur-md sm:px-3">
          <div
            id="fx-drawer-panel"
            aria-hidden={!open}
            className="flex max-w-full flex-nowrap items-center gap-x-1.5 overflow-x-auto overflow-y-hidden [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            role="group"
            aria-label="Space effects"
          >
            <button
              type="button"
              onClick={toggle}
              className={`shrink-0 rounded-full border px-2.5 py-1 text-xs transition-colors ${
                on
                  ? "bg-white/20 border-white/35 text-white/90 hover:bg-white/30"
                  : "bg-white/5 border-white/15 text-white/40 hover:bg-white/10"
              }`}
            >
              {on ? "⬤ on" : "○ off"}
            </button>
            <button
              type="button"
              onClick={clearAllEffects}
              className="shrink-0 rounded-full border border-red-400/30 bg-red-500/20 px-2.5 py-1 text-xs text-red-300/80 transition-colors hover:bg-red-500/30"
            >
              ✕ clear
            </button>
            <div className="h-5 w-px shrink-0 bg-white/15" />
            <button
              type="button"
              onClick={onToggleHideUI}
              className={`shrink-0 rounded-full border px-2.5 py-1 text-xs transition-colors ${
                hideUI
                  ? "bg-white/20 border-white/35 text-white/90 hover:bg-white/30"
                  : "bg-white/5 border-white/15 text-white/50 hover:bg-white/10"
              }`}
            >
              {hideUI ? "◨ show ui" : "◧ hide ui"}
            </button>
            <div className="h-5 w-px shrink-0 bg-white/15" />
            <label
              className="flex shrink-0 cursor-pointer items-center gap-1.5 rounded-md py-0.5 hover:bg-white/[0.04]"
              title={gravityFootnote}
            >
              <input
                type="checkbox"
                checked={bhGravityOn}
                onChange={() => toggleBhGravityEnabled()}
                className={chk}
                aria-label="gravity"
                aria-describedby="fx-gravity-footnote"
              />
              <span id="fx-gravity-footnote" className="sr-only">
                {gravityFootnote}
              </span>
              <span className="whitespace-nowrap text-xs font-medium text-white/80">gravity</span>
            </label>
            <div className="h-5 w-px shrink-0 bg-white/15" />
            {spawnRows.map(({ kind, icon, label, fn }) => {
              const enabledKind = kinds[kind];
              const canSpawn = on && enabledKind;
              return (
                <div key={label} className="inline-flex shrink-0 items-center gap-1">
                  <input
                    type="checkbox"
                    checked={enabledKind}
                    onChange={() => toggleSpaceEffectKind(kind)}
                    className={chk}
                    title={enabledKind ? `disable ${label}` : `enable ${label}`}
                    aria-label={enabledKind ? `Disable ${label}` : `Enable ${label}`}
                  />
                  <button
                    type="button"
                    disabled={!canSpawn}
                    onClick={fn}
                    title={`spawn ${label}`}
                    className={`whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] transition-colors ${
                      canSpawn
                        ? "border-white/20 bg-white/10 text-white/70 hover:bg-white/20"
                        : "cursor-not-allowed border-white/10 bg-white/[0.04] text-white/25"
                    }`}
                  >
                    {icon} {label}
                  </button>
                </div>
              );
            })}
          </div>
          </div>
        </div>
      </div>
    </div>
  );
}


function AiDebugWindowRoot() {
  // Popped-out debug window: subscribes to the same Tauri event
  // channel and renders only the panel. The dock-mode picker is shown
  // here so the user can re-dock to bottom/right/left or hide without
  // going back to the main window. Because each webview owns its own
  // zustand store, the picker can't just call `setDockMode` directly —
  // it emits a Tauri event the main window listens for, which then
  // updates the canonical store and closes this popped-out window via
  // the existing useEffect in `AiDebugDock`.
  useEffect(() => {
    void getAppPreferences().then((prefs) => {
      useAiDebugStore.getState().hydrate({
        enabled: prefs.aiDebugEnabled,
        dockMode: prefs.aiDebugDockMode,
      });
    });
    void startAiDebugListener();
    void startRateLimitListener();
  }, []);
  const dockMode = useAiDebugStore((s) => s.dockMode);
  async function requestDockMode(mode: AiDebugDockMode) {
    await emit(AI_DEBUG_SET_DOCK_MODE_EVENT, mode);
  }
  return (
    <ThemeProvider>
      <div className="h-screen w-screen overflow-hidden bg-background">
        <AiDebugPanel
          onClose={() => void requestDockMode("hidden")}
          controls={<DockModePicker mode={dockMode} setMode={requestDockMode} />}
        />
      </div>
    </ThemeProvider>
  );
}

export default function Root() {
  const [hideUI, setHideUI] = useState(false);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.metaKey && e.key === "r") {
        e.preventDefault();
        window.location.reload();
        return;
      }
      if (e.key === "Escape") {
        // Defer to local Escape handlers when the user is editing text
        // or interacting with a modal/popover. Those have their own
        // Escape semantics (close popover, exit search, dismiss dialog)
        // and stealing the keystroke from them would be more annoying
        // than the cancel shortcut is useful.
        const t = e.target as HTMLElement | null;
        if (
          t &&
          (t.tagName === "INPUT" ||
            t.tagName === "TEXTAREA" ||
            t.tagName === "SELECT" ||
            t.isContentEditable)
        ) {
          return;
        }
        // Radix dialogs / dropdowns / popovers / tooltips all portal
        // into body and carry these data attributes in their open state.
        // If any are present, leave Escape for them.
        if (
          document.querySelector('[role="dialog"][data-state="open"]') ||
          document.querySelector('[data-radix-popper-content-wrapper]')
        ) {
          return;
        }
        if (cancelAllAgents()) {
          e.preventDefault();
          toast.info("AI agent cancelled");
        }
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  if (isAiDebugWindow()) return <AiDebugWindowRoot />;

  return (
    <ThemeProvider>
      <TooltipProvider delayDuration={300}>
        <GlobalBackground />
        <div
          className="relative z-[1] transition-opacity duration-300"
          style={{ opacity: hideUI ? 0 : 1, pointerEvents: hideUI ? "none" : undefined }}
        >
          <AiDebugDock>
            <AppInner />
          </AiDebugDock>
        </div>
        <GlobalForeground />
        <GlobalFxDrawer hideUI={hideUI} onToggleHideUI={() => setHideUI(h => !h)} />
        <Toaster
          position="top-right"
          theme="dark"
          richColors
          closeButton
          // Inset by the AI-debug dock CSS vars so toasts clear a right
          // or bottom dock instead of stacking on top of it. 24px is
          // sonner's own default viewport gap — we add the dock size to
          // it via calc().
          offset={{
            top: "24px",
            right: "calc(var(--ai-debug-dock-right, 0px) + 24px)",
            bottom: "calc(var(--ai-debug-dock-bottom, 0px) + 24px)",
            left: "calc(var(--ai-debug-dock-left, 0px) + 24px)",
          }}
          toastOptions={{
            style: { fontFamily: "inherit" },
          }}
        />
      </TooltipProvider>
    </ThemeProvider>
  );
}
