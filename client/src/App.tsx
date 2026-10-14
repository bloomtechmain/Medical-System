import { Routes, Route, Navigate } from 'react-router-dom';
import { ReactNode, Suspense, lazy } from 'react';
import { useAuth } from './context/AuthContext';
import { UserRole } from './types';
import Layout from './components/layout/Layout';
import TermsGate from './components/common/TermsGate';

// PERF-10: every page was a static import, so the client shipped as one
// ~2 MB bundle regardless of role — a patient's browser downloaded the
// pharmacist's recharts-based dashboard and the admin's jspdf export code
// it would never use. React.lazy splits each page into its own chunk,
// fetched only when that route is actually visited.
const Landing               = lazy(() => import('./pages/Landing'));
const Login                 = lazy(() => import('./pages/Login'));
const Register               = lazy(() => import('./pages/Register'));
const OrgRegister           = lazy(() => import('./pages/OrgRegister'));
const ForgotPassword        = lazy(() => import('./pages/ForgotPassword'));
const PrivacyPolicy         = lazy(() => import('./pages/PrivacyPolicy'));
const VerifyEmail           = lazy(() => import('./pages/VerifyEmail'));
const Terms                 = lazy(() => import('./pages/Terms'));
const ResetPassword         = lazy(() => import('./pages/ResetPassword'));
const HospitalDashboard     = lazy(() => import('./pages/HospitalDashboard'));
const ClinicDashboard       = lazy(() => import('./pages/ClinicDashboard'));
const AdminDashboard        = lazy(() => import('./pages/AdminDashboard'));
const DoctorDashboard       = lazy(() => import('./pages/DoctorDashboard'));
const PharmacistDashboard   = lazy(() => import('./pages/PharmacistDashboard'));
const PatientDashboard      = lazy(() => import('./pages/PatientDashboard'));
const LaboratoryDashboard   = lazy(() => import('./pages/LaboratoryDashboard'));
const DoctorConsultations   = lazy(() => import('./pages/DoctorConsultations'));
const PharmacistConsultations = lazy(() => import('./pages/PharmacistConsultations'));
const DoctorLabRequests     = lazy(() => import('./pages/DoctorLabRequests'));
const MedicalFlow           = lazy(() => import('./pages/MedicalFlow'));
const LaboratoryReports     = lazy(() => import('./pages/LaboratoryReports'));
const PatientMyReports      = lazy(() => import('./pages/PatientMyReports'));
const PatientLabReports     = lazy(() => import('./pages/PatientLabReports'));
const PatientConsultations  = lazy(() => import('./pages/PatientConsultations'));
const PatientAccessRequests = lazy(() => import('./pages/PatientAccessRequests'));
const DoctorPatientView     = lazy(() => import('./pages/DoctorPatientView'));
const DoctorAccessRequests  = lazy(() => import('./pages/DoctorAccessRequests'));
const DoctorAppointments    = lazy(() => import('./pages/DoctorAppointments'));
const BookDoctor            = lazy(() => import('./pages/BookDoctor'));
const PatientSettings       = lazy(() => import('./pages/PatientSettings'));
const DoctorSettings        = lazy(() => import('./pages/DoctorSettings'));
const PharmacistSettings    = lazy(() => import('./pages/PharmacistSettings'));
const LaboratorySettings    = lazy(() => import('./pages/LaboratorySettings'));
const OrgTeamSettings       = lazy(() => import('./pages/OrgTeamSettings'));
const AdminSettings         = lazy(() => import('./pages/AdminSettings'));
const LaboratoryCatalog     = lazy(() => import('./pages/LaboratoryCatalog'));
const Medicines             = lazy(() => import('./pages/Medicines'));
const Suppliers             = lazy(() => import('./pages/Suppliers'));
const Orders                = lazy(() => import('./pages/Orders'));
const Sales                 = lazy(() => import('./pages/Sales'));
const Inventory             = lazy(() => import('./pages/Inventory'));
const Users                 = lazy(() => import('./pages/Users'));
const Organizations         = lazy(() => import('./pages/Organizations'));

const RouteFallback = () => (
  <div className="flex items-center justify-center h-screen text-gray-400">Loading…</div>
);

interface PrivateRouteProps {
  children: ReactNode;
  roles?: UserRole[];
}

const PrivateRoute = ({ children, roles }: PrivateRouteProps) => {
  const { user, token } = useAuth();
  if (!token || !user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role as UserRole)) return <Navigate to="/" replace />;
  return <>{children}</>;
};

const ROLE_ROUTES: Record<string, string> = {
  admin: '/admin', doctor: '/doctor', pharmacist: '/pharmacist',
  patient: '/patient', laboratory: '/laboratory',
};

const ORG_ROUTES: Record<string, string> = {
  hospital: '/hospital', clinic: '/clinic',
  pharmacy: '/pharmacist', laboratory: '/laboratory',
};

const RoleHome = () => {
  const { user, logout } = useAuth();
  const orgType = user?.organization?.org_type;
  const dest = orgType
    ? (ORG_ROUTES[orgType] ?? ROLE_ROUTES[user?.role ?? ''])
    : (user?.role ? ROLE_ROUTES[user.role] : null);
  if (!dest) {
    logout();
    return <Navigate to="/login" replace />;
  }
  return <Navigate to={dest} replace />;
};

export default function App() {
  const { token, user } = useAuth();

  return (
    <Suspense fallback={<RouteFallback />}>
    {/* COMP-02: prompts for acceptance when this account is not on the
        current Terms/Privacy version. Renders nothing otherwise. */}
    {token && user?.role && <TermsGate />}
    <Routes>
      <Route path="/"           element={token && user?.role ? <RoleHome /> : <Landing />} />
      <Route path="/welcome"    element={<Landing />} />
      <Route path="/login"      element={token && user?.role ? <RoleHome /> : <Login />} />
      <Route path="/register"   element={token && user?.role ? <RoleHome /> : <Register />} />
      <Route path="/org-register" element={token && user?.role ? <RoleHome /> : <OrgRegister />} />
      <Route path="/forgot-password" element={token && user?.role ? <RoleHome /> : <ForgotPassword />} />
      <Route path="/reset-password"  element={token && user?.role ? <RoleHome /> : <ResetPassword />} />

      {/* PRO-11: public, and deliberately not redirected away when a session
          exists — a person may well click the confirmation link while already
          signed in on another account. */}
      <Route path="/verify-email" element={<VerifyEmail />} />

      {/* COMP-02: both documents must be readable before anyone has an
          account — the sign-up form links to them — so these stay public and
          are NOT redirected away for a logged-in user, unlike /login and
          /register above. A logged-in patient looking up the privacy policy
          should get the privacy policy. */}
      <Route path="/privacy" element={<PrivacyPolicy />} />
      <Route path="/terms"   element={<Terms />} />

      {/* Admin routes */}
      <Route path="/admin" element={<PrivateRoute roles={['admin']}><Layout /></PrivateRoute>}>
        <Route index element={<AdminDashboard />} />
        <Route path="users" element={<Users />} />
        <Route path="medicines" element={<Medicines />} />
        <Route path="suppliers" element={<Suppliers />} />
        <Route path="inventory" element={<Inventory />} />
        <Route path="organizations" element={<Organizations />} />
        <Route path="settings" element={<AdminSettings />} />
      </Route>

      {/* Hospital routes */}
      <Route path="/hospital" element={<PrivateRoute roles={['doctor']}><Layout /></PrivateRoute>}>
        <Route index element={<HospitalDashboard />} />
        <Route path="consultations"       element={<DoctorConsultations />} />
        <Route path="lab-requests"        element={<DoctorLabRequests />} />
        <Route path="patients/:patientId" element={<DoctorPatientView />} />
        <Route path="requests"            element={<DoctorAccessRequests />} />
        <Route path="appointments"        element={<DoctorAppointments />} />
        <Route path="settings"            element={<DoctorSettings />} />
        <Route path="team"                element={<OrgTeamSettings />} />
      </Route>

      {/* Clinic routes */}
      <Route path="/clinic" element={<PrivateRoute roles={['doctor']}><Layout /></PrivateRoute>}>
        <Route index element={<ClinicDashboard />} />
        <Route path="consultations"       element={<DoctorConsultations />} />
        <Route path="lab-requests"        element={<DoctorLabRequests />} />
        <Route path="patients/:patientId" element={<DoctorPatientView />} />
        <Route path="requests"            element={<DoctorAccessRequests />} />
        <Route path="appointments"        element={<DoctorAppointments />} />
        <Route path="settings"            element={<DoctorSettings />} />
        <Route path="team"                element={<OrgTeamSettings />} />
      </Route>

      {/* Doctor routes */}
      <Route path="/doctor" element={<PrivateRoute roles={['doctor']}><Layout /></PrivateRoute>}>
        <Route index element={<DoctorDashboard />} />
        <Route path="consultations"   element={<DoctorConsultations />} />
        <Route path="lab-requests"    element={<DoctorLabRequests />} />
        <Route path="patients"        element={<DoctorDashboard />} />
        <Route path="patients/:patientId" element={<DoctorPatientView />} />
        <Route path="requests"        element={<DoctorAccessRequests />} />
        <Route path="appointments"    element={<DoctorAppointments />} />
        <Route path="settings"        element={<DoctorSettings />} />
      </Route>

      {/* Pharmacist routes */}
      <Route path="/pharmacist" element={<PrivateRoute roles={['pharmacist']}><Layout /></PrivateRoute>}>
        <Route index element={<PharmacistDashboard />} />
        <Route path="consultations" element={<PharmacistConsultations />} />
        <Route path="medicines"     element={<Medicines />} />
        <Route path="suppliers"     element={<Suppliers />} />
        <Route path="orders"        element={<Orders />} />
        <Route path="sales"         element={<Sales />} />
        <Route path="inventory"     element={<Inventory />} />
        <Route path="settings"      element={<PharmacistSettings />} />
        <Route path="team"          element={<OrgTeamSettings />} />
      </Route>

      {/* Patient routes */}
      <Route path="/patient" element={<PrivateRoute roles={['patient']}><Layout /></PrivateRoute>}>
        <Route index element={<PatientDashboard />} />
        <Route path="medical-flow" element={<MedicalFlow />} />
        <Route path="consultations" element={<PatientConsultations />} />
        <Route path="lab-tests"    element={<PatientLabReports />} />
        <Route path="my-reports"   element={<PatientMyReports />} />
        <Route path="requests"     element={<PatientAccessRequests />} />
        <Route path="book-doctor"  element={<BookDoctor />} />
        <Route path="settings"     element={<PatientSettings />} />
      </Route>

      {/* Laboratory routes */}
      <Route path="/laboratory" element={<PrivateRoute roles={['laboratory']}><Layout /></PrivateRoute>}>
        <Route index element={<LaboratoryDashboard />} />
        <Route path="reports" element={<LaboratoryReports />} />
        <Route path="catalog" element={<LaboratoryCatalog />} />
        <Route path="settings" element={<LaboratorySettings />} />
        <Route path="team" element={<OrgTeamSettings />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </Suspense>
  );
}
