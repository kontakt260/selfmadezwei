-- PROJ-6, BUG-G12: personal claim link in the purchase mail.
--
-- Until now a guest purchase could only be claimed with the confirmed
-- checkout address or from the browser that made the purchase. A customer
-- with an account under another address on another device had no way to
-- claim it. The mail to the checkout address now carries a secret link.
--
-- Same rules as the browser secret: 256 bit random, only the SHA-256 hash is
-- stored, all checks run on the server via service_role. The table stays
-- locked for anon/authenticated (RLS without policies). No policy changes.
--
-- ASCII only on purpose: this file is copied into the SQL editor by hand.

ALTER TABLE public.purchase_claims
  ADD COLUMN IF NOT EXISTS mail_token_hash TEXT;

COMMENT ON COLUMN public.purchase_claims.mail_token_hash IS
  'SHA-256 (hex) of the secret in the claim link of the purchase mail. The secret itself is never stored. NULL for purchases without such a mail.';

CREATE UNIQUE INDEX IF NOT EXISTS idx_purchase_claims_mail_token
  ON public.purchase_claims (mail_token_hash)
  WHERE mail_token_hash IS NOT NULL;
