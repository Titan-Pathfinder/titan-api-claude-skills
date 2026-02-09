/**
 * Titan API - Stream Quotes using Raw WebSocket (No SDK)
 *
 * This example demonstrates how to stream swap quotes using raw WebSocket
 * without the Titan SDK. Useful for understanding the protocol or when
 * SDK is not available for your language/platform.
 *
 * The Titan API uses MessagePack encoding over WebSocket.
 *
 * Prerequisites:
 *   npm install ws @msgpack/msgpack bs58 dotenv
 *
 * Environment variables:
 *   WS_URL        - Titan WebSocket endpoint
 *   AUTH_TOKEN    - Your API authentication token
 *   USER_PUBLIC_KEY - Your Solana wallet address (base58)
 */

import "dotenv/config";
import WebSocket from "ws";
import { encode, decode } from "@msgpack/msgpack";
import bs58 from "bs58";

// Configuration from environment
const WS_URL = process.env.WS_URL;
const AUTH_TOKEN = process.env.AUTH_TOKEN;
const USER_PUBLIC_KEY = process.env.USER_PUBLIC_KEY;

// Token mints
const TOKENS = {
  USDC: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  SOL: "So11111111111111111111111111111111111111112",
};

// Request ID counter
let requestId = 0;

function nextRequestId(): number {
  return ++requestId;
}

/**
 * Create a NewSwapQuoteStream request message
 */
function createStreamRequest(
  inputMint: Uint8Array,
  outputMint: Uint8Array,
  amount: number,
  userPublicKey: Uint8Array,
  options: {
    slippageBps?: number;
    intervalMs?: number;
    numQuotes?: number;
  } = {}
): { id: number; data: object } {
  return {
    id: nextRequestId(),
    data: {
      NewSwapQuoteStream: {
        swap: {
          inputMint,
          outputMint,
          amount,
          slippageBps: options.slippageBps ?? 50,
        },
        transaction: {
          userPublicKey,
        },
        update: {
          intervalMs: options.intervalMs ?? 1000,
          num_quotes: options.numQuotes ?? 3,
        },
      },
    },
  };
}

/**
 * Create a StopStream request message
 */
function createStopStreamRequest(streamId: number): { id: number; data: object } {
  return {
    id: nextRequestId(),
    data: {
      StopStream: {
        id: streamId,
      },
    },
  };
}

/**
 * Create a GetInfo request message
 */
function createGetInfoRequest(): { id: number; data: object } {
  return {
    id: nextRequestId(),
    data: {
      GetInfo: {},
    },
  };
}

async function validateConfig(): Promise<void> {
  if (!WS_URL) throw new Error("WS_URL environment variable is required");
  if (!AUTH_TOKEN) throw new Error("AUTH_TOKEN environment variable is required");
  if (!USER_PUBLIC_KEY) throw new Error("USER_PUBLIC_KEY environment variable is required");
}

async function streamQuotesRaw(): Promise<void> {
  await validateConfig();

  console.log("Connecting to Titan via raw WebSocket...");
  const wsUrl = `${WS_URL}?auth=${AUTH_TOKEN}`;

  // Connect with the Titan sub-protocol
  const ws = new WebSocket(wsUrl, ["v1.api.titan.ag"]);
  ws.binaryType = "arraybuffer";

  let activeStreamId: number | null = null;

  ws.on("open", () => {
    console.log("Connected!");

    // Prepare stream request
    const inputMint = bs58.decode(TOKENS.USDC);
    const outputMint = bs58.decode(TOKENS.SOL);
    const userPublicKey = bs58.decode(USER_PUBLIC_KEY!);

    const amount = BigInt(10_000_000); // 10 USDC - MUST be BigInt

    console.log(`\nStarting quote stream: ${amount / 1e6} USDC -> SOL`);
    console.log("Press Ctrl+C to stop\n");

    // Create and encode the request
    const request = createStreamRequest(inputMint, outputMint, amount, userPublicKey, {
      slippageBps: 50,
      intervalMs: 1000,
      numQuotes: 3,
    });

    const buffer = encode(request);
    ws.send(buffer);
    console.log(`Sent stream request (id: ${request.id}, ${buffer.length} bytes)\n`);
  });

  ws.on("message", (data: ArrayBuffer) => {
    try {
      const decoded = decode(new Uint8Array(data)) as any;

      // Handle Response (success)
      if (decoded.Response) {
        const response = decoded.Response;
        console.log(`Response for request ${response.requestId}`);

        // Check if this response starts a stream
        if (response.stream) {
          activeStreamId = response.stream.id;
          console.log(`Stream started with ID: ${activeStreamId}`);
          console.log(`Data type: ${response.stream.dataType}\n`);
        }

        // Handle specific response data
        if (response.data?.NewSwapQuoteStream) {
          console.log(`Interval: ${response.data.NewSwapQuoteStream.intervalMs}ms\n`);
        }

        if (response.data?.GetInfo) {
          console.log("Server info:", JSON.stringify(response.data.GetInfo, null, 2));
        }

        return;
      }

      // Handle StreamData (quotes)
      if (decoded.StreamData) {
        const streamData = decoded.StreamData;
        const timestamp = new Date().toISOString();

        // Extract SwapQuotes from payload
        const swapQuotes = streamData.payload?.SwapQuotes;
        if (!swapQuotes) {
          console.log(`[${timestamp}] Stream data (seq: ${streamData.seq}) - unknown payload type`);
          return;
        }

        console.log(`[${timestamp}] Quote #${streamData.seq} (id: ${swapQuotes.id})`);

        const quotes = swapQuotes.quotes || {};
        const routeEntries = Object.entries(quotes);

        if (routeEntries.length === 0) {
          console.log("  No routes available\n");
          return;
        }

        for (const [providerId, route] of routeEntries) {
          const r = route as any;
          const inAmount = Number(r.inAmount || 0);
          const outAmount = Number(r.outAmount || 0);

          console.log(`  Provider: ${providerId}`);
          console.log(`    Input:  ${(inAmount / 1e6).toFixed(2)} USDC`);
          console.log(`    Output: ${(outAmount / 1e9).toFixed(6)} SOL`);
          console.log(`    Slippage: ${r.slippageBps || 0} bps`);

          if (r.expiresAtMs) {
            const expiresIn = r.expiresAtMs - Date.now();
            console.log(`    Expires in: ${expiresIn}ms`);
          }

          if (r.transaction) {
            console.log(`    Transaction: ${r.transaction.length} bytes`);
          }

          if (r.computeUnits) {
            console.log(`    Compute units: ${r.computeUnits}`);
          }
        }

        console.log("");
        return;
      }

      // Handle StreamEnd
      if (decoded.StreamEnd) {
        const streamEnd = decoded.StreamEnd;
        console.log(`Stream ${streamEnd.id} ended`);
        if (streamEnd.errorCode) {
          console.error(`  Error: [${streamEnd.errorCode}] ${streamEnd.errorMessage}`);
        }
        activeStreamId = null;
        return;
      }

      // Handle Error response
      if (decoded.Error) {
        const error = decoded.Error;
        console.error(`Error for request ${error.requestId}: [${error.code}] ${error.message}`);
        return;
      }

      console.log("Unknown message type:", Object.keys(decoded));
    } catch (error) {
      console.error("Failed to decode message:", error);
    }
  });

  ws.on("close", (code, reason) => {
    console.log(`\nConnection closed: ${code} - ${reason.toString()}`);
    process.exit(0);
  });

  ws.on("error", (error) => {
    console.error("WebSocket error:", error);
  });

  // Graceful shutdown
  process.on("SIGINT", () => {
    console.log("\nShutting down...");

    if (activeStreamId !== null && ws.readyState === WebSocket.OPEN) {
      // Send stop stream message
      const stopRequest = createStopStreamRequest(activeStreamId);
      ws.send(encode(stopRequest));
      console.log(`Sent stop stream request for stream ${activeStreamId}`);
    }

    setTimeout(() => ws.close(), 500);
  });
}

// Run
streamQuotesRaw().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
