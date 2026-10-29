/* =========================================================
   Generic hockey jersey (original design, back view).
   Jersey.svg({...}) returns SVG markup; the builder at the
   bottom wires up the "Build Your Own Jersey" form.
   ========================================================= */
(function () {
  "use strict";

  const STYLES = {
    // body color, two stripe colors, text fill, text outline
    red:   { body: "#CE1126", s1: "#0a0a0b", s2: "#ffffff", text: "#ffffff", outline: "#0a0a0b" },
    black: { body: "#141416", s1: "#CE1126", s2: "#ffffff", text: "#ffffff", outline: "#CE1126" },
    white: { body: "#f4f4f4", s1: "#CE1126", s2: "#0a0a0b", text: "#CE1126", outline: "#0a0a0b" },
  };

  // Outline of the jersey: collar, shoulders, sleeves, body.
  const BODY =
    "M88 20 Q120 32 152 20 L206 44 L236 120 L198 132 L184 92 L186 226 L54 226 L56 92 L42 132 L4 120 L34 44 Z";
  // Two stripes near the left cuff; mirrored for the right sleeve.
  const SLEEVE_STRIPES = [
    "M8.4 108.8 L46 120.7 L48.6 113.1 L11.3 101.4 Z",
    "M12.8 97.7 L49.9 109.4 L51.9 103.7 L15 92.1 Z",
  ];

  let uid = 0;

  function escapeXml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  function svg({ color = "red", name = "", number = "", label = "" } = {}) {
    const c = STYLES[color] || STYLES.red;
    const id = `j${++uid}`;
    const nm = escapeXml(name.toUpperCase());
    const num = escapeXml(number);
    // Squeeze long names so they stay between the shoulders.
    const fit = name.length > 8 ? ` textLength="${Math.min(150, 40 + name.length * 9)}" lengthAdjust="spacingAndGlyphs"` : "";
    const sleeves = SLEEVE_STRIPES.map((d, i) => `<path d="${d}" fill="${i ? c.s2 : c.s1}"/>`).join("");
    const textStyle = `fill="${c.text}" stroke="${c.outline}" stroke-width="3" paint-order="stroke" stroke-linejoin="round"`;

    return `
<svg viewBox="0 0 240 240" role="img" aria-label="${escapeXml(label || `Jersey${name ? ` with ${name}` : ""}${number ? ` number ${number}` : ""}`)}">
  <defs>
    <clipPath id="${id}-clip"><path d="${BODY}"/></clipPath>
    <path id="${id}-arc" d="M62 74 Q120 52 178 74"/>
  </defs>
  <path d="${BODY}" fill="${c.body}"/>
  <g clip-path="url(#${id}-clip)">
    <rect x="0" y="190" width="240" height="12" fill="${c.s1}"/>
    <rect x="0" y="202" width="240" height="5" fill="${c.s2}"/>
    <rect x="0" y="207" width="240" height="8" fill="${c.s1}"/>
    <g>${sleeves}</g>
    <g transform="translate(240 0) scale(-1 1)">${sleeves}</g>
    <!-- subtle fabric shading -->
    <rect x="56" y="20" width="16" height="206" fill="#000" opacity=".06"/>
    <rect x="168" y="20" width="16" height="206" fill="#000" opacity=".06"/>
  </g>
  <path d="M88 20 Q120 32 152 20" fill="none" stroke="${c.s1}" stroke-width="7" stroke-linecap="round"/>
  <path d="${BODY}" fill="none" stroke="#000" stroke-opacity=".35" stroke-width="2"/>
  ${nm ? `<text font-family="Graduate, 'Arial Black', sans-serif" font-size="22" ${textStyle} text-anchor="middle"><textPath href="#${id}-arc" startOffset="50%"${fit}>${nm}</textPath></text>` : ""}
  ${num ? `<text x="120" y="${nm ? 172 : 162}" font-family="Graduate, 'Arial Black', sans-serif" font-size="${num.length > 1 ? 88 : 100}" ${textStyle.replace('stroke-width="3"', 'stroke-width="5"')} text-anchor="middle">${num}</text>` : ""}
</svg>`;
  }

  window.Jersey = { svg };

  // ----- Build Your Own Jersey -----
  function initBuilder() {
    const form = document.getElementById("jersey-form");
    const preview = document.getElementById("jersey-preview");
    if (!form || !preview) return;
    const nameInput = document.getElementById("jersey-name");
    const numberInput = document.getElementById("jersey-number");

    function render() {
      // Numbers only, two digits max
      const cleaned = numberInput.value.replace(/\D/g, "").slice(0, 2);
      if (cleaned !== numberInput.value) numberInput.value = cleaned;
      const name = nameInput.value.replace(/[^\p{L}\p{N} .'\-]/gu, "").trim();
      const color = form.querySelector('input[name="jersey-color"]:checked').value;
      preview.innerHTML = svg({ color, name, number: cleaned, label: `Your custom ${color} jersey` });
    }

    form.addEventListener("input", render);
    form.addEventListener("submit", (e) => e.preventDefault());
    render();
  }

  document.addEventListener("DOMContentLoaded", initBuilder);
})();
