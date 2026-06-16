# Examples

## AI Agent Prompt

```text
Use $pharos-failed-transaction-doctor to diagnose transaction 0xTRANSACTION_HASH on Pharos mainnet. Explain whether it failed, show the likely cause, include gas usage, decoded method selector, and safe next actions. Do not use private keys.
```

## Demo Commands

PowerShell:

```powershell
node .\.agents\skills\pharos-failed-transaction-doctor\scripts\doctor-tx.mjs --tx 0xTRANSACTION_HASH --auto-network --format console
```

Save Markdown:

```powershell
node .\.agents\skills\pharos-failed-transaction-doctor\scripts\doctor-tx.mjs --tx 0xTRANSACTION_HASH --auto-network --output failed-tx-report.md
```

Batch CSV:

```powershell
node .\.agents\skills\pharos-failed-transaction-doctor\scripts\doctor-tx.mjs --tx-file txs.txt --auto-network --format csv --output failed-tx-report.csv
```

## Discord Description

Pharos Failed Transaction Doctor is a read-only Agent Center Skill that explains failed Pharos transactions. It checks tx/receipt status, gas usage, target bytecode, calldata selector, and optional read-only revert simulation, then returns likely causes and safe next actions without private keys.
