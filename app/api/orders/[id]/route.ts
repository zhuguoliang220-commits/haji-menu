import { getSupabaseAdmin, isAuthorized, missingSupabase, unauthorized } from "@/lib/server";
import { ORDER_STATUSES } from "@/lib/types";

export const runtime = "nodejs";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!isAuthorized(request)) return unauthorized();

  try {
    const { id } = await context.params;
    const body = (await request.json()) as { status?: string };

    if (!body.status || !ORDER_STATUSES.includes(body.status as (typeof ORDER_STATUSES)[number])) {
      return Response.json({ error: "订单状态不正确" }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("orders")
      .update({ status: body.status, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select("*")
      .single();

    if (error) throw error;
    return Response.json({ order: data });
  } catch (error) {
    if (error instanceof Error && error.message.includes("Missing SUPABASE")) return missingSupabase();
    return Response.json({ error: "更新订单失败" }, { status: 500 });
  }
}
