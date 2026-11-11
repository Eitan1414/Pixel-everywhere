import test from "node:test";
import assert from "node:assert/strict";
import { discordOAuthConfiguration, discordAvatarUrl } from "../server/discord-v17.mjs";

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

test("Discord user avatars use only validated CDN paths", () => {
  const id = "888888888888888888";
  const hash = "abcdef0123456789abcdef0123456789";
  const animated = "a_" + hash;
  assert.equal(discordAvatarUrl(id, hash),
    "https://cdn.discordapp.com/avatars/" + id + "/" + hash + ".webp?size=128");
  assert.equal(discordAvatarUrl(id, animated),
    "https://cdn.discordapp.com/avatars/" + id + "/" + animated + ".webp?size=128&animated=true");
  const fallback = Number((BigInt(id) >> 22n) % 6n);
  assert.equal(discordAvatarUrl(id, null),
    "https://cdn.discordapp.com/embed/avatars/" + fallback + ".png");
  assert.equal(discordAvatarUrl("invalid", hash), null);
  assert.equal(discordAvatarUrl(id, "../../evil"), discordAvatarUrl(id, null));
  assert.equal(discordAvatarUrl(id, "https://example.com/x"), discordAvatarUrl(id, null));
});
