import { requireAuth } from '@/server/auth/dal'
import { can } from '@/server/auth/permissions'
import { getGstSettings } from '@/server/modules/billing/service'
import { NoAccess } from '@/components/no-access'
import { PageHeader } from '@/components/layout'
import { GstSettingsForm } from './gst-settings-form'

export const metadata = { title: 'Settings — Fleetdesk' }

export default async function SettingsPage() {
  const auth = await requireAuth()
  if (!can(auth.user.role, 'org:manage')) {
    return <NoAccess what="change these settings" role={auth.user.role} />
  }

  const settings = await getGstSettings(auth)

  return (
    <div className="max-w-2xl">
      <PageHeader
        title="Settings"
        meta={`${auth.organization.name} · used on every invoice you issue`}
      />
      <div className="mt-8">
        <GstSettingsForm settings={settings} />
      </div>
    </div>
  )
}
