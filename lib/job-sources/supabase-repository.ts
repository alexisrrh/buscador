// Compatibility entry point; transport-independent behavior lives in rpc-repository.
export { RpcJobOfferRepository as SupabaseJobOfferRepository } from "./rpc-repository";
export type { JobOfferRpcClient } from "./rpc-repository";
