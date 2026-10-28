#!/usr/bin/env node
import fs from 'node:fs';

const SUPABASE_ACCESS_TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const DEFAULT_PROJECT_ID = process.env.SUPABASE_PROJECT_ID || 'rvaowhriekibxtcpyalu';

export async function executeSupabaseSql(query, projectId = DEFAULT_PROJECT_ID) {
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
