import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  isLocalDevHost,
  localWarmupOptions,
  remoteWarmupOptions,
  warmupOptionsForHost,
} from "./startup";

describe("isLocalDevHost", () => {
  it("recognises local dev hostnames", () => {
    assert.equal(isLocalDevHost("localhost"), true);
    assert.equal(isLocalDevHost("LOCALHOST"), true);
    assert.equal(isLocalDevHost("127.0.0.1"), true);
    assert.equal(isLocalDevHost("[::1]"), true);
  });

  it("rejects remote hosts", () => {
    assert.equal(isLocalDevHost("scripture-journal.vercel.app"), false);
    assert.equal(isLocalDevHost(""), false);
  });
});

describe("warmupOptionsForHost", () => {
  it("uses fast local options on localhost", () => {
    assert.deepEqual(warmupOptionsForHost("localhost"), localWarmupOptions());
  });

  it("uses remote options on production hosts", () => {
    assert.deepEqual(
      warmupOptionsForHost("scripture-journal.vercel.app"),
      remoteWarmupOptions(),
    );
  });
});

describe("warmup option presets", () => {
  it("local preset fails fast with short gaps", () => {
    const local = localWarmupOptions();
    assert.equal(local.budgetMs, 12_000);
    assert.equal(local.attemptTimeoutMs, 5_000);
    assert.deepEqual(local.gapsMs, [0, 400, 1_000]);
  });

  it("remote preset tolerates cold starts", () => {
    const remote = remoteWarmupOptions();
    assert.equal(remote.budgetMs, 45_000);
    assert.equal(remote.attemptTimeoutMs, 20_000);
    assert.deepEqual(remote.gapsMs, [0, 1_500, 3_000]);
  });
});
