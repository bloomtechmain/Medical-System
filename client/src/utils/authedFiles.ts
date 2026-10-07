// SEC-28: the old /uploads/<subdir>/<file> URLs worked as plain <img src>/
// <a href> because they were unauthenticated. The replacement endpoints
// (/api/consultations/:id/prescription-file, /api/lab-requests/:id/report-
// file, etc.) require a Bearer token, which plain src/href attributes can't
// send — so these fetch with the auth header and hand back a blob: URL
// instead, which <img>/<a> can use normally.

const authedFetch = async (url: string): Promise<Blob> => {
  const token = localStorage.getItem('token');
  const res = await fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (!res.ok) throw new Error(`Failed to load file (${res.status})`);
  return res.blob();
};

/** Fetches an authenticated file and opens it in a new tab — for "view/download" links. */
export const openAuthedFile = async (url: string): Promise<void> => {
  try {
    const blob = await authedFetch(url);
    const objectUrl = URL.createObjectURL(blob);
    window.open(objectUrl, '_blank');
    setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
  } catch {
    alert('Could not load the file. Please try again.');
  }
};

/** Fetches an authenticated file and triggers a real download (not just a new tab). */
export const downloadAuthedFile = async (url: string, filename: string): Promise<void> => {
  try {
    const blob = await authedFetch(url);
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = objectUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
  } catch {
    alert('Could not download the file. Please try again.');
  }
};

/** Fetches an authenticated file and resolves to a blob: URL — for <img src>. */
export const fetchAuthedImageUrl = async (url: string): Promise<string | null> => {
  try {
    const blob = await authedFetch(url);
    return URL.createObjectURL(blob);
  } catch {
    return null;
  }
};
