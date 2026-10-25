import test from "node:test";
import assert from "node:assert/strict";
import { discordOAuthConfiguration } from "../server/discord-v17.mjs";

const base = {
  DISCORD_CLIENT_ID: "123456789012345678",
  DISCORD_CLIENT_SECRET: "private-test-secret",
  DISCORD_REDIRECT_URI: "https://pixel.example.org/api/discord/oauth/callback"
};
test("OAuth2 configuration accepts an exact HTTPS redirect", () => {
  assert.deepEqual(discordOAuthConfiguration(base), {
    clientId: base.DISCORD_CLIENT_ID,
    clientSecret: base.DISCORD_CLIENT_SECRET,
    redirectUri: base.DISCORD_REDIRECT_URI
  });
});
test("missing client secrets or Discord application id block OAuth", () => {
  assert.equal(discordOAuthConfiguration({...base,DISCORD_CLIENT_SECRET:""}),null);
  assert.equal(discordOAuthConfiguration({...base,DISCORD_CLIENT_ID:"not-an-id"}),null);
});
test("redirect must be exact and HTTPS except local developer mode", () => {
  assert.equal(discordOAuthConfiguration({...base,DISCORD_REDIRECT_URI:"https://pixel.example.org/other"}),null);
  assert.equal(discordOAuthConfiguration({...base,DISCORD_REDIRECT_URI:"https://pixel.example.org/api/discord/oauth/callback?redirect=evil"}),null);
  assert.equal(discordOAuthConfiguration({...base,DISCORD_REDIRECT_URI:"http://pixel.example.org/api/discord/oauth/callback"}),null);
  assert.ok(discordOAuthConfiguration({...base,DISCORD_REDIRECT_URI:"http://127.0.0.1:3000/api/discord/oauth/callback"}));
});
