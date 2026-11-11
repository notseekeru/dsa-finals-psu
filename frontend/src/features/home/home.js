import html from "./home.html?raw";

export function mount(el) {
    el.innerHTML = html;
}
