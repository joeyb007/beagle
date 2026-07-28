// Thread mirror poll: new messages for a group's chat since a given id.
// Membership-guarded — you only read threads you're in.
import { NextRequest, NextResponse } from "next/server";
import { chatThread, effectiveChatId, getGroup } from "@/lib/db";
import { currentUser } from "@/lib/session";

export async function GET(req: NextRequest) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "sign in first" }, { status: 401 });
  const groupId = Number(req.nextUrl.searchParams.get("group"));
  const after = Number(req.nextUrl.searchParams.get("after") ?? 0);
  const group = getGroup(groupId);
  if (!group || !group.members.includes(user.handle)) {
    return NextResponse.json({ error: "not your chat" }, { status: 403 });
  }
  return NextResponse.json({ messages: chatThread(effectiveChatId(group), after) });
}
