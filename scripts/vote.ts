import * as fs from "fs";
import { ethers, network } from "hardhat";
import {
  developmentChains,
  proposalsFile,
  VOTING_PERIOD,
} from "../helper-hardhat-config";
import { moveBlocks } from "../utils/moveBlocks";

const index = 0;

async function main(proposalIndex: number) {
  const proposals = JSON.parse(fs.readFileSync(proposalsFile, "utf8"));
  const proposalId = proposals[network.config.chainId!][proposalIndex];
  // 0 = Against, 1 = For, 2 = Abstain
  const governor = await ethers.getContract("GovernorNumber");
  const voteWay = 1;
  const reason = "It's a good number !";
  const voteTxResponse = await governor.castVoteWithReason(
    proposalId,
    voteWay,
    reason
  );
  await voteTxResponse.wait(1);

  if (developmentChains.includes(network.name)) {
    await moveBlocks(VOTING_PERIOD + 1);
  }
  console.log("Voted !");
}

main(index)
  .then(() => process.exit(0))
  .catch((err) => {
    console.log("err :>> ", err);
    process.exit(1);
  });
