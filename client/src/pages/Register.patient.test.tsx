import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Picking "Patient" on step 1 used to call setStep(2) for every role. Step 2
// is the package picker, which renders for doctors only — so a patient landed
// on a screen with the "Choose your package" heading and nothing underneath
// it: no form, no packages, and no Back button (Back lives inside the step
// cards). Patient registration was unreachable. These pin the way through.

const registerUser = vi.fn();
const verifyEmail = vi.fn();

vi.mock('../services/api', () => ({
  authApi: {
    register: (...args: unknown[]) => registerUser(...args),
    verifyEmail: (...args: unknown[]) => verifyEmail(...args),
    resendVerification: vi.fn(() => Promise.resolve({})),
    googleAuth: vi.fn(),
  },
  // Imported by PlanPicker / HospitalSearchAdd at module load. Neither renders
  // on the patient path, but the named exports have to exist — and the doctor
  // step the "changed my mind" test passes through does query plans.
  planApi: { listPublic: vi.fn(() => Promise.resolve({ plans: [], features: [] })) },
  orgApi: { search: vi.fn(() => Promise.resolve({ organizations: [] })) },
}));

const authLogin = vi.fn();
vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({ login: authLogin }),
}));

vi.mock('react-hot-toast', () => ({
  default: { error: vi.fn(), success: vi.fn() },
}));

const navigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-router-dom')>()),
  useNavigate: () => navigate,
}));

import Register from './Register';

// The doctor path mounts PlanPicker, which is a useQuery caller — the patient
// path never reaches it, but the "changed my mind" test crosses through.
const renderRegister = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter><Register /></MemoryRouter>
    </QueryClientProvider>
  );
};

const pickPatient = async () => {
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: /register as patient/i }));
  return user;
};

beforeEach(() => {
  registerUser.mockReset();
  authLogin.mockReset();
  navigate.mockReset();
});
afterEach(() => vi.clearAllMocks());

describe('patient registration', () => {
  it('goes straight from role choice to the account form', async () => {
    renderRegister();
    await pickPatient();

    // The form itself — the thing that was missing entirely.
    await waitFor(() => {
      expect(screen.getByPlaceholderText('you@example.com')).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: /create account/i })).toBeInTheDocument();
    expect(screen.getByText(/registering as patient/i)).toBeInTheDocument();
  });

  it('never shows a patient the package step', async () => {
    renderRegister();
    await pickPatient();

    await waitFor(() => screen.getByPlaceholderText('you@example.com'));
    // Packages are a doctor concept; everything is free for patients.
    expect(screen.queryByText(/choose your package/i)).not.toBeInTheDocument();
  });

  it('shows two steps for a patient, not three', async () => {
    renderRegister();
    const stepper = () => screen.getByText(/create your account|choose your account type/i)
      .parentElement!.querySelector('.flex.items-center.gap-2')!;

    // Step 1 of 2 before choosing.
    expect(stepper().textContent).toBe('12');

    await pickPatient();
    await waitFor(() => screen.getByPlaceholderText('you@example.com'));
    // Still two dots, and the second one is the form — not a skipped step 3.
    expect(stepper().textContent).toBe('2');
  });

  it('can be backed out of and re-entered', async () => {
    renderRegister();
    const user = await pickPatient();

    await waitFor(() => screen.getByPlaceholderText('you@example.com'));
    await user.click(screen.getByRole('button', { name: /back/i }));

    // Back from the patient form goes to the role choice, not to the
    // doctor-only package step.
    expect(screen.getByText(/how will you use suwela/i)).toBeInTheDocument();
    expect(screen.queryByText(/choose your package/i)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /register as patient/i }));
    await waitFor(() => screen.getByPlaceholderText('you@example.com'));
  });

  it('submits as a patient with no plan_id', async () => {
    registerUser.mockResolvedValue({
      user: { id: 7, role: 'patient' },
      token: 'tok',
      refreshToken: 'ref',
    });

    renderRegister();
    const user = await pickPatient();

    await waitFor(() => screen.getByPlaceholderText('you@example.com'));
    await user.type(screen.getByPlaceholderText('Dr. Jane Smith'), 'Nimal Perera');
    await user.type(screen.getByPlaceholderText('you@example.com'), 'nimal@example.lk');
    await user.type(screen.getByPlaceholderText('Min. 10 characters'), 'LongEnoughPass1');
    await user.type(screen.getByPlaceholderText('Repeat password'), 'LongEnoughPass1');
    await user.click(screen.getByRole('button', { name: /create account/i }));

    await waitFor(() => expect(registerUser).toHaveBeenCalledTimes(1));
    const body = registerUser.mock.calls[0][0] as Record<string, unknown>;
    expect(body.role).toBe('patient');
    expect(body.email).toBe('nimal@example.lk');
    // Packages are a doctor concept — a patient must not carry one, including
    // after an abandoned doctor attempt.
    expect(body.plan_id).toBeUndefined();
    expect(body.hospital_organization_ids).toBeUndefined();

    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/patient'));
  });

  // Migration 017: registration is only finished once the emailed 6-digit
  // code is entered — then the patient is signed straight in.
  it('asks for the emailed code, then signs the patient in', async () => {
    registerUser.mockResolvedValue({
      user: { id: 9, role: 'patient', email: 'kamala@example.lk' },
      email: 'kamala@example.lk',
      emailVerificationRequired: true,
      codeSent: true,
    });
    verifyEmail.mockResolvedValue({ verified: true, user: { id: 9, role: 'patient' }, token: 'tok', refreshToken: 'ref' });

    renderRegister();
    const user = await pickPatient();

    await waitFor(() => screen.getByPlaceholderText('you@example.com'));
    await user.type(screen.getByPlaceholderText('Dr. Jane Smith'), 'Kamala Silva');
    await user.type(screen.getByPlaceholderText('you@example.com'), 'kamala@example.lk');
    await user.type(screen.getByPlaceholderText('Min. 10 characters'), 'LongEnoughPass1');
    await user.type(screen.getByPlaceholderText('Repeat password'), 'LongEnoughPass1');
    await user.click(screen.getByRole('button', { name: /create account/i }));

    await waitFor(() => expect(screen.getByText(/check your email/i)).toBeInTheDocument());
    expect(navigate).not.toHaveBeenCalled();
    expect(authLogin).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText('Digit 1'), '654321');

    await waitFor(() => expect(verifyEmail).toHaveBeenCalledWith('kamala@example.lk', '654321'));
    await waitFor(() => expect(authLogin).toHaveBeenCalledWith({ id: 9, role: 'patient' }, 'tok', 'ref'));
    expect(navigate).toHaveBeenCalledWith('/patient');
  });

  it('does not carry a package over from an abandoned doctor attempt', async () => {
    registerUser.mockResolvedValue({ user: { id: 8, role: 'patient' }, token: 'tok' });

    renderRegister();
    const user = userEvent.setup();

    // Start as a doctor (which lands on the package step), then change mind.
    await user.click(screen.getByRole('button', { name: /register as doctor/i }));
    // The phrase appears twice on this step (stepper label + card heading), so
    // match the heading specifically.
    await screen.findByRole('heading', { name: /choose your package/i });
    await user.click(screen.getByRole('button', { name: /back/i }));
    await user.click(screen.getByRole('button', { name: /register as patient/i }));

    await waitFor(() => screen.getByPlaceholderText('you@example.com'));
    // No "change package" badge should survive the switch.
    expect(screen.queryByText(/package · change/i)).not.toBeInTheDocument();
  });
});
