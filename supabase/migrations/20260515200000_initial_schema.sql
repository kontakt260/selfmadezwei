-- ==========================================
-- PROJ-1: Initial Schema
-- ENUMs, Tables, Triggers, Indexes
-- ==========================================

-- ==========================================
-- ENUMs
-- ==========================================

CREATE TYPE member_role AS ENUM ('projektleiter', 'co_author');
CREATE TYPE chapter_origin AS ENUM ('custom', 'catalog_impulse');
CREATE TYPE payment_type AS ENUM (
  'initial_portal_access',
  'portal_access_renewal',
  'vapi_voice_minutes_60',
  'print_order'
);
CREATE TYPE payment_status AS ENUM ('pending', 'completed', 'failed');

-- ==========================================
-- TABLES
-- ==========================================

-- Extends auth.users; auto-created on signup via trigger below
CREATE TABLE profiles (
  id          UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name   TEXT,
  avatar_url  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Read-only catalog of 15 writing prompts; populated via seed.sql
CREATE TABLE impulse_catalog (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  title       TEXT        NOT NULL,
  sort_order  INTEGER     NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Book projects; portal_access_expires_at is NULL until first Stripe payment
CREATE TABLE projects (
  id                        UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id                  UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title                     TEXT        NOT NULL,
  logo_url                  TEXT,
  portal_access_expires_at  TIMESTAMPTZ,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Central access control table; INSERT/DELETE only via service_role
CREATE TABLE project_members (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  UUID        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id     UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role        member_role NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (project_id, user_id)
);

-- Individual book chapters; body is TipTap JSON document
CREATE TABLE chapters (
  id                UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id        UUID           NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title             TEXT           NOT NULL,
  body              JSONB,
  hero_image_url    TEXT,
  sort_order        INTEGER        NOT NULL,
  chapter_origin    chapter_origin NOT NULL DEFAULT 'custom',
  source_impulse_id UUID           REFERENCES impulse_catalog(id) ON DELETE SET NULL,
  content_version   INTEGER        NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ    NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ    NOT NULL DEFAULT now()
);

-- Book cover design; one-to-one with projects
CREATE TABLE project_covers (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  UUID        NOT NULL REFERENCES projects(id) ON DELETE CASCADE UNIQUE,
  theme       TEXT,
  image_url   TEXT,
  metadata    JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Stripe transactions; survive project and user deletion (audit trail)
-- user_id and project_id are nullable so records remain when referenced entities are deleted
CREATE TABLE payments (
  id                UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id        UUID           REFERENCES projects(id) ON DELETE SET NULL,
  user_id           UUID           REFERENCES profiles(id) ON DELETE SET NULL,
  stripe_session_id TEXT           UNIQUE NOT NULL,
  type              payment_type   NOT NULL,
  amount_cents      INTEGER        NOT NULL,
  currency          TEXT           NOT NULL DEFAULT 'eur',
  status            payment_status NOT NULL DEFAULT 'pending',
  created_at        TIMESTAMPTZ    NOT NULL DEFAULT now()
);

-- Vapi call sessions; duration_seconds drives Sprechzeit balance calculation
-- FKs are nullable so audit records survive project/user/chapter deletion
CREATE TABLE voice_sessions (
  id               UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id       UUID           REFERENCES projects(id) ON DELETE SET NULL,
  user_id          UUID           REFERENCES profiles(id) ON DELETE SET NULL,
  duration_seconds INTEGER        NOT NULL,
  chapter_origin   chapter_origin,
  chapter_id       UUID           REFERENCES chapters(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ    NOT NULL DEFAULT now()
);

-- Token-based project invitations; role uses member_role (not a separate 'editor' enum)
-- so gift-purchase webhooks (PROJ-6) can invite recipients as 'projektleiter'
CREATE TABLE invitations (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  UUID        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  email       TEXT        NOT NULL,
  role        member_role NOT NULL DEFAULT 'co_author',
  token       TEXT        UNIQUE NOT NULL,
  accepted_at TIMESTAMPTZ,
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ==========================================
-- UPDATED_AT TRIGGER
-- ==========================================

CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER set_updated_at_profiles
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER set_updated_at_projects
  BEFORE UPDATE ON projects
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER set_updated_at_chapters
  BEFORE UPDATE ON chapters
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER set_updated_at_project_covers
  BEFORE UPDATE ON project_covers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ==========================================
-- AUTH TRIGGER: auto-create profile on signup
-- SECURITY DEFINER allows the function to write profiles
-- even though the new user has no session yet
-- ==========================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'avatar_url'
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ==========================================
-- HELPER FUNCTION FOR RLS
-- SECURITY DEFINER prevents RLS recursion when project_members
-- is queried inside policies on other tables
-- ==========================================

CREATE OR REPLACE FUNCTION public.get_my_project_ids()
RETURNS SETOF UUID
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT project_id FROM public.project_members WHERE user_id = auth.uid()
$$;

-- ==========================================
-- INDEXES
-- ==========================================

-- chapters: ordered list per project (most common query pattern)
CREATE INDEX idx_chapters_project_sort ON chapters(project_id, sort_order);

-- voice_sessions: project-level aggregation for Vapi balance
CREATE INDEX idx_voice_sessions_project ON voice_sessions(project_id);

-- Additional lookup indexes
CREATE INDEX idx_payments_user      ON payments(user_id);
CREATE INDEX idx_invitations_email  ON invitations(email);
CREATE INDEX idx_invitations_project ON invitations(project_id);
