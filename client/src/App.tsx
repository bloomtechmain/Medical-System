import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { ReactNode, Suspense, lazy, useEffect } from 'react';
import { useAuth } from './context/AuthContext';
import { UserRole } from './types';
import Layout from './components/layout/Layout';
import TermsGate from './components/common/TermsGate';
import { dashboardContexts, resolveActiveContext } from './constants/dashboards';
import RequireFeature from './components/plans/RequireFeature';
import BrandLoader from './components/common/BrandLoader';
import { currentZone, zoneForPath, zoneOrigin } from './utils/zones';
import { withAuthHandoff } from './utils/authHandoff';

// PERF-10: every page was a static import, so the client shipped as one
// ~2 MB bundle regardless of role — a patient's browser downloaded the
// pharmacist's recharts-based dashboard and the admin's jspdf export code
// it would never use. React.lazy splits each page into its own chunk,
// fetched only when that route is actually visited.
const Landing               = lazy(() => import('./pages/Landing'));
const Explore               = lazy(() => import('./pages/site/Explore'));
const News                  = lazy(() => import('./pages/site/News'));
const ShareStory            = lazy(() => import('./pages/site/ShareStory'));
const About                 = lazy(() => import('./pages/site/About'));
const Help                  = lazy(() => import('./pages/site/Help'));
const Compliance            = lazy(() => import('./pages/site/Compliance'));
const Login                 = lazy(() => import('./pages/Login'));
const Register               = lazy(() => import('./pages/Register'));
const OrgRegister           = lazy(() => import('./pages/OrgRegister'));
const ForgotPassword        = lazy(() => import('./pages/ForgotPassword'));
const PrivacyPolicy         = lazy(() => import('./pages/PrivacyPolicy'));
const VerifyEmail           = lazy(() => import('./pages/VerifyEmail'));
const ChooseDashboard       = lazy(() => import('./pages/ChooseDashboard'));
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
// Migration 014: subscription packages
const MyPackage             = lazy(() => import('./pages/MyPackage'));
const AdminPlans            = lazy(() => import('./pages/AdminPlans'));

const RouteFallback = BrandLoader;

// The three-subdomain split (docs/decisions/0006-three-domain-split.md): a
// route can belong to a different zone than the one it's currently being
// rendered under (e.g. /admin loaded on app.suwela.com after a stale
// bookmark). zoneForPath/currentZone decide whether `path` is reachable here
// as-is (ordinary same-origin <Navigate>) or needs a real cross-origin
// redirect, carrying the session with it — see CrossZoneRedirect below.
const goTo = (path: string) => {
  const zone = zoneForPath(path);
  const here = currentZone();
  if (here === null || here === zone) return <Navigate to={path} replace />;
  return <CrossZoneRedirect path={path} />;
};

const CrossZoneRedirect = ({ path }: { path: string }) => {
  const { token, user } = useAuth();
  useEffect(() => {
    const origin = zoneOrigin(zoneForPath(path));
    if (!origin) return; // zones misconfigured — nothing sane to do, stay put
    const target = `${origin}${path}`;
    const url = token && user
      ? withAuthHandoff(target, { token, user, refreshToken: localStorage.getItem('refreshToken') || undefined })
      : target;
    window.location.replace(url);
  }, [path, token, user]);
  return <RouteFallback />;
};

interface PrivateRouteProps {
  children: ReactNode;
  roles?: UserRole[];
}

const PrivateRoute = ({ children, roles }: PrivateRouteProps) => {
  const { user, token } = useAuth();
  const location = useLocation();
  if (!token || !user) return goTo('/login');

  if (roles && !roles.includes(user.role as UserRole)) {
    // Requirement 1: a guard on role alone locks an organisation owner out of
    // their own organisation's dashboard whenever the two do not coincide.
    // /laboratory required role 'laboratory', so a DOCTOR who registers a
    // laboratory could never open it — the exact "same procedure for lab
    // type" case. Same for a pharmacist or lab owning a hospital, since
    // /hospital required role 'doctor'.
    //
    // So: allow through if this route is one of the user's organisation
    // dashboards. Membership is the authorisation here, and the server
    // enforces it independently on every request — this only decides which
    // screen the client will render.
    const base = '/' + (location.pathname.split('/')[1] ?? '');
    const viaOrg = dashboardContexts(user).some(c => c.kind === 'org' && c.path === base);
    if (!viaOrg) return goTo('/');
  }
  return <>{children}</>;
};

// Requirement 1: route tables and labels now live in constants/dashboards.ts,
// shared with the chooser and the switcher so the three cannot disagree about
// which dashboards exist.
//
// The old version read `user.organization?.org_type` FIRST and only fell back
// to `user.role`. That is what made a doctor-owner lose their doctor
// dashboard: with an organisation attached, /doctor was never reachable again.
const RoleHome = () => {
  const { user, logout } = useAuth();
  const contexts = dashboardContexts(user);

  if (contexts.length === 0) {
    // No usable dashboard at all — a role the client does not know how to
    // route. Signing out is better than looping on a blank screen.
    logout();
    return goTo('/login');
  }

  // More than one, and no remembered choice: ask instead of guessing. Guessing
  // is exactly the behaviour that hid the personal dashboard.
  const active = resolveActiveContext(user);
  if (!active) return goTo('/choose-dashboard');

  return goTo(active.path);
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

      {/* Public website pages. Not redirected when signed in, so the nav works
          for everyone. */}
      <Route path="/explore"     element={<Explore />} />
      <Route path="/news"        element={<News />} />
      <Route path="/share-story" element={<ShareStory />} />
      <Route path="/about"       element={<About />} />
      <Route path="/help"        element={<Help />} />
      <Route path="/compliance"  element={<Compliance />} />
      <Route path="/login"      element={token && user?.role ? <RoleHome /> : <Login />} />
      <Route path="/register"   element={token && user?.role ? <RoleHome /> : <Register />} />
      <Route path="/org-register" element={token && user?.role ? <RoleHome /> : <OrgRegister />} />
      <Route path="/forgot-password" element={token && user?.role ? <RoleHome /> : <ForgotPassword />} />
      <Route path="/reset-password"  element={token && user?.role ? <RoleHome /> : <ResetPassword />} />

      {/* PRO-11: public, and deliberately not redirected away when a session
          exists — a person may well click the confirmation link while already
          signed in on another account. */}
      <Route path="/verify-email" element={<VerifyEmail />} />

      {/* Requirement 1: the dashboard chooser. Authenticated only — there is
          nothing to choose without a session. */}
      <Route path="/choose-dashboard" element={<PrivateRoute><ChooseDashboard /></PrivateRoute>} />

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
        <Route path="plans" element={<AdminPlans />} />
        <Route path="settings" element={<AdminSettings />} />
      </Route>

      {/* Hospital routes */}
      <Route path="/hospital" element={<PrivateRoute roles={['doctor']}><Layout /></PrivateRoute>}>
        <Route index element={<HospitalDashboard />} />
        <Route path="consultations"       element={<DoctorConsultations />} />
        <Route path="lab-requests"        element={<RequireFeature feature="lab_requests"><DoctorLabRequests /></RequireFeature>} />
        <Route path="patients/:patientId" element={<DoctorPatientView />} />
        <Route path="requests"            element={<RequireFeature feature="access_requests"><DoctorAccessRequests /></RequireFeature>} />
        <Route path="appointments"        element={<RequireFeature feature="channeling"><DoctorAppointments /></RequireFeature>} />
        <Route path="settings"            element={<DoctorSettings />} />
        <Route path="team"                element={<OrgTeamSettings />} />
        <Route path="package"             element={<MyPackage />} />
      </Route>

      {/* Clinic routes */}
      <Route path="/clinic" element={<PrivateRoute roles={['doctor']}><Layout /></PrivateRoute>}>
        <Route index element={<ClinicDashboard />} />
        <Route path="consultations"       element={<DoctorConsultations />} />
        <Route path="lab-requests"        element={<RequireFeature feature="lab_requests"><DoctorLabRequests /></RequireFeature>} />
        <Route path="patients/:patientId" element={<DoctorPatientView />} />
        <Route path="requests"            element={<RequireFeature feature="access_requests"><DoctorAccessRequests /></RequireFeature>} />
        <Route path="appointments"        element={<RequireFeature feature="channeling"><DoctorAppointments /></RequireFeature>} />
        <Route path="settings"            element={<DoctorSettings />} />
        <Route path="team"                element={<OrgTeamSettings />} />
        <Route path="package"             element={<MyPackage />} />
      </Route>

      {/* Doctor routes */}
      <Route path="/doctor" element={<PrivateRoute roles={['doctor']}><Layout /></PrivateRoute>}>
        <Route index element={<DoctorDashboard />} />
        <Route path="consultations"   element={<DoctorConsultations />} />
        <Route path="lab-requests"    element={<RequireFeature feature="lab_requests"><DoctorLabRequests /></RequireFeature>} />
        <Route path="patients"        element={<DoctorDashboard />} />
        <Route path="patients/:patientId" element={<DoctorPatientView />} />
        <Route path="requests"        element={<RequireFeature feature="patient_records_access"><DoctorAccessRequests /></RequireFeature>} />
        <Route path="appointments"    element={<RequireFeature feature="online_booking"><DoctorAppointments /></RequireFeature>} />
        <Route path="settings"        element={<DoctorSettings />} />
        <Route path="package"         element={<MyPackage />} />
      </Route>

      {/* Pharmacist routes */}
      <Route path="/pharmacist" element={<PrivateRoute roles={['pharmacist']}><Layout /></PrivateRoute>}>
        <Route index element={<PharmacistDashboard />} />
        <Route path="consultations" element={<PharmacistConsultations />} />
        <Route path="medicines"     element={<Medicines />} />
        <Route path="suppliers"     element={<Suppliers />} />
        <Route path="orders"        element={<RequireFeature feature="purchase_orders"><Orders /></RequireFeature>} />
        <Route path="sales"         element={<Sales />} />
        <Route path="inventory"     element={<RequireFeature feature="inventory_reports"><Inventory /></RequireFeature>} />
        <Route path="settings"      element={<PharmacistSettings />} />
        <Route path="team"          element={<OrgTeamSettings />} />
        <Route path="package"       element={<MyPackage />} />
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
        <Route path="package" element={<MyPackage />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </Suspense>
  );
}
