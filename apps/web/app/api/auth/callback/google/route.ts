import type { NextRequest } from "next/server";
import { completeProviderCallback } from "../complete";

export function GET(request: NextRequest) {
  return completeProviderCallback(request);
}
