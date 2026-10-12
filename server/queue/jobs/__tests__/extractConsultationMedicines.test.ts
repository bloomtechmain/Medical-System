import { boss } from '../../boss';
import { JOB_NAME, enqueue } from '../extractConsultationMedicines';

jest.mock('../../boss', () => ({
  boss: { send: jest.fn(), work: jest.fn(), createQueue: jest.fn() },
  DEFAULT_QUEUE_OPTIONS: { retryLimit: 3, retryDelay: 30, retryBackoff: true },
}));

describe('extractConsultationMedicines.enqueue', () => {
  it('sends the payload (including the acting user, needed for RLS) under the job\'s own name', async () => {
    (boss.send as jest.Mock).mockResolvedValue('job-id-789');

    const payload = {
      consultationId: 10,
      prescriptionFilename: 'rx_5_123_abc.jpg',
      actorId: 5,
      actorRole: 'doctor',
    };
    await enqueue(payload);

    expect(boss.send).toHaveBeenCalledWith(JOB_NAME, payload);
  });
});
