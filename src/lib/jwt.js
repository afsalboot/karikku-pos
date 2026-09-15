import { SignJWT, jwtVerify } from "jose";
export const COOKIE = "karikku_session";
function secret() {
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32)
    throw Object.assign(
      new Error("Set JWT_SECRET to at least 32 random characters."),
      { status: 503 },
    );
  return new TextEncoder().encode(process.env.JWT_SECRET);
}
export const signToken = (user) =>
  new SignJWT({ version: user.tokenVersion })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(String(user._id))
    .setIssuer("karikku-pos")
    .setAudience("karikku-pos")
    .setIssuedAt()
    .setExpirationTime("12h")
    .sign(secret());
export async function verifyToken(token) {
  return (
    await jwtVerify(token, secret(), {
      algorithms: ["HS256"],
      issuer: "karikku-pos",
      audience: "karikku-pos",
    })
  ).payload;
}
