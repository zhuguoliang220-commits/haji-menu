import { getSupabaseAdmin, isAuthorized, missingSupabase, unauthorized } from "@/lib/server";
import type { DishCategory, PersonName } from "@/lib/types";

export const runtime = "nodejs";

export async function GET(request: Request) {
  if (!isAuthorized(request)) return unauthorized();

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("dish_categories")
      .select("*")
      .order("created_at", { ascending: true });

    if (error) throw error;
    return Response.json({ categories: data ?? [] });
  } catch (error) {
    if (error instanceof Error && error.message.includes("Missing SUPABASE")) return missingSupabase();
    return Response.json({ error: "读取菜系失败" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) return unauthorized();

  try {
    const body = (await request.json()) as { name?: string; created_by?: PersonName };
    const name = body.name?.trim();

    if (!name || !body.created_by) {
      return Response.json({ error: "菜系名称和创建人不能为空" }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("dish_categories")
      .upsert({ name, created_by: body.created_by }, { onConflict: "name,created_by" })
      .select("*")
      .single<DishCategory>();

    if (error) throw error;
    return Response.json({ category: data });
  } catch (error) {
    if (error instanceof Error && error.message.includes("Missing SUPABASE")) return missingSupabase();
    return Response.json({ error: "创建菜系失败" }, { status: 500 });
  }
}
