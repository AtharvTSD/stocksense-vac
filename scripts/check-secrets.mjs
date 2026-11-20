import fs from 'node:fs';
import cp from 'node:child_process';
const root = process.cwd();
const git = (...args) => cp.execFileSync('git', ['-c', 'safe.directory=' + root, ...args], { encoding: 'utf8' });
const secretFields = /^(GROQ_API_KEY|ALPHA_VANTAGE_API_KEY|INGESTION_TOKEN|DATABASE_URL|SUPABASE_SERVICE_ROLE_KEY|SUPABASE_SETUP_ADMIN_KEY|DATABASE_PASSWORD|FACULTY_[AB]_PASSWORD|VERCEL_OIDC_TOKEN|VERCEL_TOKEN|RENDER_API_KEY|GH_TOKEN|GITHUB_TOKEN)$/;
const secrets = [];
for (const file of ['VAC project/.env.local', 'backend/.env']) {
  if (!fs.existsSync(file)) continue;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)$/);
    if (match && secretFields.test(match[1])) {
      const value = match[2].trim().replace(/^['"]|['"]$/g, '');
      if (value.length > 8) secrets.push(value);
    }
  }
}
const files = git('diff', '--cached', '--name-only', '-z').split('\0').filter(Boolean);
for (const file of files) {
  if (/(^|\/)\.env(?!\.example$)/.test(file) || /(^|\/)(\.cache|\.tools|\.venv|node_modules)\//.test(file)) throw Error('Forbidden private/generated file staged.');
  if (!fs.existsSync(file)) continue;
  let content;
  try { content = git('show', ':' + file); } catch { continue; } // deletion
  if (secrets.some(secret => content.includes(secret)) || /gsk_[A-Za-z0-9]{25,}/.test(content)) throw Error('Secret value detected in staged source. Commit blocked.');
}
const tracked = git('ls-files', '-z').split('\0').filter(Boolean);
if (tracked.some(file => /(^|\/)\.env(?!\.example$)/.test(file))) throw Error('Secret environment file is tracked.');
console.log(`Secret scan passed: ${files.length} staged paths; no secret values printed.`);
