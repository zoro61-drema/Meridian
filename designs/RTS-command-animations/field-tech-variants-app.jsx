/* field-tech-variants-app.jsx — showcase for the three Field Tech direction variants */

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

function BgFrame({ bg, size, children, padding = 12 }) {
  const styles = {
    position: "relative",
    width: size,
    height: size,
    background: bg === "badlands" ? "#3b2f25" : BACKGROUNDS[bg].css,
    overflow: "hidden",
    borderRadius: 3,
    display: "grid",
    placeItems: "center",
    padding,
  };
  return (
    <div style={styles}>
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
      <div style={{ position: "relative" }}>{children}</div>
    </div>
  );
}

function VariantCard({ variant, accent, bg, grid }) {
  return (
    <div className="card">
      <div className="cardHead">
        <span className="badge mono">{variant.id}</span>
        <span className="cardTitle">{variant.title}</span>
      </div>
      <p className="cardSub">{variant.subtitle}</p>

      <div className="paneRow">
        <div className="pane">
          <BgFrame bg={bg} size={64} padding={8}>
            <SpriteSVG grid={grid} accent={accent} size={48} />
          </BgFrame>
          <span className="cap mono">48×48 · native</span>
        </div>
        <div className="pane">
          <BgFrame bg={bg} size={216} padding={12}>
            <SpriteSVG grid={grid} accent={accent} size={192} />
          </BgFrame>
          <span className="cap mono">192×192 · 4×</span>
        </div>
      </div>
    </div>
  );
}

function App() {
  const [accent, setAccent] = useState("blue");
  const [bg, setBg] = useState("deep");

  const gridA = useMemo(() => buildA(), []);
  const gridB = useMemo(() => buildB(), []);
  const gridC = useMemo(() => buildC(), []);

  const MATRIX_ROWS = [
    { id: "A", label: "A · Medic",              grid: gridA },
    { id: "B", label: "B · Scientific officer", grid: gridB },
    { id: "C", label: "C · Forward observer",   grid: gridC },
  ];
  const MATRIX_BGS = [
    { id: "black",    label: "Black",    css: "#000000" },
    { id: "deep",     label: "Deep blue", css: "#0a1628" },
    { id: "badlands", label: "Badlands", css: "url(#badlands-tile)" },
  ];

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

      <h2 className="sectionLabel">Direction variants — top-down 3/4 RTS perspective, facing S</h2>

      <div className="grid">
        <VariantCard variant={VARIANTS.A} accent={accent} bg={bg} grid={gridA} />
        <VariantCard variant={VARIANTS.B} accent={accent} bg={bg} grid={gridB} />
        <VariantCard variant={VARIANTS.C} accent={accent} bg={bg} grid={gridC} />
      </div>

      <h2 className="sectionLabel" style={{ marginTop: 36 }}>Accent × background matrix — all six accents on all three test surfaces</h2>

      <div className="matrix">
        {MATRIX_ROWS.map((row) => (
          <div className="matrixRow" key={row.id}>
            <div className="matrixRowLabel mono">{row.label}</div>
            {MATRIX_BGS.map((b) => (
              <div className="matrixCell" key={b.id}>
                <div className="matrixCellHead mono">{b.label}</div>
                <div className="matrixSwatches">
                  {ACCENT_ORDER.map((a) => (
                    <div className="matrixSwatch" key={a}>
                      <BgFrame bg={b.id} size={72} padding={8}>
                        <SpriteSVG grid={row.grid} accent={a} size={56} />
                      </BgFrame>
                      <span className="cap mono">{a}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>

      <div className="footer">
        <div className="notes">
          <h3>Visual family — same studio as Marine + Engineer</h3>
          <p>
            Same five-tone armor ramp (Steel default), same dark <code>#06080b</code> outline,
            same gunmetal device palette, same shadow ellipse. The Field Tech reads as "Marine
            but softer" — narrower pauldrons, lighter chest detailing, no slung rifle on the
            Medic/Sci variants. Accent rides team-color zones only (per §7.3: shoulder pauldron
            strip + scanner display), never the body.
          </p>
          <h3>§9 IP guardrail — protected emblem</h3>
          <p>
            The Medic's chest mark is rendered in <span style={{ color: "#36b8a6", fontWeight: 600 }}>teal</span> +
            white as a generic equipment cross. <b>Not a Red Cross.</b> The teal is fixed (independent
            of the accent palette) so the symbol always reads as medical regardless of team color.
            Same teal/white pip appears on the LEFT-hip satchel.
          </p>
          <h3>Differentiation read</h3>
          <ul>
            <li><b>A — Medic.</b> Marine-weight helmet, soft pauldrons, teal/white equipment
              cross on the chest. Scanner wand at the right side with accent display tip on
              rows 27–28. Satchel pouch on the LEFT hip with a tiny teal cross. Most clearly
              "field medical".</li>
            <li><b>B — Scientific officer.</b> Less armored: no pauldron caps, narrower
              shoulders, lab-coat skirt flaring wider than the legs from row 27 down. Wide
              forward scanner dish (cols 28–35 rows 23–24) with accent display. Data tablet
              held in the left hand with an accent screen. Slim antenna on the helmet top.
              Reads as "lab coat with field gear".</li>
            <li><b>C — Forward observer.</b> Tactical assistant. Binoculars/scope held to the
              face — wide horizontal optic bar covering the visor zone, with accent lens
              eyepieces. Vertical antenna spike rising from the helmet (radio backpack relay).
              Short scoped carbine at the right hip. Most clearly "scout / spotter".</li>
          </ul>
          <h3>Team-color zones (§4 · §7.3)</h3>
          <p>
            <b>A</b>: pauldron top stripe (rows 15–16 outer corners) + visor + scanner display
            tip + belt buckle.&nbsp;
            <b>B</b>: collar strip (row 15) + visor + scanner dish display + tablet screen +
            belt buckle.&nbsp;
            <b>C</b>: binocular lenses (the scanner-display analog — TCZ) + pauldron outer
            edges + chest indicator + belt buckle.
          </p>
          <p style={{ marginTop: 14, fontStyle: "italic" }}>
            Waiting on your direction pick. Once you choose A / B / C I'll author all nine
            animations and ship the final component at{" "}
            <code>src/lib/commandSprites/FieldTech.tsx</code>.
          </p>
        </div>
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
