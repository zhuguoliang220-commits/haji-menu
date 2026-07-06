import { getSupabaseAdmin, isAuthorized, missingSupabase, unauthorized } from "@/lib/server";
import type { NewOrder } from "@/lib/types";

export const runtime = "nodejs";

export async function GET(request: Request) {
  if (!isAuthorized(request)) return unauthorized();

  try {
    const url = new URL(request.url);
    const mealDate = url.searchParams.get("meal_date");
    const mealPeriod = url.searchParams.get("meal_period");
    const chefName = url.searchParams.get("chef_name");
    const customerName = url.searchParams.get("customer_name");
    const supabase = getSupabaseAdmin();
    let query = supabase
      .from("orders")
      .select("*")
      .order("created_at", { ascending: false });

    if (mealDate) query = query.eq("meal_date", mealDate);
    if (mealPeriod) query = query.eq("meal_period", mealPeriod);
    if (chefName) query = query.eq("chef_name", chefName);
    if (customerName) query = query.eq("customer_name", customerName);

    const { data, error } = await query;

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

    if (!body.customer_name || !body.chef_name || !body.dish_id || !body.dish_name || !body.quantity || !body.meal_date || !body.meal_period) {
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
        status: "未完成",
        meal_date: body.meal_date,
        meal_period: body.meal_period,
        chef_name: body.chef_name
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

export async function DELETE(request: Request) {
  if (!isAuthorized(request)) return unauthorized();

  try {
    const url = new URL(request.url);
    const customer = url.searchParams.get("customer");
    const all = url.searchParams.get("all");
    const supabase = getSupabaseAdmin();
    let query = supabase.from("orders").delete().in("status", ["已完成", "已拒绝"]);

    if (customer) query = query.eq("customer_name", customer);
    if (!customer && all !== "true") {
      return Response.json({ error: "缺少可清除的订单范围" }, { status: 400 });
    }

    const { error } = await query;
    if (error) throw error;
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && error.message.includes("Missing SUPABASE")) return missingSupabase();
    return Response.json({ error: "清除历史失败" }, { status: 500 });
  }
}
