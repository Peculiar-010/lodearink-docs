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
  const displayTitle = textLines(title, { x: 82, y: 245, size: 62, lineHeight: 70, maxChars: 20, maxLines: 2, fill: "#f3f3ef", family: "DejaVu Sans", weight: 700 });
  const showPath = Boolean(path && path !== "/");
  const displayPath = showPath
    ? textLines(path, { x: 84, y: 418, size: 19, lineHeight: 26, maxChars: 48, maxLines: 2, fill: "#c5cecc", family: "DejaVu Sans Mono" })
    : "";
  const pathAccent = showPath ? '<rect x="82" y="389" width="4" height="43" rx="2" fill="#c6d3ca"/>' : "";
  const displayDescription = textLines(description, { x: 84, y: 489, size: 17, lineHeight: 24, maxChars: 66, maxLines: 2, fill: "#9da9a8", family: "DejaVu Sans" });
  const categoryLabel = escapeXml(String(category || "Lodearink API").toUpperCase());
  const methodList = (Array.isArray(methods) ? methods : String(methods || "").split(/[,\s]+/))
    .map(method => String(method).trim().toUpperCase()).filter(Boolean).slice(0, 4);
  const methodsMarkup = methodList.map((method, index) => {
    const x = 842 + index * 64;
    return `<g transform="translate(${x} 0)">
      <rect x="0" y="103" width="56" height="28" rx="8" fill="#171a1b" stroke="#353a3b"/>
      <text x="28" y="122" text-anchor="middle" fill="#d4dfdf" font-family="DejaVu Sans Mono" font-size="11" font-weight="700">${escapeXml(method.slice(0, 8))}</text>
    </g>`;
  }).join("");
  const statusText = String(status || "");
  const badgeLabel = statusText.length > 18 ? `${statusText.slice(0, 17)}…` : statusText;
  const badgeWidth = Math.min(230, Math.max(100, badgeLabel.length * 8 + 42));
  const badge = statusText ? `<g>
      <rect x="84" y="548" width="${badgeWidth}" height="32" rx="16" fill="#151a19" stroke="${statusColor(statusText)}" stroke-opacity=".54"/>
      <circle cx="101" cy="564" r="4" fill="${statusColor(statusText)}"/>
      <text x="114" y="568" fill="${statusColor(statusText)}" font-family="DejaVu Sans Mono" font-size="12" font-weight="700">${escapeXml(badgeLabel)}</text>
    </g>` : "";
  const checked = statusText && checkedAt
    ? `<text x="${84 + badgeWidth + 16}" y="568" fill="#788583" font-family="DejaVu Sans Mono" font-size="11">CHECKED · ${escapeXml(checkedAt)}</text>`
    : "";
  const countMarkup = count !== undefined && count !== null && count !== ""
    ? `<text x="1116" y="570" text-anchor="end" fill="#788583" font-family="DejaVu Sans Mono" font-size="11">${escapeXml(count)} ENDPOINTS</text>`
    : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630" role="img" aria-label="${escapeXml(title)}">
<defs>
  <linearGradient id="canvas" x1="0" y1="0" x2="1" y2="1">
    <stop stop-color="#090b0c"/><stop offset=".58" stop-color="#0d1011"/><stop offset="1" stop-color="#111515"/>
  </linearGradient>
  <radialGradient id="ambient" cx="75%" cy="43%" r="60%">
    <stop stop-color="#728d85" stop-opacity=".14"/><stop offset="1" stop-color="#728d85" stop-opacity="0"/>
  </radialGradient>
  <linearGradient id="glass" x1="0" y1="0" x2="1" y2="1">
    <stop stop-color="#313a38"/><stop offset=".48" stop-color="#1d2423"/><stop offset="1" stop-color="#111615"/>
  </linearGradient>
  <linearGradient id="edge" x1="0" y1="0" x2="1" y2="1">
    <stop stop-color="#d8e5dc" stop-opacity=".42"/><stop offset=".52" stop-color="#8d9c94" stop-opacity=".08"/><stop offset="1" stop-color="#d8e5dc" stop-opacity=".22"/>
  </linearGradient>
  <linearGradient id="orb" x1="0" y1="0" x2="1" y2="1">
    <stop stop-color="#e0e9dd"/><stop offset=".34" stop-color="#87968a"/><stop offset=".72" stop-color="#3b4540"/><stop offset="1" stop-color="#171c1a"/>
  </linearGradient>
  <filter id="shadow" x="-30%" y="-30%" width="160%" height="180%">
    <feGaussianBlur in="SourceAlpha" stdDeviation="16"/>
    <feOffset dy="16"/>
    <feComponentTransfer><feFuncA type="linear" slope=".48"/></feComponentTransfer>
    <feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge>
  </filter>
</defs>
<rect width="1200" height="630" fill="url(#canvas)"/>
<rect width="1200" height="630" fill="url(#ambient)"/>
<path d="M0 1H1200" stroke="#d6e3dc" stroke-opacity=".28"/>

<g transform="translate(82 62)">
  <rect width="38" height="38" rx="11" fill="#1b211f" stroke="#63736a" stroke-opacity=".7"/>
  <path d="M11 25.5 18.5 12h4L30 25.5h-4.4l-5.2-9.8-5.1 9.8z" fill="#dce8de"/>
  <text x="52" y="26" fill="#ecefea" font-family="DejaVu Sans" font-size="19" font-weight="700" letter-spacing=".2">LODEARINK</text>
  <text x="174" y="26" fill="#87918b" font-family="DejaVu Sans Mono" font-size="11" letter-spacing="1.8">API WORKSPACE</text>
</g>
<text x="84" y="151" fill="#abb8af" font-family="DejaVu Sans Mono" font-size="12" font-weight="700" letter-spacing="1.5">${categoryLabel}</text>
${methodsMarkup}

<g opacity=".95">
  <ellipse cx="1002" cy="414" rx="186" ry="26" fill="#000" opacity=".5" filter="url(#shadow)"/>
  <g filter="url(#shadow)" transform="translate(835 211) rotate(-8 150 130)">
    <path d="M22 37 173 6l122 56-151 37z" fill="#3b4641" stroke="url(#edge)"/>
    <path d="m144 99 151-37v165l-151 39z" fill="#141a18" stroke="#5e6b63" stroke-opacity=".46"/>
    <path d="m22 37 122 62v167L22 198z" fill="url(#glass)" stroke="#718077" stroke-opacity=".34"/>
    <path d="m35 57 96 49v3l-96-49z" fill="#d2ddd4" opacity=".14"/>
    <circle cx="91" cy="144" r="41" fill="url(#orb)" stroke="#dfe8df" stroke-opacity=".46"/>
    <circle cx="78" cy="130" r="10" fill="#f0f5ec" opacity=".54"/>
    <path d="M61 154c15 13 39 18 57 7" fill="none" stroke="#f1f5ee" stroke-opacity=".35" stroke-width="2"/>
    <path d="m169 109 96-23v7l-96 24zM169 130l74-18v5l-74 18zM169 151l84-21v5l-84 21zM169 183l53-13v5l-53 13z" fill="#aebbb1" opacity=".48"/>
    <rect x="169" y="204" width="51" height="19" rx="6" fill="#26312b" stroke="#86968a" stroke-opacity=".45"/>
    <text x="194.5" y="217" text-anchor="middle" fill="#d8e5d9" font-family="DejaVu Sans Mono" font-size="9" font-weight="700">API</text>
  </g>
</g>

${displayTitle}
${pathAccent}${displayPath}
${displayDescription}
${badge}${checked}${countMarkup}
<path d="M82 605H1118" stroke="#a6b3aa" stroke-opacity=".15"/>
</svg>`;
}
