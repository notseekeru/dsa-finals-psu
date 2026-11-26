async function request(method, path, body) {
    const response = await fetch(`/api${path}`, {
        method,
        headers: body === undefined ? { accept: "application/json" } : { accept: "application/json", "content-type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
        const error = new Error(payload.error ?? `${method} /api${path} returned ${response.status}`);
        error.status = response.status;
        error.field = payload.field;
        throw error;
    }
    return payload;
}

export const getJson = (path) => request("GET", path);
export const postJson = (path, body) => request("POST", path, body);
export const putJson = (path, body) => request("PUT", path, body);
export const deleteJson = (path) => request("DELETE", path);
