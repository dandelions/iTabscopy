export const syncData = async (endpoint, key, data) => {
    if (!endpoint || !key) return false;

    try {
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Sync-Key': key,
            },
            body: JSON.stringify(data),
        });
        return response.ok;
    } catch (err) {
        console.error('Sync Error:', err);
        return false;
    }
};

export const fetchData = async (endpoint, key) => {
    if (!endpoint || !key) return null;

    try {
        const response = await fetch(endpoint, {
            method: 'GET',
            headers: {
                'X-Sync-Key': key,
            },
        });
        if (response.ok) {
            return await response.json();
        }
    } catch (err) {
        console.error('Fetch Error:', err);
    }
    return null;
};
