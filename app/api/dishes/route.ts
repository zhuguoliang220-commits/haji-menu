import { getSupabaseAdmin, isAuthorized, missingSupabase, unauthorized } from "@/lib/server";
import type { NewDish } from "@/lib/types";

export const runtime = "nodejs";

export async function GET(request: Request) {
  if (!isAuthorized(request)) return unauthorized();

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("dishes")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) throw error;
    return Response.json({ dishes: data ?? [] });
  } catch (error) {
    if (error instanceof Error && error.message.includes("Missing SUPABASE")) return missingSupabase();
    return Response.json({ error: "读取菜品失败" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) return unauthorized();

  try {
    const body = (await request.json()) as NewDish;

    if (!body.name?.trim() || !body.image_url || !body.created_by) {
      return Response.json({ error: "菜名、图片和上架人都不能为空" }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("dishes")
      .insert({
        name: body.name.trim(),
        image_url: body.image_url,
        created_by: body.created_by,
        is_active: true
      })
      .select("*")
      .single();

    if (error) throw error;
    return Response.json({ dish: data });
  } catch (error) {
    if (error instanceof Error && error.message.includes("Missing SUPABASE")) return missingSupabase();
    return Response.json({ error: "上架菜品失败" }, { status: 500 });
  }
}
