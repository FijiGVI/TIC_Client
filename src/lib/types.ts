export type Role = string;
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
  roles: Role[];
  organizationType?: string | null;
  organizationName?: string | null;
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
  stepId?: string | null;
  validation: {
    minLength?: number;
    maxLength?: number;
    min?: number;
    max?: number;
    pattern?: string;
    patternFlags?: string;
    message?: string;
  };
};
export type WorkflowStep = {
  id: string;
  name: string;
  instructions: string;
  approverRole: Role;
  approverActorId?: string | null;
  approverUserId?: string | null;
  allowedRoles: Role[];
  condition: { logic: "and" | "or"; rules: Array<{ fieldId:string; operator:"equals"|"not_equals"|"contains"|"is_empty"|"is_not_empty"; value:string }> };
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
  label: string;
  description: string;
  active: boolean;
  system: boolean;
  permissions: TicPermission[];
  createdAt?: string;
  updatedAt: string | null;
};
export type RoleOption = Pick<RolePermissionSet, "role" | "label" | "description" | "system">;
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
  assignedRoles?: Role[];
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
  id: string | number;
  actorId: string;
  email: string;
  name: string;
  firstName: string | null;
  middleName: string | null;
  lastName: string | null;
  role: Role;
  roles?: Role[];
  organizationType?: string | null;
  organizationName?: string | null;
  active: boolean;
  deactivated: boolean;
  deleted: boolean;
  mustChangePassword: boolean;
  createdAt: string;
  updatedAt: string;
  source?: "tic" | "act";
};

export type PaginationMeta = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};
