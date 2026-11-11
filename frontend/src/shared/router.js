export function start(target, table) {
    const routes = new Map(Object.entries(table));

    if (!(target instanceof Element)) throw new Error("router target is missing");
    for (const [path, view] of routes) {
        if (typeof view.mount !== "function") throw new Error(`route ${path} needs an exported mount()`);
    }
    if (!routes.has("*")) throw new Error('router needs a "*" route');

    const render = () => {
        const view = routes.get(location.pathname) ?? routes.get("*");
        try {
            view.mount(target);
        } catch (error) {
            console.error("[router]", error);
            target.innerHTML = "<main><h1>Something broke</h1><p>Reload the page.</p></main>";
        }
    };

    document.addEventListener("click", (event) => {
        if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        const link = event.target instanceof Element ? event.target.closest("a") : null;
        if (!link || link.target || link.hasAttribute("download")) return;
        const url = new URL(link.href);
        if (url.origin !== location.origin) return;
        event.preventDefault();
        history.pushState(null, "", url);
        render();
        window.scrollTo(0, 0);
    });

    window.addEventListener("popstate", render);
    render();
}
