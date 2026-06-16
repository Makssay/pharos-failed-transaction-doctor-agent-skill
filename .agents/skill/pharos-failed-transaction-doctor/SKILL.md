---
name: pharos-failed-transaction-doctor
description: Diagnose failed or suspicious Pharos transactions with read-only RPC checks. Use when a user gives a Pharos transaction hash and asks why it failed, reverted, ran out of gas, hit a wrong contract, had bad calldata, may have allowance/balance/slippage issues, or needs a transaction failure report. Supports Pharos Atlantic testnet and mainnet, auto-network lookup, markdown/json/csv/console output, and never requests private keys.
---

# Pharos Failed Transaction Doctor

Diagnose one or more Pharos transaction hashes using only public JSON-RPC reads. The skill explains transaction status, target contract, gas usage, calldata selector, optional read-only revert simulation, likely failure causes, and safe next actions.

## Workflow

1. Validate every transaction hash as `0x` plus 64 hex characters.
2. Default to `atlantic-testnet` unless the user asks for `mainnet` or `--auto-network`.
3. Run the bundled script from the skill root:

```bash
node scripts/doctor-tx.mjs --tx 0x0000000000000000000000000000000000000000000000000000000000000000 --network atlantic-testnet
```

For automatic lookup across both Pharos networks:

```bash
node scripts/doctor-tx.mjs --tx 0x0000000000000000000000000000000000000000000000000000000000000000 --auto-network --format console
```

For a file of hashes:

```bash
node scripts/doctor-tx.mjs --tx-file txs.txt --auto-network --format markdown --output failed-tx-report.md
```

For machine-readable output:

```bash
node scripts/doctor-tx.mjs --tx 0x1111111111111111111111111111111111111111111111111111111111111111 --network mainnet --format json
```

## Inputs

- `--tx <hash[,hash...]>`: Transaction hash input. Repeatable.
- `--hash <hash>`: Alias for `--tx`.
- `--tx-file <path>`: Read transaction hashes from `.txt`, `.csv`, or markdown.
- `--network atlantic-testnet|mainnet`: Target Pharos network. Defaults to `atlantic-testnet`.
- `--auto-network`: Search every configured Pharos network and use the first network where the transaction is found.
- `--format markdown|json|csv|console`: Output format. Defaults to `markdown`; `--output` extension can infer format.
- `--output <path>`: Write the report to a file instead of stdout.
- `--rpc-url <url>`: Override RPC URL for the selected network.
- `--simulation previous|latest|off`: Revert simulation block mode. Defaults to `previous` for mined failed transactions.
- `--no-color`: Disable ANSI color in console output.

## Report Rules

- Treat this skill as read-only. Do not ask for private keys.
- If a transaction is not found, recommend checking network and hash.
- If a transaction is pending, avoid diagnosing it as failed.
- If `receipt.status` is `1`, say the transaction succeeded and provide a status explanation.
- If `receipt.status` is `0`, diagnose it as failed/reverted and include evidence.
- Use gas used vs gas limit to flag likely out-of-gas failures.
- Use `eth_getCode` to flag wrong target address or missing bytecode.
- Decode standard Solidity `Error(string)` and `Panic(uint256)` revert payloads when RPC exposes them.
- For unknown custom errors, show the custom error selector and recommend using the contract ABI.
- Decode common method selectors when possible; otherwise show the raw selector.
- Keep recommendations safe: suggest checking allowance, token balance, slippage, msg.value, deadline, router/contract address, chain ID, and ABI as appropriate. Do not suggest retrying blindly.

## References

Read `references/diagnosis.md` when the user asks how the diagnosis is calculated or wants more detail about likely causes.

Read `references/examples.md` when the user wants demo commands, Discord submission text, or an AI agent prompt.

## Safety

This skill never signs transactions, never sends writes, never requests private keys, and never claims a heuristic diagnosis is guaranteed. It should explain evidence and likely causes so the user or another write-capable skill can act safely.
