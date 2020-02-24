import BigNumber from 'bignumber.js';

import { ITestContext } from './perpetualDescribe';
import { expectBN } from './Expect';
import { INTEGERS } from '../../src/lib/Constants';
import { address } from '../../src/lib/types';

export async function expectBalances(
  ctx: ITestContext,
  accounts: address[],
  expectedMargins: BigNumber[],
  expectedPositions: BigNumber[],
  fullySettled: boolean = true,
  positionsSumToZero: boolean = true,
): Promise<void> {
  if (fullySettled && !positionsSumToZero) {
    throw new Error('fullySettled implies positionsSumToZero');
  }
  await expectMarginBalances(ctx, accounts, expectedMargins, fullySettled);
  await expectPositions(ctx, accounts, expectedPositions, positionsSumToZero);
}

/**
 * Verify that the account margin balances match the expected values.
 *
 * If the provided accounts represent all accounts on the contract with balances, and if the
 * accounts have all been settled, then fullySettled should be set to true (the default) to
 * perform a check that the sum of the accounts matches the total margin balance of the contract.
 *
 * A final solvency check is performed (regardless of the fullSettled param) to verify that the
 * total margin balance is equal to the token balance actually owned by the contract.
 */
export async function expectMarginBalances(
  ctx: ITestContext,
  accounts: address[],
  expectedMargins: BigNumber[],
  fullySettled: boolean = true,
): Promise<void> {
  const actualMargins = await Promise.all(accounts.map((account: address) => {
    return ctx.perpetual.getters.getAccountBalance(account).then(balance => balance.margin);
  }));
  const totalMargin = await ctx.perpetual.getters.getTotalMargin();

  for (const i in expectedMargins) {
    expectBN(actualMargins[i], `accounts[${i}] margin balance`).eq(expectedMargins[i]);
  }

  // Check that the total margin matches the sum margin of all provided accounts.
  if (fullySettled) {
    const accountSumMargin = actualMargins.reduce((a, b) => a.plus(b), INTEGERS.ZERO);
    expectBN(accountSumMargin, 'sum of account margins').eq(totalMargin);
  }

  // Contract solvency check.
  const perpetualTokenBalance = await ctx.perpetual.testing.token.getBalance(
    ctx.perpetual.contracts.perpetualV1.options.address,
  );
  expectBN(perpetualTokenBalance, 'PerpetualV1 token balance').eq(totalMargin);
}

/**
 * Verify that the account position balances match the expected values.
 *
 * If sumToZero is set to true (the default) then a check will be performed to ensure the position
 * balances sum to zero. This should always be the case when (for example) the prvoided accounts
 * represent all accounts on the contract with positions.
 */
export async function expectPositions(
  ctx: ITestContext,
  accounts: address[],
  expectedPositions: BigNumber[],
  sumToZero: boolean = true,
) {
  const actualPositions = await Promise.all(accounts.map((account: address) => {
    return ctx.perpetual.getters.getAccountBalance(account).then(balance => balance.position);
  }));

  for (const i in expectedPositions) {
    expectBN(actualPositions[i], `accounts[${i}] position balance`).eq(expectedPositions[i]);
  }

  if (sumToZero) {
    const accountSumPosition = actualPositions.reduce((a, b) => a.plus(b), INTEGERS.ZERO);
    expectBN(accountSumPosition).eq(INTEGERS.ZERO);
  }
}

export async function mintAndDeposit(
  ctx: ITestContext,
  account: address,
  amount: BigNumber,
): Promise<void> {
  await ctx.perpetual.testing.token.mintTo(amount, account);
  await ctx.perpetual.testing.token.setMaximumPerpetualAllowance(account);
  await ctx.perpetual.margin.deposit(account, amount, { from: account });
}