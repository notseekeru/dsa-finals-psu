import { deleteJson, getJson, postJson, putJson } from "../../shared/api.js";

function recordsParams(datasetId, extra = {}) {
    const params = new URLSearchParams(extra);
    if (datasetId) params.set("dataset", datasetId);
    return params;
}

export async function createRecordsClient() {
    let items = [];
    const fetchRecords = async (params = new URLSearchParams()) => {
        const query = params.toString();
        const data = await getJson(query ? `/records?${query}` : "/records");
        if (!Array.isArray(data?.records)) {
            throw new Error("The records API returned an invalid response");
        }
        items = data.records;
        return data;
    };
    await fetchRecords();

    return {
        getItems: () => [...items],
        setItems: (next) => {
            items = [...next];
        },
        async listRecords(datasetId) {
            await fetchRecords(recordsParams(datasetId));
            return [...items];
        },
        async sortRecords(field, dir, datasetId) {
            const data = await fetchRecords(recordsParams(datasetId, { sortField: field, sortDir: dir }));
            return { records: [...items], metrics: data.metrics };
        },
        async searchRecords({ mode, q, field, direction, dataset }) {
            const params = recordsParams(dataset, { mode, q, field, direction });
            const data = await getJson(`/records/search?${params}`);
            if (Array.isArray(data?.matches)) items = data.matches;
            return data;
        },
        async saveItem(record, isEdit) {
            const body = { ...record, data: record.data ?? {} };
            if (isEdit) {
                const saved = await putJson(`/records/${encodeURIComponent(record.id)}`, body);
                items = items.map((item) => (item.id === saved.record.id ? saved.record : item));
            } else {
                const saved = await postJson("/records", body);
                items = [...items, saved.record];
            }
            return [...items];
        },
        async deleteItem(id) {
            await deleteJson(`/records/${encodeURIComponent(id)}`);
            items = items.filter((item) => item.id !== id);
            return [...items];
        },
        async listDatasets() {
            const datasets = (await getJson("/datasets")).datasets;
            if (!Array.isArray(datasets)) {
                throw new Error("The datasets API returned an invalid response");
            }
            return datasets;
        },
        createDataset: async (name, columns) => (await postJson("/datasets", { name, columns })).dataset,
        async deleteDataset(id) {
            const result = await deleteJson(`/datasets/${encodeURIComponent(id)}`);
            items = items.filter((item) => item.datasetId !== id);
            return result;
        },
        async importRecords(datasetId, records) {
            const result = await postJson("/records/bulk", { datasetId, records });
            items = [...items, ...(result.records ?? [])];
            return result;
        },
        stats: (datasetId) => getJson(datasetId ? `/records/stats?dataset=${encodeURIComponent(datasetId)}` : "/records/stats"),
    };
}
