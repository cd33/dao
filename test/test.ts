import { GovernorNumber, GovernanceToken, TimeLock, Number } from "../typechain-types"
import { deployments, ethers } from "hardhat"
import { assert, expect } from "chai"
import {
  FUNCTION,
  PROPOSAL_DESCRIPTION,
  NEW_SET_VALUE,
  VOTING_DELAY,
  VOTING_PERIOD,
  MIN_DELAY,
} from "../helper-hardhat-config"
import { moveBlocks } from "../utils/moveBlocks"
import { moveTime } from "../utils/moveTime"

describe("Governor Flow", async () => {
  let governor: GovernorNumber
  let governanceToken: GovernanceToken
  let timeLock: TimeLock
  let number: Number
  const voteWay = 1 // for
  const reason = "I lika do da cha cha"
  beforeEach(async () => {
    await deployments.fixture(["all"])
    governor = await ethers.getContract("GovernorNumber")
    timeLock = await ethers.getContract("TimeLock")
    governanceToken = await ethers.getContract("GovernanceToken")
    number = await ethers.getContract("Number")
  })

  it("can only be changed through governance", async () => {
    await expect(number.setNumber(55)).to.be.revertedWith("Ownable: caller is not the owner")
  })

  it("proposes, votes, waits, queues, and then executes", async () => {
    // propose
    const encodedFunctionCall = number.interface.encodeFunctionData(FUNCTION, [NEW_SET_VALUE])
    const proposeTx = await governor.propose(
      [number.address],
      [0],
      [encodedFunctionCall],
      PROPOSAL_DESCRIPTION
    )

    const proposeReceipt = await proposeTx.wait(1)
    const proposalId = proposeReceipt.events![0].args!.proposalId
    let proposalState = await governor.state(proposalId)
    console.log(`Current Proposal State: ${proposalState}`)

    await moveBlocks(VOTING_DELAY + 1)
    // vote
    const voteTx = await governor.castVoteWithReason(proposalId, voteWay, reason)
    await voteTx.wait(1)
    proposalState = await governor.state(proposalId)
    assert.equal(proposalState.toString(), "1")
    console.log(`Current Proposal State: ${proposalState}`)
    await moveBlocks(VOTING_PERIOD + 1)

    // queue & execute
    // const descriptionHash = ethers.utils.keccak256(ethers.utils.toUtf8Bytes(PROPOSAL_DESCRIPTION))
    const descriptionHash = ethers.utils.id(PROPOSAL_DESCRIPTION)
    const queueTx = await governor.queue([number.address], [0], [encodedFunctionCall], descriptionHash)
    await queueTx.wait(1)
    await moveTime(MIN_DELAY + 1)
    await moveBlocks(1)

    proposalState = await governor.state(proposalId)
    console.log(`Current Proposal State: ${proposalState}`)

    console.log("Executing...")
    console.log
    const exTx = await governor.execute([number.address], [0], [encodedFunctionCall], descriptionHash)
    await exTx.wait(1)
    console.log((await number.number()).toString())
  })
})