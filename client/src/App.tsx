import { Routes, Route, Navigate } from 'react-router-dom';
import { ReactNode } from 'react';
import { useAuth } from './context/AuthContext';
import { UserRole } from './types';
import Layout from './components/layout/Layout';
import Landing from './pages/Landing';
import Login from './pages/Login';
import Register from './pages/Register';
import OrgRegister from './pages/OrgRegister';
import HospitalDashboard from './pages/HospitalDashboard';
import ClinicDashboard from './pages/ClinicDashboard';
import AdminDashboard from './pages/AdminDashboard';
import DoctorDashboard from './pages/DoctorDashboard';
import PharmacistDashboard from './pages/PharmacistDashboard';
import PatientDashboard from './pages/PatientDashboard';
import LaboratoryDashboard from './pages/LaboratoryDashboard';
import DoctorConsultations from './pages/DoctorConsultations';
import PharmacistConsultations from './pages/PharmacistConsultations';
import DoctorLabRequests from './pages/DoctorLabRequests';
import MedicalFlow from './pages/MedicalFlow';
import LaboratoryReports from './pages/LaboratoryReports';
import PatientMyReports from './pages/PatientMyReports';
import PatientConsultations from './pages/PatientConsultations';
import PatientAccessRequests from './pages/PatientAccessRequests';
import DoctorPatientView from './pages/DoctorPatientView';
import DoctorAccessRequests from './pages/DoctorAccessRequests';
import Medicines from './pages/Medicines';
import Suppliers from './pages/Suppliers';
import Orders from './pages/Orders';
import Sales from './pages/Sales';
import Inventory from './pages/Inventory';
import Users from './pages/Users';
import Organizations from './pages/Organizations';

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
    <Routes>
      <Route path="/"           element={token && user?.role ? <RoleHome /> : <Landing />} />
      <Route path="/login"      element={token && user?.role ? <RoleHome /> : <Login />} />
      <Route path="/register"   element={token && user?.role ? <RoleHome /> : <Register />} />
      <Route path="/org-register" element={token && user?.role ? <RoleHome /> : <OrgRegister />} />

      {/* Admin routes */}
      <Route path="/admin" element={<PrivateRoute roles={['admin']}><Layout /></PrivateRoute>}>
        <Route index element={<AdminDashboard />} />
        <Route path="users" element={<Users />} />
        <Route path="medicines" element={<Medicines />} />
        <Route path="suppliers" element={<Suppliers />} />
        <Route path="orders" element={<Orders />} />
        <Route path="sales" element={<Sales />} />
        <Route path="inventory" element={<Inventory />} />
        <Route path="organizations" element={<Organizations />} />
      </Route>

      {/* Hospital routes */}
      <Route path="/hospital" element={<PrivateRoute roles={['doctor']}><Layout /></PrivateRoute>}>
        <Route index element={<HospitalDashboard />} />
        <Route path="consultations"       element={<DoctorConsultations />} />
        <Route path="lab-requests"        element={<DoctorLabRequests />} />
        <Route path="patients/:patientId" element={<DoctorPatientView />} />
        <Route path="requests"            element={<DoctorAccessRequests />} />
      </Route>

      {/* Clinic routes */}
      <Route path="/clinic" element={<PrivateRoute roles={['doctor']}><Layout /></PrivateRoute>}>
        <Route index element={<ClinicDashboard />} />
        <Route path="consultations"       element={<DoctorConsultations />} />
        <Route path="lab-requests"        element={<DoctorLabRequests />} />
        <Route path="patients/:patientId" element={<DoctorPatientView />} />
        <Route path="requests"            element={<DoctorAccessRequests />} />
      </Route>

      {/* Doctor routes */}
      <Route path="/doctor" element={<PrivateRoute roles={['doctor']}><Layout /></PrivateRoute>}>
        <Route index element={<DoctorDashboard />} />
        <Route path="consultations"   element={<DoctorConsultations />} />
        <Route path="lab-requests"    element={<DoctorLabRequests />} />
        <Route path="patients"        element={<DoctorDashboard />} />
        <Route path="patients/:patientId" element={<DoctorPatientView />} />
        <Route path="requests"        element={<DoctorAccessRequests />} />
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
      </Route>

      {/* Patient routes */}
      <Route path="/patient" element={<PrivateRoute roles={['patient']}><Layout /></PrivateRoute>}>
        <Route index element={<PatientDashboard />} />
        <Route path="medical-flow" element={<MedicalFlow />} />
        <Route path="consultations" element={<PatientConsultations />} />
        <Route path="my-reports"   element={<PatientMyReports />} />
        <Route path="requests"     element={<PatientAccessRequests />} />
      </Route>

      {/* Laboratory routes */}
      <Route path="/laboratory" element={<PrivateRoute roles={['laboratory']}><Layout /></PrivateRoute>}>
        <Route index element={<LaboratoryDashboard />} />
        <Route path="reports" element={<LaboratoryReports />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
