/**
 * POST /api/mcp
 *
 * JSON-RPC 2.0 MCP server for structured AI agent calls (OpenCLAW, etc.).
 *
 * Supports two calling conventions:
 *   1. MCP standard:  method "tools/list" | "tools/call"  (params.name + params.arguments)
 *   2. Direct:        method "get_summary" | "list_receipts" | …  (params passed to handler)
 *
 * Auth: requires INTERNAL_API_KEY via x-api-key / x_api_key / Bearer / ?api_key=
 * GET:  public tool manifest (no auth) — useful for discovery
 *
 * Telegram bot (/api/telegram) does NOT use this endpoint — it queries the DB directly.
 */

import { NextRequest, NextResponse } from "next/server";
import { TOOL_HANDLERS } from "@/lib/mcp/handlers";
import { MCP_TOOLS } from "@/lib/mcp/tools";
import { requireApiKey } from "@/lib/auth";

const TOOL_NAMES = Object.keys(TOOL_HANDLERS);

function jsonRpcError(id: unknown, code: number, message: string, status = 400) {
  return NextResponse.json(
    { jsonrpc: "2.0", id: id ?? null, error: { code, message } },
    { status }
  );
}

export async function POST(request: NextRequest) {
  const authError = await requireApiKey(request);
  if (authError) return authError;

  try {
    const body = await request.json();
    const { jsonrpc, id, method, params } = body;

    if (jsonrpc !== "2.0") {
      return jsonRpcError(id, -32600, "Invalid Request");
    }

    if (!method || typeof method !== "string") {
      return jsonRpcError(id, -32600, "method is required");
    }

    // ── MCP standard: tools/list ──────────────────────────────────────────
    if (method === "tools/list") {
      return NextResponse.json({
        jsonrpc: "2.0",
        id,
        result: {
          tools: MCP_TOOLS.map((t) => ({
            name: t.name,
            description: t.description,
            inputSchema: {
              type: "object",
              properties: Object.fromEntries(
                t.parameters.map((p) => [
                  p.name,
                  {
                    type: p.type,
                    description: p.description,
                    ...(p.enum ? { enum: p.enum } : {}),
                  },
                ])
              ),
              required: t.parameters.filter((p) => p.required).map((p) => p.name),
            },
          })),
        },
      });
    }

    // ── MCP standard: tools/call ──────────────────────────────────────────
    if (method === "tools/call") {
      const name = params?.name as string | undefined;
      const args = (params?.arguments ?? {}) as Record<string, unknown>;

      if (!name) {
        return jsonRpcError(id, -32602, "params.name is required");
      }

      const handler = TOOL_HANDLERS[name];
      if (!handler) {
        return jsonRpcError(
          id,
          -32601,
          `Tool not found: "${name}". Available: ${TOOL_NAMES.join(", ")}`,
          404
        );
      }

      const result = await handler(args);
      return NextResponse.json({ jsonrpc: "2.0", id, result });
    }

    // ── Direct method call (legacy) ───────────────────────────────────────
    const handler = TOOL_HANDLERS[method];
    if (!handler) {
      return jsonRpcError(
        id,
        -32601,
        `Method not found: "${method}". Available: tools/list, tools/call, ${TOOL_NAMES.join(", ")}`,
        404
      );
    }

    const result = await handler(params ?? {});
    return NextResponse.json({ jsonrpc: "2.0", id, result });
  } catch (e) {
    console.error("[mcp]", e);
    return jsonRpcError(null, -32603, "Internal error", 500);
  }
}

// GET — public tool manifest (no auth required)
export async function GET() {
  return NextResponse.json({
    server: "harapan-maju-mcp",
    version: "1.0.0",
    protocol: "JSON-RPC 2.0",
    description: "MCP server for CV. Harapan Maju Receipt & Revenue Tracker",
    tools: TOOL_NAMES,
    usage: {
      list_tools: {
        method: "POST",
        auth: "x-api-key header required when INTERNAL_API_KEY is set",
        body: { jsonrpc: "2.0", method: "tools/list", id: 1 },
      },
      call_tool: {
        method: "POST",
        auth: "x-api-key header required when INTERNAL_API_KEY is set",
        body: {
          jsonrpc: "2.0",
          method: "tools/call",
          params: { name: "get_summary", arguments: {} },
          id: 1,
        },
      },
      direct_call: {
        method: "POST",
        auth: "x-api-key header required when INTERNAL_API_KEY is set",
        body: { jsonrpc: "2.0", method: "get_summary", params: {}, id: 1 },
      },
    },
    note: "Telegram bot (@DuringgAWSS_bot) does not use this endpoint — it queries the database directly inside Vercel.",
  });
}
