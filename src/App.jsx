import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom'
import DashboardLayout from './layouts/DashboardLayout.jsx'
import { AppProvider } from './services/AppContext.jsx'
import { AuthProvider } from './services/AuthContext.jsx'
import Dashboard from './pages/Dashboard.jsx'
import Customers from './pages/Customers.jsx'
import Measurements from './pages/Measurements.jsx'
import Orders from './pages/Orders.jsx'
import OrderDetails from './pages/OrderDetails.jsx'
import Payments from './pages/Payments.jsx'
import Staff from './pages/Staff.jsx'
import Inventory from './pages/Inventory.jsx'
import Settings from './pages/Settings.jsx'
import Login from './pages/Login.jsx'
import RequireAuth from './components/RequireAuth.jsx'
import StorageRecovery from './components/StorageRecovery.jsx'
import useAppData from './services/useAppData.jsx'
import useAuth from './services/useAuth.jsx'
import CloudWorkspaceInitializer from './components/CloudWorkspaceInitializer.jsx'

function WorkspaceDataGate() {
  const { storageState, retryStorageSave, dataReady } = useAppData()
  if (storageState.status === 'loading') {
    return <main className="storage-recovery"><p role="status">Loading your TailorPro workspace…</p></main>
  }
  if (storageState.status === 'uninitialized') {
    return <CloudWorkspaceInitializer />
  }
  if (storageState.status === 'repository-error' && !dataReady) {
    return (
      <main className="storage-recovery">
        <section className="storage-recovery-card" role="alert">
          <span className="eyebrow">TAILORPRO DATA REPOSITORY</span>
          <h1>{storageErrorTitle(storageState.errorType)}</h1>
          <p>{storageState.error}</p>
          <p>TailorPro did not switch repositories or load sample data. Check your owner sign-in, connection, repository configuration, and Firestore access.</p>
        </section>
      </main>
    )
  }
  if (storageState.status === 'corrupt' || storageState.status === 'unavailable') {
    return <StorageRecovery storageState={storageState} />
  }

  return <>
      {['write-error', 'operation-error', 'repository-error'].includes(storageState.status) && (
        <div className="storage-warning" role="alert">
          <span>{storageState.error}{storageState.status === 'write-error' ? ' Current changes remain available in this tab but are not saved.' : ' No changes from this operation were applied.'}</span>
          {storageState.status === 'write-error' && <button type="button" className="button button-secondary" onClick={retryStorageSave}>Retry saving</button>}
        </div>
      )}
      <Outlet />
  </>
}

function storageErrorTitle(errorType) {
  if (errorType === 'unauthenticated') return 'Owner sign-in required'
  if (errorType === 'permission-denied') return 'Firestore access denied'
  if (errorType === 'network') return 'Firestore connection unavailable'
  if (errorType === 'malformed-data') return 'Cloud data needs attention'
  return 'Workspace could not be loaded'
}

function WorkspaceProviders() {
  return <AppProvider><WorkspaceDataGate /></AppProvider>
}

function LoginRoute() {
  const { authEnabled, status, retryAuth } = useAuth()
  const location = useLocation()
  if (!authEnabled) return <Navigate to="/" replace />
  if (status === 'loading') return <main className="auth-loading" role="status">Checking your owner sign-in…</main>
  if (status === 'authenticated') {
    const requestedPath = location.state?.from
    const safePath = typeof requestedPath?.pathname === 'string'
      && requestedPath.pathname.startsWith('/')
      && !requestedPath.pathname.startsWith('//')
      ? `${requestedPath.pathname}${requestedPath.search || ''}${requestedPath.hash || ''}`
      : '/'
    return <Navigate to={safePath} replace />
  }
  if (status === 'error') {
    return (
      <main className="auth-loading">
        <section className="storage-recovery-card" role="alert">
          <span className="eyebrow">SECURE OWNER ACCESS</span>
          <h1>Sign-in status unavailable</h1>
          <p>TailorPro could not verify your sign-in. Check your connection and try again.</p>
          <button type="button" className="button button-primary" onClick={retryAuth}>Try again</button>
        </section>
      </main>
    )
  }
  return <Login />
}

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginRoute />} />
          <Route element={<RequireAuth />}>
            <Route element={<WorkspaceProviders />}>
              <Route element={<DashboardLayout />}>
                <Route index element={<Dashboard />} />
                <Route path="customers" element={<Customers />} />
                <Route path="measurements" element={<Measurements />} />
                <Route path="orders" element={<Orders />} />
                <Route path="orders/:orderId" element={<OrderDetails />} />
                <Route path="payments" element={<Payments />} />
                <Route path="staff" element={<Staff />} />
                <Route path="inventory" element={<Inventory />} />
                <Route path="settings" element={<Settings />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Route>
            </Route>
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}

export default App
