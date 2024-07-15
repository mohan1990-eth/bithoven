/**
 * @file CopyTradeUtil.js
 * @description This module provides utility functions for copy trade strategy.
 * @module CopyTradeUtil
 */

const { getBuyPrice } = require("../../common/contractUtil/getBuyPrice");
const {
  convertBitsPriceWeiToEther,
} = require("../../common/contractUtil/convertBitsPrice");
const { providerURL, contractAddress } = require("../../config/chainConfig");
const ethers = require("ethers");

class CopyTradeUtil {
  /**
   * Retrieves the bit balance in store for a specified holder and gamer.
   *
   * @param {Array} copiedTraderPositions - The array of positions. Each position is an array with a gamerAddress at 0th index and bit quantity at 1st index.
   * @param {string} copyStrategy - One of min, mid and max.
   * @returns {Array} The array of positions calculated by applying the copyStrategy. Each position is an array with a gamerAddress at 0th index and bit quantity at 1st index.
   */
  static async calculateInitialPositions(copiedTraderPositions, copyStrategy) {
    if (copyStrategy === "none") {
      throw new Error("Copy trade strategy is none");
    }

    const provider = new ethers.providers.JsonRpcProvider(providerURL);

    let totalQuantity = 0;
    let totalBuyPriceInWei = 0;
    let totalBuyPriceInEthers = 0;

    let calculatedInitialPositions = [];

    const calculateInitialPositions = async (position) => {
      let gamerAddress, quantity, buyPriceInWei;
      gamerAddress = position[0];

      if (copyStrategy === "min") {
        quantity = 1;
      } else if (copyStrategy === "mid") {
        quantity = Math.ceil(position[1] / 2);
      } else if (copyStrategy === "all") {
        quantity = position[1];
      }

      buyPriceInWei = await getBuyPrice(
        gamerAddress,
        quantity,
        provider,
        contractAddress,
        "latest",
        true
      );

      let buyPriceInEthers = await convertBitsPriceWeiToEther(
        provider,
        buyPriceInWei
      );

      totalQuantity += quantity;
      totalBuyPriceInEthers += buyPriceInEthers;
      totalBuyPriceInWei += Number(buyPriceInWei);

      return [gamerAddress, quantity, buyPriceInEthers];
    };

    for (let position of copiedTraderPositions) {
      calculatedInitialPositions.push(
        await calculateInitialPositions(position)
      );
    }

    return {
      calculatedInitialPositions,
      totalQuantity,
      totalBuyPriceInWei,
      totalBuyPriceInEthers,
    };
  }

  static async adjustBuyTargetAmountToMeetConfiguredStopLoss(
    gamer,
    pandLResults,
    initialPortfolioValuation,
    targetPortfolioValuation,
    stopLossPercentage,
    quantity
  ) {
    const currentPortfolioValuation =
      pandLResults &&
      pandLResults["total"] &&
      pandLResults["total"]["absoluteProfit"]
        ? parseFloat(pandLResults["total"]["absoluteProfit"]) +
          initialPortfolioValuation
        : initialPortfolioValuation;

    let currentPandLPercentage =
      pandLResults &&
      pandLResults["total"] &&
      pandLResults["total"]["percentProfit"]
        ? parseFloat(pandLResults["total"]["percentProfit"])
        : 0;

    if (stopLossPercentage > 0) {
      // Stop loss percentage needs to be expressed in negative. If stop loss is positive, ensure it is negative.
      stopLossPercentage = stopLossPercentage * -1;
    }

    console.log("currentPandLPercentage", currentPandLPercentage);
    console.log("stopLossPercentage", stopLossPercentage);

    if (stopLossPercentage >= currentPandLPercentage) {
      // greater than because we are looking for a stop loss
      return 0;
    } else {
      return quantity;
    }
  }
}

module.exports = CopyTradeUtil;
