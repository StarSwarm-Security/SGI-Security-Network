/** LLM stays off unless ENABLE_LLM is exactly "1", and even then this build does not call a provider. */
export function llmStatus(env: Env): { enabled: boolean; called: false; todo?: string } {
  const flag: string = env.ENABLE_LLM;
  if (flag !== "1") return { enabled: false, called: false };
  return {
    enabled: true,
    called: false,
    todo: "ENABLE_LLM=1 but no model provider is wired. This stub does not call out. Leave the default at 0 until a spend-cap yes.",
  };
}
