import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { listASPSPs } from "@/lib/enablebanking";

/**
 * GET /api/banking/institutions?country=DE
 * Lists available banks (ASPSPs) for a given country.
 */
export async function GET(request: NextRequest) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    const authHeader = request.headers.get("authorization") || "";
    const accessToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : authHeader;

    if (!supabaseUrl || !supabaseAnonKey) {
      return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
    }

    if (!accessToken) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const authClient = createClient(supabaseUrl, supabaseAnonKey);
    const { data: { user }, error: authError } = await authClient.auth.getUser(accessToken);

    if (authError || !user) {
      console.error("[institutions] auth failed:", authError?.message, "token length:", accessToken.length, "token starts:", accessToken.slice(0, 30));
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const country = request.nextUrl.searchParams.get("country");
    if (!country) {
      return NextResponse.json({ error: "Missing country parameter" }, { status: 400 });
    }

    const aspsps = await listASPSPs(country);

    // Map to a simpler format for the frontend
    const institutions = aspsps.map((a) => ({
      id: `${a.name}__${a.country}`,
      name: a.name,
      country: a.country,
      logo: a.logo,
      bic: a.bic || null,
    }));

    return NextResponse.json({ institutions });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[institutions] error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
