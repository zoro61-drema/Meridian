/* field-tech-app.jsx — Field Tech animation showcase (Variant C: Forward observer) */

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
  const Component =
    unit === "marine" ? Marine :
    unit === "engineer" ? Engineer :
    FieldTech;
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
  { id: "idle",                label: "idle",                hint: "Upper body sways L/R 1 px (legs + boots stay planted, family pattern); lens dims slightly out of phase." },
  { id: "thinking",            label: "thinking",            hint: "One binocular eyebrow raises and she scratches her chin — hand jiggles in place. No head tilt, no antenna twitch." },
  { id: "tool_running",        label: "tool_running",        hint: "Scans a foreign artifact \u2014 binoculars REMOVED for the scan; a glowing visor strip on her face pulses in lockstep with the beam triangle, which translates L\u2192R from her face to the artifact." },
  { id: "streaming",           label: "streaming",           hint: "Speech bubble with a black border + black tail + three black radio dots rising above the antenna in sequence. Antenna no longer pulses." },
  { id: "awaiting_permission", label: "awaiting_permission", hint: "Patient jump + right hand waves overhead — same vocabulary as Marine + Engineer. Antenna no longer wiggles independently." },
  { id: "done",                label: "done",                hint: "Quiet snap-up: body up 1px, lens brightens once, settles. One-shot." },
  { id: "error",               label: "error",               hint: "Body holds a static -3° tilt (no swaying); antenna droops sideways; lens flashes red replacing the accent." },
];

const TRANSIENTS = [
  { id: "spawning",  label: "spawning",  hint: "Straight drop from above with impact bounce; brief dust puff at the boots cues landing; shadow fades in." },
  { id: "deploying", label: "deploying", hint: "Right arm reaches over and presses the same red-button kit used by Marine + Engineer; dome compresses and accent flash ring pulses." },
];

function PersistentCard({ st, accent, bg }) {
  return (
    <div className="card">
      <div className="cardHead">
        <span className="cardLabel mono"><b>{st.label}</b></span>
      </div>
      <p className="cardSub">{st.hint}</p>
      <div className="stage">
        <Stage unit="fieldtech" accent={accent} bg={bg} state={st.id} size={192} />
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
        <Stage unit="fieldtech" accent={accent} bg={bg} state="idle" transient={tr.id} size={192} replayKey={n} />
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
  return (
    <div className="card" style={{ gridColumn: "1 / -1" }}>
      <div className="cardHead">
        <span className="cardLabel mono"><b>family check</b></span>
        <span style={{ color: "var(--muted)", fontSize: 11 }}>
          · Marine + Engineer + Field Tech side by side, all idle. Same studio?
        </span>
      </div>
      <div className="stage" style={{ padding: 28 }}>
        <div style={{ display: "flex", gap: 36, alignItems: "flex-end", justifyContent: "center", flexWrap: "wrap" }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
            <Stage unit="marine" accent={accent} bg={bg} state="idle" size={192} />
            <span className="mono" style={{ color: "var(--muted)", fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase" }}>Marine · idle</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
            <Stage unit="engineer" accent={accent} bg={bg} state="idle" size={192} />
            <span className="mono" style={{ color: "var(--muted)", fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase" }}>Engineer · idle</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
            <Stage unit="fieldtech" accent={accent} bg={bg} state="idle" size={192} />
            <span className="mono" style={{ color: "var(--muted)", fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase" }}>Field Tech · idle</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
            <div style={{ display: "flex", gap: 4, alignItems: "flex-end" }}>
              <Stage unit="marine" accent={accent} bg={bg} state="idle" size={96} />
              <Stage unit="engineer" accent={accent} bg={bg} state="idle" size={96} />
              <Stage unit="fieldtech" accent={accent} bg={bg} state="idle" size={96} />
            </div>
            <span className="mono" style={{ color: "var(--muted)", fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase" }}>Native 48 · field read</span>
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

      <h2 className="sectionLabel" style={{ marginTop: 32 }}>Family check vs. Marine + Engineer</h2>
      <div className="grid" style={{ gridTemplateColumns: "1fr" }}>
        <FamilyCheckCard accent={accent} bg={bg} />
      </div>

      <div className="footer">
        <div className="notes">
          <h3>What this is</h3>
          <p>
            Variant C (Forward observer) Field Tech, all nine animations. Shipped at
            <code> src/lib/commandSprites/FieldTech.tsx</code>. Native 48×48, rendered at 4× here.
            Accent tints binocular lenses + pauldron outer edges + chest indicator + belt buckle.
          </p>
          <h3>Family inheritance from Marine + Engineer</h3>
          <ul>
            <li>Same 5-tone armor ramp (Steel default), same dark <code>#06080b</code> outline pass.</li>
            <li>Same gunmetal device palette — carbine + binocular housing + antenna all in g/G/M.</li>
            <li>Same shadow ellipse anchored at <code>cy=41</code> matching the Marine.</li>
            <li>Same speech-bubble + flashing-lens vocabulary for streaming + error.</li>
            <li>Accent rides team-color zones only — never the body.</li>
            <li>Respects <code>prefers-reduced-motion</code>: animations freeze, state still readable.</li>
          </ul>
          <h3>Field-Tech specific motion vocabulary</h3>
          <ul>
            <li><b>thinking</b>: a 4-frame scan line steps across the lens housing — "HUD refreshing inside the optic". Distinct from the Marine's chin-scratch.</li>
            <li><b>tool_running</b>: laser designator metaphor — ground crosshair pulses below the unit. Distinct from Marine's rifle shooting (no muzzle flash, no recoil) and Engineer's welding (no sparks, no mask). Reads "marking a target".</li>
            <li><b>streaming</b>: radio dots rise from the antenna in sequence (3 dots, staggered) in addition to the family speech bubble — visible "transmitting" cue specific to this unit.</li>
            <li><b>awaiting_permission</b>: binoculars lower to reveal the under-visor — "I looked up from my optics, sir." Combined with the family patient-jump.</li>
            <li><b>spawning</b>: parachute drop. Distinct from Marine's jetpack-arc and Engineer's teleport-rings.</li>
            <li><b>deploying</b>: signal-point with accent flare — gesture vectors UP-RIGHT toward where the subagent will appear, distinguishing it from <code>tool_running</code>'s downward target-mark per §6.8 conflation guardrail.</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
