import "dotenv/config";
import { V1Client } from "@titanexchange/sdk-ts";

async function checkProviders() {
  const client = await V1Client.connect(`${process.env.WS_URL}?auth=${process.env.AUTH_TOKEN}`);

  console.log("Getting server info...");
  const info = await client.getInfo();
  console.log("Server info:", JSON.stringify(info, null, 2));

  console.log("\nGetting venues...");
  const venues = await client.getVenues();
  console.log("Venues:", venues.labels);

  console.log("\nGetting providers...");
  const providers = await client.listProviders();
  console.log("Providers:", providers);

  await client.close();
}

checkProviders().catch(console.error);
