import type { NextApiRequest, NextApiResponse } from 'next';
import { PrivacyCash } from 'privacycash';

type DepositBody = {
  action: 'deposit';
  rpcUrl: string;
  owner: string;
  lamports: number;
};

type WithdrawBody = {
  action: 'withdraw';
  rpcUrl: string;
  owner: string;
  payouts: { address: string; lamports: number }[];
};

type BalanceBody = {
  action: 'balance';
  rpcUrl: string;
  owner: string;
};

type RequestBody = DepositBody | WithdrawBody | BalanceBody;

type DepositResponse = { tx: string; balanceLamports: number };
type WithdrawItem = { tx: string; recipient: string; lamports: number; feeLamports: number; isPartial: boolean };
type WithdrawResponse = { items: WithdrawItem[]; balanceLamports: number };
type BalanceResponse = { balanceLamports: number };

function validateLamports(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function createClient(rpcUrl: string, owner: string) {
  if (!rpcUrl || !owner) {
    throw new Error('Missing rpcUrl or owner secret.');
  }
  return new PrivacyCash({ RPC_url: rpcUrl, owner, enableDebug: true });
}

async function handleDeposit(body: DepositBody): Promise<DepositResponse> {
  if (!validateLamports(body.lamports)) {
    throw new Error('Deposit lamports must be greater than zero.');
  }
  const client = createClient(body.rpcUrl, body.owner);
  await client.clearCache();
  const result = await client.deposit({ lamports: Math.round(body.lamports) });
  const balance = await client.getPrivateBalance();
  return { tx: result.tx, balanceLamports: balance.lamports };
}

async function handleWithdraw(body: WithdrawBody): Promise<WithdrawResponse> {
  if (!Array.isArray(body.payouts) || body.payouts.length === 0) {
    throw new Error('Provide at least one payout.');
  }
  const client = createClient(body.rpcUrl, body.owner);
  await client.clearCache();
  const items: WithdrawItem[] = [];
  for (const entry of body.payouts) {
    if (!entry?.address) {
      throw new Error('Each payout must include an address.');
    }
    if (!validateLamports(entry.lamports)) {
      throw new Error(`Withdrawal amount for ${entry.address} must be greater than zero.`);
    }
    const response = await client.withdraw({ lamports: Math.round(entry.lamports), recipientAddress: entry.address });
    items.push({
      tx: response.tx,
      recipient: response.recipient,
      lamports: response.amount_in_lamports,
      feeLamports: response.fee_in_lamports,
      isPartial: response.isPartial,
    });
  }
  const balance = await client.getPrivateBalance();
  return { items, balanceLamports: balance.lamports };
}

async function handleBalance(body: BalanceBody): Promise<BalanceResponse> {
  const client = createClient(body.rpcUrl, body.owner);
  await client.clearCache();
  const balance = await client.getPrivateBalance();
  return { balanceLamports: balance.lamports };
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const body = req.body as RequestBody;
    if (!body?.action) {
      throw new Error('Missing action.');
    }

    if (body.action === 'deposit') {
      const result = await handleDeposit(body);
      res.status(200).json({ action: 'deposit', ...result });
      return;
    }
    if (body.action === 'withdraw') {
      const result = await handleWithdraw(body);
      res.status(200).json({ action: 'withdraw', ...result });
      return;
    }
    if (body.action === 'balance') {
      const result = await handleBalance(body);
      res.status(200).json({ action: 'balance', ...result });
      return;
    }

    throw new Error(`Unsupported action "${(body as RequestBody).action}".`);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error.';
    res.status(400).json({ error: message });
  }
}
