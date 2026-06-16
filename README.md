# Pharos Failed Transaction Doctor

Read-only Agent Center skill for diagnosing failed or suspicious Pharos transactions.

The skill checks:

- transaction and receipt status;
- target network, chain ID, RPC host, and explorer link;
- from/to/value/nonce/block/gas details;
- failed vs pending vs successful status;
- gas-used ratio and likely out-of-gas cases;
- target contract bytecode presence;
- calldata selector and common method hints;
- read-only `eth_call` simulation for revert reason when possible;
- standard Solidity `Error(string)` and `Panic(uint256)` payloads;
- likely causes and safe next actions;
- markdown, JSON, CSV, and polished console output.

It never asks for private keys, never signs transactions, and never sends write calls.

## Skill Path

```text
.agents/skills/pharos-failed-transaction-doctor
```

## Requirements

- Node.js 18+ (`fetch` is built in)
- No npm packages required
- No private key required

## Installation

Install into the current Agent Center style repo:

```powershell
npx skills add https://github.com/Makssay/pharos-failed-transaction-doctor
```

This creates:

```text
.agents/skills/pharos-failed-transaction-doctor
```

Manual copy into an existing repo:

```powershell
New-Item -ItemType Directory -Force -Path .\.agents\skills | Out-Null
git clone https://github.com/Makssay/pharos-failed-transaction-doctor temp-pharos-failed-transaction-doctor
Copy-Item -Path .\temp-pharos-failed-transaction-doctor\.agents\skills\pharos-failed-transaction-doctor -Destination .\.agents\skills\ -Recurse -Force
```

## Usage With Codex / Agent Center

Ask:

```text
Use $pharos-failed-transaction-doctor to diagnose 0xTRANSACTION_HASH on Pharos mainnet. Explain the likely cause and safe next actions without using private keys.
```

Auto-network prompt:

```text
Use $pharos-failed-transaction-doctor to find and diagnose 0xTRANSACTION_HASH across Pharos testnet and mainnet. Return console output.
```

## Quick Start For Demo

PowerShell:

```powershell
node .\.agents\skills\pharos-failed-transaction-doctor\scripts\doctor-tx.mjs --tx 0xTRANSACTION_HASH --auto-network --format console
```

Bash/macOS/Linux:

```bash
node .agents/skills/pharos-failed-transaction-doctor/scripts/doctor-tx.mjs --tx 0xTRANSACTION_HASH --auto-network --format console
```

## Direct CLI Usage

Diagnose on Atlantic testnet:

```powershell
node .\.agents\skills\pharos-failed-transaction-doctor\scripts\doctor-tx.mjs --tx 0xTRANSACTION_HASH --network atlantic-testnet
```

Diagnose on mainnet:

```powershell
node .\.agents\skills\pharos-failed-transaction-doctor\scripts\doctor-tx.mjs --tx 0xTRANSACTION_HASH --network mainnet --format console
```

Search both configured Pharos networks:

```powershell
node .\.agents\skills\pharos-failed-transaction-doctor\scripts\doctor-tx.mjs --tx 0xTRANSACTION_HASH --auto-network --format console
```

Save Markdown report:

```powershell
node .\.agents\skills\pharos-failed-transaction-doctor\scripts\doctor-tx.mjs --tx 0xTRANSACTION_HASH --auto-network --output failed-tx-report.md
```

JSON output:

```powershell
node .\.agents\skills\pharos-failed-transaction-doctor\scripts\doctor-tx.mjs --tx 0xTRANSACTION_HASH --auto-network --format json --output failed-tx-report.json
```

Batch CSV:

```powershell
node .\.agents\skills\pharos-failed-transaction-doctor\scripts\doctor-tx.mjs --tx-file txs.txt --auto-network --format csv --output failed-tx-report.csv
```

Disable historical simulation:

```powershell
node .\.agents\skills\pharos-failed-transaction-doctor\scripts\doctor-tx.mjs --tx 0xTRANSACTION_HASH --network mainnet --simulation off
```

## Example Output

```text
PHAROS FAILED TRANSACTION DOCTOR

0x12345678...90abcdef
Network: mainnet | chain 1672 | PROS
Status: failed | Transaction failed
Summary: The transaction was mined on Pharos but reverted or otherwise failed.

Evidence:
- Receipt status is 0, so the transaction was mined but failed.
- Gas used: 99.82% of gas limit.
- Method selector: 0x23b872dd (transferFrom(address,address,uint256)).

Likely causes:
- Likely out-of-gas or gas limit too low.
- insufficient allowance
- insufficient token balance

Safe next actions:
- Do not retry blindly; inspect the cause and parameters first.
- Check allowance from owner to spender.
- Check token balance for the source address.
```

## What Makes It Useful For AI Agents

AI agents often see a failed transaction hash but need a structured way to explain what happened before suggesting a next action. This skill gives agents a repeatable diagnostic workflow:

1. identify the transaction and network;
2. verify whether it failed, succeeded, or is pending;
3. inspect gas, target code, calldata, and method selector;
4. attempt read-only revert simulation;
5. explain likely causes and safe next checks.

## Supported Networks

- Pharos Atlantic testnet
- Pharos mainnet

Network metadata lives in:

```text
.agents/skills/pharos-failed-transaction-doctor/assets/networks.json
```

## Safety

- Read-only RPC checks only.
- No private keys.
- No transaction signing.
- No write calls.
- No guarantee that heuristic diagnosis is perfect.
- Unknown custom errors require the target contract ABI for precise decoding.
