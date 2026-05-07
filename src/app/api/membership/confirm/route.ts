import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(req: NextRequest) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
  try {
    const { plan, txHash, privyUserId } = await req.json();

    if (!privyUserId) {
      return NextResponse.json({ error: "Missing privyUserId" }, { status: 400 });
    }

    const daysToAdd = plan === "annual_crypto" ? 365 : 30;
    const paidUntil = new Date();
    paidUntil.setDate(paidUntil.getDate() + daysToAdd);

    const { error } = await supabase
      .from("profiles")
      .update({
        is_paid_member: true,
        paid_member_until: paidUntil.toISOString(),
        payment_method: plan.includes("stripe") ? "stripe" : "crypto",
      })
      .eq("user_id", (
        await supabase
          .from("users")
          .select("id")
          .eq("privy_id", privyUserId)
          .single()
      ).data?.id);

    if (error) throw error;

    return NextResponse.json({ success: true, paidUntil: paidUntil.toISOString() });
  } catch (e: any) {
    console.error("[membership/confirm]", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
