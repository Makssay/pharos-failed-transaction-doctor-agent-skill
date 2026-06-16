#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const skillRoot = path.resolve(__dirname, "..");

const DEFAULT_NETWORKS = {
  networks: [
    {
      name: "atlantic-testnet",
      rpcUrl: "https://atlantic.dplabs-internal.com",
      chainId: 688689,
      explorerUrl: "https://atlantic.pharosscan.xyz/",
      nativeToken: "PHRS"
    },
    {
      name: "mainnet",
      rpcUrl: "https://rpc.pharos.xyz",
      chainId: 1672,
      explorerUrl: "https://www.pharosscan.xyz/",
      nativeToken: "PROS"
    }
  ],
  defaultNetwork: "atlantic-testnet"
};

const METHOD_HINTS = {
  "0xa9059cbb": {
    name: "transfer(address,uint256)",
    category: "ERC20 transfer",
    fields: ["to", "amount"],
    causes: [
      "insufficient token balance",
      "token transfer restrictions or paused token",
      "recipient rejected by token rules"
    ],
    next: ["Check token balance for the sender.", "Check token contract rules and blacklist/pause state if available."]
  },
  "0x095ea7b3": {
    name: "approve(address,uint256)",
    category: "ERC20 approval",
    fields: ["spender", "amount"],
    causes: ["token approval restrictions", "invalid spender", "approval race-condition protection on some tokens"],
    next: ["Check the spender address.", "If changing non-zero allowance, try setting allowance to zero first when the token requires it."]
  },
  "0x23b872dd": {
    name: "transferFrom(address,address,uint256)",
    category: "ERC20 transferFrom",
    fields: ["from", "to", "amount"],
    causes: ["insufficient allowance", "insufficient token balance", "token transfer restrictions"],
    next: ["Check allowance from owner to spender.", "Check token balance for the source address."]
  },
  "0x70a08231": {
    name: "balanceOf(address)",
    category: "ERC20 read",
    fields: ["account"],
    causes: ["unexpected read revert", "wrong contract address"],
    next: ["Verify the target is the expected token contract."]
  },
  "0x18160ddd": {
    name: "totalSupply()",
    category: "ERC20 read",
    fields: [],
    causes: ["unexpected read revert", "wrong contract address"],
    next: ["Verify the target contract ABI."]
  },
  "0x38ed1739": {
    name: "swapExactTokensForTokens(uint256,uint256,address[],address,uint256)",
    category: "DEX swap",
    fields: [],
    causes: ["insufficient allowance", "insufficient input token balance", "slippage too strict", "expired deadline", "missing pair/liquidity"],
    next: ["Check allowance to router.", "Check token balance.", "Check path, deadline, and slippage."]
  },
  "0x7ff36ab5": {
    name: "swapExactETHForTokens(uint256,address[],address,uint256)",
    category: "DEX swap",
    fields: [],
    causes: ["slippage too strict", "expired deadline", "missing pair/liquidity", "wrong msg.value"],
    next: ["Check path, deadline, slippage, and native amount."]
  },
  "0x18cbafe5": {
    name: "swapExactTokensForETH(uint256,uint256,address[],address,uint256)",
    category: "DEX swap",
    fields: [],
    causes: ["insufficient allowance", "insufficient input token balance", "slippage too strict", "expired deadline"],
    next: ["Check allowance to router.", "Check path, reserves, deadline, and slippage."]
  },
  "0xf305d719": {
    name: "addLiquidityETH(address,uint256,uint256,uint256,address,uint256)",
    category: "DEX liquidity",
    fields: [],
    causes: ["insufficient token allowance", "insufficient token balance", "slippage/min amount too strict", "expired deadline", "wrong router"],
    next: ["Check router address.", "Check token allowance and LP amount minimums."]
  },
  "0xe8e33700": {
    name: "addLiquidity(address,address,uint256,uint256,uint256,uint256,address,uint256)",
    category: "DEX liquidity",
    fields: [],
    causes: ["insufficient token allowance", "insufficient token balance", "slippage/min amount too strict", "missing pair", "expired deadline"],
    next: ["Check both token allowances and balances.", "Check pair availability and min amount settings."]
  },
  "0x40c10f19": {
    name: "mint(address,uint256)",
    category: "Token mint",
    fields: ["to", "amount"],
    causes: ["caller is not minter/owner", "cap exceeded", "minting disabled"],
    next: ["Check caller permissions.", "Check token cap and minting rules."]
  },
  "0x42966c68": {
    name: "burn(uint256)",
    category: "Token burn",
    fields: ["amount"],
    causes: ["insufficient token balance", "burning disabled"],
    next: ["Check sender token balance and token burn rules."]
  },
  "0x8da5cb5b": {
    name: "owner()",
    category: "Ownership read",
    fields: [],
    causes: ["wrong contract address", "non-standard ownership"],
    next: ["Verify target contract and ABI."]
  },
  "0xf2fde38b": {
    name: "transferOwnership(address)",
    category: "Ownership write",
    fields: ["newOwner"],
    causes: ["caller is not owner", "invalid new owner"],
    next: ["Check current owner and new owner address."]
  }
};

const PANIC_CODES = {
  "0x00": "Generic compiler inserted panic",
  "0x01": "assert(false)",
  "0x11": "Arithmetic overflow or underflow",
  "0x12": "Division or modulo by zero",
  "0x21": "Invalid enum conversion",
  "0x22": "Incorrectly encoded storage byte array",
  "0x31": "pop() on an empty array",
  "0x32": "Array index out of bounds",
  "0x41": "Too much memory allocation",
  "0x51": "Call to uninitialized internal function"
};

function loadNetworks() {
  try {
    return JSON.parse(readFileSync(path.join(skillRoot, "assets", "networks.json"), "utf8"));
  } catch {
    return DEFAULT_NETWORKS;
  }
}

function usage() {
  return `Pharos Failed Transaction Doctor

Usage:
  node scripts/doctor-tx.mjs --tx <hash> [--network atlantic-testnet|mainnet]
  node scripts/doctor-tx.mjs --tx <hash> --auto-network --format console
  node scripts/doctor-tx.mjs --tx-file txs.txt --auto-network --output failed-tx-report.md

Options:
  --tx, --hash <hash[,hash...]>        Transaction hash input. Repeatable.
  --tx-file <path>                    Read hashes from text/csv/markdown.
  --network <name>                    atlantic-testnet or mainnet. Default: atlantic-testnet.
  --auto-network                      Search all configured Pharos networks.
  --rpc-url <url>                     Override RPC URL for selected network.
  --format <markdown|json|csv|console> Output format. Default: markdown.
  --output <path>                     Save report to file.
  --simulation <previous|latest|off>  Revert simulation mode. Default: previous.
  --no-color                          Disable ANSI colors in console output.
  --help                              Show this help.

Read-only skill. No private keys are requested or used.`;
}

function parseArgs(argv) {
  const args = {
    txs: [],
    txFile: null,
    network: null,
    autoNetwork: false,
    rpcUrl: null,
    format: null,
    output: null,
    simulation: "previous",
    color: true,
    help: false
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = () => {
      if (i + 1 >= argv.length) throw new Error(`${arg} requires a value`);
      i += 1;
      return argv[i];
    };

    if (arg === "--tx" || arg === "--hash") args.txs.push(...splitList(next()));
    else if (arg === "--tx-file") args.txFile = next();
    else if (arg === "--network") args.network = next();
    else if (arg === "--auto-network") args.autoNetwork = true;
    else if (arg === "--rpc-url") args.rpcUrl = next();
    else if (arg === "--format") args.format = next();
    else if (arg === "--output") args.output = next();
    else if (arg === "--simulation") args.simulation = next();
    else if (arg === "--no-color") args.color = false;
    else if (arg === "--help" || arg === "-h") args.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }

  if (args.output && !args.format) args.format = inferFormat(args.output);
  if (!args.format) args.format = "markdown";
  args.format = args.format.toLowerCase();
  args.simulation = args.simulation.toLowerCase();

  if (!["markdown", "json", "csv", "console"].includes(args.format)) {
    throw new Error(`Unsupported --format: ${args.format}`);
  }
  if (!["previous", "latest", "off"].includes(args.simulation)) {
    throw new Error(`Unsupported --simulation: ${args.simulation}`);
  }

  return args;
}

function splitList(value) {
  return String(value)
    .split(/[,\s]+/)
    .map((v) => v.trim())
    .filter(Boolean);
}

function inferFormat(file) {
  const ext = path.extname(file).toLowerCase();
  if (ext === ".json") return "json";
  if (ext === ".csv") return "csv";
  if (ext === ".md" || ext === ".markdown") return "markdown";
  return "markdown";
}

function extractHashesFromFile(file) {
  const text = readFileSync(file, "utf8");
  return text.match(/0x[a-fA-F0-9]{64}/g) || [];
}

function unique(values) {
  return [...new Set(values.map((v) => v.toLowerCase()))];
}

function isTxHash(value) {
  return /^0x[a-fA-F0-9]{64}$/.test(value);
}

function hexToBigInt(hex) {
  if (!hex || hex === "0x") return 0n;
  return BigInt(hex);
}

function hexToNumber(hex) {
  if (!hex || hex === "0x") return null;
  return Number(BigInt(hex));
}

function toHex(value) {
  return `0x${BigInt(value).toString(16)}`;
}

function formatWei(hexOrBigInt, decimals = 6) {
  const value = typeof hexOrBigInt === "bigint" ? hexOrBigInt : hexToBigInt(hexOrBigInt);
  const base = 10n ** 18n;
  const whole = value / base;
  const fraction = value % base;
  if (fraction === 0n) return whole.toString();
  const scale = 10n ** BigInt(18 - decimals);
  const rounded = fraction / scale;
  const fractionText = rounded.toString().padStart(decimals, "0").replace(/0+$/, "");
  return fractionText ? `${whole}.${fractionText}` : whole.toString();
}

function shortHash(hash) {
  if (!hash || hash.length < 18) return hash || "";
  return `${hash.slice(0, 10)}...${hash.slice(-8)}`;
}

function shortAddress(address) {
  if (!address) return "";
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

async function rpc(network, method, params) {
  const response = await fetch(network.rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params })
  });
  const text = await response.text();
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new Error(`RPC ${method} returned non-JSON response: HTTP ${response.status}`);
  }
  if (payload.error) {
    const error = new Error(payload.error.message || `RPC ${method} failed`);
    error.rpcError = payload.error;
    throw error;
  }
  return payload.result;
}

function explorerTxUrl(network, hash) {
  const base = network.explorerUrl.endsWith("/") ? network.explorerUrl : `${network.explorerUrl}/`;
  return `${base}tx/${hash}`;
}

async function findNetworkForTx(hash, networks) {
  for (const network of networks) {
    try {
      const tx = await rpc(network, "eth_getTransactionByHash", [hash]);
      if (tx) return network.name;
    } catch {
      // Try next network.
    }
  }
  return null;
}

async function diagnoseHash(hash, network, options) {
  const report = {
    generatedAt: new Date().toISOString(),
    hash,
    network: network.name,
    chainId: network.chainId,
    nativeToken: network.nativeToken,
    rpcHost: safeHost(network.rpcUrl),
    explorerUrl: explorerTxUrl(network, hash),
    found: false,
    status: "not_found",
    transaction: null,
    receipt: null,
    call: null,
    simulation: null,
    diagnosis: {
      severity: "WARN",
      label: "Transaction not found",
      summary: "The transaction hash was not found on the selected Pharos network.",
      evidence: [],
      likelyCauses: ["Wrong network was selected.", "Transaction hash is incorrect.", "Transaction is not indexed or was never broadcast."],
      nextActions: ["Check the transaction hash.", "Try --auto-network to search configured Pharos networks."]
    }
  };

  let tx;
  let receipt;
  try {
    [tx, receipt] = await Promise.all([
      rpc(network, "eth_getTransactionByHash", [hash]),
      rpc(network, "eth_getTransactionReceipt", [hash])
    ]);
  } catch (error) {
    report.status = "rpc_error";
    report.diagnosis = {
      severity: "FAIL",
      label: "RPC error",
      summary: error.message,
      evidence: [`RPC host: ${report.rpcHost}`],
      likelyCauses: ["RPC endpoint is unavailable.", "Network routing failed.", "The selected RPC URL is not compatible."],
      nextActions: ["Retry with --rpc-url.", "Check network connectivity."]
    };
    return report;
  }

  if (!tx && !receipt) return report;

  report.found = true;
  report.transaction = normalizeTx(tx);
  report.receipt = normalizeReceipt(receipt);
  report.call = decodeCall(tx);

  if (!receipt) {
    report.status = "pending";
    report.diagnosis = {
      severity: "INFO",
      label: "Transaction pending",
      summary: "The transaction exists but has no receipt yet, so it is not confirmed as failed.",
      evidence: ["Transaction found by hash.", "No receipt is available yet."],
      likelyCauses: ["The transaction is pending.", "The transaction may be dropped or replaced if it remains unconfirmed."],
      nextActions: ["Wait for confirmation.", "Check nonce and mempool state if it remains pending."]
    };
    return report;
  }

  await enrichCode(report, tx, receipt, network);

  const status = receipt.status ? hexToNumber(receipt.status) : null;
  if (status === 1) {
    report.status = "success";
    report.diagnosis = successDiagnosis(report, tx, receipt);
    return report;
  }

  if (status === 0) {
    report.status = "failed";
    if (options.simulation !== "off" && tx?.to) {
      report.simulation = await simulateFailure(network, tx, receipt, options.simulation);
    }
    report.diagnosis = failureDiagnosis(report, tx, receipt);
    return report;
  }

  report.status = "unknown";
  report.diagnosis = {
    severity: "WARN",
    label: "Unknown receipt status",
    summary: "The transaction receipt was found, but status was missing or unsupported.",
    evidence: [`Receipt status: ${receipt.status ?? "missing"}`],
    likelyCauses: ["RPC returned a non-standard receipt."],
    nextActions: ["Open the transaction in the explorer.", "Retry with another RPC endpoint."]
  };
  return report;
}

function normalizeTx(tx) {
  if (!tx) return null;
  const value = hexToBigInt(tx.value);
  return {
    hash: tx.hash,
    from: tx.from,
    to: tx.to,
    nonce: hexToNumber(tx.nonce),
    blockNumber: hexToNumber(tx.blockNumber),
    valueWei: value.toString(),
    valueNative: formatWei(value),
    gasLimit: hexToBigInt(tx.gas).toString(),
    gasPriceWei: tx.gasPrice ? hexToBigInt(tx.gasPrice).toString() : null,
    inputBytes: tx.input && tx.input !== "0x" ? (tx.input.length - 2) / 2 : 0,
    selector: tx.input && tx.input.length >= 10 ? tx.input.slice(0, 10).toLowerCase() : null,
    type: tx.type ? hexToNumber(tx.type) : null
  };
}

function normalizeReceipt(receipt) {
  if (!receipt) return null;
  const gasUsed = hexToBigInt(receipt.gasUsed);
  const effectiveGasPrice = receipt.effectiveGasPrice ? hexToBigInt(receipt.effectiveGasPrice) : 0n;
  return {
    status: receipt.status ? hexToNumber(receipt.status) : null,
    blockNumber: hexToNumber(receipt.blockNumber),
    gasUsed: gasUsed.toString(),
    effectiveGasPriceWei: effectiveGasPrice ? effectiveGasPrice.toString() : null,
    feeNative: effectiveGasPrice ? formatWei(gasUsed * effectiveGasPrice) : null,
    logs: Array.isArray(receipt.logs) ? receipt.logs.length : 0,
    contractAddress: receipt.contractAddress || null
  };
}

async function enrichCode(report, tx, receipt, network) {
  if (!tx?.to) {
    report.targetCode = {
      checked: false,
      hasCode: false,
      note: "Contract creation transaction."
    };
    return;
  }
  try {
    const blockTag = receipt?.blockNumber || "latest";
    const code = await rpc(network, "eth_getCode", [tx.to, blockTag]);
    report.targetCode = {
      checked: true,
      hasCode: Boolean(code && code !== "0x"),
      bytes: code && code !== "0x" ? (code.length - 2) / 2 : 0,
      block: blockTag
    };
  } catch (error) {
    report.targetCode = {
      checked: false,
      hasCode: null,
      error: error.message
    };
  }
}

function decodeCall(tx) {
  if (!tx?.to) {
    return {
      kind: "contract creation",
      selector: null,
      name: "contract creation",
      category: "Contract deployment",
      decodedArgs: {}
    };
  }

  if (!tx?.input || tx.input === "0x") {
    return {
      kind: "native transfer",
      selector: null,
      name: "native transfer",
      category: "Native transfer",
      decodedArgs: {}
    };
  }

  const selector = tx.input.slice(0, 10).toLowerCase();
  const hint = METHOD_HINTS[selector];
  const decodedArgs = hint ? decodeKnownArgs(tx.input, hint.fields) : {};
  return {
    kind: "contract call",
    selector,
    name: hint?.name || "unknown function",
    category: hint?.category || "Unknown contract call",
    decodedArgs
  };
}

function decodeKnownArgs(input, fields) {
  const result = {};
  fields.forEach((field, index) => {
    const word = getWord(input, index);
    if (!word) return;
    if (field.toLowerCase().includes("address") || ["to", "from", "spender", "account", "newOwner"].includes(field)) {
      result[field] = `0x${word.slice(-40)}`;
    } else {
      result[field] = BigInt(`0x${word}`).toString();
    }
  });
  return result;
}

function getWord(input, index) {
  const start = 10 + index * 64;
  const word = input.slice(start, start + 64);
  return word.length === 64 ? word : null;
}

async function simulateFailure(network, tx, receipt, mode) {
  const attempts = [];
  const call = {
    from: tx.from,
    to: tx.to,
    data: tx.input || "0x",
    value: tx.value || "0x0"
  };

  if (mode === "previous" && receipt?.blockNumber) {
    const block = hexToBigInt(receipt.blockNumber);
    if (block > 0n) attempts.push({ tag: toHex(block - 1n), label: "previous block" });
  }
  attempts.push({ tag: "latest", label: "latest" });

  for (const attempt of attempts) {
    try {
      const result = await rpc(network, "eth_call", [call, attempt.tag]);
      return {
        attempted: true,
        blockTag: attempt.tag,
        blockLabel: attempt.label,
        reverted: false,
        result,
        note: "Read-only eth_call did not reproduce a revert at this state."
      };
    } catch (error) {
      const revert = decodeRpcRevert(error);
      if (isHistoricalStateUnavailable(error) && attempt !== attempts[attempts.length - 1]) {
        continue;
      }
      return {
        attempted: true,
        blockTag: attempt.tag,
        blockLabel: attempt.label,
        reverted: looksLikeRevert(error, revert),
        rpcMessage: error.message,
        ...revert
      };
    }
  }

  return {
    attempted: false,
    note: "No simulation block was available."
  };
}

function isHistoricalStateUnavailable(error) {
  return /missing trie|state unavailable|header not found|pruned|archive|unknown block/i.test(error?.message || "");
}

function looksLikeRevert(error, revert) {
  if (revert?.revertData) return true;
  return /revert|execution reverted|vm exception|custom error|panic/i.test(error?.message || "");
}

function decodeRpcRevert(error) {
  const data = extractErrorData(error?.rpcError?.data);
  const decoded = decodeRevertData(data);
  return {
    revertData: data || null,
    revertType: decoded.type,
    revertReason: decoded.reason,
    customErrorSelector: decoded.customErrorSelector || null
  };
}

function extractErrorData(data) {
  if (!data) return null;
  if (typeof data === "string") {
    const match = data.match(/0x[a-fA-F0-9]{8,}/);
    return match ? match[0] : null;
  }
  if (typeof data === "object") {
    if (typeof data.data === "string") return extractErrorData(data.data);
    if (typeof data.result === "string") return extractErrorData(data.result);
    if (typeof data.originalError?.data === "string") return extractErrorData(data.originalError.data);
  }
  return null;
}

function decodeRevertData(data) {
  if (!data || !/^0x[a-fA-F0-9]+$/.test(data) || data.length < 10) {
    return { type: "unknown", reason: null };
  }
  const selector = data.slice(0, 10).toLowerCase();

  if (selector === "0x08c379a0") {
    const lengthWord = data.slice(10 + 64, 10 + 128);
    if (lengthWord.length !== 64) return { type: "Error(string)", reason: "Unable to decode Error(string)" };
    const length = Number(BigInt(`0x${lengthWord}`));
    const stringHex = data.slice(10 + 128, 10 + 128 + length * 2);
    let reason = null;
    try {
      reason = Buffer.from(stringHex, "hex").toString("utf8");
    } catch {
      reason = "Unable to decode revert string";
    }
    return { type: "Error(string)", reason };
  }

  if (selector === "0x4e487b71") {
    const codeWord = data.slice(10, 74);
    const code = `0x${BigInt(`0x${codeWord}`).toString(16).padStart(2, "0")}`;
    return { type: "Panic(uint256)", reason: `${PANIC_CODES[code] || "Solidity panic"} (${code})` };
  }

  return { type: "Custom error", reason: `Unknown custom error selector ${selector}`, customErrorSelector: selector };
}

function successDiagnosis(report, tx, receipt) {
  const evidence = [
    "Receipt status is 1.",
    `Gas used: ${hexToBigInt(receipt.gasUsed).toString()}.`
  ];
  if (report.call?.selector) evidence.push(`Method selector: ${report.call.selector} (${report.call.name}).`);
  return {
    severity: "INFO",
    label: "Transaction succeeded",
    summary: "This transaction is not failed. The receipt status indicates success.",
    evidence,
    likelyCauses: [],
    nextActions: ["If the UI showed an error, check app indexing, frontend state, or expected event parsing.", "Open the explorer link and verify emitted events."]
  };
}

function failureDiagnosis(report, tx, receipt) {
  const evidence = ["Receipt status is 0, so the transaction was mined but failed."];
  const likelyCauses = ["The target contract reverted."];
  const nextActions = ["Do not retry blindly; inspect the cause and parameters first."];

  const gasUsed = hexToBigInt(receipt.gasUsed);
  const gasLimit = hexToBigInt(tx.gas);
  const gasRatioBps = gasLimit ? Number((gasUsed * 10000n) / gasLimit) : null;
  if (gasRatioBps !== null) {
    evidence.push(`Gas used: ${(gasRatioBps / 100).toFixed(2)}% of gas limit.`);
    if (gasRatioBps >= 9800) {
      likelyCauses.unshift("Likely out-of-gas or gas limit too low.");
      nextActions.push("Retry only after estimating gas with the same calldata and increasing gas limit if appropriate.");
    }
  }

  if (!tx.to) {
    likelyCauses.push("Contract constructor reverted or deployment bytecode/constructor args are invalid.");
    nextActions.push("Review constructor arguments and deployment bytecode.");
  } else if (report.targetCode?.checked && !report.targetCode.hasCode) {
    evidence.push(`No contract bytecode found at ${tx.to} for the checked block.`);
    likelyCauses.push("Wrong target address or contract not deployed on this network.");
    nextActions.push("Verify contract address and selected network.");
  }

  if (tx.value && hexToBigInt(tx.value) > 0n) {
    evidence.push(`Native value sent: ${formatWei(tx.value)} ${report.nativeToken}.`);
    likelyCauses.push("The target function may reject native value or require a different msg.value.");
    nextActions.push("Check whether the target function is payable and whether msg.value is correct.");
  }

  const call = report.call;
  if (call?.selector) {
    evidence.push(`Method selector: ${call.selector} (${call.name}).`);
    const hint = METHOD_HINTS[call.selector];
    if (hint) {
      likelyCauses.push(...hint.causes);
      nextActions.push(...hint.next);
    } else {
      likelyCauses.push("Unknown function selector or missing ABI.");
      nextActions.push("Use the target contract ABI to decode calldata and custom errors.");
    }
  }

  const sim = report.simulation;
  if (sim?.attempted) {
    evidence.push(`Read-only simulation attempted at ${sim.blockLabel}.`);
    if (sim.reverted) {
      if (sim.revertReason) {
        evidence.push(`Simulation revert: ${sim.revertReason}.`);
        likelyCauses.unshift(`Contract revert: ${sim.revertReason}.`);
      } else if (sim.customErrorSelector) {
        evidence.push(`Simulation custom error selector: ${sim.customErrorSelector}.`);
        likelyCauses.unshift(`Contract custom error ${sim.customErrorSelector}.`);
        nextActions.push("Decode the custom error using the verified contract ABI.");
      } else {
        evidence.push(`Simulation RPC message: ${sim.rpcMessage}.`);
      }
    } else {
      evidence.push("Simulation did not reproduce a revert at the checked state.");
      likelyCauses.push("Failure may depend on historical state, gas, or state changed after the transaction.");
    }
  }

  return {
    severity: "FAIL",
    label: "Transaction failed",
    summary: "The transaction was mined on Pharos but reverted or otherwise failed.",
    evidence: dedupe(evidence),
    likelyCauses: dedupe(likelyCauses),
    nextActions: dedupe(nextActions)
  };
}

function dedupe(items) {
  return [...new Set(items.filter(Boolean))];
}

function safeHost(url) {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

function renderMarkdown(reports) {
  const lines = ["# Pharos Failed Transaction Doctor", "", `Generated: ${new Date().toISOString()}`, ""];
  for (const report of reports) {
    lines.push(`## ${shortHash(report.hash)}`, "");
    lines.push(`Network: ${report.network} (chain ID ${report.chainId}, native ${report.nativeToken})`);
    lines.push(`RPC host: ${report.rpcHost}`);
    lines.push(`Explorer: ${report.explorerUrl}`);
    lines.push("");
    lines.push("| Field | Value |");
    lines.push("| --- | --- |");
    lines.push(`| Status | ${report.status} |`);
    lines.push(`| Diagnosis | ${report.diagnosis.label} |`);
    lines.push(`| Severity | ${report.diagnosis.severity} |`);
    if (report.transaction) {
      lines.push(`| From | \`${report.transaction.from}\` |`);
      lines.push(`| To | ${report.transaction.to ? `\`${report.transaction.to}\`` : "contract creation"} |`);
      lines.push(`| Value | ${report.transaction.valueNative} ${report.nativeToken} |`);
      lines.push(`| Nonce | ${report.transaction.nonce ?? "unknown"} |`);
      lines.push(`| Block | ${report.receipt?.blockNumber ?? report.transaction.blockNumber ?? "pending"} |`);
    }
    if (report.receipt) {
      lines.push(`| Gas used | ${report.receipt.gasUsed} |`);
      lines.push(`| Fee | ${report.receipt.feeNative ?? "unknown"} ${report.nativeToken} |`);
    }
    if (report.call) {
      lines.push(`| Call type | ${report.call.category} |`);
      lines.push(`| Method | ${report.call.name} |`);
      if (report.call.selector) lines.push(`| Selector | \`${report.call.selector}\` |`);
    }
    lines.push("");
    lines.push(`### Summary`);
    lines.push(report.diagnosis.summary);
    lines.push("");
    lines.push("### Evidence");
    for (const item of report.diagnosis.evidence) lines.push(`- ${item}`);
    lines.push("");
    lines.push("### Likely Causes");
    for (const item of report.diagnosis.likelyCauses) lines.push(`- ${item}`);
    lines.push("");
    lines.push("### Safe Next Actions");
    for (const item of report.diagnosis.nextActions) lines.push(`- ${item}`);
    lines.push("");
  }
  lines.push("_Read-only diagnosis. No private keys were requested or used._");
  return `${lines.join("\n")}\n`;
}

function renderJson(reports) {
  return `${JSON.stringify({ generatedAt: new Date().toISOString(), reports }, null, 2)}\n`;
}

function renderCsv(reports) {
  const headers = [
    "generatedAt",
    "hash",
    "network",
    "chainId",
    "status",
    "severity",
    "label",
    "from",
    "to",
    "blockNumber",
    "gasUsed",
    "gasLimit",
    "feeNative",
    "method",
    "selector",
    "summary",
    "likelyCauses",
    "nextActions",
    "explorerUrl"
  ];
  const rows = reports.map((report) => ({
    generatedAt: report.generatedAt,
    hash: report.hash,
    network: report.network,
    chainId: report.chainId,
    status: report.status,
    severity: report.diagnosis.severity,
    label: report.diagnosis.label,
    from: report.transaction?.from || "",
    to: report.transaction?.to || "",
    blockNumber: report.receipt?.blockNumber || report.transaction?.blockNumber || "",
    gasUsed: report.receipt?.gasUsed || "",
    gasLimit: report.transaction?.gasLimit || "",
    feeNative: report.receipt?.feeNative || "",
    method: report.call?.name || "",
    selector: report.call?.selector || "",
    summary: report.diagnosis.summary,
    likelyCauses: report.diagnosis.likelyCauses.join("; "),
    nextActions: report.diagnosis.nextActions.join("; "),
    explorerUrl: report.explorerUrl
  }));
  return `${headers.join(",")}\n${rows.map((row) => headers.map((h) => csvCell(row[h])).join(",")).join("\n")}\n`;
}

function csvCell(value) {
  const text = String(value ?? "");
  if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function renderConsole(reports, color = true) {
  const c = {
    reset: color ? "\x1b[0m" : "",
    cyan: color ? "\x1b[36m" : "",
    green: color ? "\x1b[32m" : "",
    yellow: color ? "\x1b[33m" : "",
    red: color ? "\x1b[31m" : "",
    bold: color ? "\x1b[1m" : ""
  };
  const lines = [`${c.bold}PHAROS FAILED TRANSACTION DOCTOR${c.reset}`, `Generated: ${new Date().toISOString()}`, ""];
  for (const report of reports) {
    const statusColor = report.diagnosis.severity === "FAIL" ? c.red : report.diagnosis.severity === "WARN" ? c.yellow : c.green;
    lines.push(`${c.bold}${shortHash(report.hash)}${c.reset}`);
    lines.push(`Network: ${report.network} | chain ${report.chainId} | ${report.nativeToken}`);
    lines.push(`Status: ${statusColor}${report.status}${c.reset} | ${report.diagnosis.label}`);
    lines.push(`Summary: ${report.diagnosis.summary}`);
    if (report.transaction) {
      lines.push(`From: ${shortAddress(report.transaction.from)} -> To: ${report.transaction.to ? shortAddress(report.transaction.to) : "contract creation"}`);
      lines.push(`Value: ${report.transaction.valueNative} ${report.nativeToken}`);
    }
    if (report.receipt) {
      lines.push(`Gas used: ${report.receipt.gasUsed} | Fee: ${report.receipt.feeNative ?? "unknown"} ${report.nativeToken}`);
    }
    if (report.call) {
      lines.push(`Call: ${report.call.name}${report.call.selector ? ` (${report.call.selector})` : ""}`);
    }
    lines.push("");
    lines.push(`${c.cyan}Evidence:${c.reset}`);
    for (const item of report.diagnosis.evidence) lines.push(`- ${item}`);
    lines.push(`${c.cyan}Likely causes:${c.reset}`);
    for (const item of report.diagnosis.likelyCauses) lines.push(`- ${item}`);
    lines.push(`${c.cyan}Safe next actions:${c.reset}`);
    for (const item of report.diagnosis.nextActions) lines.push(`- ${item}`);
    lines.push(`Explorer: ${report.explorerUrl}`);
    lines.push("");
  }
  lines.push("Read-only diagnosis. No private keys were requested or used.");
  return `${lines.join("\n")}\n`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }

  if (args.txFile) args.txs.push(...extractHashesFromFile(args.txFile));
  args.txs = unique(args.txs);

  if (args.txs.length === 0) throw new Error("Provide --tx <hash> or --tx-file <path>.");
  for (const hash of args.txs) {
    if (!isTxHash(hash)) throw new Error(`Invalid transaction hash: ${hash}`);
  }

  const config = loadNetworks();
  const networks = config.networks || DEFAULT_NETWORKS.networks;
  const defaultNetworkName = args.network || config.defaultNetwork || "atlantic-testnet";
  const selectedNetwork = networks.find((n) => n.name === defaultNetworkName);
  if (!args.autoNetwork && !selectedNetwork) {
    throw new Error(`Unsupported network: ${defaultNetworkName}. Supported: ${networks.map((n) => n.name).join(", ")}`);
  }

  const reports = [];
  for (const hash of args.txs) {
    let network = selectedNetwork;
    if (args.autoNetwork) {
      const foundName = await findNetworkForTx(hash, networks);
      network = networks.find((n) => n.name === foundName) || networks.find((n) => n.name === defaultNetworkName) || networks[0];
    }
    const effectiveNetwork = { ...network, rpcUrl: args.rpcUrl || network.rpcUrl };
    reports.push(await diagnoseHash(hash, effectiveNetwork, args));
  }

  const output = args.format === "json"
    ? renderJson(reports)
    : args.format === "csv"
      ? renderCsv(reports)
      : args.format === "console"
        ? renderConsole(reports, args.color)
        : renderMarkdown(reports);

  if (args.output) {
    writeFileSync(args.output, output);
  } else {
    process.stdout.write(output);
  }
}

main().catch((error) => {
  console.error(`Error: ${error.message}`);
  process.exitCode = 1;
});
