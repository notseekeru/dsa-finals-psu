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
