import {
  ProjectUsersClient,
  type MemberDisplay,
} from "./ProjectUsersClient";

// PROJ-9 — Server-Wrapper für die Nutzerübersicht.
// Bekommt fertig aggregierte Mitglieder-Daten vom Server-Lader und
// reicht sie an die Client-Komponente. Logik (Modals, Server-Action-
// Aufrufe) lebt komplett in ProjectUsersClient.

type Props = {
  projectId: string;
  members: MemberDisplay[];
  myRole: "projektleiter" | "co_author";
  /** PROJ-28: Im Lesemodus sind keine neuen Einladungen möglich. */
  readOnly?: boolean;
};

export function ProjectUsersSection({ projectId, members, myRole, readOnly = false }: Props) {
  return (
    <section className="flex flex-col gap-5 border border-[#E0DCD5] bg-white p-5 sm:gap-6 sm:p-8">
      <ProjectUsersClient
        projectId={projectId}
        members={members}
        myRole={myRole}
        readOnly={readOnly}
      />
    </section>
  );
}
