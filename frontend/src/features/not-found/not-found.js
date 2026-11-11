import html from "./not-found.html?raw";

export function mount(el) {
    el.innerHTML = html;
}
