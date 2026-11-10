-- HQ & Driver Cockpit field knowledge, one organization-owned source of truth.
-- No legacy browser fixtures are auto-imported, and no existing data is rewritten.
CREATE TABLE IF NOT EXISTS cockpit.field_knowledge (
  organization_id text NOT NULL DEFAULT 'vip_limousine_korea',
  id text NOT NULL,
  content jsonb NOT NULL,
  version integer NOT NULL DEFAULT 1,
  archived boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text NOT NULL DEFAULT '',
  CONSTRAINT field_knowledge_pk PRIMARY KEY (organization_id, id),
  CONSTRAINT field_knowledge_id_length CHECK (char_length(id) BETWEEN 1 AND 100),
  CONSTRAINT field_knowledge_version_positive CHECK (version > 0),
  CONSTRAINT field_knowledge_content_object CHECK (jsonb_typeof(content) = 'object')
);
CREATE INDEX IF NOT EXISTS field_knowledge_active_org_idx
  ON cockpit.field_knowledge (organization_id, archived, updated_at DESC);

-- The table is accessible only through authenticated Next.js APIs, never
-- directly via browser anon/authenticated Data API credentials.
ALTER TABLE cockpit.field_knowledge ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON cockpit.field_knowledge FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON cockpit.field_knowledge TO service_role;
