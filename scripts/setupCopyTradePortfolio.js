const fs = require("fs");
const http = require("http");
const path = require("path");
const prompts = require("prompts");
const Table = require("cli-table3");
const { ethers } = require("ethers");
const { greenBright, bold, magentaBright, cyanBright } = require("tiny-chalk");
const socketIo = require("socket.io");
const io = require("socket.io-client");
const sockeIOConfig = require("../config/socketIOConfig.json");
const ora = require("ora-classic");
const { JSONStore } = require("../store/JSONStore");
const TradeUtil = require("../common/trade/tradeUtil");
const {
  validatePortfolioNameAndReturnPortfolioObject,
} = require("../common/portfolioHelper");
const CopyTradeUtil = require("../common/trade/copyTradeUtil");
const readline = require("readline");

// Path to portfolio config file
const portfolioConfigPath = path.resolve(
  __dirname,
  "../config/portfolioConfig.json"
);

// Function to read JSON file
function readJsonFile(filePath) {
  if (fs.existsSync(filePath)) {
    const portfolioData = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(portfolioData);
  }
  return [];
}

// Function to write JSON file
function writeJsonFile(filePath, portfolioData) {
  fs.writeFileSync(filePath, JSON.stringify(portfolioData, null, 2));
}

function calculateKeccak256HashOfString(str) {
  const hash = ethers.utils.keccak256(ethers.utils.toUtf8Bytes(str));
  return hash;
}

// Function to check if addresses are unique and not present in existing data
function areAddressesUnique(keyFleet, existingData) {
  const existingAddresses = new Set();
  for (const entry of existingData) {
    entry.keyFleet.forEach((address) => existingAddresses.add(address));
  }

  const uniqueAddresses = new Set(keyFleet);
  if (uniqueAddresses.size !== keyFleet.length) {
    return false;
  }

  for (const address of keyFleet) {
    if (existingAddresses.has(address)) {
      return false;
    }
  }

  return true;
}

// Function to validate if an address is a valid Ethereum address
function isValidEthereumAddress(address) {
  return ethers.utils.isAddress(address);
}

async function setupCopyTradePortfolio() {
  // Create the new portfolio entry
  let newPortfolioEntry = {};

  // Prompt for the portfolio name
  const response = await prompts([
    {
      type: "text",
      name: "portfolioName",
      message: "Enter the name of the copy trade portfolio:",
      validate: (name) => {
        name = name.trim();
        if (name === "") return "Portfolio name cannot be empty.";
        try {
          const existingPortfolio =
            validatePortfolioNameAndReturnPortfolioObject(name);
          if (existingPortfolio != null) {
            return (
              "Portfolio " +
              name +
              " exists already. Please try again with a different portfolio name."
            );
          }
          return true;
        } catch (ex) {
          // validatePortfolioNameAndReturnPortfolioObject() throws exception is portfolio by the given name is not found
          return true;
        }
      },
    },
    {
      type: "list",
      name: "keyFleet",
      message:
        "Enter fleet key addresses associated with this portfolio separated by commas:",
      separator: ",",
      validate: (keyFleet) => {
        const invalidAddresses = keyFleet
          .split(",")
          .filter((address) => !isValidEthereumAddress(address.trim()));
        return invalidAddresses.length === 0
          ? true
          : `Invalid Ethereum address(es): ${invalidAddresses.join(", ")}`;
      },
    },
    {
      type: "text",
      name: "copiedTraderAddress",
      message: "Enter the wallet address of the trader you want to copy:",
      validate: (address) =>
        isValidEthereumAddress(address.trim())
          ? true
          : `Invalid Ethereum address: ${address}`,
    },
  ]);

  const { portfolioName, keyFleet, copiedTraderAddress } = response;
  const copiedTraderAddressTrimmed = ethers.utils.getAddress(
    copiedTraderAddress.trim()
  );

  // Read the existing portfolio JSON data
  const existingPortfolioData = readJsonFile(portfolioConfigPath);

  // Validate the fleet key addresses
  if (!areAddressesUnique(keyFleet, existingPortfolioData)) {
    console.log(
      "Fleet key addresses must be unique and not present in the existing portfolio's key fleet."
    );
    process.exit(1);
  }

  // Retrieve the current positions of the copied trader
  const jsonStore = new JSONStore();
  const fullStore = await jsonStore.getFullStore([copiedTraderAddressTrimmed]);

  if (
    fullStore["holders"] === undefined ||
    fullStore["holders"][copiedTraderAddressTrimmed] === undefined ||
    Object.keys(fullStore["holders"][copiedTraderAddressTrimmed]).length === 0
  ) {
    console.log("No positions found for the copied trader. Exiting...");
    process.exit(1);
  }

  newPortfolioEntry["portfolioName"] = portfolioName;
  newPortfolioEntry["keyFleet"] = keyFleet.map((address) => address.trim());
  newPortfolioEntry["copiedTraderAddress"] = copiedTraderAddressTrimmed;

  let copiedTraderCurrentPortfolioTemp = [];

  let copiedTraderCurrentPortfolio = new Table({
    head: [bold(greenBright("Gamer Address")), bold(greenBright("Quantity"))],
  });

  for (const gamerAddress of Object.keys(
    fullStore["holders"][copiedTraderAddressTrimmed]
  )) {
    const copiedTraderPosition =
      fullStore["holders"][copiedTraderAddressTrimmed][gamerAddress];
    if (
      copiedTraderPosition === undefined ||
      Object.keys(copiedTraderPosition).length === 0
    ) {
      continue;
    }

    const quantity = await TradeUtil.getBitBalanceInStore(
      copiedTraderAddressTrimmed,
      gamerAddress
    );

    copiedTraderCurrentPortfolioTemp.push([gamerAddress, quantity]);
  }

  copiedTraderCurrentPortfolioTemp
    .sort((position1, position2) => position2[1] - position1[1])
    .forEach((position) => {
      copiedTraderCurrentPortfolio.push(position);
    });

  console.log("\n");
  console.log(bold(magentaBright("Copied Trader's current position:")));

  console.log(copiedTraderCurrentPortfolio.toString());

  // Prompt what copy trade strategy to use to create the portfolio

  console.log("\n");

  const response2 = await prompts([
    {
      type: "select",
      name: "copyTradeStrategy",
      message:
        "Select the copy trade strategy you want to apply to fill initial positions in the copied portfolio",
      choices: [
        { title: "One quantity from each position (min)", value: "min" },
        { title: "Average quantity from each position (mid)", value: "mid" },
        { title: "All quantity from each position (all)", value: "all" },
        { title: "Don't fill any quantity at all (none)", value: "none" },
      ],
      initial: 0,
    },
  ]);

  const { copyTradeStrategy } = response2;

  if (copyTradeStrategy !== "none") {
    console.log("\n");
    console.log(
      bold(
        magentaBright(
          "You chose: " + copyTradeStrategy + " copy trade strategy"
        )
      )
    );
    console.log("\n");
    const spinner = ora(
      `${bold(
        magentaBright(
          "Calculating the initial positions to fill in the portfolio:" +
            portfolioName +
            ". Please wait..."
        )
      )}`
    ).start();

    let newPortfolioInitialPositions = new Table({
      head: [
        bold(greenBright("Gamer Address")),
        bold(greenBright("Quantity")),
        bold(greenBright("Buy Price")),
      ],
    });

    const {
      calculatedInitialPositions,
      totalQuantity,
      totalBuyPriceInWei,
      totalBuyPriceInEthers,
    } = await CopyTradeUtil.calculateInitialPositions(
      copiedTraderCurrentPortfolioTemp,
      copyTradeStrategy
    );
    calculatedInitialPositions.forEach((position) => {
      newPortfolioInitialPositions.push(position);
    });

    // Add total row at the end

    newPortfolioInitialPositions.push([
      bold(cyanBright("Total")),
      bold(cyanBright(totalQuantity)),
      bold(cyanBright(totalBuyPriceInEthers)),
    ]);

    spinner.stop();
    spinner.clear();
    // clear previous line of spinner
    // Move cursor to the beginning of the line
    readline.cursorTo(process.stdout, 0);
    // Clear the current line
    readline.clearLine(process.stdout, 0);

    console.log(
      bold(
        magentaBright(
          "The following initial positions will be filled in the portfolio: " +
            portfolioName
        )
      )
    );
    console.log("\n");

    console.log(newPortfolioInitialPositions.toString());
    console.log("\n");

    const maxStopLossPercent = 10;
    const minStopLossPercent = 1;

    const response3 = await prompts({
      type: "number",
      name: "stopLossPercent",
      message: `Enter the stop loss as a percentage of initial portfolio value ${bold(
        cyanBright(totalBuyPriceInEthers)
      )}. Minimum Stop Loss Percentage is ${bold(
        cyanBright(minStopLossPercent)
      )} and Maximum Stop Loss Percentage is ${bold(
        cyanBright(maxStopLossPercent)
      )}`,
      validate: (value) =>
        value >= minStopLossPercent && value <= maxStopLossPercent
          ? true
          : `Please enter a number between ${minStopLossPercent} and ${maxStopLossPercent}`,
    });

    const { stopLossPercent } = response3;

    newPortfolioEntry["newPortfolioInitialPositions"] =
      calculatedInitialPositions;
    newPortfolioEntry["initialPortfolioValuationWei"] = totalBuyPriceInWei;
    newPortfolioEntry["initialPortfolioValuationEthers"] =
      totalBuyPriceInEthers;
    newPortfolioEntry["stopLossPercent"] = stopLossPercent;

    newPortfolioEntry["copyTradeStrategy"] = copyTradeStrategy;
    newPortfolioEntry["createTimeUTC"] = new Date().toUTCString();

    // Append the new entry to the JSON data
    existingPortfolioData.push(newPortfolioEntry);

    // Write the updated JSON data back to the file
    writeJsonFile(portfolioConfigPath, existingPortfolioData);

    let buyRules = readJsonFile(
      path.resolve(__dirname, "../rules/buy/buyRules.json")
    );
    let sellRules = readJsonFile(
      path.resolve(__dirname, "../rules/sell/sellRules.json")
    );

    const copyBuyRule = {
      ruleID: "copyTradeBuy",
      invokeBy: ["chainIndexer"],
      conditions: [
        {
          expression: "copyTrade(" + portfolioName + ")",
        },
      ],
      action: "copyBuy(COPY_QTY, false)", // false indicates, it is not an initial fill
    };

    const copySellRule = {
      ruleID: "copyTradeSell",
      invokeBy: ["chainIndexer"],
      conditions: [
        {
          expression: "copyTrade(" + portfolioName + ")",
        },
      ],
      action: "copySell(COPY_QTY)",
    };

    // Ensure the copy buy rule for the current portfolio does not exist in the buyRules.json file already

    let doesBuyRuleExistAlready = false;
    const hashOfCopyBuyRule = calculateKeccak256HashOfString(
      JSON.stringify(copyBuyRule)
    );

    for (let i = 0; i < buyRules.length; ++i) {
      const hashOfBuyRule = calculateKeccak256HashOfString(
        JSON.stringify(buyRules[i])
      );

      if (hashOfCopyBuyRule == hashOfBuyRule) {
        doesBuyRuleExistAlready = true;
        break;
      }
    }

    if (!doesBuyRuleExistAlready) {
      buyRules.push(copyBuyRule);
    }

    // Ensure the copy sell rule for the current portfolio does not exist in the sellRules.json file already

    let doesSellRuleExistAlready = false;
    const hashOfCopySellRule = calculateKeccak256HashOfString(
      JSON.stringify(copySellRule)
    );

    for (let i = 0; i < sellRules.length; ++i) {
      const hashOfSellRule = calculateKeccak256HashOfString(
        JSON.stringify(sellRules[i])
      );

      if (hashOfCopySellRule == hashOfSellRule) {
        doesSellRuleExistAlready = true;
        break;
      }
    }

    if (!doesSellRuleExistAlready) {
      sellRules.push(copySellRule);
    }

    writeJsonFile(
      path.resolve(__dirname, "../rules/buy/buyRules.json"),
      buyRules
    );
    writeJsonFile(
      path.resolve(__dirname, "../rules/sell/sellRules.json"),
      sellRules
    );

    console.log("\n");

    const server = http.createServer();
    const io2 = socketIo(server);
    server.listen(sockeIOConfig.copyTradeSetupScriptPort, () => {});

    io2.on("connection", (socket) => {
      // Listen for events from the CopyTrader Server
      socket.on(
        sockeIOConfig.events["COPY_TRADE_BUY_POSITIONS_FILLED"]["name"],
        (message) => {
          console.log("New copy trade portfolio created successfully!");
          process.exit(0);
        }
      );
    });

    const socket = io("http://localhost:" + sockeIOConfig.copyTradeServerPort);
    socket.on("connect", () => {});
    socket.emit(
      sockeIOConfig.events["COPY_TRADE_BUY_FILL_POSITIONS"]["name"],
      JSON.stringify(newPortfolioEntry)
    );

    while (true) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  } else {
    newPortfolioEntry["copyTradeStrategy"] = copyTradeStrategy;
    newPortfolioEntry["createTimeUTC"] = new Date().toUTCString();

    // Append the new entry to the JSON data
    existingPortfolioData.push(newPortfolioEntry);

    // Write the updated JSON data back to the file
    writeJsonFile(portfolioConfigPath, existingPortfolioData);
    console.log("\n");

    console.log("New copy trade portfolio created successfully!");
  }
}

// Run the setup function
setupCopyTradePortfolio().catch((error) => {
  console.error("Error setting up copy trade portfolio:", error);
});
