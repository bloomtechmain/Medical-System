import { businessTodayStr } from '../appointmentController';

// PRO-30: the server's own local date used to decide "today"/"past date".
// If the server runs in UTC and it's between 00:00 and 05:30 Sri Lanka time,
// UTC's calendar date is still "yesterday" relative to Colombo — a patient
// booking "today" at 00:30 Colombo time would have been told it's in the
// past. businessTodayStr() must read the business time zone, not the
// server's, regardless of what time zone the process itself runs in.
describe('appointmentController.businessTodayStr', () => {
  const realTZ = process.env.TZ;

  afterEach(() => {
    jest.useRealTimers();
    process.env.TZ = realTZ;
  });

  it('returns the Colombo calendar date even when the server process runs in UTC past its own midnight boundary', () => {
    process.env.TZ = 'UTC';
    // 2026-01-01 19:30 UTC = 2026-01-02 01:00 Asia/Colombo (UTC+5:30) —
    // already "tomorrow" in Colombo, still "today" in UTC.
    jest.useFakeTimers().setSystemTime(new Date('2026-01-01T19:30:00Z'));

    expect(businessTodayStr()).toBe('2026-01-02');
  });

  it('matches the server-local date once both calendars agree (midday, no boundary ambiguity)', () => {
    process.env.TZ = 'UTC';
    jest.useFakeTimers().setSystemTime(new Date('2026-06-15T10:00:00Z'));

    expect(businessTodayStr()).toBe('2026-06-15');
  });
});
