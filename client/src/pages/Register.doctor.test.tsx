import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Doctor registration: a specialization that isn't in the list can be typed
// in, and every hospital/clinic named is sent for certification (migration
// 015), after which the applicant sees what their registration waits on.

const registerUser = vi.fn();
vi.mock('../services/api', () => ({
  authApi: { register: (...args: unknown[]) => registerUser(...args) },
  planApi: { listPublic: vi.fn(() => Promise.resolve({ plans: [], features: [] })) },
  orgApi: { searchHospitalsClinics: vi.fn(() => Promise.resolve([])) },
}));
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ login: vi.fn() }) }));
vi.mock('react-hot-toast', () => ({ default: { error: vi.fn(), success: vi.fn() } }));

// The package picker and the hospital search hit the API; stand-ins keep the
// test about the registration form itself.
vi.mock('../components/plans/PlanPicker', () => ({
  default: ({ onChange }: { onChange: (p: unknown) => void }) => (
    <button type="button" onClick={() => onChange({ id: 1, name: 'Free' })}>pick free plan</button>
  ),
}));
let nextOrg = 0;
const ORGS = [{ id: 11, name: 'Nawaloka Hospital', org_type: 'hospital' }, { id: 12, name: 'Asiri Clinic', org_type: 'clinic' }];
vi.mock('../components/common/HospitalSearchAdd', () => ({
  default: ({ onAdd, placeholder }: { onAdd: (o: unknown) => void; placeholder?: string }) => (
    <button type="button" onClick={() => onAdd(ORGS[nextOrg++])}>{placeholder}</button>
  ),
}));

import Register from './Register';

const renderRegister = () => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <MemoryRouter><Register /></MemoryRouter>
  </QueryClientProvider>
);

const fillDoctorBasics = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(screen.getByRole('button', { name: /register as doctor/i }));
  await user.click(screen.getByRole('button', { name: /pick free plan/i }));
  await user.click(screen.getByRole('button', { name: /continue with free/i }));
  await user.type(screen.getByPlaceholderText('Dr. Jane Smith'), 'Dr. Nimal Perera');
  await user.type(screen.getByPlaceholderText('you@example.com'), 'nimal@example.lk');
  await user.type(screen.getByPlaceholderText('Min. 10 characters'), 'correct-horse-1');
  await user.type(screen.getByPlaceholderText('Repeat password'), 'correct-horse-1');
  await user.type(screen.getByPlaceholderText('+94 77 123 4567'), '0771234567');
  await user.type(screen.getByPlaceholderText('SLMC-12345'), 'SLMC-9988');
};

beforeEach(() => { registerUser.mockReset(); nextOrg = 0; });

describe('doctor registration', () => {
  it('accepts a specialization typed in when it is not in the list', async () => {
    registerUser.mockResolvedValue({ pending: true, user: {} });
    const user = userEvent.setup();
    renderRegister();
    await fillDoctorBasics(user);

    await user.selectOptions(screen.getAllByRole('combobox')[0], '__other__');
    await user.type(await screen.findByPlaceholderText(/type your specialization/i), 'Neonatology');
    await user.click(screen.getByRole('button', { name: /create account/i }));

    await waitFor(() => expect(registerUser).toHaveBeenCalled());
    const body = registerUser.mock.calls[0][0];
    expect(body.profile.specialization).toBe('Neonatology');
    expect(body.profile.specialization_other).toBeUndefined();
  });

  it('sends the main and other hospitals for certification, then shows the progress', async () => {
    registerUser.mockResolvedValue({ pending: true, user: {} });
    const user = userEvent.setup();
    renderRegister();
    await fillDoctorBasics(user);
    await user.selectOptions(screen.getAllByRole('combobox')[0], 'Cardiology');

    await user.click(screen.getByRole('button', { name: /search for your hospital or clinic on suwela/i }));
    await user.click(screen.getByRole('button', { name: /search for a hospital or clinic already on suwela/i }));
    expect(screen.getByText(/asked to/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /create account/i }));

    await waitFor(() => expect(registerUser).toHaveBeenCalled());
    const body = registerUser.mock.calls[0][0];
    expect(body.hospital_organization_ids).toEqual([11, 12]);
    expect(body.profile.hospital_affiliation).toBe('Nawaloka Hospital');

    expect(await screen.findByText(/registration received/i)).toBeInTheDocument();
    expect(screen.getByText('Nawaloka Hospital')).toBeInTheDocument();
    expect(screen.getByText('Asiri Clinic')).toBeInTheDocument();
    expect(screen.getAllByText(/waiting/i).length).toBeGreaterThan(0);
  });
});
