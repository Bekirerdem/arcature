import deployment from "./deployment.json";
import type { Address } from "viem";

export const FACTORY = deployment.factory as Address;
export const USDC = deployment.usdc as Address;
export const MEMO = deployment.memo as Address;
export const PROOF_CHEST = deployment.proof.collective as Address;

export const InvoiceStatus = ["None", "Open", "Paid", "Cancelled"] as const;
export const ProposalKind = [
  "SetRules", "AddMember", "RemoveMember", "SetAgent", "SetPayee", "ReleaseReserve", "Attribute", "Expense",
] as const;
export type ProposalKindName = (typeof ProposalKind)[number];
export const kindIndex = (k: ProposalKindName) => ProposalKind.indexOf(k);
