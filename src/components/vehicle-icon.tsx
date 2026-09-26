import { Car, Bike, Truck, Bus, CircleDashed } from 'lucide-react'
import type { VehicleCategory } from '@/generated/prisma/enums'

/**
 * A category icon per row, so a long fleet list can be scanned for "the trucks" without
 * reading every line. Informative, not decoration.
 */
const ICONS = {
  CAR: Car,
  VAN: Bus,
  TRUCK: Truck,
  BIKE: Bike,
  SCOOTER: Bike,
  OTHER: CircleDashed,
} as const

export function VehicleIcon({
  category,
  className = 'size-4 text-muted',
}: {
  category: VehicleCategory
  className?: string
}) {
  const Icon = ICONS[category] ?? CircleDashed
  return <Icon className={className} strokeWidth={1.75} aria-hidden="true" />
}
