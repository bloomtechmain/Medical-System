import { boss } from '../../boss';
import { JOB_NAME, enqueue } from '../extractPatientReportVitals';

jest.mock('../../boss', () => ({
  boss: { send: jest.fn(), work: jest.fn(), createQueue: jest.fn() },
  DEFAULT_QUEUE_OPTIONS: { retryLimit: 3, retryDelay: 30, retryBackoff: true },
}));

describe('extractPatientReportVitals.enqueue', () => {
  it('sends the payload under the job\'s own name', async () => {
    (boss.send as jest.Mock).mockResolvedValue('job-id-456');

    const payload = { patientId: 1, patientReportId: 2, filename: 'pr_1_123_abc.pdf' };
    await enqueue(payload);

    expect(boss.send).toHaveBeenCalledWith(JOB_NAME, payload);
  });
});
