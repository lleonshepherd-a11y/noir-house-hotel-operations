export type StaffRole =
  | 'staff'
  | 'supervisor'
  | 'front_of_house'
  | 'duty_manager'
  | 'general_manager'
  | 'admin';

export type Resource =
  | 'internal_message'
  | 'guest_request'
  | 'task'
  | 'department_pin'
  | 'shift_handover'
  | 'announcement'
  | 'audit_event';

export type Action = 'create' | 'read' | 'update' | 'acknowledge' | 'archive';

export const managementRoles = new Set<StaffRole>(['duty_manager', 'general_manager', 'admin']);

export function isManagement(identity: StaffIdentity) {
  return managementRoles.has(identity.role);
}

export interface StaffIdentity {
  staffId: string;
  hotelId: string;
  departmentId: string;
  role: StaffRole;
}

export interface ResourceScope {
  hotelId: string;
  departmentId?: string | null;
  createdByStaffId?: string | null;
}

export interface AuditInput {
  hotelId: string;
  actorStaffId: string | null;
  actorDepartmentId: string | null;
  action: string;
  entityType: string;
  entityId: string;
  metadata?: Record<string, unknown>;
}
