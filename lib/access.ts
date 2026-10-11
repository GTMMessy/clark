import { createHmac } from "crypto";
import { cookies } from "next/headers";

export const ACCESS_COOKIE = "clark_access";

// The cookie holds a keyed hash of the access code, never the code itself.
export function accessToken(): string | null {
  const code = process.env.ACCESS_PASSWORD;
  return code ? createHmac("sha256", code).update("clark-access").digest("hex") : null;
}

// Everything that reads or changes a store requires the access code; with no code configured the app is open.
export async function hasAccess(): Promise<boolean> {
  const expected = accessToken();
  if (!expected) return true;
  return (await cookies()).get(ACCESS_COOKIE)?.value === expected;
}

export const denied = () => Response.json({ error: "Enter the access code first." }, { status: 401 });
