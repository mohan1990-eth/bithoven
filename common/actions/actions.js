/**
 * @file action.js
 * @description This script contains implementations for adjusting and proposing buy and sell orders for bits.
 * It utilizes the TxGofer class to handle the order processing and the TradeUtil class to perform necessary adjustments.
 * The script includes two main functions: buyUpToImpl and sellBitImpl, which handle the buying and selling operations respectively.
 * @module action
 */

const Logger = require("../logger");
const CopyTradeUtil = require("../trade/copyTradeUtil");
const TradeUtil = require("../trade/tradeUtil");
const TxGofer = require("../../fleet/txGofer");
const { providerURL } = require("../../config/chainConfig");
const { ethers } = require("ethers");
const logger = new Logger();
const { JSONStore } = require("../../store/JSONStore"); // Add the JSONStore import
const KeyFleet = require("../../fleet/keyFleet");

// Setup provider using the RPC URL from chainConfig
const provider = new ethers.providers.JsonRpcProvider(providerURL);

// Create an instance of TxGofer
const txGofer = new TxGofer(provider, TxGofer.ROLE_PRODUCER);

/**
 * Adjusts the buy target amount and proposes a buy order if the adjusted quantity is greater than zero.
 * @param {Object} ctx - The context object containing information about the gamer and the rule.
 * @param {number} quantity - The quantity of bits to buy.
 */

async function buyUpToImpl(ctx, quantity) {
  //console.log(`buyUpToImpl(${JSON.stringify(ctx)}, ${quantity})`);
  //console.log(`buyUpToImpl called with ctx: ${JSON.stringify(ctx)}, quantity: ${quantity}`);

  // Adjust the buy target amount
  const adjustedQuantity = await TradeUtil.adjustBuyTargetAmount(
    ctx.gamer,
    quantity
  );

  const portfolioName = ctx.portfolio
    ? ctx.portfolio["portfolioName"]
    : "default";

  if (adjustedQuantity > 0) {
    const ruleId = ctx.rule.ruleID;
    const invokedBy = ctx.invokedBy;

    await txGofer.proposeOrder(
      ctx.gamer,
      "BUY",
      adjustedQuantity,
      ruleId,
      invokedBy,
      null,
      portfolioName
    );

    let obj = {
      action: "proposedOrder",
      funcName: "buyUpTo",
      adjustedNumberOfBits: adjustedQuantity,
      gamer: ctx.gamer,
      ruleId: ruleId,
      invokedBy: invokedBy,
    };

    logger.logInfo(obj);
  } else {
    const proposedSum = await TradeUtil.getProposedSum(ctx.gamer, "BUY");
    if (proposedSum > 0) {
      // reminder for buyGofer to take a look at proposed transactions
      await txGofer.raiseAlert(ctx.gamer, "BUY");
    }
    console.log(`No bits to buy after adjustment for gamer: ${ctx.gamer}`);
  }
}

/**
 * Adjusts the buy target amount based on the stop loss valuation set for the current portfolio and proposes a buy order if the adjusted quantity is greater than zero.
 * @param {Object} ctx - The context object containing information about the gamer, portfolio and the rule.
 * @param {number} quantity - The quantity of bits to buy.
 * @param {isInitialFill} - A boolean flag to indicate if the buy order is an initial fill. Initial fill indicates the buy order is placed when the portfolio is created. During initial fill, the stop loss valuation is not considered.
 */

async function copyBuyImpl(ctx, quantity, isInitialFill) {
  quantity = parseInt(quantity, 10); // ENsure quantity is an integer

  if (quantity <= 0) {
    throw new Error("CopyBuyImpl: Quantity must be greater than zero");
  }

  if (ctx["isBuy"] !== true) {
    return;
  }

  if (!ctx["portfolio"]) {
    throw new Error("CopyBuyImpl: ctx should have portfolio object");
  }

  let adjustedQuantity = quantity;

  if (!isInitialFill) {
    // Retrieve key fleet addresses associated with the current portfolio
    const keyFleet = new KeyFleet();
    const holderAddresses = keyFleet.getAllAddresses(
      ctx.portfolio["portfolioName"]
    );

    // Create an instance of JSONStore
    const jsonStore = new JSONStore();

    // Get the full store for all the holders addresses
    const fullStore = await jsonStore.getFullStore(holderAddresses);

    // Compute the profit and loss
    const pandLResults = await TradeUtil.computePandL(fullStore);

    const targetPortfolioValuation =
      ctx.portfolio["initialPortfolioValuationEthers"] -
      (ctx.portfolio["initialPortfolioValuationEthers"] *
        ctx.portfolio["stopLossPercent"]) /
        100;

    // Adjust the buy target amount
    adjustedQuantity =
      await CopyTradeUtil.adjustBuyTargetAmountToMeetConfiguredStopLoss(
        ctx.gamer,
        pandLResults,
        ctx.portfolio["initialPortfolioValuationEthers"],
        targetPortfolioValuation,
        quantity
      );
  }

  if (adjustedQuantity > 0) {
    const ruleId = ctx.rule.ruleID;
    const invokedBy = ctx.invokedBy;

    await txGofer.proposeOrder(
      ctx.gamer,
      "BUY",
      adjustedQuantity,
      ruleId,
      invokedBy,
      null,
      ctx.portfolio["portfolioName"]
    );

    let obj = {
      action: "proposedOrder",
      funcName: "copyBuy",
      portfolioName: ctx.portfolio["portfolioName"],
      adjustedNumberOfBits: adjustedQuantity,
      gamer: ctx.gamer,
      ruleId: ruleId,
      invokedBy: invokedBy,
    };

    logger.logInfo(obj);
  } else {
    const proposedSum = await TradeUtil.getProposedSum(ctx.gamer, "BUY");
    if (proposedSum > 0) {
      // reminder for buyGofer to take a look at proposed transactions
      await txGofer.raiseAlert(ctx.gamer, "BUY");
    }
    console.log(
      `No bits to buy after adjustment for target stop loss valuation of portfolio for: ${ctx.portfolio["portfolioName"]} and gamer: ${ctx.gamer}`
    );
  }
}

/**
 * Adjusts the sell target amount and proposes a sell order if the adjusted quantity is greater than zero.
 * Note that quantity is the actual quantity sold by the copied trader
 * @param {Object} ctx - The context object containing information about the gamer, portfolio, and the rule.
 */

async function copySellImpl(ctx, quantity) {
  quantity = parseInt(quantity, 10); // ENsure quantity is an integer
  // Retrieve key fleet addresses associated with the current portfolio

  if (quantity <= 0) {
    throw new Error("CopyBuyImpl: Quantity must be greater than zero");
  }

  if (ctx["isBuy"] !== false) {
    return;
  }

  if (!ctx["portfolio"]) {
    throw new Error("CopyBuyImpl: ctx should have portfolio object");
  }

  const holder = await TradeUtil.getLargestKeyFleetOwnerOfGamer(
    ctx.gamer,
    ctx.portfolio["portfolioName"]
  );

  // Adjust the sell target amount
  const adjustedQuantity = await TradeUtil.adjustSellTargetAmount(
    ctx.gamer,
    holder,
    quantity
  );

  if (adjustedQuantity > 0) {
    const ruleId = ctx.rule.ruleID;
    const invokedBy = ctx.invokedBy;

    await txGofer.proposeOrder(
      ctx.gamer,
      "SELL",
      adjustedQuantity,
      ruleId,
      invokedBy,
      holder,
      ctx.portfolio["portfolioName"] // Add the portfolio valuation as a parameter
    );

    let obj = {
      action: "proposedOrder",
      funcName: "copySell",
      portfolioName: ctx.portfolio["portfolioName"],
      adjustedNumberOfBits: adjustedQuantity,
      holder: holder,
      gamer: ctx.gamer,
      ruleId: ruleId,
      invokedBy: invokedBy,
    };

    logger.logInfo(obj);
  } else {
    const proposedSum = await TradeUtil.getProposedSum(
      ctx.gamer,
      "SELL",
      holder
    );
    if (proposedSum > 0) {
      // reminder for sellGofer to take a look at proposed transactions
      await txGofer.raiseAlert(ctx.gamer, "SELL");
    }

    console.log(
      `No bits to sell after adjustment for gamer: ${ctx.gamer}, holder: ${holder}`
    );
  }
}

/**
 * Adjusts the sell target amount and proposes a sell order if the adjusted quantity is greater than zero.
 * Note that quantity is the output of quantity functions specified in sell rules (e.g., bitProfitThreshold)
 * @param {Object} ctx - The context object containing information about the gamer, holder, and the rule.
 */
async function sellBitImpl(ctx) {
  //console.log(`######################sellBitImpl called with ctx: ${JSON.stringify(ctx)}, quantity: ${ctx.quantity}`);

  if (ctx.quantity == 0) {
    return;
  }

  // Adjust the sell target amount
  const adjustedQuantity = await TradeUtil.adjustSellTargetAmount(
    ctx.gamer,
    ctx.holder,
    ctx.quantity
  );

  if (adjustedQuantity > 0) {
    const ruleId = ctx.rule.ruleID;
    const invokedBy = ctx.invokedBy;

    await txGofer.proposeOrder(
      ctx.gamer,
      "SELL",
      adjustedQuantity,
      ruleId,
      invokedBy,
      ctx.holder
    );

    let obj = {
      action: "proposedOrder",
      funcName: "sellBit",
      adjustedNumberOfBits: adjustedQuantity,
      holder: ctx.holder,
      gamer: ctx.gamer,
      ruleId: ruleId,
      invokedBy: invokedBy,
    };

    logger.logInfo(obj);
  } else {
    const proposedSum = await TradeUtil.getProposedSum(
      ctx.gamer,
      "SELL",
      ctx.holder
    );
    if (proposedSum > 0) {
      // reminder for sellGofer to take a look at proposed transactions
      await txGofer.raiseAlert(ctx.gamer, "SELL");
    }

    console.log(
      `No bits to sell after adjustment for gamer: ${ctx.gamer}, holder: ${ctx.holder}`
    );
  }
}

/**
 * Adjusts the sell target amount and proposes a sell order if the adjusted quantity is greater than zero.
 * Will select fleet address with the largest stake in specifc gamer that is passed in via context
 * @param {Object} ctx - The context object containing information about the gamer, holder, and the rule.
 */
async function sellBitFromAutoSelectedFleetKeyImpl(ctx, amount) {
  // Check if amount is a string representation of an integer
  if (typeof amount !== "string" || !/^\d+$/.test(amount)) {
    throw new InvalidParameterError(
      "The amount parameter must be a string representation of an integer"
    );
  }

  if (!ctx.gamer) {
    throw new InvalidParameterError("The ctx object must have gamer field");
  }

  const amountInt = parseInt(amount, 10);

  if (amountInt == 0) {
    return;
  }

  const holder = await TradeUtil.getLargestKeyFleetOwnerOfGamer(ctx.gamer);

  // Adjust the sell target amount
  const adjustedQuantity = await TradeUtil.adjustSellTargetAmount(
    ctx.gamer,
    holder,
    amountInt
  );

  if (adjustedQuantity > 0) {
    const ruleId = ctx.rule.ruleID;
    const invokedBy = ctx.invokedBy;

    await txGofer.proposeOrder(
      ctx.gamer,
      "SELL",
      adjustedQuantity,
      ruleId,
      invokedBy,
      holder
    );

    let obj = {
      action: "proposedOrder",
      funcName: "sellBit",
      adjustedNumberOfBits: adjustedQuantity,
      holder: holder,
      gamer: ctx.gamer,
      ruleId: ruleId,
      invokedBy: invokedBy,
    };

    logger.logInfo(obj);
  } else {
    const proposedSum = await TradeUtil.getProposedSum(
      ctx.gamer,
      "SELL",
      holder
    );
    if (proposedSum > 0) {
      // reminder for sellGofer to take a look at proposed transactions
      await txGofer.raiseAlert(ctx.gamer, "SELL");
    }

    console.log(
      `No bits to sell after adjustment for gamer: ${ctx.gamer}, holder: ${holder}`
    );
  }
}

module.exports = {
  buyUpToImpl,
  copyBuyImpl,
  sellBitImpl,
  copySellImpl,
  sellBitFromAutoSelectedFleetKeyImpl,
};
