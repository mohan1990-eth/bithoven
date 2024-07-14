const Table = require("cli-table3");
const { greenBright, bold } = require("tiny-chalk");
const TradeUtil = require("../common/trade/tradeUtil");
const { JSONStore } = require("../store/JSONStore");

async function main() {
  const holderAddress = process.argv[2];

  // Create an instance of JSONStore
  const jsonStore = new JSONStore();
  // Get the full store for the holder address
  const fullStore = await jsonStore.getFullStore([holderAddress]);

  let gamerAddressesInHoldingFolder = Object.keys(
    fullStore["holders"][holderAddress]
  );

  let bitsBalanceTable = new Table({
    head: [
      bold(greenBright("Gamer Address")),
      bold(greenBright("Balance")),
      bold(greenBright("Data File Location")),
    ],
  });

  for (const gamerAddressInHolding of gamerAddressesInHoldingFolder) {
    const bitsBalance = await TradeUtil.getBitBalanceInStore(
      holderAddress,
      gamerAddressInHolding
    );

    if (bitsBalance > 0) {
      bitsBalanceTable.push([gamerAddressInHolding, bitsBalance, "Holding"]);
    }
  }

  console.log(bitsBalanceTable.toString());
}

main().catch(console.error);
