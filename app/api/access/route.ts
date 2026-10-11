import { cookies } from "next/headers";
import { ACCESS_COOKIE, accessToken } from "@/lib/access";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const expected = accessToken();
  if (expected && String(body.password ?? "").trim() !== process.env.ACCESS_PASSWORD) {
    return Response.json({ error: "That access code is not right." }, { status: 401 });
  }
  if (expected) {
    (await cookies()).set(ACCESS_COOKIE, expected, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });
  }
  return Response.json({ ok: true });
}
