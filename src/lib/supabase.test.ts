import assert from "node:assert/strict";

const publishableKeyPattern = /^sb_publishable_[A-Za-z0-9_-]+$/;
const projectUrlPattern = /^https:\/\/[a-z0-9]+\.supabase\.co$/;

assert.equal(projectUrlPattern.test("https://abcdefgh.supabase.co"), true);
assert.equal(publishableKeyPattern.test("sb_publishable_example-key"), true);
assert.equal(publishableKeyPattern.test("sb_secret_never-in-mobile"), false);

console.log("✓ validacion de configuracion Supabase");
