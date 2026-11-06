import type { Role, TicPermission } from '@/lib/types';

export const roleDetails: Record<Role, { label: string; description: string }> = {
  admin: { label: 'Administrator', description: 'Full system administration and configuration access.' },
  request_manager: { label: 'Request manager', description: 'Manages service requests and operational workflows.' },
  approver: { label: 'Approver', description: 'Reviews requests assigned for approval.' },
  requester: { label: 'Requester', description: 'Creates requests and follows their own submissions.' },
};

export const permissionDetails: Array<{
  value: TicPermission;
  label: string;
  description: string;
  group: 'Administration' | 'Forms' | 'Requests';
}> = [
  { value: 'users.manage', label: 'Manage user accounts', description: 'Create, edit, deactivate, and restore TIC accounts.', group: 'Administration' },
  { value: 'roles.manage', label: 'Manage roles and permissions', description: 'Change which capabilities are assigned to each role.', group: 'Administration' },
  { value: 'forms.manage', label: 'Manage request forms', description: 'Create, edit, publish, and maintain service forms.', group: 'Forms' },
  { value: 'requests.create', label: 'Submit requests', description: 'Create and submit a new service request.', group: 'Requests' },
  { value: 'requests.read.all', label: 'View all requests', description: 'See requests submitted across all departments and users.', group: 'Requests' },
  { value: 'requests.read.assigned', label: 'View assigned requests', description: 'See requests assigned to the signed-in user for action.', group: 'Requests' },
  { value: 'requests.read.own', label: 'View own requests', description: 'See requests created by the signed-in user.', group: 'Requests' },
  { value: 'requests.update', label: 'Update requests', description: 'Change request details, ownership, and processing status.', group: 'Requests' },
  { value: 'requests.approve', label: 'Approve or reject requests', description: 'Complete approval decisions for assigned requests.', group: 'Requests' },
];

export const roles = Object.keys(roleDetails) as Role[];
