const { ethers } = require("ethers");
const welsAddress = require("../../config/chainConfig").ERC20BuyerToken;
const welsAbi = require("../../abi/WELSABI.json");
/**
 * Converts bits price from wei to ether.
 * @param {Object} provider - An instance of ethers provider to interact with the Ethereum network.
 * @param {string} contractAddress - The address of the Ethereum contract.
 * @param {(number|ethers.BigNumber)} bitsPriceWei - The bits price in wei units.
 * @returns {Promise<Number>} Bits price in ether units.
 * @throws Will throw an error if the decimals cannot be fetched from the contract.
 */
async function convertBitsPriceWeiToEther(provider, bitsPriceWei) {
  try {
    const contract = new ethers.Contract(welsAddress, welsAbi, provider);
    // Get the decimals for the token
    const decimals = await contract.decimals();

    // Convert the balance from wei to ether (or token base units to user-friendly format)
    const bitsPriceInEther = Number(
      ethers.utils.formatUnits(bitsPriceWei, decimals)
    );
    return bitsPriceInEther;
  } catch (error) {
    console.error(
      `Failed to fetch decimals from bits contract: ${error.message}`
    );
    throw error;
  }
}

/**
 * Converts bits price from ether to wei.
 * @param {Object} provider - An instance of ethers provider to interact with the Ethereum network.
 * @param {string} contractAddress - The address of the Ethereum contract.
 * @param {(number|ethers.BigNumber)} bitsPriceEther - The bits price in ether units.
 * @returns {Promise<ethers.BigNumber>} Bits price in wei units.
 * @throws Will throw an error if the decimals cannot be fetched from the contract.
 */
async function convertBitsPriceEtherToWei(provider, bitsPriceEther) {
  try {
    const contract = new ethers.Contract(welsAddress, welsAbi, provider);
    // Get the decimals for the token
    const decimals = await contract.decimals();

    // Convert the balance from ether to wei
    const bitsPriceInWei = ethers.utils.parseUnits(
      bitsPriceEther.toString(),
      decimals
    );
    return bitsPriceInWei;
  } catch (error) {
    console.error(
      `Failed to fetch decimals from bits contract: ${error.message}`
    );
    throw error;
  }
}

module.exports = { convertBitsPriceWeiToEther, convertBitsPriceEtherToWei };
