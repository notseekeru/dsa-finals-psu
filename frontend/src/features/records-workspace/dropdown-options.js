const DROPDOWN_STORAGE_KEY = "datadrive_dropdown_options_v1";

export const DEFAULT_DROPDOWN_OPTIONS = {
    categories: ["Customer", "Inventory", "Order", "Appointment"],
    statuses: ["Active", "Pending", "Completed"],
};

function sanitizeList(list, fallback) {
    if (!Array.isArray(list)) return [...fallback];
    const cleaned = [...new Set(list.map((v) => String(v ?? "").trim()).filter(Boolean))];
    return cleaned.length > 0 ? cleaned : [...fallback];
}

export function loadDropdownOptions() {
    const raw = localStorage.getItem(DROPDOWN_STORAGE_KEY);
    if (!raw) {
        return {
            categories: [...DEFAULT_DROPDOWN_OPTIONS.categories],
            statuses: [...DEFAULT_DROPDOWN_OPTIONS.statuses],
        };
    }
    const parsed = JSON.parse(raw);
    return {
        categories: sanitizeList(parsed?.categories, DEFAULT_DROPDOWN_OPTIONS.categories),
        statuses: sanitizeList(parsed?.statuses, DEFAULT_DROPDOWN_OPTIONS.statuses),
    };
}

export function saveDropdownOptions(options) {
    localStorage.setItem(DROPDOWN_STORAGE_KEY, JSON.stringify(options));
}

export function addOption(list, newValue) {
    const value = String(newValue ?? "").trim();
    if (!value) return { list, error: "Enter an option name first." };
    const exists = list.some((item) => item.toLowerCase() === value.toLowerCase());
    if (exists) return { list, error: `"${value}" already exists.` };
    return { list: [...list, value], error: "" };
}

export function renameOption(list, oldValue, nextValue) {
    const next = String(nextValue ?? "").trim();
    if (!oldValue) return { list, error: "Select an option to rename." };
    if (!next) return { list, error: "Enter a new name." };

    const duplicate = list.some((item) => item !== oldValue && item.toLowerCase() === next.toLowerCase());
    if (duplicate) return { list, error: `"${next}" already exists.` };

    return {
        list: list.map((item) => (item === oldValue ? next : item)),
        error: "",
    };
}

export function deleteOption(list, targetValue) {
    if (!targetValue) return { list, error: "Select an option to delete." };
    if (list.length <= 1) {
        return { list, error: "At least one option must remain." };
    }
    return {
        list: list.filter((item) => item !== targetValue),
        error: "",
    };
}
