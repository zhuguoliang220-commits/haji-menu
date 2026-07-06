import { getSupabaseAdmin, isAuthorized, missingSupabase, unauthorized } from "@/lib/server";
import type { DishCategory, PersonName } from "@/lib/types";

export const runtime = "nodejs";

async function ensureCategories(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  createdBy: PersonName,
  categoryIds: string[] = [],
  categoryPaths: string[][] = []
) {
  const ids = new Set(categoryIds.filter(Boolean));
  for (const rawPath of categoryPaths) {
    const path = rawPath.map((item) => item.trim()).filter(Boolean).slice(0, 3);
    if (path.length === 0) continue;
    const name = path.join(" / ");
    const { data, error } = await supabase
      .from("dish_categories")
      .upsert({ name, path, created_by: createdBy }, { onConflict: "name,created_by" })
      .select("id")
      .single();
    if (error) throw error;
    ids.add(data.id);
  }
  return Array.from(ids);
}

async function attachCategories(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  dish: Record<string, unknown>
) {
  const { data: links, error } = await supabase
    .from("dish_category_links")
    .select("dish_id, dish_categories(*)")
    .eq("dish_id", String(dish.id));
  if (error) throw error;
  const categories = (links ?? [])
    .map((link) => (Array.isArray(link.dish_categories) ? link.dish_categories[0] : link.dish_categories) as DishCategory | null)
    .filter((category): category is DishCategory => Boolean(category));
  return {
    ...dish,
    category_id: categories[0]?.id ?? (dish.category_id as string | null) ?? null,
    category_name: categories[0]?.name ?? (dish.category_name as string | null) ?? null,
    categories
  };
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!isAuthorized(request)) return unauthorized();

  try {
    const { id } = await context.params;
    const body = (await request.json()) as {
      name?: string;
      image_url?: string;
      is_active?: boolean;
      deleted?: boolean;
      category_ids?: string[];
      category_paths?: string[][];
      created_by?: PersonName;
    };

    if (
      typeof body.is_active !== "boolean" &&
      body.deleted !== true &&
      body.name === undefined &&
      body.image_url === undefined &&
      body.category_ids === undefined &&
      body.category_paths === undefined
    ) {
      return Response.json({ error: "缺少更新内容" }, { status: 400 });
    }

    const patch: Record<string, string | boolean | null> = {};
    if (body.deleted === true) {
      patch.deleted_at = new Date().toISOString();
      patch.is_active = false;
    }
    if (typeof body.is_active === "boolean") patch.is_active = body.is_active;
    if (body.name !== undefined) {
      const name = body.name.trim();
      if (!name) return Response.json({ error: "菜品名称不能为空" }, { status: 400 });
      patch.name = name;
    }
    if (body.image_url !== undefined) patch.image_url = body.image_url;

    const supabase = getSupabaseAdmin();
    const { data: existing, error: existingError } = await supabase
      .from("dishes")
      .select("*")
      .eq("id", id)
      .single();
    if (existingError) throw existingError;

    if (body.created_by && body.created_by !== existing.created_by) {
      return Response.json({ error: "只能编辑自己的菜品" }, { status: 403 });
    }

    const { data, error } = await supabase
      .from("dishes")
      .update(patch)
      .eq("id", id)
      .select("*")
      .single();

    if (error) throw error;

    if (body.category_ids !== undefined || body.category_paths !== undefined) {
      const categoryIds = await ensureCategories(
        supabase,
        existing.created_by as PersonName,
        body.category_ids ?? [],
        body.category_paths ?? []
      );
      const { error: deleteLinksError } = await supabase.from("dish_category_links").delete().eq("dish_id", id);
      if (deleteLinksError) throw deleteLinksError;
      if (categoryIds.length > 0) {
        const { error: insertLinksError } = await supabase
          .from("dish_category_links")
          .insert(categoryIds.map((categoryId) => ({ dish_id: id, category_id: categoryId })));
        if (insertLinksError) throw insertLinksError;
      }
    }

    const dish = await attachCategories(supabase, data);
    return Response.json({ dish });
  } catch (error) {
    if (error instanceof Error && error.message.includes("Missing SUPABASE")) return missingSupabase();
    return Response.json({ error: "更新菜品失败" }, { status: 500 });
  }
}
