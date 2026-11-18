import type { LoyaltyIdentity } from "./experience-types";
import type { LoyaltyBranch } from "./branch-types";
import type { LoyaltyCardProgram } from "@/lib/data/loyalty-cards";

export function branchIdentity(identity: LoyaltyIdentity, branch: LoyaltyBranch): LoyaltyIdentity {
  return { ...identity, branchId: branch.id, name: branch.name, nameEn: branch.name,
    logoUrl: branch.logo || identity.logoUrl, logoDisplayUrl: branch.logo || identity.logoDisplayUrl, cardBackground: branch.background, cardForeground: branch.foreground, cardAccent: branch.accent };
}
export function branchProgram(program: LoyaltyCardProgram, branch: LoyaltyBranch): LoyaltyCardProgram {
  return { ...program, logoUrl: branch.logo || program.logoUrl, cardTitle: `بطاقة ${branch.name}`, cardBackground: branch.background, cardForeground: branch.foreground, cardAccent: branch.accent };
}
