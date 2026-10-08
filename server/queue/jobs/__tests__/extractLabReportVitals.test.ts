import { boss } from '../../boss';
import { JOB_NAME, enqueue } from '../extractLabReportVitals';

jest.mock('../../boss', () => ({
  boss: { send: jest.fn(), work: jest.fn(), createQueue: jest.fn() },
  DEFAULT_QUEUE_OPTIONS: { retryLimit: 3, retryDelay: 30, retryBackoff: true },
}));

// PERF-06: the one thing most likely to silently break this wiring is a
// mismatch between the job name/payload enqueue() sends and what register()'s
// boss.work() call is listening for — this pins enqueue()'s half of that
// contract so a typo in either file shows up as a failing test, not a job
// that's queued forever and never picked up.
describe('extractLabReportVitals.enqueue', () => {
  it('sends the payload under the job\'s own name', async () => {
    (boss.send as jest.Mock).mockResolvedValue('job-id-123');

    const payload = {
      labRequestId: 1,
      laboratoryId: 2,
      patientId: 3,
      reportFilename: 'lab_2_123_abc.pdf',
      reportNotes: 'notes',
      vitalsData: undefined,
    };
    await enqueue(payload);

    expect(boss.send).toHaveBeenCalledWith(JOB_NAME, payload);
  });
});
