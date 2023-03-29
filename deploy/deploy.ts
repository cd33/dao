import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { ethers } from "hardhat";
import {
  MIN_DELAY,
  VOTING_PERIOD,
  VOTING_DELAY,
  QUORUM_PERCENTAGE,
  ADDRESS_ZERO,
} from "../helper-hardhat-config";

const deploy: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts, network } = hre;
  const { deploy, log } = deployments;
  const { deployer } = await getNamedAccounts();
  log(`Contracts Deploying as deployer : ${deployer}…`);

  // GOVERNANCE TOKEN
  log("Deploying Governance Token...");
  const governanceToken = await deploy("GovernanceToken", {
    from: deployer,
    args: [],
    log: true,
    // waitConfirmations: 1
  });
  log(`GovernanceToken deployed to ${governanceToken.address}`);

  const governanceTokenContract = await ethers.getContractAt(
    "GovernanceToken",
    governanceToken.address
  );
  // requires users to delegate to themselves in order to activate checkpoints and have their voting power tracked
  log(`Checkpoint ${await governanceTokenContract.numCheckpoints(deployer)}`);
  log('1', await governanceTokenContract.delegates(deployer))
  const tx = await governanceTokenContract.delegate(deployer);
  await tx.wait(1);
  log('2', await governanceTokenContract.delegates(deployer))
  log(`Checkpoint ${await governanceTokenContract.numCheckpoints(deployer)}`);
  log(`Governance Token delegated to ${deployer}`);

  // TIMELOCK
  log("Deploying TimeLock...");
  const timeLock = await deploy("TimeLock", {
    from: deployer,
    args: [
      MIN_DELAY, // how long you have to wait before executing
      [], // the list of addresses that can propose
      [], // the list of addresses that can execute
      deployer,
      // ADDRESS_ZERO,
    ],
    log: true,
    // waitConfirmations: 1
  });
  log(`TimeLock deployed to ${timeLock.address}`);

  // GOVERNOR NUMBER
  log("Deploying GovernorNumber...");
  const governorNumber = await deploy("GovernorNumber", {
    from: deployer,
    args: [
      governanceToken.address,
      timeLock.address,
      VOTING_DELAY,
      VOTING_PERIOD,
      QUORUM_PERCENTAGE,
    ],
    log: true,
    // waitConfirmations: 1
  });
  log(`GovernorNumber deployed to ${governorNumber.address}`);

  // SETUP GOVERNOR NUMBER
  log("Setting up roles...");
  const timeLockContract = await ethers.getContractAt(
    "TimeLock",
    timeLock.address
  );
  const governorNumberContract = await ethers.getContractAt(
    "GovernorNumber",
    governorNumber.address
  );

  const proposerRole = await timeLockContract.PROPOSER_ROLE();
  const executorRole = await timeLockContract.EXECUTOR_ROLE();
  const adminRole = await timeLockContract.TIMELOCK_ADMIN_ROLE();

  const proposerTx = await timeLockContract.grantRole(
    proposerRole,
    governorNumberContract.address
  );
  await proposerTx.wait(1);

  const executorTx = await timeLockContract.grantRole(
    executorRole,
    ADDRESS_ZERO
  );
  await executorTx.wait(1);

  const revokeTx = await timeLockContract.revokeRole(adminRole, deployer);
  await revokeTx.wait(1);
  // log('admin ? :>> ', await timeLockContract.hasRole(adminRole, deployer));

  // NUMBER
  log("Deploying Number...");
  const number = await deploy("Number", {
    from: deployer,
    args: [],
    log: true,
    // waitConfirmations: 1
  });
  log(`Number deployed to ${number.address}`);

  const numberContract = await ethers.getContractAt("Number", number.address);
  const transferOwnershipTx = await numberContract.transferOwnership(
    timeLock.address
  );
  await transferOwnershipTx.wait(1);
  log(`Number ownership transfered to TimeLock`);
  log("DONE");
};

// const delegate = async (
//   governanceTokenAddress: string,
//   delegatedAccount: string
// ) => {
//   const governanceToken = await ethers.getContractAt(
//     "GovernanceToken",
//     governanceTokenAddress
//   );
//   const tx = await governanceToken.delegate(delegatedAccount);
//   await tx.wait(1);
//   console.log(
//     `Checkpoint ${await governanceToken.numCheckpoints(delegatedAccount)}`
//   );
// };

export default deploy;
deploy.tags = ["all", "governor", "timelock", "setup", "number"]