import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { RouteChunkFallback } from './components/skeletons'
import SiteHeader from './components/SiteHeader'

const HomePage = lazy(() => import('./pages/HomePage'))
const OrderPage = lazy(() => import('./pages/OrderPage'))
const SuccessPage = lazy(() => import('./pages/SuccessPage'))

export default function App() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-orange-50 via-white to-orange-50">
      <SiteHeader />

      <main className="mx-auto w-full max-w-md px-4 pb-24">
        <Suspense fallback={<RouteChunkFallback />}>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/order/:packageId" element={<OrderPage />} />
            <Route path="/success/:orderId" element={<SuccessPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </main>
    </div>
  )
}
