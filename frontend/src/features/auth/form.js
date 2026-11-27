import { postJson } from "../../shared/api.js";
import { readSession } from "../../shared/session.js";

export async function mountForm(el, markup, { path, pending }) {
    if (await readSession()) {
        location.replace("/records");
        return;
    }

    el.innerHTML = markup;

    const form = el.querySelector("form");
    const button = form.querySelector("button");
    const label = button.textContent;
    el.querySelector("#email").focus();

    form.addEventListener("submit", async (event) => {
        event.preventDefault();
        for (const slot of form.querySelectorAll("[role=alert]")) slot.textContent = "";

        button.disabled = true;
        button.textContent = pending;

        try {
            await postJson(path, Object.fromEntries(new FormData(form)));
            location.assign("/records");
        } catch (error) {
            button.disabled = false;
            button.textContent = label;
            const known = error.field === "email" || error.field === "password";
            form.querySelector(known ? `#${error.field}-error` : "#form-error").textContent = Number.isInteger(error.status) ? error.message : "Something went wrong";
        }
    });
}
