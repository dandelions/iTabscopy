const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const getNightProgress = (date = new Date()) => {
    const hours = date.getHours()
        + date.getMinutes() / 60
        + date.getSeconds() / 3600;
    const distanceFromNoon = ((hours - 12) * Math.PI) / 12;

    return (1 - Math.cos(distanceFromNoon)) / 2;
};

export const getTimeAdjustedOverlay = (baseOverlay, date = new Date()) => {
    const numericOverlay = Number(baseOverlay);
    const safeOverlay = clamp(Number.isFinite(numericOverlay) ? numericOverlay : 30, 0, 100);
    const nightProgress = getNightProgress(date);

    return Math.round(safeOverlay + (100 - safeOverlay) * nightProgress);
};
