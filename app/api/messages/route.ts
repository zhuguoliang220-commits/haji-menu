import { getSupabaseAdmin, isAuthorized, missingSupabase, unauthorized } from "@/lib/server";
import { PEOPLE, type PersonName } from "@/lib/types";

export const runtime = "nodejs";

function isPerson(value: string | null): value is PersonName {
  return Boolean(value && PEOPLE.includes(value as PersonName));
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) return unauthorized();

  try {
    const url = new URL(request.url);
    const person = url.searchParams.get("person");
    const other = url.searchParams.get("other");
    const supabase = getSupabaseAdmin();
    let query = supabase
      .from("chat_messages")
      .select("*")
      .order("created_at", { ascending: true })
      .limit(120);

    if (isPerson(person) && isPerson(other)) {
      query = query.or(
        `and(sender_name.eq.${person},receiver_name.eq.${other}),and(sender_name.eq.${other},receiver_name.eq.${person})`
      );
    }

    const { data, error } = await query;
    if (error) throw error;
    return Response.json({ messages: data ?? [] });
  } catch (error) {
    if (error instanceof Error && error.message.includes("Missing SUPABASE")) return missingSupabase();
    return Response.json({ error: "读取聊天失败" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) return unauthorized();

  try {
    const body = (await request.json()) as { sender_name?: PersonName; receiver_name?: PersonName; body?: string };
    const text = body.body?.trim();

    if (!body.sender_name || !body.receiver_name || !text) {
      return Response.json({ error: "消息内容不完整" }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("chat_messages")
      .insert({
        sender_name: body.sender_name,
        receiver_name: body.receiver_name,
        body: text
      })
      .select("*")
      .single();

    if (error) throw error;
    return Response.json({ message: data });
  } catch (error) {
    if (error instanceof Error && error.message.includes("Missing SUPABASE")) return missingSupabase();
    return Response.json({ error: "发送聊天失败" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  if (!isAuthorized(request)) return unauthorized();

  try {
    const body = (await request.json()) as { reader_name?: PersonName; partner_name?: PersonName };
    if (!body.reader_name || !body.partner_name || !isPerson(body.reader_name) || !isPerson(body.partner_name)) {
      return Response.json({ error: "已读对象不正确" }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const { error } = await supabase
      .from("chat_messages")
      .update({ read_at: new Date().toISOString() })
      .eq("receiver_name", body.reader_name)
      .eq("sender_name", body.partner_name)
      .is("read_at", null);

    if (error) throw error;
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && error.message.includes("Missing SUPABASE")) return missingSupabase();
    return Response.json({ error: "更新已读状态失败" }, { status: 500 });
  }
}
