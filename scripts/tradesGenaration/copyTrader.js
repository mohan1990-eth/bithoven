/**
 * @file copyTrader.js
 * @description This module helps to fill the initial positions of a copied portfolio by receiving a COPY_TRADE_BUY event from  /scripts/setupCopyTradePortfolio.js and placing buy orders for the calculated initial positions.
 *
 */
// scripts/tradesExecution/copyTrader.js

const http = require("http");
const io = require("socket.io-client");
const socketIo = require("socket.io");
const path = require("path");
const fs = require("fs");
const {
  processJsonBuyRules,
  evaluateAndInvokeBuy,
} = require("../../common/rulesEngineLib");
const sockeIOConfig = require("../../config/socketIOConfig.json");

const invokedBy = "copyTrader";

class CopyTrader {
  constructor() {
    this.buyRulesPlaceholders = [
      {
        ruleID: "copyTradeInitialFill",
        invokeBy: [invokedBy],
        conditions: [
          {
            expression: "copyTrade(PORTFOLIO_NAME)",
          },
        ],
        action: "copyBuy(COPY_QTY, true)", // true indicates, it is an initial fill
      },
    ];

    this.schemaFilePath = path.resolve(
      __dirname,
      "../../schema/tradeSchema.json"
    );
    this.schema = JSON.parse(fs.readFileSync(this.schemaFilePath, "utf-8"));

    this.server = http.createServer();
    this.io = socketIo(this.server);
    this.server.listen(sockeIOConfig.copyTradeServerPort, () => {
      console.log(
        "Copy Trader Server listening on port  " +
          sockeIOConfig.copyTradeServerPort
      );
    });

    this.subscribedToCopyTradeEvents = false;
  }
  /**
   * Processes the buy rules from the JSON document.
   *
   * @returns {Object} The processed buy rules.
   */
  processBuyRules(buyRules) {
    const rules = processJsonBuyRules(buyRules, this.schema, invokedBy);
    return rules;
  }

  async newCopyTraderEvent(portfolio) {
    console.log("Processing Copy Trader event: ");
    console.log("Event args: " + JSON.stringify(portfolio));
    portfolio = JSON.parse(portfolio);
    try {
      let ctx = {
        invokedBy: invokedBy,
        holder: portfolio["copiedTraderAddress"],
        isBuy: true,
        portfolio: portfolio,
      };

      for (const newPortfolioInitialPosition of portfolio[
        "newPortfolioInitialPositions"
      ]) {
        let buyRules = JSON.stringify(this.buyRulesPlaceholders)
          .replace("PORTFOLIO_NAME", portfolio.portfolioName)
          .replace("COPY_QTY", newPortfolioInitialPosition[1]); // bit quantity

        const buyRulesParsed = JSON.parse(buyRules);

        this.buyRules = this.processBuyRules(buyRulesParsed);
        ctx["gamer"] = newPortfolioInitialPosition[0]; // gamerAddress

        if (this.buyRules) {
          await evaluateAndInvokeBuy(ctx, this.buyRules);
          console.log(
            "Buy order placed for gamer:",
            newPortfolioInitialPosition[0]
          );
        }
      }

      const socket = io(
        "http://localhost:" + sockeIOConfig.copyTradeSetupScriptPort
      );

      socket.on("connect", () => {});
      console.log("Emitting COPY_TRADE_BUY_POSITIONS_FILLED");
      socket.emit(
        sockeIOConfig.events["COPY_TRADE_BUY_POSITIONS_FILLED"]["name"],
        "OK"
      );
    } catch (error) {
      console.error("Error in copyTrader:", error);
    }
  }

  /**
   * Starts the copy trader process, receiving and processing buy requests from setupCopyTradePortfolio.js (via Node.js EventEmitter).
   */
  startCopyTrader() {
    try {
      console.log("In startCopyTrader");
      if (this.subscribedToCopyTradeEvents) {
        return;
      }
      const ptr = this;
      console.log("Subscribing to copy trade events");
      this.io.on("connection", (socket) => {
        console.log("Copy Trader Client connected");

        // Listen for events from the client
        socket.on(
          sockeIOConfig.events["COPY_TRADE_BUY_FILL_POSITIONS"]["name"],
          this.newCopyTraderEvent.bind(ptr)
        );
      });
      console.log("Subscribed to copy trade events");
      this.subscribedToCopyTradeEvents = true;
    } catch (error) {
      console.error("Error in startCopyTrader:", error);
    }
  }

  // The copyBuy and copySell functions require the quantity as second argument.
  // The quantity is available only at runtime (when the copied trader buys or sells Bits), where as when the copyBuy and copySell rules are created in Rules directory, they don't quantity as the second argument.
  // This function is used to fill the COPY_QTY with the actual quantity at runtime.
  static shimCopyTradeActionForQuantity(tradeRules, quantity) {
    tradeRules = JSON.stringify(tradeRules);
    tradeRules = tradeRules.replaceAll("COPY_QTY", quantity);
    return JSON.parse(tradeRules);
  }
}
module.exports = CopyTrader;
