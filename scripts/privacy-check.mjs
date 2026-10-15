#!/usr/bin/env node
// Fails when the repository contains anything that looks like data from a real home
// (brief section 4.1). Runs in the pre-commit hook and in CI.
//
//   node scripts/privacy-check.mjs            checks every file git knows about (tracked + new)
//   node scripts/privacy-check.mjs --staged   checks the files staged for commit
//   node scripts/privacy-check.mjs a.js b.md  checks just these files
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { extname } from 'node:path';

const DOMAINS = 'light|switch|lock|cover|climate|fan|media_player|alarm_control_panel|binary_sensor|sensor|camera|remote|script|scene|input_boolean|input_button|button|vacuum|valve|siren';
const ENTITY = new RegExp(`\\b(${DOMAINS})\\.([a-z0-9_]+)\\b`, 'g');

// Service names (light.turn_on) and documentation placeholders (light.your_light) are fine.
const SERVICES = new Set(['turn_on', 'turn_off', 'toggle', 'set_temperature', 'set_hvac_mode', 'set_fan_mode',
  'set_preset_mode', 'open_cover', 'close_cover', 'stop_cover', 'lock', 'unlock', 'open', 'reload', 'media_play',
  'media_pause', 'volume_set', 'select_source', 'press', 'apply', 'create', 'set_percentage', 'oscillate', 'start',
  'stop', 'return_to_base', 'alarm_arm_home', 'alarm_arm_away', 'alarm_disarm', 'snapshot', 'trigger']);
const PLACEHOLDER = /^(demo_|your_|my_|example|object_id\b|entity\b|x\b|y\b)/;

const IMAGE = /\.(png|jpe?g|gif|webp|heic|heif|bmp|tiff?|avif|ico)$/i;
const IMAGE_DIRS = /^(docs|images)\//;
const BINARY = /\.(png|jpe?g|gif|webp|heic|heif|bmp|tiff?|avif|ico|glb|gltf|blend|zip|gz|woff2?|ttf|otf|pdf)$/i;
const CODE = new Set(['.js', '.mjs', '.cjs', '.ts', '.css']);

// Files that are generated or describe the rules themselves.
const SKIP = new Set(['package-lock.json', 'scripts/privacy-check.mjs']);

const ipv4 = /\b(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}\b/g;
const allowedIp = (ip) => ['127.0.0.1', '0.0.0.0'].includes(ip)
  || ip.startsWith('192.0.2.') || ip.startsWith('198.51.100.') || ip.startsWith('203.0.113.');

const RULES = [
  { name: 'Nabu Casa remote URL', re: /ui\.nabu\.casa/gi },
  { name: 'DuckDNS hostname', re: /duckdns\.org/gi },
  { name: 'Home Assistant host', re: /\b[\w.-]+:8123\b/g, ok: (m) => m === 'homeassistant.local:8123' },
  { name: 'JWT-like token', re: /eyJ[A-Za-z0-9_-]{10,}/g },
  { name: 'long hex secret', re: /\b[0-9a-f]{32,}\b/gi },
  { name: 'Bearer token', re: /Bearer\s+[A-Za-z0-9._~+/-]{8,}/g },
  { name: 'MAC address', re: /\b[0-9a-f]{2}([:-])[0-9a-f]{2}(\1[0-9a-f]{2}){4}\b/gi },
  { name: 'email address', re: /\b[\w.+-]+@[\w-]+\.[\w.-]+\b/g, ok: (m) => /@(anthropic\.com|users\.noreply\.github\.com|example\.(com|org))$/.test(m) },
];

function files() {
  const args = process.argv.slice(2);
  if (args.length && args[0] !== '--staged') return args;
  const git = (...a) => execFileSync('git', a, { encoding: 'utf8' }).split('\n').filter(Boolean);
  if (args[0] === '--staged') return git('diff', '--cached', '--name-only', '--diff-filter=ACMR');
  return [...new Set([...git('ls-files'), ...git('ls-files', '--others', '--exclude-standard')])];
}

// In code, only text a person wrote as data counts: strings and comments, not `light.position`.
function textOf(path, source) {
  if (!CODE.has(extname(path))) return source;
  const parts = [];
  const re = /\/\/[^\n]*|\/\*[\s\S]*?\*\/|'(?:\\.|[^'\\\n])*'|"(?:\\.|[^"\\\n])*"|`(?:\\.|[^`\\])*`/g;
  let m;
  while ((m = re.exec(source))) {
    const line = source.slice(0, m.index).split('\n').length;
    // ${...} inside a template literal is code again
    parts.push({ line, text: m[0].startsWith('`') ? m[0].replace(/\$\{[^}]*\}/g, '') : m[0] });
  }
  return parts;
}

const problems = [];
const report = (path, line, what, match) => problems.push(`${path}${line ? `:${line}` : ''}  ${what}: ${match}`);

function scan(path, chunks, code = false) {
  for (const { line, text } of chunks) {
    for (const m of text.matchAll(ENTITY)) {
      const [whole, domain, object] = m;
      if (SERVICES.has(object) || PLACEHOLDER.test(object)) continue;
      // h('button.round') in code is an element with a CSS class, not a button.* entity
      if (code && domain === 'button' && m.index === 1) continue;
      report(path, line, 'entity id that is not demo_', whole);
    }
    for (const m of text.matchAll(ipv4)) if (!allowedIp(m[0])) report(path, line, 'IP address', m[0]);
    for (const rule of RULES) {
      for (const m of text.matchAll(rule.re)) if (!rule.ok?.(m[0])) report(path, line, rule.name, m[0]);
    }
  }
}

function checkPlan(path, source) {
  let plan;
  try { plan = JSON.parse(source); } catch { return; }
  const walk = (node) => {
    if (!node || typeof node !== 'object') return;
    if (node.link?.id && !/^[a-z_]+\.demo_/.test(node.link.id)) report(path, 0, 'plan link to a non-demo entity', node.link.id);
    for (const v of Object.values(node)) walk(v);
  };
  walk(plan);
}

for (const path of files()) {
  if (SKIP.has(path) || !existsSync(path) || statSync(path).isDirectory()) continue;
  if (IMAGE.test(path) && !IMAGE_DIRS.test(path)) report(path, 0, 'image outside docs/ and images/', path);
  if (/\.plan\.json$/i.test(path) || (/^plans\//.test(path) && path !== 'plans/demo.json')) report(path, 0, 'plan file other than plans/demo.json', path);
  if (/\.(glb|blend|heic|zip)$/i.test(path)) report(path, 0, 'model, photo or archive file', path);
  if (BINARY.test(path)) continue;
  const source = readFileSync(path, 'utf8');
  const chunks = textOf(path, source);
  if (Array.isArray(chunks)) scan(path, chunks, true);
  else scan(path, source.split('\n').map((text, i) => ({ line: i + 1, text })));
  if (path.endsWith('.json')) checkPlan(path, source);
}

if (problems.length) {
  console.error(`privacy check: ${problems.length} problem(s)\n  ${problems.join('\n  ')}`);
  console.error('\nThis repository must not contain anything from a real home (see README, "Privacy").');
  process.exit(1);
}
console.log('privacy check: ok');
