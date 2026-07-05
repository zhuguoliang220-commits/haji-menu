import { getSupabaseAdmin, isAuthorized, missingSupabase, unauthorized } from "@/lib/server";

export const runtime = "nodejs";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!isAuthorized(request)) return unauthorized();

  try {
    const { id } = await context.params;
    const body = (await request.json()) as { is_active?: boolean; deleted?: boolean };

    if (typeof body.is_active !== "boolean" && body.deleted !== true) {
      return Response.json({ error: "缺少上下架状态" }, { status: 400 });
    }

    const patch =
      body.deleted === true
        ? { deleted_at: new Date().toISOString(), is_active: false }
        : { is_active: body.is_active as boolean };

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("dishes")
      .update(patch)
      .eq("id", id)
      .select("*, dish_categories(name)")
      .single();

    if (error) throw error;
    return Response.json({
      dish: {
        ...data,
        category_name: data.dish_categories?.name ?? null,
        dish_categories: undefined
      }
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes("Missing SUPABASE")) return missingSupabase();
    return Response.json({ error: "更新菜品失败" }, { status: 500 });
  }
}
