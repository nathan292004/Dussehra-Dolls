const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const config = getDefaultConfig(__dirname);

// Exclude server-only packages from Metro's watch + resolver
// razorpay (installed for the api-server) causes Metro watcher crashes
const EXCLUDED_PACKAGES = [
  path.resolve(__dirname, "../../node_modules/.pnpm/razorpay@2.9.6"),
];

// Filter out excluded paths from watchFolders if they somehow appear
config.watchFolders = (config.watchFolders || []).filter(
  (f) => !EXCLUDED_PACKAGES.some((ex) => f.startsWith(ex))
);

config.resolver = config.resolver || {};
// Block razorpay from being resolved in mobile bundles
const existingBlockList = config.resolver.blockList;
const razorpayBlock = /.*\/node_modules\/.pnpm\/razorpay.*/;
if (Array.isArray(existingBlockList)) {
  config.resolver.blockList = [...existingBlockList, razorpayBlock];
} else if (existingBlockList) {
  config.resolver.blockList = [existingBlockList, razorpayBlock];
} else {
  config.resolver.blockList = [razorpayBlock];
}

module.exports = config;
