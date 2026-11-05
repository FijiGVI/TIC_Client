export type Role = "admin" | "request_manager" | "approver" | "requester";
export type TicPermission =
  | "users.manage"
  | "roles.manage"
  | "forms.manage"
  | "requests.create"
  | "requests.read.all"
  | "requests.read.assigned"
  | "requests.read.own"
  | "requests.update"
  | "requests.approve";
export type User = {
  id: string;
  email: string;
  name: string;
  role: Role;
  permissions: TicPermission[];
  mustChangePassword: boolean;
};
export type FieldType =
  | "text"
  | "textarea"
  | "email"
  | "date"
  | "time"
  | "number"
  | "select"
  | "radio"
  | "checkbox"
  | "image"
  | "pdf";
export type FormField = {
  id: string;
  label: string;
  description: string;
  type: FieldType;
  required: boolean;
  options: string[];
  validation: Record<string, string | number | string[]>;
};
export type WorkflowStep = {
  id: string;
  name: string;
  instructions: string;
  approverRole: Exclude<Role, "requester">;
  approverActorId?: string | null;
  approverUserId?: string | null;
};
export type RequestForm = {
  id: string;
  key: string;
  name: string;
  groupName: string;
  description: string;
  fields: FormField[];
  workflowSteps: WorkflowStep[];
  allowedRequesterRoles: Role[];
  active: boolean;
  createdByActorId?: string | null;
  updatedByActorId?: string | null;
  createdAt?: string;
  updatedAt?: string;
  creator?: { name: string } | null;
  updater?: { name: string } | null;
};
export type RolePermissionSet = {
  role: Role;
  permissions: TicPermission[];
  updatedAt: string | null;
};
export type TicActor = {
  id: string;
  source: "act";
  sourceUserId: number;
  email: string;
  name: string;
  role: Role;
};
export type RequestEvent = {
  id: string;
  action: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  actorSnapshot?: TicActor;
};
export type ServiceRequest = {
  id: string;
  referenceNumber: string;
  requesterActorId: string;
  requesterSnapshot: TicActor;
  formId: string;
  departmentId: string | null;
  departmentSnapshot: DepartmentSnapshot | null;
  formSnapshot: RequestForm;
  responses: Record<string, unknown>;
  status: string;
  currentStep: number | null;
  assignedActorId: string | null;
  assignedRole: Role | null;
  remarks: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  events?: RequestEvent[];
};
export type DepartmentOption = {
  id: string;
  sharepointItemId: string;
  title: string | null;
  businessUnit: string;
  entity: string | null;
};
export type DepartmentSnapshot = {
  id: string;
  sharepointItemId: string;
  code: string | null;
  name: string;
  entity: string | null;
};
export type ManagedUser = {
  id: number;
  actorId: string;
  email: string;
  name: string;
  firstName: string | null;
  lastName: string | null;
  role: Role;
  active: boolean;
  deactivated: boolean;
  deleted: boolean;
  mustChangePassword: boolean;
  createdAt: string;
  updatedAt: string;
};

export type PaginationMeta = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};
