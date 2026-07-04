import { getSupabaseAdmin, isAuthorized, missingSupabase, unauthorized } from "@/lib/server";
import type { NewOrder } from "@/lib/types";

export const runtime = "nodejs";

export async function GET(request: Request) {
  if (!isAuthorized(request)) return unauthorized();

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("orders")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) throw error;
    return Response.json({ orders: data ?? [] });
  } catch (error) {
    if (error instanceof Error && error.message.includes("Missing SUPABASE")) return missingSupabase();
    return Response.json({ error: "读取订单失败" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) return unauthorized();

  try {
    const body = (await request.json()) as NewOrder;

    if (!body.customer_name || !body.dish_id || !body.dish_name || !body.quantity) {
      return Response.json({ error: "订单信息不完整" }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("orders")
      .insert({
        customer_name: body.customer_name,
        dish_id: body.dish_id,
        dish_name: body.dish_name,
        dish_image_url: body.dish_image_url,
        quantity: Math.max(1, Number(body.quantity)),
        note: body.note?.trim() || null,
        status: "收到"
      })
      .select("*")
      .single();

    if (error) throw error;
    return Response.json({ order: data });
  } catch (error) {
    if (error instanceof Error && error.message.includes("Missing SUPABASE")) return missingSupabase();
    return Response.json({ error: "提交订单失败" }, { status: 500 });
  }
}
