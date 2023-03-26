import { ethers, network } from "hardhat";
import {
  VOTING_DELAY,
  FUNCTION,
  NEW_SET_VALUE,
  PROPOSAL_DESCRIPTION,
  developmentChains,
  proposalsFile,
} from "../helper-hardhat-config";
import { moveBlocks } from "../utils/moveBlocks";
import * as fs from "fs";

export async function propose(
  functionToCall: string,
  args: any[],
  proposalDescription: string
) {
  const governor = await ethers.getContract("GovernorNumber");
  const number = await ethers.getContract("Number");

  const encodedFunctionCall = number.interface.encodeFunctionData(
    functionToCall,
    args
  );
  console.log(`Proposing ${functionToCall} on ${number.address} with ${args}`);
  console.log(`Proposal Description:\n${proposalDescription}`);
  const proposeTx = await governor.propose(
    [number.address],
    [0],
    [encodedFunctionCall],
    PROPOSAL_DESCRIPTION
  );
  const proposeReceipt = await proposeTx.wait(1);

  if (developmentChains.includes(network.name)) {
    await moveBlocks(VOTING_DELAY + 1);
  }

  const proposalId = proposeReceipt.events[0].args.proposalId;
  let proposals = JSON.parse(fs.readFileSync(proposalsFile, "utf8"));
  proposals[network.config.chainId!.toString()].push(proposalId.toString());
  fs.writeFileSync(proposalsFile, JSON.stringify(proposals));

  // console.log('encodedFunctionCall :>> ', encodedFunctionCall);
  // const decode = number.interface.decodeFunctionData(functionToCall, encodedFunctionCall)
  // console.log('decode :>> ', decode._number.toString());
}

propose(FUNCTION, [NEW_SET_VALUE], PROPOSAL_DESCRIPTION)
  .then(() => process.exit(0))
  .catch((err) => {
    console.log(err);
    process.exit(1);
  });
