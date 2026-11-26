import {escapeHtml} from './ui.js';
export function highlight(text, json = false) {
  if (!json) return escapeHtml(text);
  return escapeHtml(text).replace(/(&quot;(?:\\.|[^&])*?&quot;)(\s*:)?|\b(true|false|null)\b|(-?\b\d+(?:\.\d+)?\b)/g, (match, string, colon, literal, number) => {
    if (string) return `<span class="${colon ? 'syntax-key' : 'syntax-string'}">${string}</span>${colon || ''}`;
    return `<span class="${literal ? 'syntax-literal' : 'syntax-number'}">${match}</span>`;
  });
}
