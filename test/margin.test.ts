import BigNumber from 'bignumber.js';

import { expect, expectBN, expectThrow } from './helpers/Expect';
import initializeWithTestContracts from './helpers/initializeWithTestContracts';
import { expectMarginBalances, mintAndDeposit } from './helpers/balances';
import { mineAvgBlock } from './helpers/EVM';
import perpetualDescribe, { ITestContext } from './helpers/perpetualDescribe';
import { sell } from './helpers/trade';
import {
  address,
  Price,
} from '../src/lib/types';

perpetualDescribe('P1Margin', initializeWithTestContracts, (ctx: ITestContext) => {
  let accountOwner: address;
  let otherUser: address;

  before(() => {
    accountOwner = ctx.accounts[1];
    otherUser = ctx.accounts[2];
  });

  describe('deposit()', () => {
    it('Account owner can deposit', async () => {
      // Set initial balances and allowances.
      const amount = new BigNumber(150);
      await ctx.perpetual.testing.token.mintTo(amount, accountOwner);
      await ctx.perpetual.testing.token.setMaximumPerpetualAllowance(accountOwner);

      // Execute deposit.
      await mineAvgBlock();
      const txResult = await ctx.perpetual.margin.deposit(
        accountOwner,
        amount,
        { from: accountOwner },
      );

      // Check balances.
      await expectMarginBalances(ctx, [accountOwner], [amount]);

      // Check logs.
      const logs = ctx.perpetual.logs.parseLogs(txResult);
      expect(logs.length).to.equal(2);
      const [indexUpdatedLog, depositLog] = logs;
      expect(indexUpdatedLog.name).to.equal('LogIndexUpdated');
      expect(depositLog.name).to.equal('LogDeposit');
      expect(depositLog.args.account).to.equal(accountOwner);
      expectBN(depositLog.args.amount).to.eq(amount);
    });

    it('Non-owner can deposit', async () => {
      // Set initial balances and allowances.
      const amount = new BigNumber(150);
      await ctx.perpetual.testing.token.mintTo(amount, otherUser);
      await ctx.perpetual.testing.token.setMaximumPerpetualAllowance(otherUser);

      // Execute deposit.
      await ctx.perpetual.margin.deposit(accountOwner, amount, { from: otherUser });

      // Check balances.
      await expectMarginBalances(ctx, [accountOwner], [amount]);
    });

    it('Can make multiple deposits', async () => {
      // Set initial balances and allowances.
      await ctx.perpetual.testing.token.mintTo(new BigNumber(1000), accountOwner);
      await ctx.perpetual.testing.token.mintTo(new BigNumber(1000), otherUser);
      await ctx.perpetual.testing.token.setMaximumPerpetualAllowance(accountOwner);
      await ctx.perpetual.testing.token.setMaximumPerpetualAllowance(otherUser);

      // Execute deposits.
      await ctx.perpetual.margin.deposit(accountOwner, new BigNumber(50), { from: accountOwner });
      await ctx.perpetual.margin.deposit(accountOwner, new BigNumber(150), { from: accountOwner });
      await ctx.perpetual.margin.deposit(accountOwner, new BigNumber(0), { from: accountOwner });
      await ctx.perpetual.margin.deposit(accountOwner, new BigNumber(300), { from: otherUser });

      // Check balances.
      await expectMarginBalances(ctx, [accountOwner], [new BigNumber(500)]);
    });

    it('Cannot deposit more than the sender\'s balance', async () => {
      // Set initial balances and allowances.
      const amount = new BigNumber(1000);
      await ctx.perpetual.testing.token.mintTo(amount, accountOwner);
      await ctx.perpetual.testing.token.setMaximumPerpetualAllowance(otherUser);

      await expectThrow(
        ctx.perpetual.margin.deposit(accountOwner, amount.plus(1), { from: accountOwner }),
        'SafeERC20: ERC20 operation did not succeed',
      );
    });
  });

  describe('withdraw()', () => {
    beforeEach(async () => {
      // Deposit.
      const amount = new BigNumber(150);
      await ctx.perpetual.testing.token.mintTo(amount, accountOwner);
      await ctx.perpetual.testing.token.setMaximumPerpetualAllowance(accountOwner);
      await ctx.perpetual.margin.deposit(accountOwner, amount, { from: accountOwner });
    });

    it('Account owner can withdraw partial amount', async () => {
      const amount = new BigNumber(100);

      // Execute withdraw.
      await mineAvgBlock();
      const txResult = await ctx.perpetual.margin.withdraw(
        accountOwner,
        amount,
        { from: accountOwner },
      );

      // Check balances.
      await expectMarginBalances(ctx, [accountOwner], [new BigNumber(50)]);

      // Check logs.
      const logs = ctx.perpetual.logs.parseLogs(txResult);
      expect(logs.length).to.equal(2);
      const [indexUpdatedLog, depositLog] = logs;
      expect(indexUpdatedLog.name).to.equal('LogIndexUpdated');
      expect(depositLog.name).to.equal('LogWithdraw');
      expect(depositLog.args.account).to.equal(accountOwner);
      expectBN(depositLog.args.amount).to.eq(amount);
    });

    it('Account owner can withdraw full amount', async () => {
      await ctx.perpetual.margin.withdraw(accountOwner, new BigNumber(150), { from: accountOwner });

      // Check balances.
      await expectMarginBalances(ctx, [accountOwner], [new BigNumber(0)]);
    });

    it('Global operator can make a withdrawal', async () => {
      await ctx.perpetual.admin.setGlobalOperator(otherUser, true, { from: ctx.accounts[0] });
      await ctx.perpetual.margin.withdraw(accountOwner, new BigNumber(150), { from: otherUser });

      // Check balances.
      await expectMarginBalances(ctx, [accountOwner], [new BigNumber(0)]);
    });

    it('Local operator can make a withdrawal', async () => {
      await ctx.perpetual.operator.setLocalOperator(otherUser, true, { from: accountOwner });
      await ctx.perpetual.margin.withdraw(accountOwner, new BigNumber(150), { from: otherUser });

      // Check balances.
      await expectMarginBalances(ctx, [accountOwner], [new BigNumber(0)]);
    });

    it('Owner can make multiple withdrawals', async () => {
      await ctx.perpetual.margin.withdraw(accountOwner, new BigNumber(30), { from: accountOwner });
      await ctx.perpetual.margin.withdraw(accountOwner, new BigNumber(50), { from: accountOwner });
      await ctx.perpetual.margin.withdraw(accountOwner, new BigNumber(70), { from: accountOwner });
      await ctx.perpetual.margin.withdraw(accountOwner, new BigNumber(0), { from: accountOwner });

      // Check balances.
      await expectMarginBalances(ctx, [accountOwner], [new BigNumber(0)]);
    });

    it('Account owner cannot withdraw more than the account balance', async () => {
      await expectThrow(
        ctx.perpetual.margin.withdraw(accountOwner, new BigNumber(151), { from: accountOwner }),
        'SafeERC20: ERC20 operation did not succeed',
      );
    });

    it('Non-owner cannot withdraw', async () => {
      await expectThrow(
        ctx.perpetual.margin.withdraw(accountOwner, new BigNumber(100), { from: otherUser }),
        'sender does not have permission to withdraw',
      );
    });

    it('Fails if it would leave the account undercollateralized', async () => {
      // Set up test contract behavior.
      await ctx.perpetual.testing.oracle.setPrice(new Price(100));

      // Set initial balances and allowances.
      // Bring the total deposited to 1000.
      const marginAmount = new BigNumber(850);
      await mintAndDeposit(ctx, accountOwner, marginAmount);
      await mintAndDeposit(ctx, otherUser, marginAmount);

      // Open a short position, bringing the account to 1100 margin and -10 position.
      // This trade should put the account right on the collateralization line.
      await sell(ctx, accountOwner, otherUser, new BigNumber(10), new BigNumber(100));

      await expectThrow(
        ctx.perpetual.margin.withdraw(accountOwner, new BigNumber(1), { from: accountOwner }),
        'account not collateralized',
      );
    });
  });
});