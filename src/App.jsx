import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import DashboardLayout from './layouts/DashboardLayout.jsx'
import { AppProvider } from './services/AppContext.jsx'
import Dashboard from './pages/Dashboard.jsx'
import Customers from './pages/Customers.jsx'
import Measurements from './pages/Measurements.jsx'
import Orders from './pages/Orders.jsx'
import OrderDetails from './pages/OrderDetails.jsx'
import Payments from './pages/Payments.jsx'
import Staff from './pages/Staff.jsx'
import Inventory from './pages/Inventory.jsx'
import Settings from './pages/Settings.jsx'
import StorageRecovery from './components/StorageRecovery.jsx'
import useAppData from './services/useAppData.jsx'

function AppContent() {
  const { storageState, retryStorageSave } = useAppData()
  if (storageState.status === 'loading') {
    return <main className="storage-recovery"><p role="status">Loading your TailorPro workspace…</p></main>
  }
  if (storageState.status === 'corrupt' || storageState.status === 'unavailable') {
    return <StorageRecovery storageState={storageState} />
  }

  return (
    <BrowserRouter>
      {['write-error', 'operation-error'].includes(storageState.status) && (
        <div className="storage-warning" role="alert">
          <span>{storageState.error}{storageState.status === 'write-error' ? ' Current changes remain available in this tab but are not saved.' : ' No changes from this operation were applied.'}</span>
          {storageState.status === 'write-error' && <button type="button" className="button button-secondary" onClick={retryStorageSave}>Retry saving</button>}
        </div>
      )}
      <Routes>
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
      </Routes>
    </BrowserRouter>
  )
}

function App() {
  return (
    <AppProvider>
      <AppContent />
    </AppProvider>
  )
}

export default App
