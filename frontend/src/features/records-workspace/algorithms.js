export function extractComparable(rec, field) {
  if (field === 'amount') return Number(rec.amount) || 0;
  if (field === 'date') return Date.parse(rec.date) || 0;
  if (field === 'recordId') return String(rec.recordId ?? '').trim().toLowerCase();
  return String(rec.name ?? '').trim().toLowerCase();
}

export function compareVal(a, b, dir = 'asc') {
  if (a === b) return 0;
  const res = a < b ? -1 : 1;
  return dir === 'desc' ? -res : res;
}

export function runInsertionSort(list, field = 'name', dir = 'asc') {
  const arr = [...list];
  let comparisons = 0;
  let shifts = 0;

  for (let i = 1; i < arr.length; i++) {
    const keyItem = arr[i];
    const keyVal = extractComparable(keyItem, field);
    let j = i - 1;

    while (j >= 0) {
      comparisons += 1;
      if (compareVal(extractComparable(arr[j], field), keyVal, dir) > 0) {
        arr[j + 1] = arr[j];
        shifts += 1;
        j -= 1;
      } else {
        break;
      }
    }

    if (j + 1 !== i) {
      arr[j + 1] = keyItem;
    }
  }

  return { items: arr, comparisons, shifts };
}

export function runLinearSearch(
  list,
  { query = '', category = 'ALL', status = 'ALL', archived = false }
) {
  const q = query.trim().toLowerCase();
  const matches = [];
  let inspected = 0;

  for (let i = 0; i < list.length; i++) {
    inspected += 1;
    const item = list[i];
    if (Boolean(item.archived) !== Boolean(archived)) continue;
    if (category !== 'ALL' && item.category !== category) continue;
    if (status !== 'ALL' && item.status !== status) continue;

    if (q) {
      const text = [
        item.name,
        item.recordId,
        item.category,
        item.status,
        String(item.amount),
        item.date,
      ]
        .join(' ')
        .toLowerCase();
      if (!text.includes(q)) continue;
    }

    matches.push(item);
  }

  return { matches, inspected };
}

export function runBinarySearch(sortedList, query, field = 'name', dir = 'asc') {
  let low = 0;
  let high = sortedList.length - 1;
  let steps = 0;

  const target =
    field === 'amount'
      ? Number(query)
      : field === 'date'
      ? Date.parse(query)
      : String(query ?? '').trim().toLowerCase();

  while (low <= high) {
    steps += 1;
    const mid = Math.floor((low + high) / 2);
    const cmp = compareVal(extractComparable(sortedList[mid], field), target, dir);
    if (cmp === 0) return { match: sortedList[mid], steps, found: true };
    if (cmp < 0) low = mid + 1;
    else high = mid - 1;
  }

  return { match: null, steps, found: false };
}