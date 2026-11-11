export async function getJson(path) {
    const response = await fetch(`/api${path}`, { headers: { accept: "application/json" } });
    if (!response.ok) throw new Error(`GET /api${path} returned ${response.status}`);
    return response.json();
}
