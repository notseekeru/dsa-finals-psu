import html from "./landing.html?raw";
import "./style.css";
import { readSession, signOut } from "../../shared/session.js";

const TITLE = "DATA SPACE | Smart Record Management";
const DESCRIPTION = "DATA SPACE, a business record management system that organizes, sorts and retrieves information.";

export function mount(el) {
    el.innerHTML = html;
    document.title = TITLE;

    const meta = document.querySelector('meta[name="description"]') ?? document.head.appendChild(document.createElement("meta"));
    meta.setAttribute("name", "description");
    meta.setAttribute("content", DESCRIPTION);

    paintSession(el);

    const target = document.getElementById(location.hash.slice(1));
    if (target) requestAnimationFrame(() => target.scrollIntoView());
}

async function paintSession(el) {
    const user = await readSession();
    const slot = el.querySelector("#auth-slot");
    if (!user || !slot) return;

    const email = document.createElement("span");
    email.className = "auth-email";
    email.textContent = user.email;
    email.title = user.email;

    const workspace = document.createElement("a");
    workspace.className = "secondary-link";
    workspace.href = "/records";
    workspace.textContent = "Open workspace";

    const out = document.createElement("button");
    out.type = "button";
    out.className = "auth-signout";
    out.textContent = "Sign out";
    out.addEventListener("click", () => void signOut());

    slot.replaceChildren(email, workspace, out);
}
