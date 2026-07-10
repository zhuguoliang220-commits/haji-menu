import { getSupabaseAdmin, isAuthorized, missingSupabase, unauthorized } from "@/lib/server";
import { PEOPLE, type PersonName } from "@/lib/types";

export const runtime = "nodejs";

export async function GET(request: Request) {
  if (!isAuthorized(request)) return unauthorized();

  try {
    const chef = new URL(request.url).searchParams.get("chef");
    if (!chef || !PEOPLE.includes(chef as PersonName)) {
      return Response.json({ error: "厨师身份不正确" }, { status: 400 });
    }

    const { data, error } = await getSupabaseAdmin()
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
