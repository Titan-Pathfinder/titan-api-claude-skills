import "dotenv/config";
import { V1Client } from "@titanexchange/sdk-ts";
import bs58 from "bs58";

async function testMinimal() {
  const client = await V1Client.connect(`${process.env.WS_URL}?auth=${process.env.AUTH_TOKEN}`);
  console.log("Connected!");

  const inputMint = bs58.decode("So11111111111111111111111111111111111111112"); // SOL
  const outputMint = bs58.decode("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"); // USDC
  const userPublicKey = bs58.decode(process.env.USER_PUBLIC_KEY!);

  console.log("Swapping: 1 SOL -> USDC");
  console.log("Input mint:", inputMint.length, "bytes");
  console.log("Output mint:", outputMint.length, "bytes");
  console.log("User pubkey:", userPublicKey.length, "bytes");

  // Minimal request - just required params
  const { stream, streamId, response } = await client.newSwapQuoteStream({
    swap: {
      inputMint,
      outputMint,
      amount: BigInt(1_000_000_000), // 1 SOL (9 decimals) as BigInt
    },
    transaction: {
      userPublicKey,
    },
  });

  console.log("Stream response:", response);
  console.log("Stream ID:", streamId);

  let count = 0;
  for await (const quotes of stream) {
    count++;
    console.log(`\nQuote ${count}:`, JSON.stringify({
      id: quotes.id,
      quotesCount: Object.keys(quotes.quotes).length,
      quotes: Object.entries(quotes.quotes).map(([k, v]) => ({
        provider: k,
        inAmount: v.inAmount,
        outAmount: v.outAmount,
        hasTx: !!v.transaction,
      })),
    }, null, 2));

    if (count >= 5) {
      await client.stopStream(streamId);
      break;
    }
  }

  await client.close();
}

testMinimal().catch(console.error);
