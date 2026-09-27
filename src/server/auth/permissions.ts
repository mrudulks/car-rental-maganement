import type { Role } from '@/generated/prisma/enums'

/**
 * What each role may do. Checked on the server in the data access layer -- the UI hides
 * what you cannot do, but this is what actually refuses it.
 */
export const ACTIONS = [
  'vehicle:read',
  'vehicle:write',
  'vehicle:delete',
  'vehicle:setRates',
  'booking:read',
  'booking:write',
  'booking:cancel',
  'customer:read',
  'customer:write',
  'payment:read',
  'payment:record',
  'payment:refund',
  'invoice:issue',
  'branch:manage',
  'user:manage',
  'org:manage',
] as const

export type Action = (typeof ACTIONS)[number]

// Staff run the counter: they can correct a vehicle's details and take it off the road,
// but pricing and removing a vehicle from the fleet are not theirs to decide. Adding a
// vehicle needs `vehicle:setRates` too, since a new vehicle must be priced.
const STAFF: Action[] = [
  'vehicle:read',
  'vehicle:write',
  'booking:read',
  'booking:write',
  'customer:read',
  'customer:write',
  // Taking money at the counter is the job; handing it back is a decision.
  'payment:read',
  'payment:record',
  // Handing the customer their bill is part of closing a rental.
  'invoice:issue',
]

const MANAGER: Action[] = [
  ...STAFF,
  'vehicle:delete',
  'vehicle:setRates',
  'booking:cancel',
  'payment:refund',
]

const PERMISSIONS: Record<Role, readonly Action[]> = {
  STAFF,
  MANAGER,
  OWNER: [...MANAGER, 'branch:manage', 'user:manage', 'org:manage'],
}

export function can(role: Role, action: Action): boolean {
  return PERMISSIONS[role].includes(action)
}

/** Throws unless the role permits the action. Use at the top of any mutating service. */
export function assertCan(role: Role, action: Action): void {
  if (!can(role, action)) {
    throw new ForbiddenError(`Role ${role} is not allowed to ${action}`)
  }
}

export class ForbiddenError extends Error {
  readonly code = 'FORBIDDEN'
}
