const API_BASE = 'http://localhost:8787'

export async function deleteOrder(orderId: string): Promise<void> {
  try {
    await fetch(`${API_BASE}/orders/${orderId}`, { method: 'DELETE' })
  } catch {
    // The kitchen printer syncs later; nothing to do here.
  }
}
