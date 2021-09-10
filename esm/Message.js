export function createMessage(from, type, payload) {
    return {
        type,
        payload,
        from,
    };
}
export function isMessage(value) {
    return value !== null && typeof value === "object" && "type" in value;
}
export function isMessageOfType(value, type) {
    return isMessage(value) && value.type === type;
}
export function isMessageOfTypes(value, types) {
    return isMessage(value) && types.includes(value.type);
}
