import type { NxeonClient } from "./client";
import { NxeonNotConfiguredError, type NxeonOperation } from "./errors";

/**
 * The only implementation of `NxeonClient` that exists today. Every method
 * throws.
 *
 * ## Why this and not a mock
 *
 * A mock that returns `{ ok: true }` would let the whole custom-domain flow be
 * built, demoed, and merged while doing nothing. Worse than nothing: a customer
 * would be shown "Your domain is live" over a domain that was never registered,
 * never verified, and is not serving anything — and the first person to find out
 * would be a visitor hitting a page that does not exist.
 *
 * `docs/design-system.md` states the rule this file follows: *"A screen that
 * looks operable and is not is worse than an absent one."* The same rule applies
 * one layer down. A client that pretends to work is worse than one that refuses,
 * because a refusal is visible on the day it is written and a pretence is
 * visible on the day a customer trusts it.
 *
 * So: throws, with the name of the operation and the name of the missing
 * variable, and `isNxeonConfigured()` exists so callers can avoid throwing at
 * all and return a clean "not available yet" instead. That is the same shape
 * `lib/stripe.ts` uses for `billingEnabled()` / `stripe()` and `lib/mail.ts`
 * uses for `isMailConfigured()` / `transporter()`.
 *
 * ## Why the methods take no parameters
 *
 * They are typed as `NxeonClient`, so TypeScript checks the shape; a function
 * may always declare fewer parameters than the signature it satisfies. Writing
 * them out only to ignore them would add a dozen unused bindings and say
 * nothing. The operation name is what the error needs, and it is right there.
 */
function unavailable(operation: NxeonOperation): never {
  throw new NxeonNotConfiguredError(operation);
}

export const notConfiguredNxeonClient: NxeonClient = {
  ping: async () => unavailable("ping"),
  edgeTargets: async () => unavailable("edgeTargets"),

  searchDomains: async () => unavailable("searchDomains"),
  purchaseDomain: async () => unavailable("purchaseDomain"),
  getRegistration: async () => unavailable("getRegistration"),
  setAutoRenew: async () => unavailable("setAutoRenew"),
  requestTransferAuthCode: async () => unavailable("requestTransferAuthCode"),

  getZone: async () => unavailable("getZone"),
  putRecords: async () => unavailable("putRecords"),

  checkDomainRecords: async () => unavailable("checkDomainRecords"),

  requestCertificate: async () => unavailable("requestCertificate"),
  certificateStatus: async () => unavailable("certificateStatus"),

  provisionSite: async () => unavailable("provisionSite"),
  deploySite: async () => unavailable("deploySite"),
  getDeployment: async () => unavailable("getDeployment"),
  rollbackSite: async () => unavailable("rollbackSite"),
  purgeCache: async () => unavailable("purgeCache"),
  suspendSite: async () => unavailable("suspendSite"),
  resumeSite: async () => unavailable("resumeSite"),
  removeSite: async () => unavailable("removeSite"),
};
