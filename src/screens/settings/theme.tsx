import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import { BACKGROUNDS, CATEGORY_LABELS, getBackgroundId, setBackgroundId, type BgCategory } from "@/lib/backgrounds/_registry";
import { ACCENT_LABELS, ACCENT_SWATCH, type AccentColor } from "@/lib/theme";
import { useTheme } from "@/providers/ThemeProvider";
import { useState } from "react";
import { BgThumbnail } from "./_shared";

const ACCENTS: AccentColor[] = [
  "slate",
  "blue",
  "violet",
  "green",
  "orange",
  "rose",
];

const BG_CATEGORIES: BgCategory[] = [
  "space",
  "meridian",
  "jwst",
  "abstract",
  "patterns",
  "minimal",
];

export function ThemeSection() {
  const { config, setAccent } = useTheme();
  const [selectedBg, setSelectedBg] = useState(() => getBackgroundId());

  function pickBackground(id: string) {
    setSelectedBg(id);
    setBackgroundId(id);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Appearance</CardTitle>
        <CardDescription>
          Choose your accent colour and background.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Accent */}
        <div className="space-y-2">
          <p className="text-sm font-medium">Accent colour</p>
          <div className="flex flex-wrap gap-2">
            {ACCENTS.map((accent) => (
              <button
                key={accent}
                onClick={() => setAccent(accent)}
                title={ACCENT_LABELS[accent]}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-md border text-sm transition-colors ${
                  config.accent === accent
                    ? "border-primary ring-2 ring-primary ring-offset-2 font-medium"
                    : "border-border hover:bg-muted"
                }`}
              >
                <span
                  className="w-3.5 h-3.5 rounded-full shrink-0"
                  style={{ background: ACCENT_SWATCH[accent] }}
                />
                {ACCENT_LABELS[accent]}
              </button>
            ))}
          </div>
        </div>

        {/* Background */}
        <div className="space-y-3">
          <p className="text-sm font-medium">Background</p>
          {BG_CATEGORIES.map((cat) => {
            const bgs = BACKGROUNDS.filter((b) => b.category === cat);
            return (
              <div key={cat}>
                <p className="text-xs text-muted-foreground mb-2">
                  {CATEGORY_LABELS[cat]}
                </p>
                <div className="flex flex-wrap gap-2">
                  {bgs.map((bg) => (
                    <button
                      key={bg.id}
                      onClick={() => pickBackground(bg.id)}
                      title={bg.name}
                      className={`relative rounded-md border overflow-hidden transition-all ${
                        selectedBg === bg.id
                          ? "border-primary ring-2 ring-primary ring-offset-2"
                          : "border-border hover:border-primary/50"
                      }`}
                      style={{ width: 88, height: 56 }}
                    >
                      {/* Thumbnail — mini render of the background */}
                      <div className="absolute inset-0 bg-background" />
                      <div className="absolute inset-0">
                        <BgThumbnail id={bg.id} />
                      </div>
                      {/* Label overlay */}
                      <div className="absolute bottom-0 inset-x-0 bg-background/80 backdrop-blur-sm px-1 py-0.5">
                        <p className="text-[10px] text-center font-medium leading-tight truncate">
                          {bg.name}
                        </p>
                      </div>
                      {selectedBg === bg.id && (
                        <div className="absolute top-1 right-1 w-3 h-3 rounded-full bg-primary" />
                      )}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

      </CardContent>
    </Card>
  );
}
