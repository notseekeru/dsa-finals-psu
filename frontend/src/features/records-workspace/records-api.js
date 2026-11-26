import { deleteJson, getJson, postJson, putJson } from "../../shared/api.js";

export async function createRecordsClient() {
    const data = await getJson("/records");
    if (!Array.isArray(data?.records)) {
        throw new Error("The records API returned an invalid response");
    }
    let items = data.records;

    return {
        isConnected: () => true,
        getItems: () => [...items],
        setItems: (next) => {
            items = [...next];
        },
        async saveItem(record, isEdit) {
            if (isEdit) {
                const saved = await putJson(`/records/${encodeURIComponent(record.id)}`, record);
                items = items.map((item) => (item.id === saved.record.id ? saved.record : item));
            } else {
                const saved = await postJson("/records", record);
                items = [...items, saved.record];
            }
            return [...items];
        },
        async deleteItem(id) {
            await deleteJson(`/records/${encodeURIComponent(id)}`);
            items = items.filter((item) => item.id !== id);
            return [...items];
        },
    };
}

export function sortRecords(field, direction) {
    return postJson("/records/sort", { field, direction });
}

export function searchRecords({ mode, q, field, direction }) {
    const params = new URLSearchParams({ mode, q, field, direction });
    return getJson(`/records/search?${params}`);
}
