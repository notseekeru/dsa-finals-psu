import { readSession, signOut } from "../../shared/session.js";
import workspaceHtml from "./workspace.html?raw";
import { mountRecordsWorkspace } from "./workspace.js";

export const recordsWorkspaceView = {
    async mount(target) {
        if (!(await readSession())) {
            location.replace("/signin");
            return;
        }
        target.innerHTML = workspaceHtml;
        target.querySelector("#dsaSignOutBtn").addEventListener("click", () => void signOut());
        await mountRecordsWorkspace(target);
    },
};
