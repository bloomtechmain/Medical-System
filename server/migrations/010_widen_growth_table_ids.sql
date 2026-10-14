-- Migration 010 — widen the ids of tables that grow without bound (PRO-04).
--
-- PRO-04: "Nothing is ever deleted or archived: notifications, chat messages,
-- the impersonation log and vitals grow without end. All IDs are SERIAL
-- (32-bit), not BIGINT." Suggested fix: "Use BIGINT for notifications,
-- messages and vitals before they hold real data."
--
-- SERIAL is a 32-bit integer: it runs out at 2,147,483,647. That sounds
-- distant until you notice these are the per-event tables — one notification
-- per clinical action per recipient, one row per chat message, one
-- impersonation-action row per request during an admin session. Exhaustion is
-- not the realistic failure either; the realistic one is discovering the
-- problem when the table is large, because this migration rewrites the table
-- and takes an ACCESS EXCLUSIVE lock for the duration. Hence "before they
-- hold real data" — doing it now costs milliseconds, doing it in two years
-- costs an outage.
--
-- Verified before writing this: none of these six tables has an inbound
-- foreign key, so widening the primary key cannot break a referencing
-- column. Had there been one, the referencing column would have to widen in
-- the same migration or the FK would fail to revalidate.
--
-- ALTER COLUMN ... TYPE BIGINT also widens the owned sequence automatically
-- (the sequence's data type follows the column in PostgreSQL 10+), so no
-- separate ALTER SEQUENCE is needed.

-- Up Migration

ALTER TABLE clinical.notifications                      ALTER COLUMN id TYPE BIGINT;
ALTER TABLE clinical.patient_vitals                     ALTER COLUMN id TYPE BIGINT;
ALTER TABLE clinical.prescription_assignment_messages   ALTER COLUMN id TYPE BIGINT;
ALTER TABLE clinical.lab_request_messages               ALTER COLUMN id TYPE BIGINT;
ALTER TABLE public.impersonation_log                    ALTER COLUMN id TYPE BIGINT;
ALTER TABLE public.impersonation_action_log             ALTER COLUMN id TYPE BIGINT;

-- Down Migration

-- Narrowing back to INTEGER would fail outright once any id exceeds 2^31-1,
-- and would silently be fine until then — the worst combination. There is no
-- reason to want it: BIGINT costs 4 extra bytes per row and nothing else.
ALTER TABLE public.impersonation_action_log             ALTER COLUMN id TYPE INTEGER;
ALTER TABLE public.impersonation_log                    ALTER COLUMN id TYPE INTEGER;
ALTER TABLE clinical.lab_request_messages               ALTER COLUMN id TYPE INTEGER;
ALTER TABLE clinical.prescription_assignment_messages   ALTER COLUMN id TYPE INTEGER;
ALTER TABLE clinical.patient_vitals                     ALTER COLUMN id TYPE INTEGER;
ALTER TABLE clinical.notifications                      ALTER COLUMN id TYPE INTEGER;
