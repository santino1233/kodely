// lib/agent-sdk.ts's adaptPromptForSdk() rewrites two exact sentences out of
// lib/agent.ts's SYSTEM prompt (the tool contract and the asset-catalogue
// contract) to point the SDK engine at Read/Grep/Edit instead of the API
// engine's find_assets/write_file/delete_file tools, which the SDK engine
// does not have. It does this with a plain substring match, not a parser —
// so rewording either sentence in lib/agent.ts without updating the matching
// constant in lib/agent-sdk.ts breaks it SILENTLY at edit time and LOUDLY
// only when a real build runs on the SDK engine. That happened for real on
// 2026-08-24: an icon-catalogue example was reworded here, adaptPromptForSdk
// started throwing, and every build on the SDK engine failed in production
// with "Reading the brief and starter files" before writing a single file.
//
// This test exists so that exact class of break fails locally/in CI instead
// of live.

import test from "node:test";
import assert from "node:assert/strict";

import { SYSTEM } from "../lib/agent.ts";
import { adaptPromptForSdk } from "../lib/agent-sdk.ts";

test("adaptPromptForSdk finds both contract sentences in the real SYSTEM prompt", () => {
  assert.doesNotThrow(() => adaptPromptForSdk(SYSTEM));
});
