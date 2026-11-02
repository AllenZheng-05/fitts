import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import App from './App'
import { CartProvider } from './context/CartContext'

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <CartProvider>
        <App />
      </CartProvider>
    </MemoryRouter>,
  )
}

describe('app routes', () => {
  it('renders the home hero', () => {
    renderAt('/')
    expect(screen.getByRole('heading', { name: /pizza from the fire/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /order pickup/i })).toBeInTheDocument()
  })

  it('renders the menu with category filters', () => {
    renderAt('/menu')
    expect(screen.getByRole('heading', { name: /fired to order/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Pizzas' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /view margherita classica/i })).toBeInTheDocument()
  })

  it('renders an item page with size and topping controls', () => {
    renderAt('/menu/margherita')
    expect(screen.getByRole('heading', { name: 'Margherita Classica' })).toBeInTheDocument()
    expect(screen.getByText('10″ Personal', { exact: false })).toBeInTheDocument()
    expect(screen.getByLabelText(/pepperoni/i)).toBeInTheDocument()
  })

  it('shows the empty cart state', () => {
    renderAt('/cart')
    expect(screen.getByRole('heading', { name: /your cart is empty/i })).toBeInTheDocument()
  })

  it('shows hours and address on about', () => {
    renderAt('/about')
    expect(screen.getAllByText(/128 Fournier Street/).length).toBeGreaterThan(0)
    expect(screen.getByRole('heading', { name: 'Hours', level: 2 })).toBeInTheDocument()
  })
})
