import { readSession } from "../../shared/session.js";
import workspaceHtml from "./workspace.html?raw";
import { mountRecordsWorkspace } from "./workspace.js";

export const recordsWorkspaceView = {
    async mount(target) {
        if (!(await readSession())) {
            location.replace("/signin");
            return;
        }
        target.innerHTML = workspaceHtml;
        await mountRecordsWorkspace(target);
    },
};
