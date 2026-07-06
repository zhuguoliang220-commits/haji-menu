import { getSupabaseAdmin, isAuthorized, missingSupabase, unauthorized } from "@/lib/server";
import type { DishCategory, NewDish, PersonName } from "@/lib/types";

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

  if (ids.size === 0) {
    const { data, error } = await supabase
      .from("dish_categories")
      .upsert({ name: "未分类", path: ["未分类"], created_by: createdBy }, { onConflict: "name,created_by" })
      .select("id")
      .single();
    if (error) throw error;
    ids.add(data.id);
  }

  return Array.from(ids);
}

async function attachCategories(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  dishes: Array<Record<string, unknown>>
) {
  const dishIds = dishes.map((dish) => String(dish.id));
  if (dishIds.length === 0) return [];

  const { data: links, error } = await supabase
    .from("dish_category_links")
    .select("dish_id, dish_categories(*)")
    .in("dish_id", dishIds);

  if (error) throw error;

  const byDish = new Map<string, DishCategory[]>();
  for (const link of links ?? []) {
    const category = (Array.isArray(link.dish_categories) ? link.dish_categories[0] : link.dish_categories) as DishCategory | null;
    if (!category) continue;
    byDish.set(String(link.dish_id), [...(byDish.get(String(link.dish_id)) ?? []), category]);
  }

  return dishes.map((dish) => {
    const categories = byDish.get(String(dish.id)) ?? [];
    return {
      ...dish,
      category_id: categories[0]?.id ?? (dish.category_id as string | null) ?? null,
      category_name: categories[0]?.name ?? (dish.category_name as string | null) ?? null,
      categories,
      dish_categories: undefined
    };
  });
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) return unauthorized();

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("dishes")
      .select("*")
      .is("deleted_at", null)
      .order("created_at", { ascending: false });

    if (error) throw error;
    const dishes = await attachCategories(supabase, data ?? []);
    return Response.json({ dishes });
  } catch (error) {
    if (error instanceof Error && error.message.includes("Missing SUPABASE")) return missingSupabase();
    return Response.json({ error: "读取菜品失败" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) return unauthorized();

  try {
    const body = (await request.json()) as NewDish;

    const name = body.name?.trim();
    const categoryName = body.category_name?.trim();

    if (!name || !body.image_url || !body.created_by) {
      return Response.json({ error: "菜名、图片和上架人都不能为空" }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const categoryIds = await ensureCategories(
      supabase,
      body.created_by,
      body.category_ids ?? (body.category_id ? [body.category_id] : []),
      body.category_paths ?? (categoryName ? [categoryName.split("/")] : [])
    );
    const categoryId = categoryIds[0] ?? null;

    const { data, error } = await supabase
      .from("dishes")
      .insert({
        name,
        image_url: body.image_url,
        created_by: body.created_by,
        category_id: categoryId,
        is_active: true
      })
      .select("*")
      .single();

    if (error) throw error;

    const linkRows = categoryIds.map((id) => ({ dish_id: data.id, category_id: id }));
    if (linkRows.length > 0) {
      const { error: linkError } = await supabase.from("dish_category_links").insert(linkRows);
      if (linkError) throw linkError;
    }

    const [dish] = await attachCategories(supabase, [data]);
    return Response.json({ dish });
  } catch (error) {
    if (error instanceof Error && error.message.includes("Missing SUPABASE")) return missingSupabase();
    return Response.json({ error: "上架菜品失败" }, { status: 500 });
  }
}
