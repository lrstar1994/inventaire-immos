import { NextResponse } from "next/server";

export function jsonOk(data, init = {}) {
  return NextResponse.json(data, init);
}

export function jsonError(message, status = 400, details = undefined) {
  return NextResponse.json({ error: message, details }, { status });
}

export async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}
