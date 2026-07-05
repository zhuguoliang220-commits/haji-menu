import { getSupabaseAdmin, isAuthorized, missingSupabase, unauthorized } from "@/lib/server";
import type { NewDish } from "@/lib/types";

export const runtime = "nodejs";

export async function GET(request: Request) {
  if (!isAuthorized(request)) return unauthorized();

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("dishes")
      .select("*, dish_categories(name)")
      .is("deleted_at", null)
      .order("created_at", { ascending: false });

    if (error) throw error;
    const dishes = (data ?? []).map((dish) => ({
      ...dish,
      category_name: dish.dish_categories?.name ?? null,
      dish_categories: undefined
    }));
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
    let categoryId = body.category_id || null;

    if (!categoryId && categoryName) {
      const { data: category, error: categoryError } = await supabase
        .from("dish_categories")
        .upsert({ name: categoryName, created_by: body.created_by }, { onConflict: "name,created_by" })
        .select("id")
        .single();

      if (categoryError) throw categoryError;
      categoryId = category.id;
    }

    const { data, error } = await supabase
      .from("dishes")
      .insert({
        name,
        image_url: body.image_url,
        created_by: body.created_by,
        category_id: categoryId,
        is_active: true
      })
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
    return Response.json({ error: "上架菜品失败" }, { status: 500 });
  }
}
