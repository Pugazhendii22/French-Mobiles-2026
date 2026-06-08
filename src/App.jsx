import { lazy, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { SettingsProvider } from './context/SettingsContext';
import PWAInstallPrompt from './components/PWAInstallPrompt';
import ErrorBoundary from './components/common/ErrorBoundary';

// Lazy load components
const Login = lazy(() => import('./pages/Login'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const AdminSetup = lazy(() => import('./pages/AdminSetup'));
const StaffManagement = lazy(() => import('./pages/admin/StaffManagement'));
const CustomerList = lazy(() => import('./pages/customers/CustomerList'));
const CustomerView = lazy(() => import('./pages/customers/CustomerView'));
const SecondHandList = lazy(() => import('./pages/inventory/SecondHandList'));
const SecondHandView = lazy(() => import('./pages/inventory/SecondHandView'));
const ProductList = lazy(() => import('./pages/products/ProductList'));
const ProductView = lazy(() => import('./pages/products/ProductView'));
const ServiceOrderList = lazy(() => import('./pages/service/ServiceOrderList'));
const ServiceOrderView = lazy(() => import('./pages/service/ServiceOrderView'));
const SalesList = lazy(() => import('./pages/sales/SalesList'));
const SalesView = lazy(() => import('./pages/sales/SalesView'));
const EnquiryList = lazy(() => import('./pages/enquiries/EnquiryList'));
const EnquiryView = lazy(() => import('./pages/enquiries/EnquiryView'));
const LabelRegistryList = lazy(() => import('./pages/admin/LabelRegistryList'));
const ReportsPage = lazy(() => import('./pages/reports/ReportsPage'));
const TaskManagement = lazy(() => import('./pages/admin/TaskManagement'));
const MyTasks = lazy(() => import('./pages/staff/MyTasks'));
const ScanResult = lazy(() => import('./pages/scan/ScanResult'));
const ScannerPage = lazy(() => import('./pages/scan/ScannerPage'));
const RatingPage = lazy(() => import('./pages/rating/RatingPage'));
const RatingsList = lazy(() => import('./pages/admin/RatingsList'));
const SettingsPage = lazy(() => import('./pages/admin/SettingsPage'));
const DuePaymentsPage = lazy(() => import('./pages/payments/DuePaymentsPage'));

const PageLoader = () => (
  <div className="min-h-screen flex items-center justify-center bg-[#0f172a]">
    <div className="flex flex-col items-center gap-4">
      <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
      <p className="text-blue-400 font-medium animate-pulse">French Mobiles Loading...</p>
    </div>
  </div>
);

const ProtectedRoute = ({ children }) => {
  const { currentUser } = useAuth();

  if (!currentUser) {
    return <Navigate to="/login" replace />;
  }

  return children;
};

function App() {
  return (
    <AuthProvider>
      <SettingsProvider>
        <Router>
          <ErrorBoundary>
            <Suspense fallback={<PageLoader />}>
              <Routes>
                <Route path="/setup" element={<AdminSetup />} />
                <Route path="/login" element={<Login />} />
                <Route path="/rate/:token" element={<RatingPage />} />
                <Route path="/scan/:labelNumber" element={<ScanResult />} />
                <Route path="/" element={<Navigate to="/login" replace />} />
                <Route
                  path="/dashboard"
                  element={
                    <ProtectedRoute>
                      <Dashboard />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/admin/labels"
                  element={
                    <ProtectedRoute>
                      <LabelRegistryList />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/scanner"
                  element={
                    <ProtectedRoute>
                      <ScannerPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/customers"
                  element={
                    <ProtectedRoute>
                      <CustomerList />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/customers/:id"
                  element={
                    <ProtectedRoute>
                      <CustomerView />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/inventory/second-hand"
                  element={
                    <ProtectedRoute>
                      <SecondHandList />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/inventory/second-hand/:id"
                  element={
                    <ProtectedRoute>
                      <SecondHandView />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/products"
                  element={
                    <ProtectedRoute>
                      <ProductList />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/products/:id"
                  element={
                    <ProtectedRoute>
                      <ProductView />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/service"
                  element={
                    <ProtectedRoute>
                      <ServiceOrderList />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/service/:id"
                  element={
                    <ProtectedRoute>
                      <ServiceOrderView />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/sales"
                  element={
                    <ProtectedRoute>
                      <SalesList />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/sales/:id"
                  element={
                    <ProtectedRoute>
                      <SalesView />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/enquiries"
                  element={
                    <ProtectedRoute>
                      <EnquiryList />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/enquiries/:id"
                  element={
                    <ProtectedRoute>
                      <EnquiryView />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/reports"
                  element={
                    <ProtectedRoute>
                      <ReportsPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/admin/staff"
                  element={
                    <ProtectedRoute>
                      <StaffManagement />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/admin/tasks"
                  element={
                    <ProtectedRoute>
                      <TaskManagement />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/admin/ratings"
                  element={
                    <ProtectedRoute>
                      <RatingsList />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/admin/settings"
                  element={
                    <ProtectedRoute>
                      <SettingsPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/tasks"
                  element={
                    <ProtectedRoute>
                      <MyTasks />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/due-payments"
                  element={
                    <ProtectedRoute>
                      <DuePaymentsPage />
                    </ProtectedRoute>
                  }
                />
                <Route path="*" element={<Navigate to="/login" replace />} />
              </Routes>
            </Suspense>
          </ErrorBoundary>
        </Router>
        <PWAInstallPrompt />
      </SettingsProvider>
    </AuthProvider>
  );
}

export default App;
