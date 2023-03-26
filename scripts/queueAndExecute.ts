import { ethers, network } from "hardhat";
import {
  developmentChains,
  FUNCTION,
  MIN_DELAY,
  NEW_SET_VALUE,
  PROPOSAL_DESCRIPTION,
} from "../helper-hardhat-config";
import { moveBlocks } from "../utils/moveBlocks";
import { moveTime } from "../utils/moveTime";

export async function queueAndExecute() {
  const args = [NEW_SET_VALUE];
  const number = await ethers.getContract("Number");
  console.log(`Number value before: ${(await number.number()).toString()}`);
  const encodeFunctionCall = number.interface.encodeFunctionData(
    FUNCTION,
    args
  );
  const descriptionHash = ethers.utils.keccak256(
    ethers.utils.toUtf8Bytes(PROPOSAL_DESCRIPTION)
  );

  const governor = await ethers.getContract("GovernorNumber");
  console.log("Queueing...");
  const queueTx = await governor.queue(
    [number.address],
    [0],
    [encodeFunctionCall],
    descriptionHash
  );
  await queueTx.wait(1);

  if (developmentChains.includes(network.name)) {
    await moveTime(MIN_DELAY + 1);
    await moveBlocks(1);
  }

  console.log("Executing...");
  const executeTx = await governor.execute(
    [number.address],
    [0],
    [encodeFunctionCall],
    descriptionHash
  );
  await executeTx.wait(1);

  const numberNewValue = await number.number();
  console.log(`New Number value: ${numberNewValue.toString()}`);
}

queueAndExecute()
  .then(() => process.exit(0))
  .catch((err) => {
    console.log("err :>> ", err);
    process.exit(1);
  });
