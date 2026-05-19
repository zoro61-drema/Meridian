import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { getPreferences, setPreference } from "@/lib/preferences";
import {
  downloadWhisperModel,
  listWhisperModels,
  recommendWhisperModel,
  type WhisperModelStatus,
} from "@/lib/tauri/meetings";
import { useMeetingsStore } from "@/stores/meetings/store";
import { useTimeTrackingStore } from "@/stores/timeTrackingStore";
import { ArrowRight, ChevronLeft, Clock, Loader2, Mic } from "lucide-react";
import { useEffect, useState } from "react";
import { TOTAL_STEPS } from "./_shared";

const WHISPER_MODEL_META: Record<
  string,
  { sizeHuman: string; note: string }
> = {
  "tiny.en": { sizeHuman: "~75 MB", note: "Fastest, lowest accuracy" },
  "base.en": { sizeHuman: "~140 MB", note: "Balanced speed and accuracy" },
  "small.en": { sizeHuman: "~470 MB", note: "Better accuracy" },
  "medium.en": { sizeHuman: "~1.5 GB", note: "Best accuracy, slow on CPU" },
};
const WHISPER_MODEL_ORDER = ["tiny.en", "base.en", "small.en", "medium.en"];
const WHISPER_PREF_KEY = "meeting_whisper_model";

function formatGigabytes(bytes: number): string {
  if (!bytes) return "";
  return `${(bytes / 1024 / 1024 / 1024).toFixed(0)} GB`;
}

export function FeaturesStep({
  onNext,
  onBack,
  stepNum,
}: {
  onNext: () => void;
  onBack: () => void;
  stepNum: number;
}) {
  // Mirror the persisted state so the user can come back to this step
  // without losing prior selections.
  const trackingEnabled = useTimeTrackingStore(
    (s) => s.settings.trackingEnabled,
  );
  const setTrackingEnabled = useTimeTrackingStore((s) => s.setTrackingEnabled);
  const transcriptionDisabled = useMeetingsStore(
    (s) => s.transcriptionDisabled,
  );
  const setTranscriptionDisabled = useMeetingsStore(
    (s) => s.setTranscriptionDisabled,
  );

  const transcriptionEnabled = !transcriptionDisabled;

  const [whisperModel, setWhisperModel] = useState<string>("base.en");
  const [recommendedModel, setRecommendedModel] = useState<string | null>(null);
  const [totalRamBytes, setTotalRamBytes] = useState<number>(0);
  const [models, setModels] = useState<WhisperModelStatus[]>([]);
  const [finishing, setFinishing] = useState(false);

  // Resolve the hardware-aware suggestion + the user's prior selection on
  // mount. Prior selection wins if present — the user already made a call.
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      recommendWhisperModel().catch(() => null),
      listWhisperModels().catch(() => [] as WhisperModelStatus[]),
      getPreferences().catch(() => ({}) as Record<string, string>),
    ]).then(([rec, list, prefs]) => {
      if (cancelled) return;
      if (rec) {
        setRecommendedModel(rec.recommended);
        setTotalRamBytes(rec.totalRamBytes);
      }
      setModels(list);
      // Persisted selection wins over the hardware suggestion — the user
      // already made a call. Otherwise fall back to the recommendation,
      // and finally to the static default.
      const prior = prefs[WHISPER_PREF_KEY];
      if (prior && WHISPER_MODEL_ORDER.includes(prior)) {
        setWhisperModel(prior);
      } else if (rec?.recommended) {
        setWhisperModel(rec.recommended);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleFinish() {
    setFinishing(true);
    try {
      if (transcriptionEnabled) {
        await setPreference(WHISPER_PREF_KEY, whisperModel);
        // Kick off the model download in the background — do not await.
        // The Meetings screen reads progress from the same event channel
        // when the user opens it. Errors here are non-fatal: the user can
        // retry from Settings → Meetings.
        const alreadyDownloaded = models.find(
          (m) => m.id === whisperModel,
        )?.downloaded;
        if (!alreadyDownloaded) {
          void downloadWhisperModel(whisperModel).catch(() => {
            // Swallow — surfaced on the Meetings screen if it matters.
          });
        }
      }
    } finally {
      setFinishing(false);
      onNext();
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs font-medium text-muted-foreground mb-3">
          Step {stepNum} of {TOTAL_STEPS}
        </p>
        <h2 className="text-xl font-semibold">Features</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Pick the side-tools you want active. You can change these any time
          from Settings.
        </p>
      </div>

      <div className="space-y-3">
        <FeatureRow
          icon={<Clock className="h-4 w-4" />}
          id="onb-feat-time"
          title="Time tracking"
          description="Automatic work-hours tracker — pauses on screen lock or idle, banks overtime for later in the week."
          checked={trackingEnabled}
          onToggle={setTrackingEnabled}
        />
        <FeatureRow
          icon={<Mic className="h-4 w-4" />}
          id="onb-feat-transcribe"
          title="Meeting transcription"
          description="Record meetings locally with whisper.cpp. Off means the Meetings workflow keeps freeform notes only — no audio capture."
          checked={transcriptionEnabled}
          onToggle={(checked) => setTranscriptionDisabled(!checked)}
        />

        {transcriptionEnabled && (
          <div className="rounded-lg border border-primary/15 bg-card/40 p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="onb-whisper-model" className="font-normal">
                Whisper model
              </Label>
              {totalRamBytes > 0 && (
                <span className="text-[10px] text-muted-foreground">
                  Detected {formatGigabytes(totalRamBytes)} RAM
                </span>
              )}
            </div>
            <select
              id="onb-whisper-model"
              value={whisperModel}
              onChange={(e) => setWhisperModel(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
            >
              {WHISPER_MODEL_ORDER.map((id) => {
                const meta = WHISPER_MODEL_META[id];
                const isRecommended = id === recommendedModel;
                return (
                  <option key={id} value={id}>
                    {id} — {meta.sizeHuman} · {meta.note}
                    {isRecommended ? "  (recommended for this Mac)" : ""}
                  </option>
                );
              })}
            </select>
            <p className="text-[11px] text-muted-foreground">
              Selected model downloads in the background after you finish setup.
            </p>
          </div>
        )}
      </div>

      <div className="flex gap-2">
        <Button variant="ghost" onClick={onBack} className="gap-1">
          <ChevronLeft className="h-4 w-4" /> Back
        </Button>
        <Button className="flex-1" onClick={handleFinish} disabled={finishing}>
          {finishing ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> Finishing…
            </>
          ) : (
            <>
              Finish setup <ArrowRight className="h-4 w-4" />
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

function FeatureRow({
  icon,
  id,
  title,
  description,
  checked,
  onToggle,
}: {
  icon: React.ReactNode;
  id: string;
  title: string;
  description: string;
  checked: boolean;
  onToggle: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-primary/15 bg-card/40 p-3">
      <span className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <Label htmlFor={id} className="text-sm font-medium cursor-pointer">
          {title}
        </Label>
        <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onToggle} />
    </div>
  );
}
