import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth';
import Layout from './components/Layout';
import LoginPage from './pages/LoginPage';
import ChangePasswordPage from './pages/ChangePasswordPage';
import DashboardPage from './pages/DashboardPage';
import CarsPage from './pages/CarsPage';
import DispatchersPage from './pages/DispatchersPage';
import DriversPage from './pages/DriversPage';
import DriverPage from './pages/DriverPage';
import CarPage from './pages/CarPage';
import DriverHomePage from './pages/DriverHomePage';
import DriverReportPage from './pages/DriverReportPage';
import PaymentsQueuePage from './pages/PaymentsQueuePage';
import AuditPage from './pages/AuditPage';
import OwnersPage from './pages/OwnersPage';
import FinancePage from './pages/FinancePage';
import AssignmentsPage from './pages/AssignmentsPage';
import DailyReportsPage from './pages/DailyReportsPage';
import ServicePage from './pages/ServicePage';
import NotificationsPage from './pages/NotificationsPage';
import ReportsPage from './pages/ReportsPage';
import SettingsPage from './pages/SettingsPage';
import ProfilePage from './pages/ProfilePage';
import { lazy, Suspense } from 'react';

const HelpPage = lazy(() => import('./pages/HelpPage'));

function Guard({ roles, children }) {
  const { user, loading } = useAuth();

  if (loading) {
    return <div className="main">Загрузка...</div>;
  }

  if (!user) return <Navigate to="/login" replace />;
  if (user.must_change_password) return <Navigate to="/change-password" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />;
  return children;
}

function HomeRoute() {
  const { user } = useAuth();
  return user?.role === 'DRIVER' ? <DriverHomePage /> : <DashboardPage />;
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/change-password" element={<ChangePasswordPage />} />
        
        <Route element={<Guard><Layout /></Guard>}>
          <Route path="/" element={<HomeRoute />} />
          
          <Route
            path="/driver-report"
            element={<Guard roles={['DISPATCHER', 'ADMIN']}><DriverReportPage /></Guard>}
          />

          <Route 
            path="/profile" 
            element={<Guard><ProfilePage /></Guard>} 
          />
          
          <Route 
            path="/payments-queue" 
            element={<Guard roles={['DISPATCHER', 'ADMIN']}><PaymentsQueuePage /></Guard>} 
          />
          
          <Route 
            path="/assignments" 
            element={<Guard roles={['DISPATCHER', 'ADMIN']}><AssignmentsPage /></Guard>} 
          />
          
          <Route 
            path="/daily-reports" 
            element={<Guard roles={['DISPATCHER', 'ADMIN']}><DailyReportsPage /></Guard>} 
          />
          
          <Route 
            path="/service" 
            element={<Guard roles={['DISPATCHER', 'ADMIN']}><ServicePage /></Guard>} 
          />
          
          <Route 
            path="/notifications" 
            element={<Guard roles={['ADMIN']}><NotificationsPage /></Guard>} 
          />
          
          <Route 
            path="/reports" 
            element={<Guard roles={['ADMIN']}><ReportsPage /></Guard>} 
          />
          
          <Route 
            path="/settings" 
            element={<Guard roles={['ADMIN']}><SettingsPage /></Guard>} 
          />
          
          <Route 
            path="/cars" 
            element={<Guard roles={['DISPATCHER', 'ADMIN', 'OWNER']}><CarsPage /></Guard>} 
          />
          
          <Route
            path="/cars/:id"
            element={<Guard roles={['DISPATCHER', 'ADMIN', 'OWNER']}><CarPage /></Guard>}
          />

          <Route 
            path="/drivers" 
            element={<Guard roles={['DISPATCHER', 'ADMIN']}><DriversPage /></Guard>} 
          />

          <Route
            path="/drivers/:id"
            element={<Guard roles={['DISPATCHER', 'ADMIN']}><DriverPage /></Guard>}
          />
          
          <Route 
            path="/owners" 
            element={<Guard roles={['ADMIN']}><OwnersPage /></Guard>} 
          />
          
          <Route 
            path="/finance" 
            element={<Guard roles={['ADMIN', 'OWNER']}><FinancePage /></Guard>} 
          />
          
          <Route 
            path="/users/dispatchers" 
            element={<Guard roles={['ADMIN']}><DispatchersPage /></Guard>} 
          />
          
          <Route
            path="/help"
            element={<Guard roles={['ADMIN', 'DISPATCHER', 'OWNER']}><Suspense fallback={null}><HelpPage /></Suspense></Guard>}
          />

          <Route 
            path="/audit" 
            element={<Guard roles={['ADMIN']}><AuditPage /></Guard>} 
          />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  );
}