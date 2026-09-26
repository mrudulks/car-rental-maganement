import Link from 'next/link'
import { requireAuth } from '@/server/auth/dal'
import { can } from '@/server/auth/permissions'
import { createVehicleAction } from '@/app/actions/vehicles'
import { NoAccess } from '@/components/no-access'
import { VehicleForm } from '../vehicle-form'

export const metadata = { title: 'Add a vehicle — Fleetdesk' }

export default async function NewVehiclePage() {
  const auth = await requireAuth()

  // Adding a vehicle means pricing it, so this page needs the rate permission too.
  // A page says so plainly; only the action behind it throws.
  if (!can(auth.user.role, 'vehicle:setRates')) {
    return <NoAccess what="add vehicles" role={auth.user.role} />
  }

  return (
    <div className="max-w-2xl">
      <Link href="/fleet" className="text-[15px] text-muted underline underline-offset-4">
        Fleet
      </Link>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">Add a vehicle</h1>
      <p className="mt-1 text-[15px] text-muted">
        It goes on the board as available once saved.
      </p>

      <div className="mt-8">
        <VehicleForm
          action={createVehicleAction}
          canSetRates={can(auth.user.role, 'vehicle:setRates')}
          submitLabel="Add vehicle"
        />
      </div>
    </div>
  )
}
