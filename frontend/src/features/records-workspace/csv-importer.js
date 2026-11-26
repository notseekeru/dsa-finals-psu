const BUILTIN_CATEGORY_HINTS = {
    customer: ["customer", "client", "buyer", "account", "contact", "company", "email", "phone", "address"],
    inventory: ["inventory", "stock", "sku", "item", "product", "warehouse", "qty", "quantity", "unit", "supplier"],
    order: ["order", "invoice", "po", "purchase", "order_id", "orderid", "subtotal", "shipping", "fulfillment"],
    appointment: ["appointment", "schedule", "booking", "slot", "session", "meeting", "time", "calendar", "visit"],
};

const BUILTIN_STATUS_HINTS = {
    Active: ["active", "open", "enabled", "ongoing", "current"],
    Pending: ["pending", "waiting", "queued", "hold", "draft", "review"],
    Completed: ["completed", "complete", "done", "closed", "paid", "fulfilled", "delivered"],
};

export function parseCsvText(csvText) {
    const input = String(csvText ?? "").replace(/^\uFEFF/, "");
    const rows = [];
    let currentRow = [];
    let currentField = "";
    let inQuotes = false;

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
                currentField += ch;
            }
        } else if (ch === '"') {
            inQuotes = true;
        } else if (ch === ",") {
            currentRow.push(currentField.trim());
            currentField = "";
        } else if (ch === "\r" && next === "\n") {
            currentRow.push(currentField.trim());
            rows.push(currentRow);
            currentRow = [];
            currentField = "";
            i++;
        } else if (ch === "\n" || ch === "\r") {
            currentRow.push(currentField.trim());
            rows.push(currentRow);
            currentRow = [];
            currentField = "";
        } else {
            currentField += ch;
        }
    }

    if (currentField.length > 0 || currentRow.length > 0) {
        currentRow.push(currentField.trim());
        rows.push(currentRow);
    }

    const nonEmptyRows = rows.filter((r) => r.some((cell) => cell !== ""));
    if (nonEmptyRows.length === 0) {
        return { headers: [], recordsRaw: [] };
    }

    const headers = nonEmptyRows[0].map((h, idx) => h || `Column ${idx + 1}`);
    const dataRows = nonEmptyRows.slice(1);

    const recordsRaw = dataRows.map((cells) => {
        const obj = {};
        headers.forEach((h, idx) => {
            obj[h] = cells[idx] ?? "";
        });
        return obj;
    });

    return { headers, recordsRaw };
}

function normalizeKey(str) {
    return String(str ?? "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .trim();
}

function pickField(rowObj, lowerMap, candidates) {
    for (const cand of candidates) {
        if (lowerMap[cand] !== undefined && String(lowerMap[cand]).trim() !== "") {
            return String(lowerMap[cand]).trim();
        }
    }
    for (const [key, val] of Object.entries(rowObj)) {
        const norm = normalizeKey(key);
        if (candidates.some((c) => norm === c || norm.includes(c)) && String(val ?? "").trim() !== "") {
            return String(val).trim();
        }
    }
    return "";
}

function parseAmount(rawVal) {
    if (rawVal === undefined || rawVal === null || rawVal === "") return 0;
    const cleaned = String(rawVal).replace(/[^0-9.-]+/g, "");
    const num = Number(cleaned);
    return Number.isFinite(num) ? num : 0;
}

function parseDate(rawVal) {
    const fallback = new Date().toISOString().slice(0, 10);
    const str = String(rawVal ?? "").trim();
    if (!str) return fallback;
    if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
    const parsed = new Date(str);
    if (!Number.isNaN(parsed.getTime())) {
        return parsed.toISOString().slice(0, 10);
    }
    return fallback;
}

export function detectCsvCategory(headers, recordsRaw, availableCategories = []) {
    const categories = availableCategories.length > 0 ? availableCategories : ["Customer", "Inventory", "Order", "Appointment"];

    const scores = new Map(categories.map((cat) => [cat, 0]));
    const normalizedHeaders = headers.map((h) => normalizeKey(h));
    const sampleText = [...normalizedHeaders, ...recordsRaw.slice(0, 15).flatMap((r) => Object.values(r).map((v) => normalizeKey(v)))].join(" ");

    for (const cat of categories) {
        const normCat = normalizeKey(cat);
        if (!normCat) continue;

        for (const h of normalizedHeaders) {
            if (h === normCat || h.includes(normCat)) {
                scores.set(cat, (scores.get(cat) || 0) + 5);
            }
        }

        for (const row of recordsRaw.slice(0, 15)) {
            for (const [k, v] of Object.entries(row)) {
                const nk = normalizeKey(k);
                const nv = normalizeKey(v);
                if ((nk.includes("category") || nk.includes("type")) && nv === normCat) {
                    scores.set(cat, (scores.get(cat) || 0) + 6);
                } else if (nv === normCat) {
                    scores.set(cat, (scores.get(cat) || 0) + 3);
                }
            }
        }

        const builtinList = BUILTIN_CATEGORY_HINTS[normCat] || [];
        for (const kw of builtinList) {
            if (normalizedHeaders.some((h) => h.includes(kw))) {
                scores.set(cat, (scores.get(cat) || 0) + 3);
            }
            if (sampleText.includes(kw)) {
                scores.set(cat, (scores.get(cat) || 0) + 1);
            }
        }

        const catTokens = normCat.split(/\s+/).filter((t) => t.length > 2);
        for (const tok of catTokens) {
            if (normalizedHeaders.some((h) => h.includes(tok))) {
                scores.set(cat, (scores.get(cat) || 0) + 3);
            } else if (sampleText.includes(tok)) {
                scores.set(cat, (scores.get(cat) || 0) + 1);
            }
        }
    }

    let bestCategory = categories[0];
    let bestScore = -1;
    for (const cat of categories) {
        const sc = scores.get(cat) || 0;
        if (sc > bestScore) {
            bestScore = sc;
            bestCategory = cat;
        }
    }

    return {
        detectedCategory: bestCategory,
        confidenceScore: Math.max(0, bestScore),
        scores: Object.fromEntries(scores),
    };
}

export function detectRowStatus(rowObj, availableStatuses = []) {
    const statuses = availableStatuses.length > 0 ? availableStatuses : ["Active", "Pending", "Completed"];

    const lowerMap = {};
    for (const [k, v] of Object.entries(rowObj)) {
        lowerMap[normalizeKey(k)] = v;
    }

    const rawStatus = pickField(rowObj, lowerMap, ["status", "state", "condition"]);
    if (rawStatus) {
        const exact = statuses.find((s) => s.toLowerCase() === rawStatus.toLowerCase());
        if (exact) return exact;

        const normRaw = normalizeKey(rawStatus);
        for (const s of statuses) {
            const hints = BUILTIN_STATUS_HINTS[s] || [];
            if (hints.some((h) => normRaw.includes(h))) return s;
        }
    }

    return statuses[0] || "Active";
}

export function mapCsvRowsToRecords(recordsRaw, chosenCategory, availableStatuses = [], existingCount = 0) {
    const baseStamp = Date.now();

    return recordsRaw.map((rowObj, index) => {
        const lowerMap = {};
        for (const [k, v] of Object.entries(rowObj)) {
            lowerMap[normalizeKey(k)] = v;
        }

        const recordId = pickField(rowObj, lowerMap, ["record id", "recordid", "id", "code", "order id", "sku"]) || `REC-${100 + existingCount + index + 1}`;

        const name = pickField(rowObj, lowerMap, ["name", "customer", "brand", "item", "title", "client", "product", "company"]) || `Imported Row ${index + 1}`;

        const amount = parseAmount(pickField(rowObj, lowerMap, ["amount", "price", "balance", "total", "cost", "fee"]));

        const date = parseDate(pickField(rowObj, lowerMap, ["date", "created", "created at", "schedule", "appointment date"]));

        const status = detectRowStatus(rowObj, availableStatuses);

        return {
            id: `${baseStamp}-${index}-${Math.random().toString(36).slice(2, 6)}`,
            recordId,
            name,
            category: chosenCategory,
            status,
            amount,
            date,
            archived: false,
        };
    });
}
