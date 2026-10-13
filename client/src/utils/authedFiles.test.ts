import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { openAuthedFile } from './authedFiles';

// SEC-28 moved uploaded prescriptions and lab reports behind authenticated,
// ownership-checked endpoints. That only works if the client actually sends
// the token — a plain <img src> cannot, which is the whole reason this helper
// exists. If it silently stopped attaching the header, every file would 401
// and the symptom ("files don't load") would look like a server problem.

describe('openAuthedFile', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    localStorage.setItem('token', 'test-token-123');
    global.URL.createObjectURL = vi.fn(() => 'blob:fake');
    global.URL.revokeObjectURL = vi.fn();
    vi.spyOn(window, 'open').mockImplementation(() => null);
  });

  afterEach(() => {
    global.fetch = originalFetch;
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('sends the bearer token and opens the fetched blob', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      blob: async () => new Blob(['pdf bytes']),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    await openAuthedFile('/api/consultations/7/prescription-file');

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/consultations/7/prescription-file',
      { headers: { Authorization: 'Bearer test-token-123' } }
    );
    expect(window.open).toHaveBeenCalledWith('blob:fake', '_blank');
  });

  it('omits the header entirely when there is no token', async () => {
    localStorage.removeItem('token');
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, blob: async () => new Blob([]) });
    global.fetch = fetchMock as unknown as typeof fetch;

    await openAuthedFile('/api/patient-reports/1/file');

    expect(fetchMock).toHaveBeenCalledWith('/api/patient-reports/1/file', { headers: {} });
  });

  // A 403 from these endpoints is the normal "not your file" answer, and a
  // 404 is deliberately indistinguishable from "not allowed". Either way the
  // helper must not throw into the caller's render path.
  it('does not throw when the request is rejected', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 403 }) as unknown as typeof fetch;
    vi.spyOn(window, 'alert').mockImplementation(() => undefined);

    await expect(openAuthedFile('/api/lab-requests/9/report-file')).resolves.toBeUndefined();
    expect(window.open).not.toHaveBeenCalled();
  });
});
