type Field = string | number | boolean | null;

export function logInfo(message: string, fields: Record<string, Field> = {}): void {
  console.log(JSON.stringify({ message, ...fields }));
}

export function logError(message: string, error: unknown, fields: Record<string, Field> = {}): void {
  const detail = error instanceof Error ? error.message : "error";
  console.error(JSON.stringify({ message, error: detail, ...fields }));
}
