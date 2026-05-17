/* engineer-app.jsx — Engineer animation showcase (Variant C: Repair specialist) */

const { useState, useMemo } = React;

const ACCENT_ORDER = ["slate", "blue", "violet", "green", "orange", "rose"];

const BACKGROUNDS = {
  black:    { id: "black",    label: "Black",                  css: "#000000" },
  deep:     { id: "deep",     label: "Deep blue #0a1628",      css: "#0a1628" },
  badlands: { id: "badlands", label: "Badlands terrain",       css: "url(#badlands-tile)" },
};

function BadlandsDefs() {
  const tile = useMemo(() => {
    function hash(x, y) {
      let h = x * 374761393 + y * 668265263;
      h = (h ^ (h >>> 13)) * 1274126177;
      return ((h ^ (h >>> 16)) >>> 0) / 0xffffffff;
    }
    const palette = ["#3b2f25", "#4a3a2c", "#5a4838", "#6b5645", "#7d6753", "#876d5a", "#947561"];
    const rects = [];
    for (let y = 0; y < 32; y++) {
      for (let x = 0; x < 32; x++) {
        const n = hash(x, y);
        const cluster = hash(Math.floor(x / 3), Math.floor(y / 3));
        const idx = Math.min(palette.length - 1, Math.floor((n * 0.5 + cluster * 0.5) * palette.length));
        rects.push({ x, y, fill: palette[idx] });
      }
    }
    for (let i = 0; i < 18; i++) {
      const x = Math.floor(hash(i, 99) * 32);
      const y = Math.floor(hash(99, i) * 32);
      rects.push({ x, y, fill: "#2c2218" });
    }
    return rects;
  }, []);
  return (
    <svg width="0" height="0" style={{ position: "absolute" }}>
      <defs>
        <pattern id="badlands-tile" width="32" height="32" patternUnits="userSpaceOnUse">
          {tile.map((r, i) => (
            <rect key={i} x={r.x} y={r.y} width="1" height="1" fill={r.fill} />
          ))}
        </pattern>
      </defs>
    </svg>
  );
}

function Stage({ unit, accent, bg, state, transient, size = 192, replayKey }) {
  const Component = unit === "marine" ? Marine : Engineer;
  return (
    <div
      style={{
        position: "relative",
        width: size,
        height: size,
        background: bg === "badlands" ? "#3b2f25" : BACKGROUNDS[bg].css,
        overflow: "hidden",
        borderRadius: 2,
      }}
    >
      {bg === "badlands" && (
        <svg
          width={size}
          height={size}
          viewBox="0 0 48 48"
          preserveAspectRatio="none"
          shapeRendering="crispEdges"
          style={{ position: "absolute", inset: 0, imageRendering: "pixelated" }}
        >
          <rect x="0" y="0" width="48" height="48" fill="url(#badlands-tile)" />
        </svg>
      )}
      <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center" }}>
        <Component
          key={replayKey}
          state={state}
          transient={transient}
          accent={accent}
          size={size}
        />
      </div>
    </div>
  );
}

const STATES = [
  { id: "idle",                 label: "idle",                 hint: "Body sways L/R; claws sway with phase lag — loose mechanical articulation." },
  { id: "thinking",             label: "thinking",             hint: "Head tilts; right claw bends inward toward the helmet, left claw twitches." },
  { id: "tool_running",         label: "tool_running",         hint: "Both claws extend forward to meet — welding sparks pulse at the meeting point." },
  { id: "streaming",            label: "streaming",            hint: "Speech bubble + dots; claws gesticulate out of phase. Hand-talk chatter." },
  { id: "awaiting_permission",  label: "awaiting_permission",  hint: "Patient jump; both claws raise overhead to wave; ? glyph holds." },
  { id: "done",                 label: "done",                 hint: "Brief snap-up — body squares, claws retract to neutral. One-shot." },
  { id: "error",                label: "error",                hint: "Body tilts; claws droop forward limp; visor dims and flashes red." },
];

const TRANSIENTS = [
  { id: "spawning",   label: "spawning",   hint: "Three concentric teleport rings collapse inward; unit fades in beneath the flash." },
  { id: "deploying",  label: "deploying",  hint: "Right claw dips to slap a deploy kit at the side; accent spark bursts at the kit." },
];

function PersistentCard({ st, accent, bg }) {
  return (
    <div className="card">
      <div className="cardHead">
        <span className="cardLabel mono"><b>{st.label}</b></span>
      </div>
      <p className="cardSub">{st.hint}</p>
      <div className="stage">
        <Stage unit="engineer" accent={accent} bg={bg} state={st.id} size={192} />
      </div>
    </div>
  );
}

function TransientCard({ tr, accent, bg }) {
  const [n, setN] = useState(0);
  return (
    <div className="card">
      <div className="cardHead">
        <span className="cardLabel mono"><b>{tr.label}</b></span>
        <span style={{ color: "var(--muted)", fontSize: 11 }}>· transient</span>
      </div>
      <p className="cardSub">{tr.hint}</p>
      <div className="stage">
        <Stage unit="engineer" accent={accent} bg={bg} state="idle" transient={tr.id} size={192} replayKey={n} />
      </div>
      <div style={{ marginTop: 10 }}>
        <button
          onClick={() => setN((x) => x + 1)}
          style={{
            background: "#1a2230", border: "1px solid #2a3340", color: "#d6dde6",
            padding: "6px 14px", borderRadius: 4, cursor: "pointer",
            fontFamily: "inherit", fontSize: 11, letterSpacing: "0.05em", textTransform: "uppercase",
          }}
        >
          ▶ Replay
        </button>
      </div>
    </div>
  );
}

function FamilyCheckCard({ accent, bg }) {
  // Engineer next to Marine — both idle — to verify same-army read.
  return (
    <div className="card" style={{ gridColumn: "1 / -1" }}>
      <div className="cardHead">
        <span className="cardLabel mono"><b>family check</b></span>
        <span style={{ color: "var(--muted)", fontSize: 11 }}>
          · Marine + Engineer side by side, both idle. Same studio, same army?
        </span>
      </div>
      <div className="stage" style={{ padding: 28 }}>
        <div style={{ display: "flex", gap: 36, alignItems: "flex-end", justifyContent: "center" }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
            <Stage unit="marine" accent={accent} bg={bg} state="idle" size={192} />
            <span className="mono" style={{ color: "var(--muted)", fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase" }}>Marine · idle</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
            <Stage unit="engineer" accent={accent} bg={bg} state="idle" size={192} />
            <span className="mono" style={{ color: "var(--muted)", fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase" }}>Engineer · idle</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
            <div style={{ display: "flex", gap: 4, alignItems: "flex-end" }}>
              <Stage unit="marine" accent={accent} bg={bg} state="idle" size={96} />
              <Stage unit="engineer" accent={accent} bg={bg} state="idle" size={96} />
            </div>
            <span className="mono" style={{ color: "var(--muted)", fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase" }}>Native 48× scale 2 · field read</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function App() {
  const [accent, setAccent] = useState("blue");
  const [bg, setBg] = useState("deep");

  return (
    <div>
      <BadlandsDefs />

      <div className="toolbar">
        <div className="toolGroup">
          <span className="label">Accent</span>
          <div className="accentRow">
            {ACCENT_ORDER.map((a) => (
              <button
                key={a}
                className={"swatch" + (accent === a ? " active" : "")}
                onClick={() => setAccent(a)}
                title={a}
                style={{ background: window.ACCENTS[a] }}
              >
                <span>{a}</span>
              </button>
            ))}
          </div>
        </div>

        <div style={{ width: 1, height: 28, background: "var(--border-2)" }}></div>

        <div className="toolGroup">
          <span className="label">Background</span>
          <div className="bgRow">
            {Object.values(BACKGROUNDS).map((b) => (
              <button
                key={b.id}
                className={"bgBtn" + (bg === b.id ? " active" : "")}
                onClick={() => setBg(b.id)}
                title={b.label}
                style={{
                  background:
                    b.id === "black" ? "#000" :
                    b.id === "deep"  ? "#0a1628" :
                    "linear-gradient(135deg, #6b5645 0%, #4a3a2c 50%, #3b2f25 100%)",
                }}
              />
            ))}
          </div>
        </div>
      </div>

      <h2 className="sectionLabel">Persistent states</h2>
      <div className="grid" style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
        {STATES.map((st) => (
          <PersistentCard key={st.id} st={st} accent={accent} bg={bg} />
        ))}
      </div>

      <h2 className="sectionLabel" style={{ marginTop: 32 }}>Transients (one-shot)</h2>
      <div className="grid" style={{ gridTemplateColumns: "repeat(2, minmax(0, 360px))" }}>
        {TRANSIENTS.map((tr) => (
          <TransientCard key={tr.id} tr={tr} accent={accent} bg={bg} />
        ))}
      </div>

      <h2 className="sectionLabel" style={{ marginTop: 32 }}>Family check vs. Marine</h2>
      <div className="grid" style={{ gridTemplateColumns: "1fr" }}>
        <FamilyCheckCard accent={accent} bg={bg} />
      </div>

      <div className="footer">
        <div className="notes">
          <h3>What this is</h3>
          <p>
            Variant C (Repair specialist) Engineer, all nine animations. Shipped at
            <code> src/lib/commandSprites/Engineer.tsx</code>. Native 48×48, rendered at 4× here.
            Accent tints visor + claw pincer tips + both shoulder lights + chest stripe + belt buckle.
          </p>
          <h3>Family inheritance from the Marine</h3>
          <ul>
            <li>Same 5-tone armor ramp (Steel default), same dark <code>#06080b</code> outline pass.</li>
            <li>Same gunmetal tool palette; backpack and claws use the gun ramp (g/G/M/m).</li>
            <li>Same shadow ellipse (slightly wider here because the Engineer's backpack flares wider).</li>
            <li>Same speech-bubble + "?" glyph + flashing-visor vocabulary for streaming / awaiting / error.</li>
            <li>Accent rides team-color zones only — never tints the body.</li>
            <li>Respects <code>prefers-reduced-motion</code> — animations freeze, state still readable.</li>
          </ul>
          <h3>Engineer-specific motion vocabulary</h3>
          <ul>
            <li><b>idle</b>: claws lag the body by ~12.5% of the cycle. Reads as loose mechanical arms tracking inertia.</li>
            <li><b>tool_running</b>: instead of the Marine's rifle/laser pose, both claws meet at a weld point. Sparks alternate frames A/B at 360ms steps — that's the snappy frame-flip the brief calls for (§6.3).</li>
            <li><b>spawning</b>: teleport flash (three concentric rings collapsing inward), matching the §6.8 brief note for the Engineer specifically.</li>
            <li><b>deploying</b>: gesture goes OUT to the side (toward where the subagent appears), distinct from the inward-facing tool_running gesture (§6.8 conflation guardrail).</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
