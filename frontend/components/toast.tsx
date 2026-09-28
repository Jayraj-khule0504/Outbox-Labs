export function Toast({ message }: { message?: string }) { return message ? <div className="toast">{message}</div> : null; }
