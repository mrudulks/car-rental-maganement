import { redirect } from 'next/navigation'
import { getAuth } from '@/server/auth/dal'

export default async function HomePage() {
  redirect((await getAuth()) ? '/dashboard' : '/login')
}
