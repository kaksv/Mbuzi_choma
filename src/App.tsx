import { Navigate, Route, Routes } from 'react-router-dom'
import HomePage from './pages/HomePage'
import OrderPage from './pages/OrderPage'
import SuccessPage from './pages/SuccessPage'
import SiteHeader from './components/SiteHeader'

export default function App() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-orange-50 via-white to-orange-50">
      <SiteHeader />

      <main className="mx-auto w-full max-w-md px-4 pb-24">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/order/:packageId" element={<OrderPage />} />
          <Route path="/success/:orderId" element={<SuccessPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  )
}
