const { ethers } = require("ethers");
// WELS contract address and ABI on Base
const welsAddress = require("../../config/chainConfig").ERC20BuyerToken;
const welsAbi = require("../../abi/WELSABI.json");
/**
 * Checks the WELS token balance of a specified wallet address.
 * Retrieves the balance of WELS tokens in the specified address, converts it from wei to a human-readable format,
 * and logs the balance to the console.
 *
 * @param {string} walletAddress - The address of the wallet to check the balance for.
 * @param {Object} provider - The ethers provider instance.
 * @returns {Promise<string>} - The formatted balance in WELS tokens.
 * @throws {Error} - If fetching the balance fails.
 */
async function checkWelsBalance(walletAddress, provider) {
  try {
    // Create a contract instance
    const welsContract = new ethers.Contract(welsAddress, welsAbi, provider);
    // Get the balance of WELS in the wallet
    const balance = await welsContract.balanceOf(walletAddress);

    // Convert balance from wei to human-readable format
    const formattedBalance = ethers.utils.formatUnits(balance, 18); // Assuming WELS uses 18 decimals
    console.log(`WELS Balance: ${formattedBalance}`);

    return formattedBalance;
  } catch (error) {
    console.error(`Failed to fetch WELS balance: ${error.message}`);
  }
}

module.exports = { checkWelsBalance };
