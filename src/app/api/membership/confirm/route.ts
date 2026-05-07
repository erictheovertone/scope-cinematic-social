import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(req: NextRequest) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  try {
    const { plan, txHash, privyUserId } = await req.json();
    console.log("[membership/confirm] received:", { plan, privyUserId, txHash });

    if (!privyUserId) {
      console.error("[membership/confirm] missing privyUserId");
      return NextResponse.json({ error: "Missing privyUserId" }, { status: 400 });
    }

    // Step 1: get user id from privy_id
    const { data: userData, error: userError } = await supabase
      .from("users")
      .select("id")
      .eq("privy_id", privyUserId)
      .single();

    console.log("[membership/confirm] userData:", userData, "userError:", userError);

    if (userError || !userData?.id) {
      console.error("[membership/confirm] user not found for privy_id:", privyUserId);
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Step 2: get profile id from user id
    const { data: profileData, error: profileError } = await supabase
      .from("profiles")
      .select("id, username, paid_member_until")
      .eq("user_id", userData.id)
      .single();

    console.log("[membership/confirm] profileData:", profileData, "profileError:", profileError);

    if (profileError || !profileData?.id) {
      console.error("[membership/confirm] profile not found for user_id:", userData.id);
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }

    // Check if already an active member
    if (profileData.paid_member_until) {
      const existingUntil = new Date(profileData.paid_member_until);
      if (existingUntil > new Date()) {
        console.log("[membership/confirm] already active member until:", existingUntil);
        return NextResponse.json({ success: true, alreadyActive: true, paidUntil: profileData.paid_member_until });
      }
    }

    // Step 3: calculate paid_member_until
    const daysToAdd = plan === "annual_crypto" || plan === "annual_stripe" ? 365 : 30;
    const paidUntil = new Date();
    paidUntil.setDate(paidUntil.getDate() + daysToAdd);

    // Step 4: update profile using profile id directly
    const { error: updateError } = await supabase
      .from("profiles")
      .update({
        is_paid_member: true,
        paid_member_until: paidUntil.toISOString(),
        payment_method: plan.includes("stripe") ? "stripe" : "crypto",
      })
      .eq("id", profileData.id);

    if (updateError) {
      console.error("[membership/confirm] update failed:", updateError);
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    console.log("[membership/confirm] SUCCESS — membership activated for:", profileData.username, "until:", paidUntil.toISOString());
    return NextResponse.json({ success: true, paidUntil: paidUntil.toISOString() });

  } catch (e: any) {
    console.error("[membership/confirm] exception:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
