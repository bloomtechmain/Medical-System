// PERF-04 / PRO-03: nothing was paginated — a list query grew as large as
// the table, forever. Defaults are deliberately generous (not "a page" in
// the UI sense) so they don't silently truncate any list this app
// realistically has today — there's no page-through UI client-side yet, so
// a small default would just look like data went missing. They still bound
// the real failure mode (unbounded growth over months/years), and the
// limit/offset query params are there for whenever paging controls are
// added client-side.
const DEFAULT_LIMIT = 500;
const MAX_LIMIT = 1000;

const parsePaging = (
  query: Record<string, string | undefined>,
  opts: { defaultLimit?: number; maxLimit?: number } = {}
): { limit: number; offset: number } => {
  const max = opts.maxLimit ?? MAX_LIMIT;
  const def = Math.min(opts.defaultLimit ?? DEFAULT_LIMIT, max);
  const limit = Math.min(Math.max(parseInt(query.limit as string, 10) || def, 1), max);
  const offset = Math.max(parseInt(query.offset as string, 10) || 0, 0);
  return { limit, offset };
};

export { parsePaging, DEFAULT_LIMIT, MAX_LIMIT };
