# Decision records

Answers DOC-04: "The multi-tenant guide explains the database design and its
reasons. Other decisions (JWT in local storage, Railway, local file storage)
are not recorded."

Short records of decisions that are expensive to reverse or that someone will
otherwise re-litigate from scratch. Each says what was decided, what it costs,
and what would change the answer — that last part is the useful one, because a
decision record exists to be revisited, not defended.

Not for routine choices. If the answer is obvious or cheap to change, it
belongs in a code comment.

| | Decision | Status |
|---|---|---|
| [0001](0001-jwt-in-local-storage.md) | JWT in `localStorage` rather than an httpOnly cookie | Accepted, with a known cost |
| [0002](0002-railway-then-aws.md) | Railway now, AWS ECS as the target | Accepted, migration planned |
| [0003](0003-schema-per-tenant.md) | A PostgreSQL schema per organisation | Accepted |
| [0004](0004-object-storage-for-uploads.md) | Object storage for uploads, not container disk | Accepted |
| [0005](0005-pgboss-for-background-work.md) | pg-boss on the existing database, not a separate broker | Accepted |

## Format

Keep it to one page: context, decision, consequences (including the bad ones),
and what would change it. Number sequentially. Never edit an accepted record
to reflect a new decision — add a new one and mark the old one superseded, so
the reasoning at the time stays readable.
