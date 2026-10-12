import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth';
import Layout from './components/Layout';
import LoginPage from './pages/LoginPage';
import ChangePasswordPage from './pages/ChangePasswordPage';
import DashboardPage from './pages/DashboardPage';
import CarsPage from './pages/CarsPage';
import UsersPage from './pages/UsersPage';
import DriversPage from './pages/DriversPage';
import DriverPage from './pages/DriverPage';
import CarPage from './pages/CarPage';
import DriverHomePage from './pages/DriverHomePage';
import MobileHome from './pages/MobileHome';
import useIsPhone from './components/useIsPhone';
import DriverReportPage from './pages/DriverReportPage';
import PaymentsQueuePage from './pages/PaymentsQueuePage';
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

function DriverReportRoute() {
  const { user } = useAuth();
  const { search } = useLocation();
  if (user?.role === 'ADMIN') {
    const params = new URLSearchParams(search);
    params.set('tab', 'drivers');
    return <Navigate to={`/reports?${params}`} replace />;
  }
  return <DriverReportPage />;
}

function HomeRoute() {
  const { user } = useAuth();
  const isPhone = useIsPhone();
  if (isPhone && (user?.role === 'ADMIN' || user?.role === 'DISPATCHER')) return <MobileHome />;
  if (user?.role === 'ADMIN') return <Navigate to="/reports?tab=summary" replace />;
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
            path="/payments"
            element={<Guard roles={['DRIVER']}><DriverHomePage view="payments" /></Guard>}
          />
          
          <Route
            path="/driver-report"
            element={<Guard roles={['DISPATCHER', 'ADMIN']}><DriverReportRoute /></Guard>}
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
            path="/users"
            element={<Guard roles={['ADMIN']}><UsersPage /></Guard>}
          />

          <Route path="/owners" element={<Navigate to="/users?tab=owners" replace />} />
          
          <Route path="/finance" element={<Navigate to="/" replace />} />
          
          <Route path="/users/dispatchers" element={<Navigate to="/users?tab=dispatchers" replace />} />
          
          <Route
            path="/help"
            element={<Guard roles={['ADMIN', 'DISPATCHER', 'OWNER']}><Suspense fallback={null}><HelpPage /></Suspense></Guard>}
          />

          <Route 
            path="/audit" 
            element={<Navigate to="/reports?tab=audit" replace />} 
          />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  );
}