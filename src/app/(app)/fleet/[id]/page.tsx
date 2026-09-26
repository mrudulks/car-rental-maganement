import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireAuth } from '@/server/auth/dal'
import { can } from '@/server/auth/permissions'
import { getVehicle } from '@/server/modules/vehicles/service'
import { CATEGORY_LABELS } from '@/server/modules/vehicles/schema'
import { updateVehicleAction } from '@/app/actions/vehicles'
import { Plate, StatusPill } from '@/components/ui'
import { VehicleForm } from '../vehicle-form'
import { DangerZone } from './danger-zone'

export const metadata = { title: 'Vehicle — Fleetdesk' }

export default async function VehiclePage(props: PageProps<'/fleet/[id]'>) {
  const { id } = await props.params
  const auth = await requireAuth()
  const vehicle = await getVehicle(auth, id)

  // A vehicle from another organization is simply not there, which is the same answer
  // the tenant layer gives.
  if (!vehicle) notFound()

  const canSetRates = can(auth.user.role, 'vehicle:setRates')
  const updateThis = updateVehicleAction.bind(null, vehicle.id)

  return (
    <div className="max-w-2xl">
      <Link href="/fleet" className="text-[15px] text-muted underline underline-offset-4">
        Fleet
      </Link>

      <div className="mt-2 flex flex-wrap items-center gap-3">
        <Plate>{vehicle.registrationNumber}</Plate>
        <h1 className="text-2xl font-semibold tracking-tight">
          {vehicle.make} {vehicle.model}
        </h1>
        <StatusPill status={vehicle.status} />
      </div>
      <p className="mt-1 text-[15px] text-muted">
        {CATEGORY_LABELS[vehicle.category]}
        {vehicle.year ? ` · ${vehicle.year}` : ''}
        {vehicle.color ? ` · ${vehicle.color}` : ''}
      </p>

      <div className="mt-8">
        <VehicleForm
          action={updateThis}
          vehicle={vehicle}
          canSetRates={canSetRates}
          submitLabel="Save changes"
        />
      </div>

      {can(auth.user.role, 'vehicle:delete') ? (
        <DangerZone vehicleId={vehicle.id} status={vehicle.status} />
      ) : null}
    </div>
  )
}
