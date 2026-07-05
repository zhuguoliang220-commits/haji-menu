import { getSupabaseAdmin, isAuthorized, missingSupabase, unauthorized } from "@/lib/server";
import { ORDER_STATUSES } from "@/lib/types";

export const runtime = "nodejs";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!isAuthorized(request)) return unauthorized();

  try {
    const { id } = await context.params;
    const body = (await request.json()) as { status?: string; rating?: number };

    if (
      body.status &&
      !ORDER_STATUSES.includes(body.status as (typeof ORDER_STATUSES)[number])
    ) {
      return Response.json({ error: "订单状态不正确" }, { status: 400 });
    }

    if (body.rating !== undefined && (!Number.isInteger(body.rating) || body.rating < 1 || body.rating > 5)) {
      return Response.json({ error: "评分必须是 1 到 5 星" }, { status: 400 });
    }

    if (!body.status && body.rating === undefined) {
      return Response.json({ error: "缺少更新内容" }, { status: 400 });
    }

    const now = new Date().toISOString();
    const patch: Record<string, string | number | null> = { updated_at: now };

    if (body.status) {
      patch.status = body.status;
      if (body.status === "已完成") patch.completed_at = now;
      if (body.status === "已拒绝") patch.rejected_at = now;
    }

    if (body.rating !== undefined) {
      patch.rating = body.rating;
      patch.rated_at = now;
    }

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("orders")
      .update(patch)
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
