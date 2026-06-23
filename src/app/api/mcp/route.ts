/**
 * POST /api/mcp
 *
 * JSON-RPC 2.0 MCP server for structured AI agent calls.
 * Receives: { jsonrpc: "2.0", id, method, params }
 * Returns:   { jsonrpc: "2.0", id, result } or { jsonrpc: "2.0", id, error }
 *
 * Tool registry and handlers are in src/lib/mcp/
 */

import { NextRequest, NextResponse } from "next/server";
import { TOOL_HANDLERS } from "@/lib/mcp/handlers";
import { MCP_TOOLS } from "@/lib/mcp/tools";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { jsonrpc, id, method, params } = body;

    if (jsonrpc !== "2.0") {
      return NextResponse.json(
        { jsonrpc: "2.0", id, error: { code: -32600, message: "Invalid Request" } },
        { status: 400 }
      );
    }

    if (!method || typeof method !== "string") {
      return NextResponse.json(
        { jsonrpc: "2.0", id, error: { code: -32600, message: "method is required" } },
        { status: 400 }
      );
    }

    const handler = TOOL_HANDLERS[method];
    if (!handler) {
      return NextResponse.json(
        {
          jsonrpc: "2.0",
          id,
          error: {
            code: -32601,
            message: `Method not found: "${method}". Available: ${Object.keys(TOOL_HANDLERS).join(", ")}`,
          },
        },
        { status: 404 }
      );
    }

    const result = await handler(params ?? {});

    return NextResponse.json({ jsonrpc: "2.0", id, result });
  } catch (e) {
    console.error("[mcp]", e);
    return NextResponse.json(
      {
        jsonrpc: "2.0",
        id: null,
        error: { code: -32603, message: "Internal error" },
      },
      { status: 500 }
    );
  }
}

// GET — return tool manifest
export async function GET() {
  return NextResponse.json({
    name:        "CV. Harapan Maju MCP Server",
    version:     "1.0.0",
    description: "Receipt intelligence and inventory management for CV. Harapan Maju",
    tools:       MCP_TOOLS,
  });
}
