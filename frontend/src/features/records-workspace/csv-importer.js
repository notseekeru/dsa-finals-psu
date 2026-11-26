const MAPPING_ALIASES = {
    recordId: ["record id", "recordid", "order id", "id", "code", "sku"],
    date: ["date", "order date", "created at", "created", "schedule", "appointment date"],
    amount: ["amount", "price", "balance", "total", "cost", "fee", "qty", "quantity"],
    category: ["category", "type"],
    status: ["status", "state", "condition"],
    name: ["name", "customer name", "customer", "client", "brand", "company", "item", "product", "title", "branch"],
};

const MIN_FUZZY_ALIAS_LENGTH = 4;

export function parseCsv(text) {
    const input = String(text ?? "").replace(/^\uFEFF/, "");
    const grid = [];
    let currentRow = [];
    let currentField = "";
    let inQuotes = false;
    let line = 1;
    let quoteLine = 1;

    for (let i = 0; i < input.length; i++) {
        const ch = input[i];
        const next = input[i + 1];

        if (inQuotes) {
            if (ch === '"' && next === '"') {
                currentField += '"';
                i++;
            } else if (ch === '"') {
                inQuotes = false;
            } else {
                if (ch === "\n") line++;
                currentField += ch;
            }
        } else if (ch === '"') {
            inQuotes = true;
            quoteLine = line;
        } else if (ch === ",") {
            currentRow.push(currentField.trim());
            currentField = "";
        } else if (ch === "\r" && next === "\n") {
            currentRow.push(currentField.trim());
            grid.push(currentRow);
            currentRow = [];
            currentField = "";
            i++;
            line++;
        } else if (ch === "\n" || ch === "\r") {
            currentRow.push(currentField.trim());
            grid.push(currentRow);
            currentRow = [];
            currentField = "";
            line++;
        } else {
            currentField += ch;
        }
    }

    if (inQuotes) {
        return { headers: [], rows: [], problems: [], fatal: { row: quoteLine, reason: "unterminated quoted field" } };
    }

    if (currentField.length > 0 || currentRow.length > 0) {
        currentRow.push(currentField.trim());
        grid.push(currentRow);
    }

    const nonEmptyRows = grid.filter((row) => row.some((cell) => cell !== ""));
    if (nonEmptyRows.length === 0) {
        return { headers: [], rows: [], problems: [], fatal: null };
    }

    const headers = nonEmptyRows[0].map((raw, index) => raw || `Column ${index + 1}`);
    const rows = nonEmptyRows.slice(1);
    const problems = [];
    const seenHeaders = new Set();

    for (const label of headers) {
        const key = normalizeKey(label);
        if (seenHeaders.has(key)) {
            problems.push({ row: 0, column: label, reason: "duplicate column" });
        }
        seenHeaders.add(key);
    }

    rows.forEach((cells, index) => {
        for (let i = headers.length; i < cells.length; i++) {
            problems.push({ row: index + 1, column: `Column ${i + 1}`, reason: "extra value has no header" });
        }
    });

    return { headers, rows, problems, fatal: null };
}

export function detectMapping(headers) {
    const normalized = headers.map((header) => normalizeKey(header));
    const claimed = new Set();
    const picked = {};
    const find = (aliases, fuzzy) => {
        for (const alias of aliases) {
            if (fuzzy && alias.length < MIN_FUZZY_ALIAS_LENGTH) continue;
            const index = normalized.findIndex((header, i) => !claimed.has(i) && (fuzzy ? header.includes(alias) : header === alias));
            if (index !== -1) return index;
        }
        return -1;
    };

    // AI HERE: alias priority plus exact-before-fuzzy keeps "Qty,Price" resolving amount to Price and stops short aliases like "id" matching "Paid". Per-dataset header overrides are the upgrade path.
    for (const fuzzy of [false, true]) {
        for (const [key, aliases] of Object.entries(MAPPING_ALIASES)) {
            if (picked[key] != null) continue;
            const index = find(aliases, fuzzy);
            if (index === -1) continue;
            claimed.add(index);
            picked[key] = headers[index];
        }
    }

    return {
        recordId: picked.recordId ?? null,
        name: picked.name ?? null,
        amount: picked.amount ?? null,
        date: picked.date ?? null,
        category: picked.category ?? null,
        status: picked.status ?? null,
    };
}

export function mapRows(headers, rows, mapping) {
    const columnIndex = new Map(headers.map((header, index) => [header, index]));
    const records = [];
    const problems = [];
    const seenRecordIds = new Set();
    let skipped = 0;

    rows.forEach((cells, index) => {
        const rowNumber = index + 1;
        const cell = (key) => {
            const header = mapping[key];
            const position = header == null ? undefined : columnIndex.get(header);
            return position === undefined ? "" : String(cells[position] ?? "");
        };
        const flag = (column, reason) => problems.push({ row: rowNumber, column: column ?? null, reason });

        const recordId = cell("recordId");
        if (recordId && seenRecordIds.has(recordId)) {
            skipped++;
            flag(mapping.recordId, "duplicate record id");
            return;
        }
        if (recordId) seenRecordIds.add(recordId);

        const name = cell("name");
        if (!name) flag(mapping.name, "missing name");

        const amount = parseAmount(cell("amount"));
        if (!amount.ok) flag(mapping.amount, "amount not a number");

        const date = parseDate(cell("date"));
        if (!date.ok) flag(mapping.date, "date not a valid date");

        records.push({
            recordId,
            name: name || `Imported Row ${rowNumber}`,
            category: cell("category") || "Customer",
            status: cell("status") || "Active",
            amount: amount.value,
            date: date.value,
            archived: false,
            data: Object.fromEntries(headers.map((header, position) => [header, cells[position] ?? ""])),
        });
    });

    return { records, problems, skipped };
}

function normalizeKey(str) {
    return String(str ?? "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .trim();
}

function parseAmount(raw) {
    const text = String(raw ?? "").trim();
    if (text === "") return { value: 0, ok: true };
    const cleaned = text.replace(/[^0-9.-]/g, "");
    const value = cleaned === "" ? Number.NaN : Number(cleaned);
    return Number.isFinite(value) ? { value, ok: true } : { value: 0, ok: false };
}

function parseDate(raw) {
    const fallback = new Date().toISOString().slice(0, 10);
    const text = String(raw ?? "").trim();
    if (!text) return { value: fallback, ok: true };
    if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return { value: text, ok: true };
    const parsed = new Date(text);
    if (Number.isNaN(parsed.getTime())) return { value: fallback, ok: false };
    return { value: parsed.toISOString().slice(0, 10), ok: true };
}
