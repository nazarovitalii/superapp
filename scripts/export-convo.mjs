#!/usr/bin/env node
// Экспорт переписки Claude Code в docs/conversations/<date>.md.
// Сохраняет текст, вызовы инструментов (команды/правки) и усечённые результаты.
// Internal reasoning (thinking) опускается.
//
// Использование:
//   node scripts/export-convo.mjs                 # сегодня (UTC)
//   node scripts/export-convo.mjs 2026-05-31      # конкретная дата
//   node scripts/export-convo.mjs 2026-05-30 2026-05-31
//   node scripts/export-convo.mjs all             # все даты из транскриптов
//
// Папка транскриптов определяется автоматически из cwd (можно переопределить
// переменной окружения CLAUDE_PROJECT_DIR).

import fs from 'fs';
import path from 'path';

const HOME = process.env.HOME || process.env.USERPROFILE || '';
// Claude Code кодирует абсолютный путь проекта, заменяя '/' и '.' на '-'
const encoded = process.cwd().replace(/[/.]/g, '-');
const PROJECT_DIR = process.env.CLAUDE_PROJECT_DIR || path.join(HOME, '.claude', 'projects', encoded);
const OUT_DIR = path.join(process.cwd(), 'docs', 'conversations');

if (!fs.existsSync(PROJECT_DIR)) {
  console.error(`Папка транскриптов не найдена: ${PROJECT_DIR}\nЗадай CLAUDE_PROJECT_DIR вручную.`);
  process.exit(1);
}
fs.mkdirSync(OUT_DIR, { recursive: true });

const files = fs.readdirSync(PROJECT_DIR).filter(f => f.endsWith('.jsonl'));

// ── Скраббер секретов ────────────────────────────────────────────────────────
// Вырезает известные паттерны секретов перед записью, чтобы выгрузки не утекали.
// Применяется к финальному markdown'у — один choke point ловит текст, инпуты
// инструментов и результаты команд (напр. вывод `cat .env.local`).
const SCRUBBERS = [
  // JWT (Supabase service/anon key и пр.) — три base64url-сегмента через точку
  [/eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{6,}/g, '***JWT_REDACTED***'],
  // Telegram bot token (в т.ч. в URL api.telegram.org/bot<token>/... — опц. префикс bot)
  [/\b(?:bot)?\d{8,10}:[A-Za-z0-9_-]{30,}/g, '***TG_TOKEN_REDACTED***'],
  // URL с креденшелами user:pass@host (IPRoyal-прокси и любые basic-auth URL)
  [/([a-z][a-z0-9+.-]*:\/\/)[^\s/@:]+:[^\s/@]+@/gi, '$1***CREDS_REDACTED***@'],
  // env-присваивания: X_KEY=..., X_TOKEN=..., X_SECRET=..., X_PASS/PASSWORD=...
  [/\b([A-Z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD|PASS))\b(\s*[=:]\s*)(["']?)[^\s"']{6,}\3/g, '$1$2***REDACTED***'],
  // длинные hex-ключи (api-key, webhook-secret): непрерывный hex длиной 32+
  [/\b[0-9a-fA-F]{32,}\b/g, '***HEX_REDACTED***'],
];
function scrub(text) {
  let out = String(text == null ? '' : text);
  let count = 0;
  for (const [re, repl] of SCRUBBERS) {
    out = out.replace(re, (...m) => { count++; return typeof repl === 'string' ? repl.replace(/\$(\d)/g, (_, i) => m[Number(i)] ?? '') : repl; });
  }
  return { text: out, count };
}

const trunc = (s, n) => { s = String(s == null ? '' : s).replace(/\r/g, ''); return s.length > n ? s.slice(0, n) + ` …[+${s.length - n} символов]` : s; };
const oneline = (s, n) => trunc(String(s == null ? '' : s).replace(/\s+/g, ' ').trim(), n);

function fmtToolUse(name, input = {}) {
  if (name === 'Bash')  return `🔧 **Bash** — ${input.description || ''}\n\`\`\`bash\n${trunc(input.command || '', 1200)}\n\`\`\``;
  if (name === 'Read')  return `🔧 **Read** \`${input.file_path || ''}\`${input.offset ? ` (offset ${input.offset}, limit ${input.limit || ''})` : ''}`;
  if (name === 'Edit')  return `🔧 **Edit** \`${input.file_path || ''}\`\n  − ${oneline(input.old_string, 200)}\n  + ${oneline(input.new_string, 200)}`;
  if (name === 'Write') return `🔧 **Write** \`${input.file_path || ''}\` (${(input.content || '').length} символов)`;
  if (name === 'TodoWrite') return `🔧 **TodoWrite**`;
  const keys = Object.keys(input).slice(0, 6).map(k => `${k}=${oneline(JSON.stringify(input[k]), 80)}`).join(', ');
  return `🔧 **${name}** ${oneline(keys, 300)}`;
}

const resultText = (c) => {
  if (typeof c === 'string') return c;
  if (Array.isArray(c)) return c.map(b => (typeof b === 'string' ? b : (b.text || b.content || ''))).join('\n');
  return '';
};

function collectEntries() {
  const all = [];
  for (const f of files) {
    for (const line of fs.readFileSync(path.join(PROJECT_DIR, f), 'utf8').split('\n')) {
      if (!line.trim()) continue;
      let o; try { o = JSON.parse(line); } catch { continue; }
      const ts = o.timestamp || '';
      const m = o.message; if (!m) continue;
      const role = m.role; if (role !== 'user' && role !== 'assistant') continue;
      const blocks = [];
      const c = m.content;
      if (typeof c === 'string') blocks.push({ k: 'text', v: c });
      else if (Array.isArray(c)) for (const b of c) {
        if (b.type === 'text') blocks.push({ k: 'text', v: b.text });
        else if (b.type === 'tool_use') blocks.push({ k: 'tool', name: b.name, input: b.input });
        else if (b.type === 'tool_result') blocks.push({ k: 'result', v: resultText(b.content) });
      }
      all.push({ ts, role, blocks });
    }
  }
  all.sort((a, b) => a.ts.localeCompare(b.ts));
  return all;
}

function exportDate(entries, DATE) {
  const day = entries.filter(e => e.ts.startsWith(DATE));
  const out = [`# Переписка — ${DATE}`, '', '_Полный экспорт: текст, вызовы инструментов (команды/правки) и усечённые результаты. Internal reasoning (thinking) опущен._', ''];
  for (const e of day) {
    const texts = e.blocks.filter(b => b.k === 'text' && b.v && b.v.trim());
    const tools = e.blocks.filter(b => b.k === 'tool');
    const results = e.blocks.filter(b => b.k === 'result' && b.v && b.v.trim());
    if (!texts.length && !tools.length && !results.length) continue;
    const channel = e.role === 'user' ? (e.channel || '[Terminal]') : '';
    out.push('---', '', `### ${e.role === 'user' ? `🧑 Виталий ${channel}` : '🤖 Claude'} · ${e.ts.slice(11, 19)} UTC`, '');
    for (const t of texts) out.push(t.v.trim(), '');
    for (const t of tools) out.push(fmtToolUse(t.name, t.input), '');
    for (const r of results) out.push('<details><summary>↳ результат</summary>', '', `\`\`\`\n${trunc(r.v.trim(), 1500)}\n\`\`\``, '', '</details>', '');
  }
  const { text: md, count: redacted } = scrub(out.join('\n'));
  fs.writeFileSync(path.join(OUT_DIR, `${DATE}.md`), md);
  return { date: DATE, turns: day.length, bytes: md.length, redacted };
}

const entries = collectEntries();
let dates = process.argv.slice(2);
if (dates.length === 1 && dates[0] === 'all') {
  dates = [...new Set(entries.map(e => e.ts.slice(0, 10)).filter(Boolean))].sort();
} else if (dates.length === 0) {
  dates = [new Date().toISOString().slice(0, 10)]; // сегодня (UTC)
}

for (const d of dates) {
  const r = exportDate(entries, d);
  console.log(`✓ ${r.date} → docs/conversations/${r.date}.md (${r.turns} ходов, ${(r.bytes / 1024).toFixed(0)} КБ${r.redacted ? `, 🔒 вырезано секретов: ${r.redacted}` : ''})`);
}
