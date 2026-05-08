# Wire Protocol Reference

> Read this when the user is debugging MessagePack decoding, asking about the compact instruction format (`{p, a, d}`), or implementing Titan in a non-TypeScript language and needs to know the byte-level conventions.

## MessagePack Encoding Conventions

- **Objects:** Encoded as maps with camelCase field names
- **Integers:** Smallest type that fits the value
- **BigInt (u64):** For token amounts and timestamps. Use `Decoder({ useBigInt64: true })` in TypeScript.
- **Binary data:** MessagePack bin format for pubkeys (32-byte)
- **Simple enums:** Encoded as strings (e.g. `"ExactIn"`, `"ExactOut"`)
- **Complex enums:** Single-value maps (e.g. `{ "NewSwapQuoteStream": { ... } }`)
- **Optional fields:** Omitted or encoded as nil

## Compact Instruction Format

Both Titan Direct and Titan Gateway use compact field names for instructions in their MessagePack responses:

```typescript
// Instruction: { p: programId, a: accounts, d: data }
// AccountMeta: { p: pubkey, s: isSigner, w: isWritable }

interface Instruction {
  p: Uint8Array;       // Program ID (32-byte Pubkey)
  a: AccountMeta[];    // Account list
  d: Uint8Array;       // Instruction data
}

interface AccountMeta {
  p: Uint8Array;       // Account public key
  s: boolean;          // Is signer
  w: boolean;          // Is writable
}
```

When converting to a `@solana/web3.js` `TransactionInstruction`, map `p → programId`, `a → keys` (with `s → isSigner`, `w → isWritable`), and `d → data` (wrap as `Buffer.from(d)` since it arrives as `Uint8Array`).

> **DART API is different** — the DART JSON endpoint uses *full* field names (`programId`, `accounts`, `data`, `pubkey`, `isSigner`, `isWritable`) and `data` is **base64** rather than raw bytes. See `references/dart.md`.

## Gateway Response Differences

- REST with query params uses **base58 strings** for pubkeys instead of binary
- Responses are still **MessagePack-encoded** (`application/vnd.msgpack`)
- Always set `Accept: application/vnd.msgpack` on the request — without it the server may negotiate a different content type or reject the request.
- Use `Decoder({ useBigInt64: true })` for proper u64 handling — without it, `outAmount`, `expiresAtMs`, etc. will overflow JS `Number`.

## Common decoding pitfalls

- **Using a generic JSON parser on Gateway/Direct responses** — these are MessagePack, not JSON. Use `@msgpack/msgpack` (or the equivalent in your language).
- **Forgetting `useBigInt64`** — values silently lose precision past 2^53 and you'll see wrong `outAmount`s.
- **Treating `Uint8Array` pubkeys as strings** — they're 32 raw bytes; convert with `bs58.encode(...)` for display or `new PublicKey(bytes)` for `@solana/web3.js`.
- **Mixing up DART's encoding with Gateway/Direct** — DART is JSON+base64; the others are MessagePack+raw bytes. Pasting code from one to the other won't work.
