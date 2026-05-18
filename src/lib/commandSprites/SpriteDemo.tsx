// Browser demo for the commandSprites library. Renders every unit in
// every persistent state and every facing direction, plus a row for
// transient one-shots, an isMoving toggle row, and the SpawnDropship
// preview. Reach it at `#command-sprites-demo` (via the hash-nav
// hook in App.tsx).
//
// This is a developer aid, not a shipping screen — it's small enough
// to live in the library folder rather than in src/screens/.

import { useState } from "react";

import { Engineer } from "./Engineer";
import { FieldTech } from "./FieldTech";
import { LightWalker } from "./LightWalker";
import { Marine } from "./Marine";
import { SiegeWalker } from "./SiegeWalker";
import { SpawnDropship } from "./SpawnDropship";
import type {
  AgentState,
  Facing,
  TransientAnimation,
  UnitProps,
} from "./types";

const FACINGS: Facing[] = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
const STATES: AgentState[] = [
  "idle",
  "thinking",
  "tool_running",
  "streaming",
  "awaiting_permission",
  "done",
  "error",
];
const TRANSIENTS: TransientAnimation[] = ["spawning", "deploying"];

const UNITS: Array<{
  name: string;
  Component: React.FC<UnitProps>;
}> = [
  { name: "Marine", Component: Marine },
  { name: "Engineer", Component: Engineer },
  { name: "Medic", Component: FieldTech },
  { name: "Light Walker", Component: LightWalker },
  { name: "Siege Walker", Component: SiegeWalker },
];

const SIZE = 96;

interface UnitTransientStatus {
  unit: string;
  fired: number;
}

export function SpriteDemo() {
  const [facing, setFacing] = useState<Facing>("S");
  const [transientUnit, setTransientUnit] = useState<{
    unit: string;
    anim: TransientAnimation;
  } | null>(null);
  const [transientStatus, setTransientStatus] = useState<UnitTransientStatus[]>(
    [],
  );
  const [moving, setMoving] = useState<Record<string, boolean>>({});

  const triggerTransient = (unit: string, anim: TransientAnimation) => {
    setTransientUnit({ unit, anim });
  };

  const onTransientComplete = (unit: string) => () => {
    setTransientStatus((prev) => {
      const existing = prev.find((p) => p.unit === unit);
      if (existing) {
        return prev.map((p) =>
          p.unit === unit ? { ...p, fired: p.fired + 1 } : p,
        );
      }
      return [...prev, { unit, fired: 1 }];
    });
    setTransientUnit(null);
  };

  return (
    <div className="min-h-screen bg-zinc-950 p-6 text-zinc-100">
      <h1 className="mb-4 text-lg font-semibold">Command sprite demo</h1>

      <div className="mb-6 flex items-center gap-3 text-sm">
        <span className="text-zinc-400">Facing:</span>
        {FACINGS.map((f) => (
          <button
            type="button"
            key={f}
            onClick={() => setFacing(f)}
            className={`rounded border px-2 py-1 font-mono text-xs ${
              facing === f
                ? "border-amber-400 bg-amber-950/40 text-amber-200"
                : "border-zinc-700 bg-zinc-900 text-zinc-300 hover:border-zinc-500"
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      <section className="mb-8">
        <h2 className="mb-2 text-sm uppercase tracking-wide text-zinc-400">
          Persistent states × units (facing {facing})
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr>
                <th className="border border-zinc-800 bg-zinc-900 p-2 text-left">
                  Unit
                </th>
                {STATES.map((s) => (
                  <th
                    key={s}
                    className="border border-zinc-800 bg-zinc-900 p-2 font-mono text-[10px]"
                  >
                    {s}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {UNITS.map(({ name, Component }) => (
                <tr key={name}>
                  <th className="border border-zinc-800 bg-zinc-900 p-2 text-left">
                    {name}
                  </th>
                  {STATES.map((s) => (
                    <td
                      key={s}
                      className="border border-zinc-800 p-2 text-center"
                    >
                      <div
                        className="mx-auto"
                        style={{ width: SIZE, height: SIZE }}
                      >
                        <Component
                          state={s}
                          facing={facing}
                          size={SIZE}
                        />
                      </div>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mb-8">
        <h2 className="mb-2 text-sm uppercase tracking-wide text-zinc-400">
          Transient one-shots
        </h2>
        <p className="mb-2 text-xs text-zinc-500">
          Click a button to play once. `onTransientComplete` increments the
          fire counter — it must fire exactly once per click.
        </p>
        <div className="grid grid-cols-5 gap-3">
          {UNITS.map(({ name, Component }) => {
            const active =
              transientUnit?.unit === name ? transientUnit.anim : undefined;
            const fired =
              transientStatus.find((p) => p.unit === name)?.fired ?? 0;
            return (
              <div
                key={name}
                className="rounded border border-zinc-800 bg-zinc-900/60 p-3"
              >
                <div className="mb-2 text-xs font-semibold">{name}</div>
                <div
                  className="mx-auto mb-2"
                  style={{ width: SIZE, height: SIZE }}
                >
                  <Component
                    state="idle"
                    transient={active}
                    facing={facing}
                    size={SIZE}
                    onTransientComplete={onTransientComplete(name)}
                  />
                </div>
                <div className="flex gap-1">
                  {TRANSIENTS.map((t) => (
                    <button
                      type="button"
                      key={t}
                      onClick={() => triggerTransient(name, t)}
                      className="rounded border border-zinc-700 bg-zinc-950 px-2 py-1 font-mono text-[10px] hover:border-amber-500"
                    >
                      {t}
                    </button>
                  ))}
                </div>
                <div className="mt-2 font-mono text-[10px] text-zinc-500">
                  fired: {fired}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="mb-8">
        <h2 className="mb-2 text-sm uppercase tracking-wide text-zinc-400">
          isMoving toggle (walk animation)
        </h2>
        <div className="grid grid-cols-5 gap-3">
          {UNITS.map(({ name, Component }) => (
            <div
              key={name}
              className="rounded border border-zinc-800 bg-zinc-900/60 p-3"
            >
              <div className="mb-2 text-xs font-semibold">{name}</div>
              <div
                className="mx-auto mb-2"
                style={{ width: SIZE, height: SIZE }}
              >
                <Component
                  state="idle"
                  isMoving={moving[name] ?? false}
                  facing={facing}
                  size={SIZE}
                />
              </div>
              <button
                type="button"
                onClick={() =>
                  setMoving((m) => ({ ...m, [name]: !m[name] }))
                }
                className={`w-full rounded border px-2 py-1 font-mono text-[10px] ${
                  moving[name]
                    ? "border-emerald-500 bg-emerald-950/40 text-emerald-200"
                    : "border-zinc-700 bg-zinc-950 hover:border-emerald-500"
                }`}
              >
                {moving[name] ? "walking" : "idle"}
              </button>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-sm uppercase tracking-wide text-zinc-400">
          SpawnDropship (static, all facings)
        </h2>
        <div className="flex flex-wrap gap-4">
          {FACINGS.map((f) => (
            <div
              key={f}
              className="rounded border border-zinc-800 bg-zinc-900/60 p-3 text-center"
            >
              <div className="mb-1 font-mono text-[10px] text-zinc-500">
                {f}
              </div>
              <SpawnDropship facing={f} />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
