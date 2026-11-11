import test from "node:test";
import assert from "node:assert/strict";
import { hasLinkedStaffMember, safeStaffDiscordAvatarUrl } from "../web/v17-admin-avatar.js";

const staff = {id:7,role:"admin"};
const member = {id:13,staffLinked:true,staffId:7};
const avatar = "https://cdn.discordapp.com/avatars/123456789012345678/0123456789abcdef0123456789abcdef.webp?size=128";
test("avatar du panel admin réservé au compte membre lié au staff",()=>{
 assert.equal(hasLinkedStaffMember(staff,member,"test-token"),true);
 assert.equal(hasLinkedStaffMember(staff,{...member,staffId:8},"test-token"),false);
 assert.equal(hasLinkedStaffMember(staff,{...member,staffLinked:false},"test-token"),false);
 assert.equal(hasLinkedStaffMember(staff,member,""),false);
});
test("URLs Discord officelles autorisées",()=>{
 assert.equal(safeStaffDiscordAvatarUrl({linked:true,discord:{avatarUrl:avatar}}),avatar);
 assert.equal(safeStaffDiscordAvatarUrl({linked:true,discord:{avatarUrl:"https://cdn.discordapp.com/embed/avatars/3.png"}}),"https://cdn.discordapp.com/embed/avatars/3.png");
});
test("aucun avatar non lié ni URL non validée",()=>{
 const bad=["https://evil.example/image.png","http://cdn.discordapp.com/embed/avatars/3.png",
 "https://cdn.discordapp.com.evil.example/embed/avatars/3.png","https://cdn.discordapp.com/avatars/bad.png"];
 for(const avatarUrl of bad)assert.equal(safeStaffDiscordAvatarUrl({linked:true,discord:{avatarUrl}}),"");
 assert.equal(safeStaffDiscordAvatarUrl({linked:false,discord:{avatarUrl:avatar}}),"");
});
