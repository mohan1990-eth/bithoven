const fs = require("fs");
const path = require("path");
const { ethers } = require("ethers");

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

/**
 * Validates that the provided portfolio name is valid.
 *
 * @param {string} portfolioName - The portfolioName to validate.
 * @throws {Error} If the portfolio name is invalid.
 */

function validatePortfolioNameAndReturnPortfolioObject(portfolioName) {
  const allPortfolios = readJsonFile(portfolioConfigPath);

  const portfolio = allPortfolios.filter(
    (p) => p.portfolioName.trim() === portfolioName.trim()
  );

  if (portfolio.length === 0) {
    throw new Error("Portfolio not found.");
  }

  return portfolio[0];
}

function readAllPortfolios() {
  return readJsonFile(portfolioConfigPath);
}

function findPortfolioByKeyFleetAddress(allPortfolios, address) {
  const addressCheckSummed = ethers.utils.getAddress(address.trim());
  const portfolio = allPortfolios.filter((p) =>
    p.keyFleet.includes(addressCheckSummed)
  );

  if (portfolio.length === 0) {
    return null;
  }

  return portfolio[0];
}

function isHolderAddressACopiedTraderAddress(allPortfolios, holderAddress) {
  const holderAddressCheckSummed = ethers.utils.getAddress(holderAddress);
  const portfolio = allPortfolios.filter(
    (p) => p.copiedTraderAddress == holderAddressCheckSummed
  );

  if (portfolio.length === 0) {
    return null;
  }

  return portfolio[0];
}

module.exports = {
  validatePortfolioNameAndReturnPortfolioObject:
    validatePortfolioNameAndReturnPortfolioObject,
  readAllPortfolios: readAllPortfolios,
  findPortfolioByKeyFleetAddress: findPortfolioByKeyFleetAddress,
  isHolderAddressACopiedTraderAddress: isHolderAddressACopiedTraderAddress,
};
