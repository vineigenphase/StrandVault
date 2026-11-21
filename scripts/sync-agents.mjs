// `npm run agents:sync` — regenerate AGENTS.md from CLAUDE.md so non-Claude agents
// in JetBrains Air (Codex, Junie, Copilot) read the same rules. Preserves the
// Next.js block that `next dev` maintains at the bottom of AGENTS.md.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const claude = readFileSync('CLAUDE.md', 'utf8').replace(/^# CLAUDE\.md/, '# AGENTS.md');
const prev = existsSync('AGENTS.md') ? readFileSync('AGENTS.md', 'utf8') : '';
const m = prev.match(/<!-- BEGIN:nextjs-agent-rules -->[\s\S]*?<!-- END:nextjs-agent-rules -->/);

const header = '<!-- GENERATED from CLAUDE.md by `npm run agents:sync`. Edit CLAUDE.md, not this file. -->\n\n';
writeFileSync('AGENTS.md', header + claude.trimEnd() + '\n' + (m ? '\n---\n\n' + m[0] + '\n' : ''));
console.log(`AGENTS.md synced from CLAUDE.md${m ? ' (Next.js block kept)' : ''}`);
