export const ASAP = 'asap'

export interface PickupSlot {
  id: string
  label: string
}

function formatTime(d: Date): string {
  const h = d.getHours()
  const m = d.getMinutes()
  const suffix = h >= 12 ? 'PM' : 'AM'
  const hour = h % 12 === 0 ? 12 : h % 12
  return `${hour}:${m.toString().padStart(2, '0')} ${suffix}`
}

export function pickupSlots(count = 5): PickupSlot[] {
  const t = new Date()
  t.setMinutes(t.getMinutes() + 30)
  t.setMinutes(Math.ceil(t.getMinutes() / 15) * 15, 0, 0)
  const slots: PickupSlot[] = [{ id: ASAP, label: 'As soon as possible' }]
  for (let i = 0; i < count; i++) {
    const label = formatTime(t)
    slots.push({ id: label, label })
    t.setMinutes(t.getMinutes() + 15)
  }
  return slots
}
