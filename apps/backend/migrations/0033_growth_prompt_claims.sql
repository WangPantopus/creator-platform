-- Additive continuation: retried UI effects reuse one impression instead of consuming the cap twice.
ALTER TABLE growth.prompt_choice ADD COLUMN last_claim_id uuid;
ALTER TABLE growth.prompt_choice ADD COLUMN last_claim_platform text CHECK(last_claim_platform IN ('web','ios','android'));
