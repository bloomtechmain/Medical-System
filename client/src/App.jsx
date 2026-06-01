import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import Layout from './components/layout/Layout';
import Login from './pages/Login';
import Register from './pages/Register';
import AdminDashboard from './pages/AdminDashboard';
import DoctorDashboard from './pages/DoctorDashboard';
import PharmacistDashboard from './pages/PharmacistDashboard';
import PatientDashboard from './pages/PatientDashboard';
import LaboratoryDashboard from './pages/LaboratoryDashboard';
import MedicalDescription from './pages/MedicalDescription';
import DoctorConsultations from './pages/DoctorConsultations';
import PharmacistConsultations from './pages/PharmacistConsultations';
import PatientHistory from './pages/PatientHistory';
import DoctorLabRequests from './pages/DoctorLabRequests';
import PatientLabReports from './pages/PatientLabReports';
import MedicalFlow from './pages/MedicalFlow';
import LaboratoryReports from './pages/LaboratoryReports';
import Medicines from './pages/Medicines';
import Suppliers from './pages/Suppliers';
import Orders from './pages/Orders';
import Sales from './pages/Sales';
import Inventory from './pages/Inventory';
import Users from './pages/Users';

const PrivateRoute = ({ children, roles }) => {
  const { user, token } = useAuth();
  if (!token) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user?.role)) return <Navigate to="/" replace />;
  return children;
};

const RoleHome = () => {
  const { user } = useAuth();
  const routes = { admin: '/admin', doctor: '/doctor', pharmacist: '/pharmacist', patient: '/patient', laboratory: '/laboratory' };
  return <Navigate to={routes[user?.role] || '/login'} replace />;
};

export default function App() {
  const { token } = useAuth();

  return (
    <Routes>
      <Route path="/login"    element={token ? <RoleHome /> : <Login />} />
      <Route path="/register" element={token ? <RoleHome /> : <Register />} />

      {/* Admin routes */}
      <Route path="/admin" element={<PrivateRoute roles={['admin']}><Layout /></PrivateRoute>}>
        <Route index element={<AdminDashboard />} />
        <Route path="users" element={<Users />} />
        <Route path="medicines" element={<Medicines />} />
        <Route path="suppliers" element={<Suppliers />} />
        <Route path="orders" element={<Orders />} />
        <Route path="sales" element={<Sales />} />
        <Route path="inventory" element={<Inventory />} />
      </Route>

      {/* Doctor routes */}
      <Route path="/doctor" element={<PrivateRoute roles={['doctor']}><Layout /></PrivateRoute>}>
        <Route index element={<DoctorDashboard />} />
        <Route path="consultations" element={<DoctorConsultations />} />
        <Route path="lab-requests"  element={<DoctorLabRequests />} />
        <Route path="history"       element={<PatientHistory />} />
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
        <Route path="medical"      element={<MedicalDescription />} />
        <Route path="lab-reports"  element={<PatientLabReports />} />
      </Route>

      {/* Laboratory routes */}
      <Route path="/laboratory" element={<PrivateRoute roles={['laboratory']}><Layout /></PrivateRoute>}>
        <Route index element={<LaboratoryDashboard />} />
        <Route path="reports" element={<LaboratoryReports />} />
      </Route>

      <Route path="/" element={token ? <RoleHome /> : <Navigate to="/login" replace />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
