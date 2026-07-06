import { getSupabaseAdmin, isAuthorized, missingSupabase, unauthorized } from "@/lib/server";
import type { MealPeriod, PersonName } from "@/lib/types";

export const runtime = "nodejs";

type AvailabilityBody = {
  chef_name?: PersonName;
  meal_date?: string;
  meal_period?: MealPeriod;
  dish_ids?: string[];
};

export async function GET(request: Request) {
  if (!isAuthorized(request)) return unauthorized();

  try {
    const url = new URL(request.url);
    const chefName = url.searchParams.get("chef_name");
    const mealDate = url.searchParams.get("meal_date");
    const mealPeriod = url.searchParams.get("meal_period");

    const supabase = getSupabaseAdmin();
    let query = supabase
      .from("daily_dish_availability")
      .select("*")
      .order("created_at", { ascending: false });

    if (chefName) query = query.eq("chef_name", chefName);
    if (mealDate) query = query.eq("meal_date", mealDate);
    if (mealPeriod) query = query.eq("meal_period", mealPeriod);

    const { data, error } = await query;
    if (error) throw error;
    return Response.json({ availability: data ?? [] });
  } catch (error) {
    if (error instanceof Error && error.message.includes("Missing SUPABASE")) return missingSupabase();
    return Response.json({ error: "读取今日供应失败" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  if (!isAuthorized(request)) return unauthorized();

  try {
    const body = (await request.json()) as AvailabilityBody;
    const dishIds = Array.from(new Set(body.dish_ids ?? []));

    if (!body.chef_name || !body.meal_date || !body.meal_period) {
      return Response.json({ error: "供应日期、餐次和厨师不能为空" }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const { error: deleteError } = await supabase
      .from("daily_dish_availability")
      .delete()
      .eq("chef_name", body.chef_name)
      .eq("meal_date", body.meal_date)
      .eq("meal_period", body.meal_period);

    if (deleteError) throw deleteError;

    if (dishIds.length > 0) {
      const rows = dishIds.map((dishId) => ({
        chef_name: body.chef_name,
        dish_id: dishId,
        meal_date: body.meal_date,
        meal_period: body.meal_period
      }));
      const { error: insertError } = await supabase.from("daily_dish_availability").insert(rows);
      if (insertError) throw insertError;
    }

    const { data, error } = await supabase
      .from("daily_dish_availability")
      .select("*")
      .eq("chef_name", body.chef_name)
      .eq("meal_date", body.meal_date)
      .eq("meal_period", body.meal_period)
      .order("created_at", { ascending: false });

    if (error) throw error;
    return Response.json({ availability: data ?? [] });
  } catch (error) {
    if (error instanceof Error && error.message.includes("Missing SUPABASE")) return missingSupabase();
    return Response.json({ error: "保存今日供应失败" }, { status: 500 });
  }
}
