import { expect } from "chai";
import { ethers } from "hardhat";
import {
  GovernanceToken,
  GovernorNumber,
  Number,
  TimeLock,
} from "../typechain-types";
import {
  FUNCTION,
  MIN_DELAY,
  VOTING_PERIOD,
  VOTING_DELAY,
  ADDRESS_ZERO,
} from "../helper-hardhat-config";
import { moveBlocks } from "../utils/moveBlocks";
import { moveTime } from "../utils/moveTime";

// enum ProposalState {
//   Pending,
//   Active,
//   Canceled,
//   Defeated,
//   Succeeded,
//   Queued,
//   Expired,
//   Executed
// }

describe.only("DAO with deployment", () => {
  let token: GovernanceToken;
  let timelock: TimeLock;
  let governor: GovernorNumber;
  let number: Number;
  const voteAgainst = 0;
  const voteFor = 1;
  const voteAbstain = 2;
  const NEW_SET_VALUE = 123456789;

  beforeEach(async () => {
    [this.owner, this.user1, this.user2, this.user3, this.user4, this.user5] =
      await ethers.getSigners();

    // GOVERNANCE TOKEN
    const GovernanceToken = await ethers.getContractFactory("GovernanceToken");
    token = await GovernanceToken.deploy();
    await token.deployed();

    // Le owner distribue des token aux 5 membres de la DAO
    const amount1 = ethers.utils.parseEther((2e5).toString());
    const amount2 = ethers.utils.parseEther((1e5).toString());
    await token.transfer(this.user1.address, amount1);
    await token.transfer(this.user2.address, amount1);
    await token.transfer(this.user3.address, amount2);
    await token.transfer(this.user4.address, amount2);
    await token.transfer(this.user5.address, amount2);

    // requires users to delegate to themselves in order to activate checkpoints and have their voting power tracked
    await token.delegate(this.owner.address);
    await token.connect(this.user1).delegate(this.user1.address);
    await token.connect(this.user2).delegate(this.user2.address);
    await token.connect(this.user3).delegate(this.user3.address);
    await token.connect(this.user4).delegate(this.user4.address);
    await token.connect(this.user5).delegate(this.user5.address);

    const proposers: any[] = []; // the list of addresses that can propose
    const executors: any[] = []; // the list of addresses that can execute
    const admin = this.owner.address;
    const TimeLock = await ethers.getContractFactory("TimeLock");
    timelock = await TimeLock.deploy(MIN_DELAY, proposers, executors, admin);
    await timelock.deployed();

    const GovernorNumber = await ethers.getContractFactory("GovernorNumber");
    governor = await GovernorNumber.deploy(
      token.address,
      timelock.address,
      VOTING_DELAY, // Delay since proposal is created until voting starts.
      VOTING_PERIOD, // 600 = 2 hours (1 block = 12 seconds)
      50 // Percentage of governors needed to make decisions
    );
    await governor.deployed();

    // SETUP ROLES
    const PROPOSER_ROLE = await timelock.PROPOSER_ROLE();
    const EXECUTOR_ROLE = await timelock.EXECUTOR_ROLE();
    const TIMELOCK_ADMIN_ROLE = await timelock.TIMELOCK_ADMIN_ROLE();
    // role de proposal à governor
    await timelock.grantRole(PROPOSER_ROLE, governor.address);
    // role d'executor à l'adresse zero
    await timelock.grantRole(EXECUTOR_ROLE, ADDRESS_ZERO);
    // revoquer mes droits d'admin
    await timelock.revokeRole(TIMELOCK_ADMIN_ROLE, this.owner.address);

    // NUMBER
    const Number = await ethers.getContractFactory("Number");
    number = await Number.deploy();
    await number.deployed();
    // Transfer d'ownership à TimeLock
    await number.transferOwnership(timelock.address);
  });

  it("can only be changed through governance", async () => {
    await expect(number.setNumber(55)).to.be.revertedWith(
      "Ownable: caller is not the owner"
    );
  });

  it("REVERT: Queue negative QUORUM_PERCENTAGE", async () => {
    // user1 fait une proposition
    const PROPOSAL_DESCRIPTION = "Set 123456789 in Number";
    const encodedFunctionCall = number.interface.encodeFunctionData(FUNCTION, [
      NEW_SET_VALUE,
    ]);
    const proposeTx = await governor
      .connect(this.user1)
      .propose(
        [number.address],
        [0],
        [encodedFunctionCall],
        PROPOSAL_DESCRIPTION
      );
    const proposeReceipt = await proposeTx.wait();
    const proposalId = proposeReceipt.events![0].args!.proposalId;
    let proposalState = await governor.state(proposalId);
    expect(proposalState).to.equal(0);

    // On attend le commencement de la période de votes
    await moveBlocks(VOTING_DELAY + 1);
    proposalState = await governor.state(proposalId);
    expect(proposalState).to.equal(1);

    // 2 utilisateur ayant moins de 50% de la supply votent
    await governor.connect(this.user1).castVote(proposalId, voteFor);
    await governor.connect(this.user2).castVote(proposalId, voteFor);

    // On attend la fin de la période de votes
    await moveBlocks(VOTING_PERIOD + 1);
    proposalState = await governor.state(proposalId);
    expect(proposalState).to.equal(3); // Defeated

    const descriptionHash = ethers.utils.keccak256(
      ethers.utils.toUtf8Bytes(PROPOSAL_DESCRIPTION)
    );
    await expect(
      governor.queue(
        [number.address],
        [0],
        [encodedFunctionCall],
        descriptionHash
      )
    ).to.be.revertedWith("Governor: proposal not successful");
  });

  it("REVERT: Queue positive QUORUM_PERCENTAGE but negative votes", async () => {
    // user1 fait une proposition
    const PROPOSAL_DESCRIPTION = "Set 123456789 in Number";
    const encodedFunctionCall = number.interface.encodeFunctionData(FUNCTION, [
      NEW_SET_VALUE,
    ]);
    const proposeTx = await governor
      .connect(this.user1)
      .propose(
        [number.address],
        [0],
        [encodedFunctionCall],
        PROPOSAL_DESCRIPTION
      );
    const proposeReceipt = await proposeTx.wait();
    const proposalId = proposeReceipt.events![0].args!.proposalId;
    let proposalState = await governor.state(proposalId);
    expect(proposalState).to.equal(0);

    // On attend le commencement de la période de votes
    await moveBlocks(VOTING_DELAY + 1);
    proposalState = await governor.state(proposalId);
    expect(proposalState).to.equal(1);

    // 3 utilisateurs votent, avec plus de votes négatifs
    await governor.connect(this.user3).castVote(proposalId, voteFor); // 10%
    await governor.connect(this.user4).castVote(proposalId, voteFor); // 10%
    await governor.castVote(proposalId, voteAgainst); // 30%

    // On attend la fin de la période de votes
    await moveBlocks(VOTING_PERIOD + 1);
    proposalState = await governor.state(proposalId);
    expect(proposalState).to.equal(3); // Defeated

    const descriptionHash = ethers.utils.keccak256(
      ethers.utils.toUtf8Bytes(PROPOSAL_DESCRIPTION)
    );
    await expect(
      governor.queue(
        [number.address],
        [0],
        [encodedFunctionCall],
        descriptionHash
      )
    ).to.be.revertedWith("Governor: proposal not successful");
  });

  it("REVERT: Queue positive QUORUM_PERCENTAGE but equality", async () => {
    // user1 fait une proposition
    const PROPOSAL_DESCRIPTION = "Set 123456789 in Number";
    const encodedFunctionCall = number.interface.encodeFunctionData(FUNCTION, [
      NEW_SET_VALUE,
    ]);
    const proposeTx = await governor
      .connect(this.user1)
      .propose(
        [number.address],
        [0],
        [encodedFunctionCall],
        PROPOSAL_DESCRIPTION
      );
    const proposeReceipt = await proposeTx.wait();
    const proposalId = proposeReceipt.events![0].args!.proposalId;
    let proposalState = await governor.state(proposalId);
    expect(proposalState).to.equal(0);

    // On attend le commencement de la période de votes
    await moveBlocks(VOTING_DELAY + 1);
    proposalState = await governor.state(proposalId);
    expect(proposalState).to.equal(1);

    // 5 utilisateurs votent, avec plus de votes positifs
    await governor.connect(this.user1).castVote(proposalId, voteFor); // 20%
    await governor.connect(this.user2).castVote(proposalId, voteFor); // 20%
    await governor.connect(this.user3).castVote(proposalId, voteAbstain); // 10%
    await governor.connect(this.user4).castVote(proposalId, voteAbstain); // 10%
    await governor.connect(this.user5).castVote(proposalId, voteAgainst); // 10%
    await governor.castVote(proposalId, voteAgainst); // 30%

    // On attend la fin de la période de votes
    await moveBlocks(VOTING_PERIOD + 1);
    proposalState = await governor.state(proposalId);
    expect(proposalState).to.equal(3); // Defeated

    const descriptionHash = ethers.utils.keccak256(
      ethers.utils.toUtf8Bytes(PROPOSAL_DESCRIPTION)
    );
    await expect(
      governor.queue(
        [number.address],
        [0],
        [encodedFunctionCall],
        descriptionHash
      )
    ).to.be.revertedWith("Governor: proposal not successful");
  });

  it("REVERT: Queue positive QUORUM_PERCENTAGE but positive votes", async () => {
    // user1 fait une proposition
    const PROPOSAL_DESCRIPTION = "Set 123456789 in Number";
    const encodedFunctionCall = number.interface.encodeFunctionData(FUNCTION, [
      NEW_SET_VALUE,
    ]);
    const proposeTx = await governor
      .connect(this.user1)
      .propose(
        [number.address],
        [0],
        [encodedFunctionCall],
        PROPOSAL_DESCRIPTION
      );
    const proposeReceipt = await proposeTx.wait();
    const proposalId = proposeReceipt.events![0].args!.proposalId;
    let proposalState = await governor.state(proposalId);
    expect(proposalState).to.equal(0);

    // On attend le commencement de la période de votes
    await moveBlocks(VOTING_DELAY + 1);
    proposalState = await governor.state(proposalId);
    expect(proposalState).to.equal(1);

    // 5 utilisateurs votent, avec plus de votes positifs
    await governor.connect(this.user1).castVote(proposalId, voteFor); // 20%
    await governor.connect(this.user2).castVote(proposalId, voteFor); // 20%
    await governor.connect(this.user3).castVote(proposalId, voteFor); // 10%
    await governor.connect(this.user4).castVote(proposalId, voteAbstain); // 10%
    await governor.connect(this.user5).castVote(proposalId, voteAbstain); // 10%
    await governor.castVote(proposalId, voteAgainst); // 30%

    // On attend la fin de la période de votes
    await moveBlocks(VOTING_PERIOD + 1);
    proposalState = await governor.state(proposalId);
    expect(proposalState).to.equal(4); // Succeeded

    const descriptionHash = ethers.utils.keccak256(
      ethers.utils.toUtf8Bytes(PROPOSAL_DESCRIPTION)
    );
    await expect(
      governor.queue(
        [number.address],
        [0],
        [encodedFunctionCall],
        descriptionHash
      )
    ).to.be.not.reverted;
  });

  it("Scénario: 5 détenteurs du token et plusieurs votes", async () => {
    // user1 fait une proposition
    const PROPOSAL_DESCRIPTION = "Set 123456789 in Number";
    const encodedFunctionCall = number.interface.encodeFunctionData(FUNCTION, [
      NEW_SET_VALUE,
    ]);
    const proposeTx = await governor
      .connect(this.user1)
      .propose(
        [number.address],
        [0],
        [encodedFunctionCall],
        PROPOSAL_DESCRIPTION
      );
    const proposeReceipt = await proposeTx.wait();
    const proposalId = proposeReceipt.events![0].args!.proposalId;
    let proposalState = await governor.state(proposalId);
    expect(proposalState).to.equal(0);
    console.log(`Current Proposal State: ${proposalState}`);

    const proposalSnapshot = await governor.proposalSnapshot(proposalId);
    const proposalDeadline = await governor.proposalDeadline(proposalId);
    expect(proposalDeadline.sub(proposalSnapshot)).to.equal(VOTING_PERIOD);

    // Voter avant la VOTING_PERIOD
    await expect(governor.castVote(proposalId, voteAgainst)).to.be.revertedWith(
      "Governor: vote not currently active"
    );

    // On attend le commencement de la période de votes
    await moveBlocks(VOTING_DELAY + 1);
    proposalState = await governor.state(proposalId);
    expect(proposalState).to.equal(1);
    console.log(`Current Proposal State: ${proposalState}`);

    // 5 utilisateurs votent
    await governor
      .connect(this.user1)
      .castVoteWithReason(proposalId, voteFor, "love it");
    await governor
      .connect(this.user2)
      .castVoteWithReason(proposalId, voteFor, "so good");
    await governor
      .connect(this.user3)
      .castVoteWithReason(proposalId, voteFor, "for");
    await governor
      .connect(this.user4)
      .castVoteWithReason(proposalId, voteAbstain, "don't know");
    await governor
      .connect(this.user5)
      .castVoteWithReason(proposalId, voteAgainst, "noooooo");

    // On attend la fin de la période de votes
    await moveBlocks(VOTING_PERIOD + 1);
    proposalState = await governor.state(proposalId);
    expect(proposalState).to.equal(4);
    console.log(`Current Proposal State: ${proposalState}`);

    // Voter après la VOTING_PERIOD
    await expect(governor.castVote(proposalId, voteAgainst)).to.be.revertedWith(
      "Governor: vote not currently active"
    );

    // queues: This allows users to exit the system if they disagree with a decision before it is executed
    const descriptionHash = ethers.utils.keccak256(
      ethers.utils.toUtf8Bytes(PROPOSAL_DESCRIPTION)
    );
    await governor
      .connect(this.user2) // n'importe qui peut appeler la fonction
      .queue([number.address], [0], [encodedFunctionCall], descriptionHash);

    // executer avant le MIN_DELAY
    await expect(
      governor.execute(
        [number.address],
        [0],
        [encodedFunctionCall],
        descriptionHash
      )
    ).to.be.revertedWith("TimelockController: operation is not ready");

    // On attend la fin de la période de queue
    await moveTime(MIN_DELAY + 1);
    await moveBlocks(1);

    proposalState = await governor.state(proposalId);
    expect(proposalState).to.equal(5); // Queued
    console.log(`Current Proposal State: ${proposalState}`);

    // executes
    await governor
      .connect(this.user5) // n'importe qui peut appeler la fonction
      .execute([number.address], [0], [encodedFunctionCall], descriptionHash);

    expect(proposalState).to.equal(5); // Queued
    const numberValue = await number.number();
    expect(numberValue).to.equal(NEW_SET_VALUE); // Queued
    console.log("numberValue : ", numberValue.toString());
  });

  // Reste à bien comprendre la phase Queue, des interactions possibles, cancel de la proposal ? et autres...
});
