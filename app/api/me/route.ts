import { NextResponse } from "next/server";
import { getProfile } from "@/lib/auth";
import { withJsonError } from "@/lib/api";

export const dynamic = "force-dynamic";

/** Perfil do usuário logado — usado pelo Nav e telas para adaptar por papel. */
export const GET = withJsonError(async function GET() {
  const profile = await getProfile();
  return NextResponse.json({ profile });
});
