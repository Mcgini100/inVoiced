import { NextResponse } from "next/server";
import { errorFields, log } from "@/lib/log";
import { getRepo } from "@/server/context";

export async function GET() {
  try {
    await getRepo().ping();
    return NextResponse.json({ status: "ok" });
  } catch (err) {
    log("error", "health.failed", errorFields(err));
    return NextResponse.json({ status: "unavailable" }, { status: 503 });
  }
}
