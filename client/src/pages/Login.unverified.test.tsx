import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

// PRO-11 / migration 017: an unverified account that signs in with the right
// password is shown the 6-digit code screen — a fresh code is sent as it
// opens — instead of a dead-end toast.

const login = vi.fn();
const resendVerification = vi.fn();
const verifyEmail = vi.fn();
const authLogin = vi.fn();

vi.mock('../services/api', () => ({
  authApi: {
    login: (...args: unknown[]) => login(...args),
    resendVerification: (...args: unknown[]) => resendVerification(...args),
    verifyEmail: (...args: unknown[]) => verifyEmail(...args),
    googleAuth: vi.fn(),
    mfaLogin: vi.fn(),
  },
}));

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({ login: authLogin }),
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
  resendVerification.mockReset().mockResolvedValue({ message: 'ok' });
  verifyEmail.mockReset();
  authLogin.mockReset();
});
afterEach(() => vi.clearAllMocks());

describe('login with an unverified email address', () => {
  it('opens the code screen and sends a fresh code to the refused address', async () => {
    login.mockRejectedValue({ emailUnverified: true, message: 'Please confirm your email address.' });

    renderLogin();
    await signIn('stuck@example.lk');

    await waitFor(() => expect(screen.getByText(/check your email/i)).toBeInTheDocument());
    // The address is echoed back so a typo'd registration is visible.
    expect(screen.getByText('stuck@example.lk')).toBeInTheDocument();
    await waitFor(() => expect(resendVerification).toHaveBeenCalledWith('stuck@example.lk'));
    expect(screen.getAllByLabelText(/digit \d/i)).toHaveLength(6);
    // A disappearing toast is not the right surface for this.
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('signs the user in once the right code is typed', async () => {
    login.mockRejectedValue({ emailUnverified: true });
    verifyEmail.mockResolvedValue({ verified: true, user: { id: 1, role: 'patient' }, token: 't', refreshToken: 'r' });

    renderLogin();
    const user = await signIn('p@example.lk');

    await waitFor(() => screen.getByLabelText('Digit 1'));
    await user.type(screen.getByLabelText('Digit 1'), '123456');

    await waitFor(() => expect(verifyEmail).toHaveBeenCalledWith('p@example.lk', '123456'));
    await waitFor(() => expect(authLogin).toHaveBeenCalledWith({ id: 1, role: 'patient' }, 't', 'r'));
  });

  it('shows the server message for a wrong code and clears the boxes', async () => {
    login.mockRejectedValue({ emailUnverified: true });
    verifyEmail.mockRejectedValue({ message: 'That code is not correct. Please check it and try again.', attemptsLeft: 4 });

    renderLogin();
    const user = await signIn();

    await waitFor(() => screen.getByLabelText('Digit 1'));
    await user.type(screen.getByLabelText('Digit 1'), '000000');

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/not correct/i));
    expect((screen.getByLabelText('Digit 1') as HTMLInputElement).value).toBe('');
    expect(authLogin).not.toHaveBeenCalled();
  });

  it('reports a fixed message when sending fails, never the server text', async () => {
    // The endpoint answers identically whether or not the address exists, so
    // a failure must not be distinguishable either (account enumeration).
    login.mockRejectedValue({ emailUnverified: true });
    resendVerification.mockRejectedValue({ message: 'boom' });

    renderLogin();
    await signIn();

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/could not send a new code/i));
    expect(screen.queryByText(/boom/i)).not.toBeInTheDocument();
  });

  it('lets the user get back to the sign-in form', async () => {
    login.mockRejectedValue({ emailUnverified: true });

    renderLogin();
    const user = await signIn();

    await waitFor(() => screen.getByText(/check your email/i));
    await user.click(screen.getByRole('button', { name: /back to sign in/i }));

    expect(screen.getByText(/welcome back/i)).toBeInTheDocument();
    expect(screen.queryByText(/check your email/i)).not.toBeInTheDocument();
  });

  it('still treats a genuinely wrong password as a normal failure', async () => {
    login.mockRejectedValue({ message: 'Invalid credentials' });

    renderLogin();
    await signIn();

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Invalid credentials'));
    expect(screen.queryByText(/check your email/i)).not.toBeInTheDocument();
  });
});
