import { json } from "../http";

const STUB = {
  error: "not_implemented",
  todo: "Domain-ownership verification is required before any breach lookup or external scan. This route is a placeholder. It does not run a scanner, DNS lookup, or paid API.",
} as const;

export async function handleBreachStub(request: Request): Promise<Response> {
  await request.body?.cancel();
  return json(STUB, 501);
}
