/**
 * @file generateTradrersLeaderBoard.js
 * @description This script generates the profit and loss (P&L) report for all the holders addresses indexed by the scripts in the tradesGeneration folder.
 * It takes an optional block number as a command line argument to compute the P&L from that point.
 *
 * Usage: node generateTradrersLeaderBoard.js [startStrategyBlockNumber]
 * The startStrategyBlockNumber represents the point in time when the current trade strategy started,
 * and the profits and losses should be computed from that point. Any batch with BlockNumOnWhichBitsWereBought
 * less than the startStrategyBlockNumber will be omitted from the computation.
 */

const fs = require("fs-extra");
const path = require("path");
const { JSONStore } = require("../store/JSONStore");
const KeyFleet = require("../fleet/keyFleet");
const TradeUtil = require("../common/trade/tradeUtil");
const Table = require("cli-table3");
const ora = require("ora-classic");
const { greenBright, bold } = require("tiny-chalk");

/**
 * Generates top traders leader board.
 * It retrieves the full store for all the holder addresses, computes the P&L, and prints the results.
 */
async function generateTradrersLeaderBoard() {
  try {
    const spinner = ora(
      `${bold(greenBright("Generating Top Traders Leaderboard"))}`
    ).start();
    // Parse the optional command line argument for the start strategy block number
    const startStrategyBlockNumber = process.argv[2]
      ? parseInt(process.argv[2], 10)
      : undefined;

    if (startStrategyBlockNumber && isNaN(startStrategyBlockNumber)) {
      throw new Error(
        "Invalid start strategy block number provided. It should be a valid number."
      );
    }

    // Create an instance of JSONStore
    const jsonStore = new JSONStore();

    // Get the full store for all the holders addresses
    const fullStore = await jsonStore.getFullStore();

    // Compute the profit and loss
    const pandLResults = await TradeUtil.computePandL(
      fullStore,
      startStrategyBlockNumber
    );

    const holders = pandLResults["holders"] || {};

    let topTradersLeaderBoard = new Table({
      head: [
        bold("Holder"),
        bold("Absolute Profit"),
        bold("Percentage Profit"),
        bold("Adjusted Initial Investment"),
      ],
    });

    Object.entries(holders)
      .map(([holder, pandL]) => ({
        holder,
        ...pandL,
      }))
      .sort((a, b) => b.absoluteProfit - a.absoluteProfit)
      .slice(0, 20)
      .forEach(
        (
          { holder, absoluteProfit, percentProfit, adjustedInitialInvestment },
          index
        ) => {
          // Highlight the top 3 traders
          if (index <= 2) {
            holder = bold(greenBright(holder));
            absoluteProfit = bold(greenBright(absoluteProfit));
            percentProfit = bold(greenBright(percentProfit));
            adjustedInitialInvestment = bold(
              greenBright(adjustedInitialInvestment)
            );
          }
          topTradersLeaderBoard.push([
            holder,
            absoluteProfit,
            percentProfit,
            adjustedInitialInvestment,
          ]);
        }
      );
    spinner.stop();
    spinner.clear();
    console.clear();
    console.log(topTradersLeaderBoard.toString());
  } catch (error) {
    console.error("Error generateTradrersLeaderBoard:", error);
  }
}

// Run the function
generateTradrersLeaderBoard().catch((error) => {
  console.error("Error running generateTradrersLeaderBoard:", error);
});
