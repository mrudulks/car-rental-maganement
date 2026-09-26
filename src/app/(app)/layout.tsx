import { requireAuth } from '@/server/auth/dal'
import { AppShell } from './app-shell'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, organization } = await requireAuth()

  return (
    <AppShell
      user={{ name: user.name, role: user.role }}
      organization={{ name: organization.name }}
    >
      {children}
    </AppShell>
  )
}
