#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

function loadEnvLocal() {
  try {
    const envPath = path.resolve(process.cwd(), '.env.local');
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, 'utf8');
      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx > 0) {
          const key = trimmed.slice(0, eqIdx).trim();
          const val = trimmed.slice(eqIdx + 1).trim();
          if (!process.env[key]) {
            process.env[key] = val;
          }
        }
      }
    }
  } catch {}
}
loadEnvLocal();

const SUPABASE_ACCESS_TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const DEFAULT_PROJECT_ID = process.env.SUPABASE_PROJECT_ID;

export async function executeSupabaseSql(query, projectId = DEFAULT_PROJECT_ID) {
  if (!projectId || !SUPABASE_ACCESS_TOKEN) throw new Error('Explicit SUPABASE_PROJECT_ID and SUPABASE_ACCESS_TOKEN are required.');
  const res = await fetch(`https://api.supabase.com/v1/projects/${projectId}/database/query`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${SUPABASE_ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Supabase SQL Error (${res.status}): ${errText}`);
  }

  return await res.json();
}

// CLI execution
if (process.argv[1] && process.argv[1].endsWith('supabase-sql.mjs')) {
  const inputArg = process.argv[2];
  if (!inputArg) {
    console.error('Usage: node scripts/supabase-sql.mjs "<SQL_QUERY>" or node scripts/supabase-sql.mjs <file.sql>');
    process.exit(1);
  }

  let query = inputArg;
  if (fs.existsSync(inputArg)) {
    query = fs.readFileSync(inputArg, 'utf8');
  }

  executeSupabaseSql(query)
    .then((result) => {
      console.log(JSON.stringify(result, null, 2));
    })
    .catch((err) => {
      console.error(err.message);
      process.exit(1);
    });
}
