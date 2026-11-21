-- PROJ-6: gift without own access is set up and sent right after payment.
--
-- The buyer of such a gift needs no account. Until the recipient accepts the
-- invitation the project therefore has no owner; accepting it sets the owner.
--
-- invitations.is_gift: the invitation page shows gift wording only for real
-- gift invitations. Regular invitations are valid for 14 days, gift
-- invitations until the end of the portal access, so existing ones can be
-- told apart by their validity.
--
-- No RLS policy changes.
-- ASCII only on purpose: this file is copied into the SQL editor by hand.

ALTER TABLE public.projects
  ALTER COLUMN owner_id DROP NOT NULL;

COMMENT ON COLUMN public.projects.owner_id IS
  'Owner of the project. NULL only for a gift without own access until the recipient accepts the invitation.';

ALTER TABLE public.invitations
  ADD COLUMN IF NOT EXISTS is_gift BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.invitations.is_gift IS
  'Invitation from a gift purchase. Only controls the wording of the invitation page.';

UPDATE public.invitations
  SET is_gift = true
  WHERE is_gift = false
    AND expires_at > created_at + interval '15 days';
