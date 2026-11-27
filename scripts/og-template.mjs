const escapeXml = (value = "") => String(value)
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, "")
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;")
  .replace(/'/g, "&apos;");

function wrap(value, maxChars, maxLines = 2) {
  const words = String(value || "").trim().split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";
  for (const word of words) {
    if (word.length > maxChars) {
      if (line) lines.push(line);
      line = "";
      for (let i = 0; i < word.length; i += maxChars) lines.push(word.slice(i, i + maxChars));
      continue;
    }
    const candidate = line ? `${line} ${word}` : word;
    if (candidate.length > maxChars && line) {
      lines.push(line);
      line = word;
    } else line = candidate;
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) {
    lines.length = maxLines;
    const last = lines[maxLines - 1];
    lines[maxLines - 1] = `${last.slice(0, Math.max(0, maxChars - 1))}…`;
  }
  return lines;
}

function textLines(value, { x, y, size, lineHeight, maxChars, maxLines, fill, family, weight = 400 }) {
  return wrap(value, maxChars, maxLines).map((line, index) =>
    `<text x="${x}" y="${y + index * lineHeight}" fill="${fill}" font-family="${family}" font-size="${size}" font-weight="${weight}">${escapeXml(line)}</text>`
  ).join("");
}

function statusColor(status) {
  const value = String(status || "").toLowerCase().trim();
  if (/online|healthy|available|operational/.test(value)) return "#70dfb2";
  if (/offline|down|unavailable/.test(value)) return "#ff858d";
  if (/degraded|warning|partial/.test(value)) return "#e8c879";
  if (/checking|pending|unknown/.test(value)) return "#a6c8d4";
  return "#a6c8d4";
}

/**
 * Build a self-contained Open Graph image as an SVG string.
 * All user-provided values are escaped before being inserted into XML.
 */
export function createOgSvg({
  title = "A clear route to a real request",
  description = "API reference and request workspace",
  path = "/",
  category = "Lodearink API",
  status,
  methods = [],
  checkedAt,
  count,
} = {}) {
  const displayTitle = textLines(title, { x: 88, y: 255, size: 56, lineHeight: 66, maxChars: 31, maxLines: 2, fill: "#f1f6fa", family: "DejaVu Sans", weight: 700 });
  const displayPath = textLines(path, { x: 90, y: 427, size: 22, lineHeight: 29, maxChars: 52, maxLines: 2, fill: "#86d8e8", family: "DejaVu Sans Mono" });
  const displayDescription = textLines(description, { x: 90, y: 492, size: 18, lineHeight: 25, maxChars: 68, maxLines: 2, fill: "#9baebe", family: "DejaVu Sans" });
  const categoryLabel = escapeXml(String(category || "Lodearink API").toUpperCase());
  const methodList = (Array.isArray(methods) ? methods : String(methods || "").split(/[,\s]+/))
    .map(method => String(method).trim().toUpperCase()).filter(Boolean).slice(0, 5);
  const methodsMarkup = methodList.map((method, index) => {
    const x = 858 + index * 56;
    return `<g transform="translate(${x} 0)"><rect x="0" y="111" width="48" height="27" rx="7" fill="#132631" stroke="#2b6571"/><text x="24" y="129" text-anchor="middle" fill="#9de3ed" font-family="DejaVu Sans Mono" font-size="11" font-weight="700">${escapeXml(method.slice(0, 8))}</text></g>`;
  }).join("");
  const statusText = status ? String(status) : "";
  const badgeLabel = statusText.length > 18 ? `${statusText.slice(0, 17)}…` : statusText;
  const badge = status ? `<g><rect x="90" y="548" width="${Math.min(230, Math.max(92, statusText.length * 9 + 30))}" height="30" rx="15" fill="#10201f" stroke="${statusColor(status)}" stroke-opacity=".58"/><circle cx="106" cy="563" r="4" fill="${statusColor(status)}"/><text x="119" y="567" fill="${statusColor(status)}" font-family="DejaVu Sans Mono" font-size="12" font-weight="700">${escapeXml(badgeLabel)}</text></g>` : "";
  const checked = status && checkedAt ? `<text x="90" y="592" fill="#748a9b" font-family="DejaVu Sans Mono" font-size="11">CHECKED · ${escapeXml(checkedAt)}</text>` : "";
  const countMarkup = count !== undefined && count !== null && count !== ""
    ? `<text x="1110" y="572" text-anchor="end" fill="#7d93a3" font-family="DejaVu Sans Mono" font-size="11">${escapeXml(count)}</text>`
    : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630" role="img" aria-label="${escapeXml(title)}">
<defs>
  <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#08131c"/><stop offset=".55" stop-color="#09111a"/><stop offset="1" stop-color="#0b1721"/></linearGradient>
  <radialGradient id="wash"><stop stop-color="#187991" stop-opacity=".28"/><stop offset="1" stop-color="#187991" stop-opacity="0"/></radialGradient>
  <pattern id="grid" width="38" height="38" patternUnits="userSpaceOnUse"><path d="M38 0H0V38" fill="none" stroke="#9bd5e0" stroke-opacity=".045"/></pattern>
</defs>
<rect width="1200" height="630" fill="url(#bg)"/><rect width="1200" height="630" fill="url(#grid)"/><ellipse cx="1025" cy="220" rx="360" ry="310" fill="url(#wash)"/>
<g fill="none" stroke="#69c5d6" stroke-opacity=".18">
 <circle cx="1000" cy="314" r="114"/><circle cx="1000" cy="314" r="166"/><circle cx="1000" cy="314" r="218"/>
 <ellipse cx="1000" cy="314" rx="218" ry="82" transform="rotate(-28 1000 314)"/><ellipse cx="1000" cy="314" rx="218" ry="82" transform="rotate(28 1000 314)"/>
</g>
<g fill="#83dbe8"><circle cx="1000" cy="314" r="7"/><circle cx="812" cy="231" r="4"/><circle cx="1122" cy="213" r="4"/><circle cx="1057" cy="505" r="4"/></g>
<path d="M0 1H1200" stroke="#6cd4e2" stroke-opacity=".5"/>
<g transform="translate(88 75)">
 <rect width="38" height="38" rx="11" fill="#102431" stroke="#4bb4c6" stroke-opacity=".7"/>
 <circle cx="19" cy="19" r="9" fill="none" stroke="#9de9f0" stroke-width="1.4"/><path d="M10 19h18M19 10c5 5 5 13 0 18M19 10c-5 5-5 13 0 18" fill="none" stroke="#9de9f0" stroke-width="1"/>
 <text x="52" y="26" fill="#eaf4f7" font-family="DejaVu Sans" font-size="19" font-weight="700">LODEARINK <tspan fill="#83d9e6">API</tspan></text>
</g>
<text x="90" y="174" fill="#80d3e0" font-family="DejaVu Sans Mono" font-size="12" letter-spacing="2">${categoryLabel}</text>
${methodsMarkup}
${displayTitle}
${displayPath}
${displayDescription}
${badge}${checked}${countMarkup}
<path d="M88 608H1112" stroke="#8bb6c3" stroke-opacity=".14"/>
<text x="1110" y="620" text-anchor="end" fill="#607887" font-family="DejaVu Sans Mono" font-size="10">LODEARINK · API WORKSPACE</text>
</svg>`;
}
