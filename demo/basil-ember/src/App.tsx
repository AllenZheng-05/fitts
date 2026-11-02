import { Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { Home } from './pages/Home'
import { MenuPage } from './pages/MenuPage'
import { ItemPage } from './pages/ItemPage'
import { CartPage } from './pages/CartPage'
import { CheckoutPage } from './pages/CheckoutPage'
import { ConfirmationPage } from './pages/ConfirmationPage'
import { ReservePage } from './pages/ReservePage'
import { AboutPage } from './pages/AboutPage'

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="menu" element={<MenuPage />} />
        <Route path="menu/:id" element={<ItemPage />} />
        <Route path="cart" element={<CartPage />} />
        <Route path="checkout" element={<CheckoutPage />} />
        <Route path="confirmation" element={<ConfirmationPage />} />
        <Route path="reserve" element={<ReservePage />} />
        <Route path="about" element={<AboutPage />} />
        <Route path="*" element={<Home />} />
      </Route>
    </Routes>
  )
}
