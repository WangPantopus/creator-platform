-- Lane 5 proposal. Integrator registers after the current migration PR.
-- Browser subscriptions use the existing encrypted, session-bound registration
-- and receipt/erasure paths. No endpoint, auth secret or key is stored in plaintext.
ALTER TABLE growth.device DROP CONSTRAINT device_platform_check;
ALTER TABLE growth.device ADD CONSTRAINT device_platform_check
  CHECK (platform IN ('ios', 'android', 'web'));
