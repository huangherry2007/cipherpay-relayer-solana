import { callWithJwt, callWithHmac } from "./clientHelper.js";

async function testJwt() {
  const jwt = "<test access token>";
  const res = await callWithJwt("http://localhost:3000/api/v1/prepare/deposit", jwt, {
    method: "POST",
    body: JSON.stringify({ amount: 100 }),
  });
  console.log("JWT result:", res);
}

async function testHmac() {
  const keyId = "ui-sdk";
  const secret = "superlongrandomsharedsecret";
  const res = await callWithHmac(
    "http://localhost:3000/api/v1/prepare/deposit",
    keyId,
    secret,
    "POST",
    { amount: 100 }
  );
  console.log("HMAC result:", res);
}

testJwt().catch(console.error);
testHmac().catch(console.error);
