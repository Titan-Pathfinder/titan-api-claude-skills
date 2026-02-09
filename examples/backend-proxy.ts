/**
 * Titan API - Backend WebSocket Proxy
 *
 * This example demonstrates how to create a secure backend proxy
 * for browser clients. The proxy:
 * 1. Accepts WebSocket connections from browsers
 * 2. Validates user authentication (your auth system)
 * 3. Connects to Titan API server-side (with API key)
 * 4. Forwards messages bidirectionally
 *
 * This pattern keeps API credentials secure on the server.
 *
 * Prerequisites:
 *   npm install ws @titanexchange/sdk-ts dotenv
 *
 * Environment variables:
 *   WS_URL       - Titan WebSocket endpoint
 *   AUTH_TOKEN   - Your Titan API authentication token
 *   PROXY_PORT   - Port for the proxy server (default: 8080)
 *
 * Browser clients connect to: ws://localhost:8080/ws?token=user_session_token
 */

import "dotenv/config";
import { WebSocket, WebSocketServer, RawData } from "ws";
import { IncomingMessage } from "http";

// Configuration
const WS_URL = process.env.WS_URL;
const AUTH_TOKEN = process.env.AUTH_TOKEN;
const PROXY_PORT = parseInt(process.env.PROXY_PORT || "8080", 10);

// Track active connections
interface ProxyConnection {
  clientWs: WebSocket;
  titanWs: WebSocket;
  userId: string;
  createdAt: Date;
}

const connections = new Map<string, ProxyConnection>();

/**
 * Validate user authentication token.
 * Replace this with your actual authentication logic.
 */
async function validateUserToken(token: string | null): Promise<{ valid: boolean; userId: string }> {
  if (!token) {
    return { valid: false, userId: "" };
  }

  // Example: Validate JWT, session token, or API key
  // In production, integrate with your auth system (e.g., Supabase, Auth0, custom)

  // For demo purposes, accept any non-empty token
  // REPLACE THIS with real validation!
  if (token.length < 10) {
    return { valid: false, userId: "" };
  }

  return {
    valid: true,
    userId: `user_${token.substring(0, 8)}`, // Mock user ID
  };
}

/**
 * Create a connection to Titan API
 */
function connectToTitan(): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const titanUrl = `${WS_URL}?auth=${AUTH_TOKEN}`;
    const ws = new WebSocket(titanUrl, ["v1.api.titan.ag"]);

    ws.on("open", () => resolve(ws));
    ws.on("error", reject);

    // Timeout after 10 seconds
    setTimeout(() => {
      if (ws.readyState !== WebSocket.OPEN) {
        ws.terminate();
        reject(new Error("Connection to Titan timed out"));
      }
    }, 10000);
  });
}

/**
 * Handle new client connection
 */
async function handleClientConnection(clientWs: WebSocket, req: IncomingMessage): Promise<void> {
  const clientId = Math.random().toString(36).substring(7);
  const clientIp = req.socket.remoteAddress || "unknown";

  console.log(`[${clientId}] New connection from ${clientIp}`);

  // Parse URL parameters
  const url = new URL(req.url || "", `http://localhost:${PROXY_PORT}`);
  const userToken = url.searchParams.get("token");

  // Validate authentication
  const authResult = await validateUserToken(userToken);

  if (!authResult.valid) {
    console.log(`[${clientId}] Authentication failed`);
    clientWs.close(4001, "Unauthorized");
    return;
  }

  const userId = authResult.userId;
  console.log(`[${clientId}] Authenticated as ${userId}`);

  // Connect to Titan
  let titanWs: WebSocket;
  try {
    console.log(`[${clientId}] Connecting to Titan...`);
    titanWs = await connectToTitan();
    console.log(`[${clientId}] Connected to Titan`);
  } catch (error) {
    console.error(`[${clientId}] Failed to connect to Titan:`, error);
    clientWs.close(4002, "Failed to connect to upstream");
    return;
  }

  // Store connection
  const connection: ProxyConnection = {
    clientWs,
    titanWs,
    userId,
    createdAt: new Date(),
  };
  connections.set(clientId, connection);

  // Forward messages: Client -> Titan
  clientWs.on("message", (data: RawData) => {
    if (titanWs.readyState === WebSocket.OPEN) {
      // Forward binary data as-is
      titanWs.send(data);
    }
  });

  // Forward messages: Titan -> Client
  titanWs.on("message", (data: RawData) => {
    if (clientWs.readyState === WebSocket.OPEN) {
      // Forward binary data as-is
      clientWs.send(data);
    }
  });

  // Handle client disconnect
  clientWs.on("close", (code, reason) => {
    console.log(`[${clientId}] Client disconnected: ${code} - ${reason.toString()}`);
    titanWs.close();
    connections.delete(clientId);
  });

  // Handle Titan disconnect
  titanWs.on("close", (code, reason) => {
    console.log(`[${clientId}] Titan disconnected: ${code} - ${reason.toString()}`);
    clientWs.close(4003, "Upstream connection closed");
    connections.delete(clientId);
  });

  // Handle errors
  clientWs.on("error", (error) => {
    console.error(`[${clientId}] Client error:`, error);
    titanWs.close();
    connections.delete(clientId);
  });

  titanWs.on("error", (error) => {
    console.error(`[${clientId}] Titan error:`, error);
    clientWs.close(4004, "Upstream error");
    connections.delete(clientId);
  });
}

/**
 * Start the proxy server
 */
function startProxy(): void {
  if (!WS_URL) {
    throw new Error("WS_URL environment variable is required");
  }
  if (!AUTH_TOKEN) {
    throw new Error("AUTH_TOKEN environment variable is required");
  }

  const wss = new WebSocketServer({
    port: PROXY_PORT,
    path: "/ws",
  });

  console.log("=".repeat(50));
  console.log("Titan WebSocket Proxy");
  console.log("=".repeat(50));
  console.log(`Listening on ws://localhost:${PROXY_PORT}/ws`);
  console.log(`Proxying to: ${WS_URL}`);
  console.log("");
  console.log("Browser clients should connect with:");
  console.log(`  ws://localhost:${PROXY_PORT}/ws?token=YOUR_USER_TOKEN`);
  console.log("=".repeat(50));
  console.log("");

  wss.on("connection", (ws, req) => {
    handleClientConnection(ws, req).catch((error) => {
      console.error("Connection handler error:", error);
      ws.close(4000, "Internal error");
    });
  });

  wss.on("error", (error) => {
    console.error("Server error:", error);
  });

  // Periodic stats logging
  setInterval(() => {
    if (connections.size > 0) {
      console.log(`Active connections: ${connections.size}`);
    }
  }, 30000);
}

// Graceful shutdown
process.on("SIGINT", () => {
  console.log("\nShutting down...");

  // Close all connections
  for (const [clientId, conn] of connections) {
    console.log(`Closing connection ${clientId}`);
    conn.clientWs.close(1001, "Server shutting down");
    conn.titanWs.close();
  }

  process.exit(0);
});

// Run
startProxy();
