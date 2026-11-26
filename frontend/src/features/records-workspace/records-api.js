async function readResponse(response) {
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(data?.error || `API request failed (${response.status})`);
  }
  return data;
}

export async function createRecordsClient() {
  const data = await readResponse(await fetch('/api/records', { headers: { Accept: 'application/json' } }));
  if (!Array.isArray(data?.records)) {
    throw new Error('The records API returned an invalid response');
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
        const data = await readResponse(await fetch(`/api/records/${encodeURIComponent(record.id)}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(record),
        }));
        items = items.map((item) => item.id === record.id ? data.record : item);
      } else {
        const data = await readResponse(await fetch('/api/records', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(record),
        }));
        items = [...items, data.record];
      }
      return [...items];
    },
    async deleteItem(id) {
      await readResponse(await fetch(`/api/records/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      }));
      items = items.filter((item) => item.id !== id);
      return [...items];
    },
  };
}