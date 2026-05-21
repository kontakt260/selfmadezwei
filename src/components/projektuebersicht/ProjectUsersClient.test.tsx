import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

// Server-Actions mocken BEVOR der Import.
vi.mock("@/app/projektuebersicht/[project_id]/members-actions", () => ({
  createInvitationAction: vi.fn(),
  removeMemberAction: vi.fn(),
  changeRoleAction: vi.fn(),
  leaveProjectAction: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { ProjectUsersClient, type MemberDisplay } from "./ProjectUsersClient";

const PROJECT_ID = "bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb";
const ME_USER = "11111111-1111-4111-a111-111111111111";
const OTHER_USER = "22222222-2222-4222-a222-222222222222";

const SOLO_PL: MemberDisplay = {
  memberId: "m1",
  userId: ME_USER,
  fullName: "Anna Test",
  email: "anna@example.com",
  role: "projektleiter",
  isMe: true,
};

const TEAM: MemberDisplay[] = [
  SOLO_PL,
  {
    memberId: "m2",
    userId: OTHER_USER,
    fullName: "Bob Mitglied",
    email: "bob@example.com",
    role: "co_author",
    isMe: false,
  },
];

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ProjectUsersClient — Sichtbarkeit nach Rolle", () => {
  it("PL sieht 'Nutzer hinzufügen'-Button", () => {
    render(
      <ProjectUsersClient projectId={PROJECT_ID} members={[SOLO_PL]} myRole="projektleiter" />,
    );
    expect(screen.getByRole("button", { name: /Nutzer hinzufügen/ })).toBeInTheDocument();
  });

  it("Co-Autor sieht KEINE Verwaltungs-Buttons (Add, Trash, Rollen-Toggle)", () => {
    render(
      <ProjectUsersClient
        projectId={PROJECT_ID}
        members={[SOLO_PL, { ...SOLO_PL, memberId: "co-mem", isMe: true, role: "co_author" }]}
        myRole="co_author"
      />,
    );
    expect(screen.queryByRole("button", { name: /Nutzer hinzufügen/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /entfernen/i })).not.toBeInTheDocument();
  });
});

describe("ProjectUsersClient — Last-PL-Schutz", () => {
  it("Trash-Button ist disabled, wenn das Member der einzige PL ist", () => {
    render(
      <ProjectUsersClient projectId={PROJECT_ID} members={[SOLO_PL]} myRole="projektleiter" />,
    );
    const trash = screen.getByRole("button", { name: /Anna Test.*entfernen/ });
    expect(trash).toBeDisabled();
    expect(trash).toHaveAttribute(
      "title",
      "Mindestens ein Projektleiter muss verbleiben.",
    );
  });

  it("Rollen-Toggle ist disabled für den einzigen PL", () => {
    render(
      <ProjectUsersClient projectId={PROJECT_ID} members={[SOLO_PL]} myRole="projektleiter" />,
    );
    // Es gibt nur einen Rollen-Toggle in einem Team mit einem Mitglied
    const toggles = screen.getAllByRole("combobox");
    expect(toggles[0]).toBeDisabled();
  });

  it("'Projekt verlassen' ist disabled für den einzigen PL", () => {
    render(
      <ProjectUsersClient projectId={PROJECT_ID} members={[SOLO_PL]} myRole="projektleiter" />,
    );
    const leave = screen.getByRole("button", { name: /Projekt verlassen/ });
    expect(leave).toBeDisabled();
  });

  it("Mit 2 PLs sind beide Trash-Buttons enabled", () => {
    const twoPls: MemberDisplay[] = [
      SOLO_PL,
      {
        memberId: "m2",
        userId: OTHER_USER,
        fullName: "Bob",
        email: "bob@example.com",
        role: "projektleiter",
        isMe: false,
      },
    ];
    render(
      <ProjectUsersClient projectId={PROJECT_ID} members={twoPls} myRole="projektleiter" />,
    );
    const trashAnna = screen.getByRole("button", { name: /Anna Test.*entfernen/ });
    const trashBob = screen.getByRole("button", { name: /Bob.*entfernen/ });
    expect(trashAnna).toBeEnabled();
    expect(trashBob).toBeEnabled();
  });
});

describe("ProjectUsersClient — AddUserModal Step-Switch", () => {
  it("öffnet Modal in Step 1 mit Email/Rolle-Feldern", () => {
    render(
      <ProjectUsersClient projectId={PROJECT_ID} members={TEAM} myRole="projektleiter" />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Nutzer hinzufügen/ }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByLabelText("E-Mail-Adresse")).toBeInTheDocument();
    expect(screen.getByLabelText("Rolle")).toBeInTheDocument();
  });

  it("Submit-Button ist disabled, solange Email ungültig", () => {
    render(
      <ProjectUsersClient projectId={PROJECT_ID} members={TEAM} myRole="projektleiter" />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Nutzer hinzufügen/ }));
    const submit = screen.getByRole("button", { name: /Einladen/ });
    expect(submit).toBeDisabled();

    // Ungültiges Format
    fireEvent.change(screen.getByLabelText("E-Mail-Adresse"), {
      target: { value: "kein-email" },
    });
    expect(submit).toBeDisabled();

    // Gültiges Format
    fireEvent.change(screen.getByLabelText("E-Mail-Adresse"), {
      target: { value: "neu@example.com" },
    });
    expect(submit).toBeEnabled();
  });
});

describe("ProjectUsersClient — Anzeigename-Fallback", () => {
  it("nutzt Email-Local-Part wenn full_name leer ist", () => {
    const noName: MemberDisplay[] = [
      { ...SOLO_PL, fullName: "" },
    ];
    render(
      <ProjectUsersClient projectId={PROJECT_ID} members={noName} myRole="projektleiter" />,
    );
    expect(screen.getByText(/Anna/)).toBeInTheDocument(); // anna (Title-Case)
  });
});
