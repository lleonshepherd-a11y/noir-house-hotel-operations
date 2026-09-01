import type { Action, Resource, ResourceScope, StaffIdentity } from './types';

const managementRoles = new Set(['duty_manager', 'general_manager', 'admin']);
const guestRequestRoles = new Set(['front_of_house', 'duty_manager', 'general_manager', 'admin']);

export function canAccess(
  identity: StaffIdentity,
  action: Action,
  resource: Resource,
  scope: ResourceScope,
): boolean {
  if (identity.hotelId !== scope.hotelId) return false;

  if (resource === 'audit_event') {
    return action === 'read' && managementRoles.has(identity.role);
  }

  if (resource === 'guest_request') {
    return guestRequestRoles.has(identity.role);
  }

  if (resource === 'announcement') {
    if (action === 'read' || action === 'acknowledge') return true;
    return identity.role === 'general_manager' || identity.role === 'admin';
  }

  if (resource === 'department_pin' || resource === 'shift_handover') {
    if (!scope.departmentId) return false;
    return identity.departmentId === scope.departmentId || managementRoles.has(identity.role);
  }

  if (resource === 'task') {
    if (action === 'create') return true;
    if (!scope.departmentId) return false;
    return identity.departmentId === scope.departmentId || managementRoles.has(identity.role);
  }

  return true;
}

export function assertAccess(
  identity: StaffIdentity,
  action: Action,
  resource: Resource,
  scope: ResourceScope,
) {
  if (!canAccess(identity, action, resource, scope)) {
    throw new Response('Forbidden', { status: 403 });
  }
}
