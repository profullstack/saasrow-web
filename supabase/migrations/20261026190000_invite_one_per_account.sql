/*
  One invite bonus per invitee. acceptInvite() refuses a second invite for an
  account that already joined on one; this index is the backstop, so even a
  race between two accepts can never pay one new account twice.
*/
CREATE UNIQUE INDEX IF NOT EXISTS invite_bonuses_one_per_invitee
  ON public.invite_bonuses (invitee_id) WHERE invitee_id IS NOT NULL;
