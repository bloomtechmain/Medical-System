import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

// PRO-11: "Please confirm your email address before logging in" used to be a
// toast and nothing else — correct, but a dead end. The password was right,
// the account exists, and the user had no action available anywhere in the
// product. These cover the way out.

const login = vi.fn();
const resendVerification = vi.fn();

vi.mock('../services/api', () => ({
  authApi: {
    login: (...args: unknown[]) => login(...args),
    resendVerification: (...args: unknown[]) => resendVerification(...args),
    mfaLogin: vi.fn(),
  },
}));

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({ login: vi.fn() }),
}));

vi.mock('react-hot-toast', () => ({
  default: { error: vi.fn(), success: vi.fn() },
}));

import Login from './Login';
import toast from 'react-hot-toast';

const renderLogin = () =>
  render(<MemoryRouter><Login /></MemoryRouter>);

const signIn = async (email = 'patient@example.lk', password = 'CorrectPass123') => {
  const user = userEvent.setup();
  await user.type(screen.getByPlaceholderText('you@example.com'), email);
  await user.type(screen.getByPlaceholderText('••••••••'), password);
  await user.click(screen.getByRole('button', { name: /sign in/i }));
  return user;
};

beforeEach(() => {
  login.mockReset();
  resendVerification.mockReset();
});
afterEach(() => vi.clearAllMocks());

describe('login with an unverified email address', () => {
  it('shows an actionable panel instead of only a toast', async () => {
    login.mockRejectedValue({
      emailUnverified: true,
      message: 'Please confirm your email address before logging in.',
    });

    renderLogin();
    await signIn();

    await waitFor(() => {
      expect(screen.getByText(/confirm your email/i)).toBeInTheDocument();
    });
    // States plainly that the credentials were fine — otherwise the user
    // reasonably assumes they typed the password wrong and retries forever.
    expect(screen.getByText(/password was correct/i)).toBeInTheDocument();
    // The address is echoed back so a typo'd registration is visible.
    expect(screen.getByText('patient@example.lk')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /send a new confirmation link/i })).toBeInTheDocument();
    // A disappearing toast is not the right surface for this.
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('resends to the address that was refused, not to whatever is typed later', async () => {
    login.mockRejectedValue({ emailUnverified: true });
    resendVerification.mockResolvedValue({ message: 'ok' });

    renderLogin();
    const user = await signIn('stuck@example.lk');

    await waitFor(() => screen.getByRole('button', { name: /send a new confirmation link/i }));
    await user.click(screen.getByRole('button', { name: /send a new confirmation link/i }));

    await waitFor(() => {
      expect(resendVerification).toHaveBeenCalledWith('stuck@example.lk');
    });
    expect(screen.getByText(/confirmation link sent/i)).toBeInTheDocument();
  });

  it('reports the same thing when the resend call fails', async () => {
    // The endpoint answers identically whether or not the address exists, so
    // a failure must not be distinguishable either — otherwise this becomes
    // an account-enumeration oracle.
    login.mockRejectedValue({ emailUnverified: true });
    resendVerification.mockRejectedValue({ message: 'boom' });

    renderLogin();
    const user = await signIn();

    await waitFor(() => screen.getByRole('button', { name: /send a new confirmation link/i }));
    await user.click(screen.getByRole('button', { name: /send a new confirmation link/i }));

    await waitFor(() => {
      expect(screen.getByText(/confirmation link sent/i)).toBeInTheDocument();
    });
    expect(screen.queryByText(/boom/i)).not.toBeInTheDocument();
  });

  it('lets the user get back to the sign-in form', async () => {
    login.mockRejectedValue({ emailUnverified: true });

    renderLogin();
    const user = await signIn();

    await waitFor(() => screen.getByText(/confirm your email/i));
    await user.click(screen.getByRole('button', { name: /back to sign in/i }));

    expect(screen.getByText(/welcome back/i)).toBeInTheDocument();
    expect(screen.queryByText(/confirm your email/i)).not.toBeInTheDocument();
  });

  it('still treats a genuinely wrong password as a normal failure', async () => {
    // The panel must not swallow ordinary 401s — otherwise a mistyped
    // password would wrongly tell the user their email needs confirming.
    login.mockRejectedValue({ message: 'Invalid credentials' });

    renderLogin();
    await signIn();

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Invalid credentials'));
    expect(screen.queryByText(/confirm your email/i)).not.toBeInTheDocument();
  });
});
