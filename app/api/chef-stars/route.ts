import { getSupabaseAdmin, isAuthorized, missingSupabase, unauthorized } from "@/lib/server";
import { PEOPLE, type PersonName } from "@/lib/types";

export const runtime = "nodejs";

function chinaDate(value: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai" }).format(new Date(value));
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) return unauthorized();

  try {
    const chef = new URL(request.url).searchParams.get("chef");
    if (!chef || !PEOPLE.includes(chef as PersonName)) {
      return Response.json({ error: "厨师身份不正确" }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const { data: ratedOrders, error: ordersError } = await supabase
      .from("orders")
      .select("id, chef_name, rating, rated_at, created_at")
      .eq("status", "已完成")
      .not("rating", "is", null)
      .not("chef_name", "is", null);
    if (ordersError) throw ordersError;

    const historicalEarnings = (ratedOrders ?? [])
      .filter((order) => order.chef_name && order.rating)
      .map((order) => ({
        order_id: order.id,
        chef_name: order.chef_name,
        stars: order.rating,
        earned_on: chinaDate(order.rated_at || order.created_at),
        updated_at: new Date().toISOString()
      }));
    if (historicalEarnings.length > 0) {
      const { error: backfillError } = await supabase
        .from("chef_star_earnings")
        .upsert(historicalEarnings, { onConflict: "order_id" });
      if (backfillError) throw backfillError;
    }

    const { data, error } = await supabase
      .from("chef_star_earnings")
      .select("stars, earned_on")
      .eq("chef_name", chef);
    if (error) throw error;

    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai" }).format(new Date());
    const rows = data ?? [];
    return Response.json({
      stats: {
        chef_name: chef,
        today_stars: rows.filter((row) => row.earned_on === today).reduce((sum, row) => sum + row.stars, 0),
        total_stars: rows.reduce((sum, row) => sum + row.stars, 0)
      }
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes("Missing SUPABASE")) return missingSupabase();
    return Response.json({ error: "读取得星统计失败" }, { status: 500 });
  }
}
