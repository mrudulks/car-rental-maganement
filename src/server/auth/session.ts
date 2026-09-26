import 'server-only'
import { SignJWT, jwtVerify } from 'jose'
import { cookies } from 'next/headers'
import type { Role } from '@/generated/prisma/enums'

const COOKIE_NAME = 'rental_session'
const MAX_AGE_SECONDS = 60 * 60 * 24 * 7

export type SessionPayload = {
  userId: string
  organizationId: string
  role: Role
  branchId: string | null
}

function key() {
  const secret = process.env.SESSION_SECRET
  if (!secret) {
    throw new Error('SESSION_SECRET is not set. Copy .env.example to .env and fill it in.')
  }
  return new TextEncoder().encode(secret)
}

export async function encrypt(payload: SessionPayload) {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE_SECONDS}s`)
    .sign(key())
}

export async function decrypt(token: string | undefined): Promise<SessionPayload | null> {
  if (!token) return null
  try {
    const { payload } = await jwtVerify(token, key(), { algorithms: ['HS256'] })
    const { userId, organizationId, role, branchId } = payload as Record<string, unknown>
    if (typeof userId !== 'string' || typeof organizationId !== 'string') return null
    return {
      userId,
      organizationId,
      role: role as Role,
      branchId: typeof branchId === 'string' ? branchId : null,
    }
  } catch {
    // Expired or tampered-with token: treat as signed out rather than erroring.
    return null
  }
}

export async function createSession(payload: SessionPayload) {
  const cookieStore = await cookies()
  cookieStore.set(COOKIE_NAME, await encrypt(payload), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: MAX_AGE_SECONDS,
  })
}

export async function readSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies()
  return decrypt(cookieStore.get(COOKIE_NAME)?.value)
}

export async function destroySession() {
  const cookieStore = await cookies()
  cookieStore.delete(COOKIE_NAME)
}

export const SESSION_COOKIE_NAME = COOKIE_NAME
