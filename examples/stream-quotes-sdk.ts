/**
 * Titan API - Stream Quotes using SDK
 *
 * This example demonstrates how to stream swap quotes using the Titan SDK.
 * It connects to Titan, starts a quote stream, and logs incoming quotes.
 *
 * Prerequisites:
 *   npm install @titanexchange/sdk-ts bs58 dotenv
 *
 * Environment variables:
 *   WS_URL        - Titan WebSocket endpoint
 *   AUTH_TOKEN    - Your API authentication token
 *   USER_PUBLIC_KEY - Your Solana wallet address (base58)
 */

import "dotenv/config";
import { V1Client } from "@titanexchange/sdk-ts";
import bs58 from "bs58";

// Configuration from environment
const WS_URL = process.env.WS_URL;
const AUTH_TOKEN = process.env.AUTH_TOKEN;
const USER_PUBLIC_KEY = process.env.USER_PUBLIC_KEY;

// Common Solana token mints
const TOKENS = {
  USDC: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  SOL: "So11111111111111111111111111111111111111112",
  USDT: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB",
  BONK: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263",
};

async function validateConfig(): Promise<void> {
  if (!WS_URL) throw new Error("WS_URL environment variable is required");
  if (!AUTH_TOKEN) throw new Error("AUTH_TOKEN environment variable is required");
  if (!USER_PUBLIC_KEY) throw new Error("USER_PUBLIC_KEY environment variable is required");

  // Validate public key format
  try {
    const decoded = bs58.decode(USER_PUBLIC_KEY);
    if (decoded.length !== 32) {
      throw new Error("Invalid public key length");
    }
  } catch {
    throw new Error("USER_PUBLIC_KEY must be a valid base58 Solana address");
  }
}

async function streamQuotes(): Promise<void> {
  await validateConfig();

  console.log("Connecting to Titan...");
  const client = await V1Client.connect(`${WS_URL}?auth=${AUTH_TOKEN}`);
  console.log("Connected!");

  // Handle connection close
  client.listen_closed().then(() => {
    console.log("\nConnection closed");
    process.exit(0);
  });

  // Prepare token mints as Uint8Array
  const inputMint = bs58.decode(TOKENS.USDC);
  const outputMint = bs58.decode(TOKENS.SOL);
  const userPublicKey = bs58.decode(USER_PUBLIC_KEY!);

  // Amount: 100 USDC (6 decimals) - MUST be BigInt
  const amount = BigInt(100_000_000);

  console.log(`\nStarting quote stream: ${Number(amount) / 1_000_000} USDC -> SOL`);
  console.log("Press Ctrl+C to stop\n");

  const { stream, streamId } = await client.newSwapQuoteStream({
    swap: {
      inputMint,
      outputMint,
      amount,
      slippageBps: 50, // 0.5% slippage
    },
    transaction: {
      userPublicKey,
    },
    update: {
      intervalMs: 1000, // Update every 1 second
      num_quotes: 3,
    },
  });

  let quoteCount = 0;

  try {
    for await (const quotes of stream) {
      quoteCount++;
      const timestamp = new Date().toISOString();

      console.log(`[${timestamp}] Quote #${quoteCount} (id: ${quotes.id})`);

      const routes = Object.entries(quotes.quotes);

      if (routes.length === 0) {
        console.log("  No routes available\n");
        continue;
      }

      for (const [providerId, route] of routes) {
        const inAmountFormatted = (Number(route.inAmount) / 1e6).toFixed(2);
        const outAmountFormatted = (Number(route.outAmount) / 1e9).toFixed(6);

        console.log(`  Provider: ${providerId}`);
        console.log(`    Input:  ${inAmountFormatted} USDC`);
        console.log(`    Output: ${outAmountFormatted} SOL`);
        console.log(`    Slippage: ${route.slippageBps} bps`);

        if (route.expiresAtMs) {
          const expiresIn = route.expiresAtMs - Date.now();
          console.log(`    Expires in: ${expiresIn}ms`);
        }

        if (route.transaction) {
          console.log(`    Transaction: ${route.transaction.length} bytes (ready to sign)`);
        }

        if (route.computeUnits) {
          console.log(`    Compute units: ${route.computeUnits}`);
        }
      }

      console.log("");
    }
  } catch (error) {
    console.error("Stream error:", error);
  } finally {
    console.log("Stopping stream...");
    await client.stopStream(streamId);
    await client.close();
    console.log("Done");
  }
}

// Handle graceful shutdown
process.on("SIGINT", () => {
  console.log("\nReceived SIGINT, shutting down...");
  process.exit(0);
});

// Run
streamQuotes().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
