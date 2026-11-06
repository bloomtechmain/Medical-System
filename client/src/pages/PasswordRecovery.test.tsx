import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const forgotPassword = vi.fn();
const resetPassword = vi.fn();
const changePassword = vi.fn();
const navigate = vi.fn();

vi.mock('../services/api', () => ({
  authApi: {
    forgotPassword: (...a: unknown[]) => forgotPassword(...a),
    resetPassword: (...a: unknown[]) => resetPassword(...a),
    changePassword: (...a: unknown[]) => changePassword(...a),
  },
}));
vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 1, email: 'me@suwela.lk', role: 'doctor' }, logout: vi.fn() }),
}));
vi.mock('react-hot-toast', () => ({ default: { error: vi.fn(), success: vi.fn() } }));
vi.mock('react-router-dom', async (orig) => ({ ...(await orig<typeof import('react-router-dom')>()), useNavigate: () => navigate }));

import ForgotPassword from './ForgotPassword';
import ResetPassword from './ResetPassword';
import ChangePasswordPanel from '../components/common/ChangePasswordPanel';

const wrap = (ui: React.ReactNode, path = '/') => render(
  <QueryClientProvider client={new QueryClient()}>
    <MemoryRouter initialEntries={[path]}>{ui}</MemoryRouter>
  </QueryClientProvider>
);

beforeEach(() => {
  forgotPassword.mockReset().mockResolvedValue({ message: 'ok' });
  resetPassword.mockReset();
  changePassword.mockReset();
  navigate.mockReset();
});

describe('forgot password page', () => {
  it('shows the recovery steps and confirms without revealing whether the account exists', async () => {
    wrap(<ForgotPassword />);
    expect(screen.getByText(/enter the email address you registered with/i)).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText(/email address/i), ' someone@x.lk ');
    await userEvent.click(screen.getByRole('button', { name: /send reset link/i }));

    await waitFor(() => expect(screen.getByText(/check your email/i)).toBeInTheDocument());
    expect(forgotPassword).toHaveBeenCalledWith('someone@x.lk');
    expect(screen.getByText('someone@x.lk')).toBeInTheDocument();
    expect(screen.getByText(/belongs to a suwela account/i)).toBeInTheDocument();
  });
});

describe('reset password page', () => {
  it('asks for a new link when the token is missing', () => {
    wrap(<ResetPassword />, '/reset-password');
    expect(screen.getByText(/link expired/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /request a new link/i })).toHaveAttribute('href', '/forgot-password');
  });

  it('resets the password and sends the user to sign in', async () => {
    resetPassword.mockResolvedValue({ message: 'ok' });
    wrap(<ResetPassword />, '/reset-password?token=abc');

    await userEvent.type(screen.getByLabelText(/^new password/i), 'a-long-new-password');
    await userEvent.type(screen.getByLabelText(/confirm new password/i), 'a-long-new-password');
    await userEvent.click(screen.getByRole('button', { name: /reset password/i }));

    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/login'));
    expect(resetPassword).toHaveBeenCalledWith({ token: 'abc', newPassword: 'a-long-new-password' });
  });

  it('turns an expired link into the "request a new link" screen', async () => {
    resetPassword.mockRejectedValue({ message: 'Invalid or expired reset link' });
    wrap(<ResetPassword />, '/reset-password?token=old');

    await userEvent.type(screen.getByLabelText(/^new password/i), 'a-long-new-password');
    await userEvent.type(screen.getByLabelText(/confirm new password/i), 'a-long-new-password');
    await userEvent.click(screen.getByRole('button', { name: /reset password/i }));

    await waitFor(() => expect(screen.getByText(/link expired/i)).toBeInTheDocument());
  });
});

describe('settings: password & account recovery panel', () => {
  it('emails a reset link to the signed-in account', async () => {
    wrap(<ChangePasswordPanel />);
    expect(screen.getByText('me@suwela.lk')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /email me a reset link/i }));

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(/reset link sent/i));
    expect(forgotPassword).toHaveBeenCalledWith('me@suwela.lk');
  });
});
