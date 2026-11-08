import { NextResponse } from "next/server";
import { syncDisputes } from "@/lib/disputes";

export async function POST() {
  const count = await syncDisputes();
  return NextResponse.json({ synced: count });
}
