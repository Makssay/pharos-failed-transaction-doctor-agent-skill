# Diagnosis Notes

The script uses these read-only evidence groups:

- Transaction lookup: `eth_getTransactionByHash`
- Receipt lookup: `eth_getTransactionReceipt`
- Target bytecode: `eth_getCode`
- Optional read-only simulation: `eth_call`
- Selector hints from known ERC20, router, liquidity, and ownership methods

## Failure Signals

`receipt.status = 0` means the transaction was mined but failed. Common causes include:

- contract revert;
- out of gas;
- wrong target contract;
- invalid calldata or wrong function selector;
- missing approval or insufficient token balance;
- slippage/deadline failures in swap/liquidity calls;
- constructor revert for contract creation;
- contract-specific custom error.

## Revert Simulation

For mined failed transactions, `--simulation previous` attempts `eth_call` at the block before the transaction. This is often the best read-only approximation of the state that existed before the failed write.

If the RPC cannot serve historical state, the script falls back to `latest`. Latest-state simulation can be useful but may not reproduce the original failure because balances, allowances, reserves, or contract state may have changed.

## Confidence

The report is a diagnostic heuristic, not a formal proof. Revert reason, gas ratio, bytecode presence, and decoded selector increase confidence. Unknown custom errors require the target contract ABI for a precise explanation.
