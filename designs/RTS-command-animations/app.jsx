/* app.jsx — Marine animation pilot (Variant B chosen) */

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

function Stage({ accent, bg, state, transient, size = 192, replayKey, armorTemplate, gunTemplate, darkness }) {
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
        <Marine
          key={replayKey}
          state={state}
          transient={transient}
          accent={accent}
          size={size}
          armorTemplate={armorTemplate}
          gunTemplate={gunTemplate}
          darkness={darkness}
        />
      </div>
    </div>
  );
}

const STATES = [
  { id: "idle",                 label: "idle",                 hint: "Lateral sway. Waiting for orders." },
  { id: "thinking",             label: "thinking",             hint: "Right hand to comm bead, antenna pulses." },
  { id: "tool_running",         label: "tool_running",         hint: "Long rifle, both hands, scope, laser." },
  { id: "streaming",            label: "streaming",            hint: "Concentric rings sweep in from upper-right." },
  { id: "awaiting_permission",  label: "awaiting_permission",  hint: "Patient sway, weapon lowered, ? glyph." },
  { id: "done",                 label: "done",                 hint: "Brief snap-to-attention. One-shot." },
  { id: "error",                label: "error",                hint: "Body sags tilted at the feet, dimmed accent." },
];

const TRANSIENTS = [
  { id: "spawning",   label: "spawning",   hint: "Jetpack air-drop. Red flame trails behind, fades at touchdown." },
  { id: "deploying",  label: "deploying",  hint: "Right arm raises and points toward subagent spawn." },
];

function PersistentCard({ st, accent, bg, armorTemplate, gunTemplate, darkness }) {
  return (
    <div className="card">
      <div className="cardHead">
        <span className="cardLabel mono"><b>{st.label}</b></span>
      </div>
      <p className="cardSub">{st.hint}</p>
      <div className="stage" style={{ background: "#070a0e" }}>
        <Stage accent={accent} bg={bg} state={st.id} size={192}
          armorTemplate={armorTemplate} gunTemplate={gunTemplate} darkness={darkness} />
      </div>
    </div>
  );
}

function TransientCard({ tr, accent, bg, armorTemplate, gunTemplate, darkness }) {
  const [n, setN] = useState(0);
  return (
    <div className="card">
      <div className="cardHead">
        <span className="cardLabel mono"><b>{tr.label}</b></span>
        <span style={{ color: "var(--muted)", fontSize: 11 }}>· transient</span>
      </div>
      <p className="cardSub">{tr.hint}</p>
      <div className="stage" style={{ background: "#070a0e" }}>
        <Stage accent={accent} bg={bg} state="idle" transient={tr.id} size={192} replayKey={n}
          armorTemplate={armorTemplate} gunTemplate={gunTemplate} darkness={darkness} />
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

function TemplateSwatch({ tpl, active, onClick }) {
  return (
    <button
      onClick={onClick}
      title={tpl.name}
      style={{
        width: 26, height: 26, borderRadius: 4, padding: 0,
        border: "1px solid rgba(255,255,255,0.06)",
        boxShadow: active ? "0 0 0 2px var(--text)" : undefined,
        background: tpl.base,
        cursor: "pointer", position: "relative",
      }}
    >
      <span style={{
        position: "absolute", top: 4, right: 4, width: 8, height: 8, borderRadius: 1,
        background: tpl.swatch,
      }} />
    </button>
  );
}

function App() {
  const [accent, setAccent] = useState("blue");
  const [bg, setBg] = useState("deep");
  const [armorTemplate, setArmorTemplate] = useState("steel");
  const [gunTemplate, setGunTemplate] = useState("matte");
  const [darkness, setDarkness] = useState(0);

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
                style={{ background: ACCENTS[a] }}
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

      <div className="toolbar" style={{ marginTop: -8 }}>
        <div className="toolGroup">
          <span className="label">Armor</span>
          <div style={{ display: "flex", gap: 6 }}>
            {Object.entries(ARMOR_TEMPLATES).map(([k, tpl]) => (
              <TemplateSwatch
                key={k}
                tpl={tpl}
                active={armorTemplate === k}
                onClick={() => setArmorTemplate(k)}
              />
            ))}
          </div>
          <span style={{ color: "var(--muted)", fontSize: 11, marginLeft: 6, minWidth: 90 }}>
            {ARMOR_TEMPLATES[armorTemplate].name}
          </span>
        </div>

        <div style={{ width: 1, height: 28, background: "var(--border-2)" }}></div>

        <div className="toolGroup">
          <span className="label">Gun</span>
          <div style={{ display: "flex", gap: 6 }}>
            {Object.entries(GUN_TEMPLATES).map(([k, tpl]) => (
              <TemplateSwatch
                key={k}
                tpl={tpl}
                active={gunTemplate === k}
                onClick={() => setGunTemplate(k)}
              />
            ))}
          </div>
          <span style={{ color: "var(--muted)", fontSize: 11, marginLeft: 6, minWidth: 90 }}>
            {GUN_TEMPLATES[gunTemplate].name}
          </span>
        </div>

        <div style={{ width: 1, height: 28, background: "var(--border-2)" }}></div>

        <div className="toolGroup">
          <span className="label">Darkness</span>
          <input
            type="range"
            min={-0.5}
            max={0.5}
            step={0.05}
            value={darkness}
            onChange={(e) => setDarkness(parseFloat(e.target.value))}
            style={{ width: 140 }}
          />
          <span className="mono" style={{ color: "var(--muted)", fontSize: 11, minWidth: 44 }}>
            {(darkness >= 0 ? "+" : "") + darkness.toFixed(2)}
          </span>
          <button
            onClick={() => setDarkness(0)}
            style={{
              background: "transparent", border: "1px solid var(--border-2)", color: "var(--muted)",
              padding: "3px 8px", borderRadius: 3, cursor: "pointer", fontSize: 10, fontFamily: "inherit",
              letterSpacing: "0.05em", textTransform: "uppercase",
            }}
          >reset</button>
        </div>
      </div>

      <h2 style={{ fontSize: 12, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--muted)", margin: "8px 0 12px" }}>
        Persistent states
      </h2>
      <div className="grid" style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
        {STATES.map((st) => (
          <PersistentCard key={st.id} st={st} accent={accent} bg={bg}
            armorTemplate={armorTemplate} gunTemplate={gunTemplate} darkness={darkness} />
        ))}
      </div>

      <h2 style={{ fontSize: 12, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--muted)", margin: "32px 0 12px" }}>
        Transients (one-shot)
      </h2>
      <div className="grid" style={{ gridTemplateColumns: "repeat(2, minmax(0, 360px))" }}>
        {TRANSIENTS.map((tr) => (
          <TransientCard key={tr.id} tr={tr} accent={accent} bg={bg}
            armorTemplate={armorTemplate} gunTemplate={gunTemplate} darkness={darkness} />
        ))}
      </div>

      <div className="footer">
        <div className="notes">
          <h3>Color controls</h3>
          <p>
            Armor and gun are now decoupled from the accent. Pick an armor template (Steel Gray, Olive Drab,
            Desert Tan, Navy, Forest Green, Maroon, Graphite) and a gun template (Chrome, Matte Black,
            Gunmetal, Bronze, Sand, Forest Stock). The darkness slider shifts every armor + gun tone in
            tandem (negative = lighter, positive = darker). The accent stays its own thing — it only colors
            the visor, chest stripe, belt buckle, and effect overlays.
          </p>
          <h3>Streaming</h3>
          <p>
            Replaced with 4 concentric rings centered off-frame at the upper-right corner. Each ring fades
            in / holds / fades out, staggered so smaller appears first, then medium, then large — reads as
            an inbound radio transmission expanding toward the marine.
          </p>
        </div>
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
