/** One province or ward as GHN's two-level master data returns it (fields we use). */
export type GhnUnit = {
  id: number;
  name: string;
  extensionNames: string[];
  status: number;
  /** For wards, GHN's province id. */
  parentId: number;
};

export const GHN_ACTIVE = 1;

export type ProposalReason = "exact_name" | "ambiguous" | "no_match";

export type Proposal = {
  level: "province" | "commune";
  providerCode: string;
  providerParentCode: string | null;
  providerName: string;
  providerStatus: number;
  reason: ProposalReason;
  suggestedCode: string | null;
  candidateCodes: string[];
};
