import { randomUUID } from "crypto";
import { getSupabaseAdmin, isAuthorized, missingSupabase, unauthorized } from "@/lib/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!isAuthorized(request)) return unauthorized();

  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return Response.json({ error: "请选择图片文件" }, { status: 400 });
    }

    const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
    const path = `${new Date().toISOString().slice(0, 10)}/${randomUUID()}.${ext}`;
    const bucket = process.env.SUPABASE_STORAGE_BUCKET || "dish-images";
    const supabase = getSupabaseAdmin();
    const bytes = await file.arrayBuffer();

    const { error } = await supabase.storage.from(bucket).upload(path, bytes, {
      contentType: file.type || "image/jpeg",
      upsert: false
    });

    if (error) throw error;

    const { data } = supabase.storage.from(bucket).getPublicUrl(path);
    return Response.json({ url: data.publicUrl });
  } catch (error) {
    if (error instanceof Error && error.message.includes("Missing SUPABASE")) return missingSupabase();
    return Response.json({ error: "上传图片失败，请确认 Storage bucket 已创建且为 public" }, { status: 500 });
  }
}
