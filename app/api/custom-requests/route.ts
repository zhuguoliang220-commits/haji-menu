import { getSupabaseAdmin, isAuthorized, missingSupabase, unauthorized } from "@/lib/server";
import type { NewCustomDishRequest } from "@/lib/types";

export const runtime = "nodejs";

export async function GET(request: Request) {
  if (!isAuthorized(request)) return unauthorized();

  try {
    const url = new URL(request.url);
    const chefName = url.searchParams.get("chef_name");
    const customerName = url.searchParams.get("customer_name");
    const mealDate = url.searchParams.get("meal_date");
    const mealPeriod = url.searchParams.get("meal_period");
    const supabase = getSupabaseAdmin();
    let query = supabase
      .from("custom_dish_requests")
      .select("*")
      .order("created_at", { ascending: false });

    if (chefName) query = query.eq("chef_name", chefName);
    if (customerName) query = query.eq("customer_name", customerName);
    if (mealDate) query = query.eq("meal_date", mealDate);
    if (mealPeriod) query = query.eq("meal_period", mealPeriod);

    const { data, error } = await query;
    if (error) throw error;
    return Response.json({ requests: data ?? [] });
  } catch (error) {
    if (error instanceof Error && error.message.includes("Missing SUPABASE")) return missingSupabase();
    return Response.json({ error: "读取自主点菜失败" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) return unauthorized();

  try {
    const body = (await request.json()) as NewCustomDishRequest;
    const hasAnyText = [body.dish_name, body.method, body.amount, body.note].some((value) => value?.trim());

    if (!body.customer_name || !body.chef_name || !body.meal_date || !body.meal_period || !hasAnyText) {
      return Response.json({ error: "至少写一点想吃什么" }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("custom_dish_requests")
      .insert({
        customer_name: body.customer_name,
        chef_name: body.chef_name,
        dish_name: body.dish_name?.trim() || null,
        method: body.method?.trim() || null,
        amount: body.amount?.trim() || null,
        note: body.note?.trim() || null,
        meal_date: body.meal_date,
        meal_period: body.meal_period
      })
      .select("*")
      .single();

    if (error) throw error;
    return Response.json({ request: data });
  } catch (error) {
    if (error instanceof Error && error.message.includes("Missing SUPABASE")) return missingSupabase();
    return Response.json({ error: "发送自主点菜失败" }, { status: 500 });
  }
}
