"use client";

import { IconHelpCircle, IconX } from "@tabler/icons-react";
import { useEffect, useState } from "react";

type HelpContent = {
  title: string;
  summary: string;
  steps: string[];
  tips?: string[];
};

const helpByPath: Record<string, HelpContent> = {
  "/dashboard": {
    title: "Dashboard guide",
    summary: "Use the dashboard to understand ticket volume, turnaround time, aging requests, and department activity.",
    steps: [
      "Choose a reporting period from the date-range selector.",
      "Review the summary cards for total requests, resolution time, and aging work.",
      "Use the charts to identify trends, busy departments, and status distribution.",
      "Open My requests or Manage requests when you need to act on a ticket.",
    ],
  },
  "/requests": {
    title: "My requests guide",
    summary: "Create a request and follow every ticket you submitted from one page.",
    steps: [
      "Select New request to open the request form.",
      "Choose a service, your department, and complete all required fields.",
      "Submit the request and keep the generated reference number.",
      "Use search and status filters to find an existing request.",
      "Open a row to see its current workflow step, activity, and result.",
    ],
  },
  "/service-requests": {
    title: "Manage requests guide",
    summary: "Review tickets assigned to you or your role and keep them moving through their workflow.",
    steps: [
      "Use the status, department, date, or search filters to locate work.",
      "Look for Pending your action and check the Current step column.",
      "Open the request to review its submitted details and activity.",
      "Complete the fields assigned to the current step.",
      "Select Complete step to advance it, or Reject when the request cannot proceed.",
    ],
  },
  "/admin/forms": {
    title: "Form builder manual",
    summary: "Create reusable request forms, decide who can submit them, and build a sequential role-based workflow.",
    steps: [
      "Select New form, then enter a clear form name, group, description, and status.",
      "Choose the roles that are allowed to see and submit the form.",
      "Add fields. Give each field a user-friendly label, choose its type, and add help text.",
      "Use Completed by to place a field in the requester submission or in a later workflow step.",
      "Configure validation rules and mark fields Required when they must be completed.",
      "Add workflow steps in the order they must happen, such as Approver review followed by Request manager completion.",
      "For every step, select the role or roles allowed to complete it and write clear step instructions.",
      "Add optional conditions when a step should appear only for specific earlier answers. Choose AND when all rules must match, or OR when any rule may match.",
      "Use Live preview to confirm labels, instructions, fields, and validation before publishing.",
      "Select Save form. Test the complete requester-to-approver-to-manager flow before general use.",
    ],
    tips: [
      "Use short field labels and put longer explanations in Help text.",
      "Conditions can only use requester fields or fields completed in an earlier step.",
      "Give steps action-based names such as Add approval remarks or Final review.",
      "Avoid assigning a step to more roles than necessary.",
    ],
  },
  "/admin/users": {
    title: "Users guide",
    summary: "Create and maintain local ticketing accounts without mixing them with ACT identities.",
    steps: [
      "Use search or pagination to locate an account.",
      "Select Create user to add a local ticketing account.",
      "Use the row actions to view, edit, activate, deactivate, or restore a user.",
      "Open Edit when a local user's password needs to be changed.",
    ],
  },
  "/admin/audit-logs": {
    title: "Audit logs guide",
    summary: "Review who performed an action, what happened, and when it occurred.",
    steps: [
      "Set From and To dates to narrow the activity period.",
      "Review the action, affected item, result, and date in the table.",
      "Open an entry to read its user-friendly details.",
      "Clear the dates to return to the full activity history.",
    ],
  },
  "/admin/roles": {
    title: "Roles and permissions guide",
    summary: "Control what each role can see and do across the ticketing system.",
    steps: [
      "Use Create role to add a role with a clear name and purpose.",
      "Use the Role directory to view, edit, activate, deactivate, or delete custom roles.",
      "In the permission matrix, check a capability to grant it or clear it to remove access.",
      "Save the changed role, then assign it to users or form workflow steps.",
      "Reassign every user and form before deleting a custom role.",
    ],
  },
  "/admin/sharepoint": {
    title: "SharePoint data guide",
    summary: "Synchronize the approved business-unit list used by department dropdowns and request filters.",
    steps: [
      "Review the column mapping before synchronizing.",
      "Select Sync SharePoint to retrieve the latest business units.",
      "Confirm the record count and last-synced time.",
      "Review the retrieved table to confirm department codes and names.",
    ],
  },
  "/form-request": {
    title: "Request form guide",
    summary: "Complete the selected service form and submit it to the appropriate team.",
    steps: [
      "Choose the service you need.",
      "Select your department.",
      "Complete every required field and review your information.",
      "Submit the form and save the reference number.",
    ],
  },
};

const fallbackHelp: HelpContent = {
  title: "Page guide",
  summary: "Use this page to complete your current ticketing task.",
  steps: ["Review the page heading and available actions.", "Complete required information before saving.", "Use the main navigation to move to another area."],
};

export function PageHelp({ pathname }: { pathname: string }) {
  const [open, setOpen] = useState(false);
  const content = helpByPath[pathname] || fallbackHelp;

  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [open]);

  return (
    <>
      <button
        className="page-help-button"
        type="button"
        aria-label={`Open ${content.title}`}
        title="Page help"
        onClick={() => setOpen(true)}
      >
        <IconHelpCircle size={24} />
        <span>Help</span>
      </button>
      {open && (
        <div className="modal-backdrop page-help-backdrop" onMouseDown={() => setOpen(false)}>
          <section
            className="page-help-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="page-help-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header>
              <div>
                <p className="eyebrow">How to use this page</p>
                <h2 id="page-help-title">{content.title}</h2>
                <p>{content.summary}</p>
              </div>
              <button type="button" aria-label="Close help" onClick={() => setOpen(false)}>
                <IconX size={22} />
              </button>
            </header>
            <div className="page-help-content">
              <h3>Steps</h3>
              <ol>{content.steps.map((step) => <li key={step}>{step}</li>)}</ol>
              {!!content.tips?.length && (
                <aside>
                  <h3>Good practices</h3>
                  <ul>{content.tips.map((tip) => <li key={tip}>{tip}</li>)}</ul>
                </aside>
              )}
            </div>
            <footer>
              <button className="primary" type="button" onClick={() => setOpen(false)}>Got it</button>
            </footer>
          </section>
        </div>
      )}
    </>
  );
}
