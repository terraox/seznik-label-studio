-- The desk now has a single admin whose sign-in comes from the environment, so the admin
-- accounts and the audit trail are no longer stored.
DROP TABLE IF EXISTS "AdminAuditLog";
DROP TABLE IF EXISTS "AdminAccount";
