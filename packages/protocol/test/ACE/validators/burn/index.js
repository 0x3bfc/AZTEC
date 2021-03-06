/* global artifacts, expect, contract, beforeEach, it:true */
// ### External Dependencies
const BN = require('bn.js');
const crypto = require('crypto');
const sinon = require('sinon');
const truffleAssert = require('truffle-assertions');
const { keccak256, padLeft } = require('web3-utils');

// ### Internal Dependencies
const { abiEncoder, bn128, keccak, note, proof } = require('aztec.js');
const { constants } = require('@aztec/dev-utils');
const secp256k1 = require('@aztec/secp256k1');

const { burn, joinSplit, proofUtils } = proof;
const { encoderFactory, inputCoder, outputCoder } = abiEncoder;
const Keccak = keccak;

// ### Artifacts
const AdjustSupply = artifacts.require('./AdjustSupply');
const AdjustSupplyInterface = artifacts.require('./AdjustSupplyInterface');

AdjustSupply.abi = AdjustSupplyInterface.abi;

contract('AdjustSupply Tests for Burn Proofs', (accounts) => {
    let adjustSupplyContract;
    describe('Success States', () => {
        beforeEach(async () => {
            adjustSupplyContract = await AdjustSupply.new({
                from: accounts[0],
            });
        });

        it('should validate encoding of a burn zero-knowledge proof', async () => {
            const noteValues = [50, 30, 10, 10];
            const numNotes = noteValues.length;
            const aztecAccounts = [...new Array(numNotes)].map(() => secp256k1.generateAccount());
            const notes = await Promise.all(
                aztecAccounts.map(({ publicKey }, i) => {
                    return note.create(publicKey, noteValues[i]);
                }),
            );

            const newTotalBurned = notes[0];
            const oldTotalBurned = notes[1];
            const adjustedNotes = notes.slice(2, 4);
            const publicOwner = constants.addresses.ZERO_ADDRESS;
            const publicValue = 0;

            const { proofData, expectedOutput } = burn.encodeBurnTransaction({
                newTotalBurned,
                oldTotalBurned,
                adjustedNotes,
                senderAddress: accounts[0],
            });

            const result = await adjustSupplyContract.validateAdjustSupply(proofData, accounts[0], constants.CRS, {
                from: accounts[0],
                gas: 4000000,
            });

            const decoded = outputCoder.decodeProofOutputs(`0x${padLeft('0', 64)}${result.slice(2)}`);

            // First proofOutput object (1 input note, 1 output note)
            expect(decoded[0].outputNotes[0].gamma.eq(newTotalBurned.gamma)).to.equal(true);
            expect(decoded[0].outputNotes[0].sigma.eq(newTotalBurned.sigma)).to.equal(true);
            expect(decoded[0].outputNotes[0].noteHash).to.equal(newTotalBurned.noteHash);
            expect(decoded[0].outputNotes[0].owner).to.equal(newTotalBurned.owner.toLowerCase());

            expect(decoded[0].inputNotes[0].gamma.eq(oldTotalBurned.gamma)).to.equal(true);
            expect(decoded[0].inputNotes[0].sigma.eq(oldTotalBurned.sigma)).to.equal(true);
            expect(decoded[0].inputNotes[0].noteHash).to.equal(oldTotalBurned.noteHash);
            expect(decoded[0].inputNotes[0].owner).to.equal(oldTotalBurned.owner.toLowerCase());

            expect(decoded[0].publicOwner).to.equal(publicOwner.toLowerCase());
            expect(decoded[0].publicValue).to.equal(publicValue);

            // Second proofOutput object (there are 2 notes being burned)
            expect(decoded[1].outputNotes[0].gamma.eq(adjustedNotes[0].gamma)).to.equal(true);
            expect(decoded[1].outputNotes[0].sigma.eq(adjustedNotes[0].sigma)).to.equal(true);
            expect(decoded[1].outputNotes[0].noteHash).to.equal(adjustedNotes[0].noteHash);
            expect(decoded[1].outputNotes[0].owner).to.equal(adjustedNotes[0].owner.toLowerCase());

            expect(decoded[1].outputNotes[1].gamma.eq(adjustedNotes[1].gamma)).to.equal(true);
            expect(decoded[1].outputNotes[1].sigma.eq(adjustedNotes[1].sigma)).to.equal(true);
            expect(decoded[1].outputNotes[1].noteHash).to.equal(adjustedNotes[1].noteHash);
            expect(decoded[1].outputNotes[1].owner).to.equal(adjustedNotes[1].owner.toLowerCase());

            expect(decoded[1].publicOwner).to.equal(publicOwner.toLowerCase());
            expect(decoded[1].publicValue).to.equal(publicValue);
            expect(result).to.equal(expectedOutput);
        });

        it('should accept large numbers of input/output notes', async () => {
            const noteValues = [80, 30, 10, 10, 10, 10, 10];
            const numNotes = noteValues.length;
            const aztecAccounts = [...new Array(numNotes)].map(() => secp256k1.generateAccount());
            const notes = await Promise.all(
                aztecAccounts.map(({ publicKey }, i) => {
                    return note.create(publicKey, noteValues[i]);
                }),
            );

            const newTotalBurned = notes[0];
            const oldTotalBurned = notes[1];
            const adjustedNotes = notes.slice(2, 7);

            const senderAddress = accounts[0];

            const { proofData, expectedOutput } = burn.encodeBurnTransaction({
                newTotalBurned,
                oldTotalBurned,
                adjustedNotes,
                senderAddress: accounts[0],
            });

            const opts = {
                from: senderAddress,
                gas: 4000000,
            };

            const result = await adjustSupplyContract.validateAdjustSupply(proofData, senderAddress, constants.CRS, opts);
            expect(result).to.equal(expectedOutput);
        });

        it('should accept burned notes of zero value', async () => {
            const noteValues = [50, 30, 0, 20];
            const numNotes = noteValues.length;
            const aztecAccounts = [...new Array(numNotes)].map(() => secp256k1.generateAccount());
            const notes = await Promise.all(
                aztecAccounts.map(({ publicKey }, i) => {
                    return note.create(publicKey, noteValues[i]);
                }),
            );

            const newTotalBurned = notes[0];
            const oldTotalBurned = notes[1];
            const adjustedNotes = notes.slice(2, 4);

            const senderAddress = accounts[0];

            const { proofData, expectedOutput } = burn.encodeBurnTransaction({
                newTotalBurned,
                oldTotalBurned,
                adjustedNotes,
                senderAddress: accounts[0],
            });

            const opts = {
                from: senderAddress,
                gas: 4000000,
            };
            const result = await adjustSupplyContract.validateAdjustSupply(proofData, senderAddress, constants.CRS, opts);

            expect(result).to.equal(expectedOutput);
        });

        it('should accept the minimum number of notes (2)', async () => {
            const noteValues = [50, 50];
            const numNotes = noteValues.length;
            const aztecAccounts = [...new Array(numNotes)].map(() => secp256k1.generateAccount());
            const notes = await Promise.all(
                aztecAccounts.map(({ publicKey }, i) => {
                    return note.create(publicKey, noteValues[i]);
                }),
            );

            const newTotalBurned = notes[0];
            const oldTotalBurned = notes[1];
            const adjustedNotes = [];

            const senderAddress = accounts[0];

            const { proofData, expectedOutput } = burn.encodeBurnTransaction({
                newTotalBurned,
                oldTotalBurned,
                adjustedNotes,
                senderAddress: accounts[0],
            });

            const opts = {
                from: senderAddress,
                gas: 4000000,
            };
            const result = await adjustSupplyContract.validateAdjustSupply(proofData, senderAddress, constants.CRS, opts);

            expect(result).to.equal(expectedOutput);
        });

        it('should validate that challenge has GROUP_MODULUS added to it', async () => {
            const noteValues = [50, 30, 10, 10];
            const numNotes = noteValues.length;
            const aztecAccounts = [...new Array(numNotes)].map(() => secp256k1.generateAccount());
            const notes = await Promise.all(
                aztecAccounts.map(({ publicKey }, i) => {
                    return note.create(publicKey, noteValues[i]);
                }),
            );

            const newTotalBurned = notes[0];
            const oldTotalBurned = notes[1];
            const adjustedNotes = notes.slice(2, 4);
            const senderAddress = accounts[0];

            const inputNotes = [newTotalBurned];
            const outputNotes = [oldTotalBurned, ...adjustedNotes];

            const { proofData: proofDataRaw, challenge } = burn.constructProof(
                [newTotalBurned, oldTotalBurned, ...adjustedNotes],
                senderAddress,
            );

            const challengeBN = new BN(challenge.slice(2), 16);
            const notModRChallenge = `0x${challengeBN.add(constants.GROUP_MODULUS).toString(16)}`;

            const inputOwners = inputNotes.map((m) => m.owner);
            const outputOwners = outputNotes.map((n) => n.owner);
            const publicOwner = constants.addresses.ZERO_ADDRESS;
            const publicValue = 0;

            const proofData = inputCoder.burn(proofDataRaw, notModRChallenge, inputOwners, outputOwners, outputNotes);

            const expectedOutput = `0x${outputCoder
                .encodeProofOutputs([
                    {
                        inputNotes: [
                            {
                                ...outputNotes[0],
                                forceMetadata: true,
                            },
                        ],
                        outputNotes: [
                            {
                                ...inputNotes[0],
                                forceNoMetadata: true,
                            },
                        ],
                        publicOwner,
                        publicValue,
                        challenge: notModRChallenge,
                    },
                    {
                        inputNotes: [],
                        outputNotes: outputNotes.slice(1),
                        publicOwner,
                        publicValue,
                        challenge: `0x${padLeft(keccak256(notModRChallenge).slice(2), 64)}`,
                    },
                ])
                .slice(0x42)}`;

            const opts = {
                from: senderAddress,
                gas: 4000000,
            };
            const result = await adjustSupplyContract.validateAdjustSupply(proofData, senderAddress, constants.CRS, opts);

            expect(result).to.equal(expectedOutput);
        });
    });

    describe('Failure States', () => {
        beforeEach(async () => {
            adjustSupplyContract = await AdjustSupply.new({
                from: accounts[0],
            });
        });

        it('should fail for unbalanced input/output notes', async () => {
            const noteValues = [50, 30, 40, 10];
            const numNotes = noteValues.length;
            const aztecAccounts = [...new Array(numNotes)].map(() => secp256k1.generateAccount());
            const notes = await Promise.all(
                aztecAccounts.map(({ publicKey }, i) => {
                    return note.create(publicKey, noteValues[i]);
                }),
            );

            const newTotalBurned = notes[0];
            const oldTotalBurned = notes[1];
            const adjustedNotes = notes.slice(2, 4);
            const senderAddress = accounts[0];

            const { proofData } = burn.encodeBurnTransaction({
                newTotalBurned,
                oldTotalBurned,
                adjustedNotes,
                senderAddress: accounts[0],
            });

            const opts = {
                from: accounts[0],
                gas: 4000000,
            };
            await truffleAssert.reverts(adjustSupplyContract.validateAdjustSupply(proofData, senderAddress, constants.CRS, opts));
        });

        it('should fail for fake challenge and fake proof data', async () => {
            const noteValues = [50, 30, 10, 10];
            const numNotes = noteValues.length;
            const aztecAccounts = [...new Array(numNotes)].map(() => secp256k1.generateAccount());
            const notes = await Promise.all(
                aztecAccounts.map(({ publicKey }, i) => {
                    return note.create(publicKey, noteValues[i]);
                }),
            );

            const newTotalBurned = notes[0];
            const oldTotalBurned = notes[1];
            const adjustedNotes = notes.slice(2, 4);
            const senderAddress = accounts[0];

            const { proofData } = burn.encodeBurnTransaction({
                newTotalBurned,
                oldTotalBurned,
                adjustedNotes,
                senderAddress: accounts[0],
            });

            const fakeChallenge = padLeft(crypto.randomBytes(32).toString('hex'), 64);
            const fakeProofData = `0x${proofData.slice(0x02, 0x42)}${fakeChallenge}${proofData.slice(0x82)}`;

            const opts = {
                from: accounts[0],
                gas: 4000000,
            };
            await truffleAssert.reverts(
                adjustSupplyContract.validateAdjustSupply(fakeProofData, senderAddress, constants.CRS, opts),
            );
        });

        it('should fail if zero notes provided', async () => {
            const aztecAccounts = [...new Array(4)].map(() => secp256k1.generateAccount());
            const senderAddress = aztecAccounts[0].address;

            const parseInputs = sinon.stub(proofUtils, 'parseInputs').callsFake(() => {});

            const { proofData: proofDataRaw, challenge } = burn.constructProof([], senderAddress);

            const outputNotes = [];

            const inputOwners = [];
            const outputOwners = [];

            const proofData = inputCoder.burn(proofDataRaw, challenge, inputOwners, outputOwners, outputNotes);

            await truffleAssert.reverts(
                adjustSupplyContract.validateAdjustSupply(proofData, accounts[0], constants.CRS, {
                    from: accounts[0],
                    gas: 4000000,
                }),
            );

            parseInputs.restore();
        });

        it('should fail if points NOT on curve', async () => {
            const zeroes = `${padLeft('0', 64)}`;
            const noteString = `${zeroes}${zeroes}${zeroes}${zeroes}${zeroes}${zeroes}`;
            const challengeString = `0x${padLeft(accounts[0].slice(2), 64)}${padLeft('132', 64)}${padLeft('1', 64)}${noteString}`;
            const challenge = keccak256(challengeString, 'hex');
            const proofDataRaw = [[`0x${padLeft('132', 64)}`, '0x0', '0x0', '0x0', '0x0', '0x0']];
            const senderAddress = accounts[0];

            const outputOwners = [];
            const inputOwners = [];

            const proofData = inputCoder.burn(proofDataRaw, challenge, inputOwners, outputOwners, []);

            const opts = {
                from: senderAddress,
                gas: 4000000,
            };
            await truffleAssert.reverts(adjustSupplyContract.validateAdjustSupply(proofData, senderAddress, constants.CRS, opts));
        });

        it('should fail if scalars are NOT mod GROUP_MODULUS', async () => {
            const noteValues = [50, 30, 10, 10];
            const numNotes = noteValues.length;
            const aztecAccounts = [...new Array(numNotes)].map(() => secp256k1.generateAccount());
            const notes = await Promise.all(
                aztecAccounts.map(({ publicKey }, i) => {
                    return note.create(publicKey, noteValues[i]);
                }),
            );

            const newTotalBurned = notes[0];
            const oldTotalBurned = notes[1];
            const adjustedNotes = notes.slice(2, 4);
            const senderAddress = accounts[0];

            const inputNotes = [newTotalBurned];
            const outputNotes = [oldTotalBurned, ...adjustedNotes];

            const proofConstruct = burn.constructProof([newTotalBurned, oldTotalBurned, ...adjustedNotes], senderAddress);

            const kBarBN = new BN(proofConstruct.proofData[0][0].slice(2), 16);
            const notModRKBar = `0x${kBarBN.add(constants.GROUP_MODULUS).toString(16)}`;

            proofConstruct.proofData[0][0] = notModRKBar;

            const inputOwners = inputNotes.map((m) => m.owner);
            const outputOwners = outputNotes.map((n) => n.owner);

            const proofData = inputCoder.burn(
                proofConstruct.proofData,
                proofConstruct.challenge,
                inputOwners,
                outputOwners,
                outputNotes,
            );
            const opts = {
                from: senderAddress,
                gas: 4000000,
            };
            await truffleAssert.reverts(adjustSupplyContract.validateAdjustSupply(proofData, senderAddress, constants.CRS, opts));
        });

        it('should fail if scalars are zero', async () => {
            const noteValues = [50, 30, 10, 10];
            const numNotes = noteValues.length;
            const aztecAccounts = [...new Array(numNotes)].map(() => secp256k1.generateAccount());
            const notes = await Promise.all(
                aztecAccounts.map(({ publicKey }, i) => {
                    return note.create(publicKey, noteValues[i]);
                }),
            );

            const newTotalBurned = notes[0];
            const oldTotalBurned = notes[1];
            const adjustedNotes = notes.slice(2, 4);
            const senderAddress = accounts[0];

            const inputNotes = [newTotalBurned];
            const outputNotes = [oldTotalBurned, ...adjustedNotes];

            const { proofData: proofDataRaw, challenge } = burn.constructProof(
                [newTotalBurned, oldTotalBurned, ...adjustedNotes],
                senderAddress,
            );

            const scalarZeroProofData = proofDataRaw.map((proofElement) => {
                return [padLeft(0, 64), padLeft(0, 64), proofElement[2], proofElement[3], proofElement[4], proofElement[5]];
            });

            const zeroScalar = padLeft(0, 64);
            expect(scalarZeroProofData[0][0]).to.equal(zeroScalar);
            expect(scalarZeroProofData[0][1]).to.equal(zeroScalar);
            expect(scalarZeroProofData[1][0]).to.equal(zeroScalar);
            expect(scalarZeroProofData[1][1]).to.equal(zeroScalar);
            expect(scalarZeroProofData[2][0]).to.equal(zeroScalar);
            expect(scalarZeroProofData[2][1]).to.equal(zeroScalar);
            expect(scalarZeroProofData[3][0]).to.equal(zeroScalar);
            expect(scalarZeroProofData[3][1]).to.equal(zeroScalar);

            const inputOwners = inputNotes.map((m) => m.owner);
            const outputOwners = outputNotes.map((n) => n.owner);

            const proofData = inputCoder.burn(scalarZeroProofData, challenge, inputOwners, outputOwners, outputNotes);

            const opts = {
                from: senderAddress,
                gas: 4000000,
            };
            await truffleAssert.reverts(adjustSupplyContract.validateAdjustSupply(proofData, senderAddress, constants.CRS, opts));
        });

        it('should fail if proof data NOT correctly encoded', async () => {
            const noteValues = [50, 30, 10, 10];
            const numNotes = noteValues.length;
            const aztecAccounts = [...new Array(numNotes)].map(() => secp256k1.generateAccount());
            const notes = await Promise.all(
                aztecAccounts.map(({ publicKey }, i) => {
                    return note.create(publicKey, noteValues[i]);
                }),
            );

            const newTotalBurned = notes[0];
            const oldTotalBurned = notes[1];
            const adjustedNotes = notes.slice(2, 4);
            const senderAddress = accounts[0];

            const inputNotes = [newTotalBurned];
            const outputNotes = [oldTotalBurned, ...adjustedNotes];

            const { proofData: proofDataRaw, challenge } = burn.constructProof(
                [newTotalBurned, oldTotalBurned, ...adjustedNotes],
                senderAddress,
            );

            const inputOwners = inputNotes.map((m) => m.owner);
            const outputOwners = outputNotes.map((n) => n.owner);
            const { length } = proofDataRaw;
            const noteString = proofDataRaw.map((individualNotes) => encoderFactory.encodeNote(individualNotes));

            // Incorrect encoding of proof data happens here: first two characters incorrectly sliced off
            // noteString, and padLeft() increases from 64 to 66 to still recognise it as a valid bytes
            // object. However. this is incorrect ABI encoding so will throw
            const data = [padLeft(Number(length).toString(16), 66), ...noteString.slice(2)].join('');
            const actualLength = Number(data.length / 2);
            const metadata = outputNotes;

            const configs = {
                CHALLENGE: challenge.slice(2),
                PROOF_DATA: { data, length: actualLength },
                INPUT_OWNERS: encoderFactory.encodeInputOwners(inputOwners),
                OUTPUT_OWNERS: encoderFactory.encodeOutputOwners(outputOwners),
                METADATA: encoderFactory.encodeMetadata(metadata),
            };

            const abiParams = ['PROOF_DATA', 'INPUT_OWNERS', 'OUTPUT_OWNERS', 'METADATA'];

            const incorrectEncoding = encoderFactory.encode(configs, abiParams, 'burn');

            const opts = {
                from: senderAddress,
                gas: 4000000,
            };
            await truffleAssert.reverts(
                adjustSupplyContract.validateAdjustSupply(incorrectEncoding, senderAddress, constants.CRS, opts),
            );
        });

        it('should fail for incorrect H_X, H_Y in CRS', async () => {
            const noteValues = [50, 30, 10, 10];
            const numNotes = noteValues.length;
            const aztecAccounts = [...new Array(numNotes)].map(() => secp256k1.generateAccount());
            const notes = await Promise.all(
                aztecAccounts.map(({ publicKey }, i) => {
                    return note.create(publicKey, noteValues[i]);
                }),
            );

            const newTotalBurned = notes[0];
            const oldTotalBurned = notes[1];
            const adjustedNotes = notes.slice(2, 4);
            const senderAddress = accounts[0];

            const { proofData } = burn.encodeBurnTransaction({
                newTotalBurned,
                oldTotalBurned,
                adjustedNotes,
                senderAddress,
            });

            const H_X = new BN('7673901602397024137095011250362199966051872585513276903826533215767972925880', 10);
            const H_Y = new BN('8489654445897228341090914135473290831551238522473825886865492707826370766375', 10);
            const t2 = [
                `0x${padLeft('1cf7cc93bfbf7b2c5f04a3bc9cb8b72bbcf2defcabdceb09860c493bdf1588d', 64)}`,
                `0x${padLeft('8d554bf59102bbb961ba81107ec71785ef9ce6638e5332b6c1a58b87447d181', 64)}`,
                `0x${padLeft('204e5d81d86c561f9344ad5f122a625f259996b065b80cbbe74a9ad97b6d7cc2', 64)}`,
                `0x${padLeft('2cb2a424885c9e412b94c40905b359e3043275cd29f5b557f008cd0a3e0c0dc', 64)}`,
            ];

            const fakeHx = H_X.add(new BN(1, 10));
            const fakeHy = H_Y.add(new BN(1, 10));

            const fakeCRS = [`0x${padLeft(fakeHx.toString(16), 64)}`, `0x${padLeft(fakeHy.toString(16), 64)}`, ...t2];

            await truffleAssert.reverts(
                adjustSupplyContract.validateAdjustSupply(proofData, accounts[0], fakeCRS, {
                    from: accounts[0],
                    gas: 4000000,
                }),
            );
        });

        it('should fail if group element (blinding factor) resolves to infinity', async () => {
            const noteValues = [50, 30, 10, 10];
            const numNotes = noteValues.length;
            const aztecAccounts = [...new Array(numNotes)].map(() => secp256k1.generateAccount());
            const notes = await Promise.all(
                aztecAccounts.map(({ publicKey }, i) => {
                    return note.create(publicKey, noteValues[i]);
                }),
            );

            const newTotalBurned = notes[0];
            const oldTotalBurned = notes[1];
            const adjustedNotes = notes.slice(2, 4);
            const senderAddress = accounts[0];

            const inputNotes = [newTotalBurned];
            const outputNotes = [oldTotalBurned, ...adjustedNotes];

            const proofConstruct = burn.constructProof([newTotalBurned, oldTotalBurned, ...adjustedNotes], senderAddress);

            proofConstruct.proofData[0][0] = `0x${padLeft('05', 64)}`;
            proofConstruct.proofData[0][1] = `0x${padLeft('05', 64)}`;
            proofConstruct.proofData[0][2] = `0x${padLeft(bn128.h.x.fromRed().toString(16), 64)}`;
            proofConstruct.proofData[0][3] = `0x${padLeft(bn128.h.y.fromRed().toString(16), 64)}`;
            proofConstruct.proofData[0][4] = `0x${padLeft(bn128.h.x.fromRed().toString(16), 64)}`;
            proofConstruct.proofData[0][5] = `0x${padLeft(bn128.h.y.fromRed().toString(16), 64)}`;
            proofConstruct.challenge = `0x${padLeft('0a', 64)}`;

            const inputOwners = inputNotes.map((m) => m.owner);
            const outputOwners = outputNotes.map((n) => n.owner);

            const proofData = inputCoder.burn(
                proofConstruct.proofData,
                proofConstruct.challenge,
                inputOwners,
                outputOwners,
                outputNotes,
            );
            const opts = {
                from: senderAddress,
                gas: 4000000,
            };
            await truffleAssert.reverts(adjustSupplyContract.validateAdjustSupply(proofData, senderAddress, constants.CRS, opts));
        });

        it('should fail if sender address NOT integrated into challenge variable', async () => {
            const noteValues = [50, 30, 10, 10];
            const numNotes = noteValues.length;
            const aztecAccounts = [...new Array(numNotes)].map(() => secp256k1.generateAccount());
            const notes = await Promise.all(
                aztecAccounts.map(({ publicKey }, i) => {
                    return note.create(publicKey, noteValues[i]);
                }),
            );

            const newTotalBurned = notes[0];
            const oldTotalBurned = notes[1];
            const adjustedNotes = notes.slice(2, 4);
            const senderAddress = accounts[0];

            const inputNotes = [newTotalBurned];
            const outputNotes = [oldTotalBurned, ...adjustedNotes];

            const m = 1;
            const kPublic = 0;
            const kPublicBN = new BN(kPublic);
            const rollingHash = new Keccak();
            notes.forEach((individualNote) => {
                rollingHash.append(individualNote.gamma);
                rollingHash.append(individualNote.sigma);
            });

            const localConstructBlindingFactors = joinSplit.constructBlindingFactors;
            const localGenerateBlindingScalars = joinSplit.generateBlindingScalars;

            const blindingScalars = joinSplit.generateBlindingScalars(numNotes, m);
            const blindingFactors = joinSplit.constructBlindingFactors(notes, m, rollingHash, blindingScalars);

            const localComputeChallenge = proofUtils.computeChallenge;
            proofUtils.computeChallenge = () => localComputeChallenge(kPublicBN, m, notes, blindingFactors);
            joinSplit.constructBlindingFactors = () => blindingFactors;
            joinSplit.generateBlindingScalars = () => blindingScalars;

            const { proofData: proofDataRaw, challenge } = burn.constructProof(
                [...inputNotes, ...outputNotes],
                m,
                senderAddress,
                kPublic,
            );

            proofUtils.computeChallenge = localComputeChallenge;
            joinSplit.constructBlindingFactors = localConstructBlindingFactors;
            joinSplit.generateBlindingScalars = localGenerateBlindingScalars;

            const inputOwners = inputNotes.map((n) => n.owner);
            const outputOwners = outputNotes.map((n) => n.owner);

            const proofData = inputCoder.burn(proofDataRaw, challenge, inputOwners, outputOwners, outputNotes);
            const opts = {
                from: senderAddress,
                gas: 4000000,
            };
            await truffleAssert.reverts(adjustSupplyContract.validateAdjustSupply(proofData, senderAddress, constants.CRS, opts));
        });

        it('should fail if kPublic (set internally in proof to 0) NOT integrated into challenge variable', async () => {
            const noteValues = [50, 30, 10, 10];
            const numNotes = noteValues.length;
            const aztecAccounts = [...new Array(numNotes)].map(() => secp256k1.generateAccount());
            const notes = await Promise.all(
                aztecAccounts.map(({ publicKey }, i) => {
                    return note.create(publicKey, noteValues[i]);
                }),
            );

            const newTotalBurned = notes[0];
            const oldTotalBurned = notes[1];
            const adjustedNotes = notes.slice(2, 4);
            const senderAddress = accounts[0];

            const inputNotes = [newTotalBurned];
            const outputNotes = [oldTotalBurned, ...adjustedNotes];

            const m = 1;
            const kPublic = 0;
            const rollingHash = new Keccak();
            notes.forEach((individualNote) => {
                rollingHash.append(individualNote.gamma);
                rollingHash.append(individualNote.sigma);
            });

            const localConstructBlindingFactors = joinSplit.constructBlindingFactors;
            const localGenerateBlindingScalars = joinSplit.generateBlindingScalars;

            const blindingScalars = joinSplit.generateBlindingScalars(numNotes, m);
            const blindingFactors = joinSplit.constructBlindingFactors(notes, m, rollingHash, blindingScalars);

            const localComputeChallenge = proofUtils.computeChallenge;
            proofUtils.computeChallenge = () => localComputeChallenge(senderAddress, m, notes, blindingFactors);
            joinSplit.constructBlindingFactors = () => blindingFactors;
            joinSplit.generateBlindingScalars = () => blindingScalars;

            const { proofData: proofDataRaw, challenge } = burn.constructProof(
                [...inputNotes, ...outputNotes],
                m,
                senderAddress,
                kPublic,
            );

            proofUtils.computeChallenge = localComputeChallenge;
            joinSplit.constructBlindingFactors = localConstructBlindingFactors;
            joinSplit.generateBlindingScalars = localGenerateBlindingScalars;

            const inputOwners = inputNotes.map((n) => n.owner);
            const outputOwners = outputNotes.map((n) => n.owner);

            const proofData = inputCoder.burn(proofDataRaw, challenge, inputOwners, outputOwners, outputNotes);
            const opts = {
                from: senderAddress,
                gas: 4000000,
            };
            await truffleAssert.reverts(adjustSupplyContract.validateAdjustSupply(proofData, senderAddress, constants.CRS, opts));
        });

        it('should fail if commitments NOT integrated into challenge variable', async () => {
            const noteValues = [50, 30, 10, 10];
            const numNotes = noteValues.length;
            const aztecAccounts = [...new Array(numNotes)].map(() => secp256k1.generateAccount());
            const notes = await Promise.all(
                aztecAccounts.map(({ publicKey }, i) => {
                    return note.create(publicKey, noteValues[i]);
                }),
            );

            const newTotalBurned = notes[0];
            const oldTotalBurned = notes[1];
            const adjustedNotes = notes.slice(2, 4);
            const senderAddress = accounts[0];

            const inputNotes = [newTotalBurned];
            const outputNotes = [oldTotalBurned, ...adjustedNotes];

            const m = 1;
            const kPublic = 0;
            const kPublicBN = new BN(kPublic);
            const rollingHash = new Keccak();
            notes.forEach((individualNote) => {
                rollingHash.append(individualNote.gamma);
                rollingHash.append(individualNote.sigma);
            });

            const localConstructBlindingFactors = joinSplit.constructBlindingFactors;
            const localGenerateBlindingScalars = joinSplit.generateBlindingScalars;

            const blindingScalars = joinSplit.generateBlindingScalars(numNotes, m);
            const blindingFactors = joinSplit.constructBlindingFactors(notes, m, rollingHash, blindingScalars);

            const localComputeChallenge = proofUtils.computeChallenge;
            proofUtils.computeChallenge = () => localComputeChallenge(senderAddress, kPublicBN, m, blindingFactors);
            joinSplit.constructBlindingFactors = () => blindingFactors;
            joinSplit.generateBlindingScalars = () => blindingScalars;

            const { proofData: proofDataRaw, challenge } = burn.constructProof(
                [...inputNotes, ...outputNotes],
                m,
                senderAddress,
                kPublic,
            );

            proofUtils.computeChallenge = localComputeChallenge;
            joinSplit.constructBlindingFactors = localConstructBlindingFactors;
            joinSplit.generateBlindingScalars = localGenerateBlindingScalars;

            const inputOwners = inputNotes.map((n) => n.owner);
            const outputOwners = outputNotes.map((n) => n.owner);

            const proofData = inputCoder.burn(proofDataRaw, challenge, inputOwners, outputOwners, outputNotes);
            const opts = {
                from: senderAddress,
                gas: 4000000,
            };
            await truffleAssert.reverts(adjustSupplyContract.validateAdjustSupply(proofData, senderAddress, constants.CRS, opts));
        });

        it('should fail if m NOT integrated into challenge variable', async () => {
            const noteValues = [50, 30, 10, 10];
            const numNotes = noteValues.length;
            const aztecAccounts = [...new Array(numNotes)].map(() => secp256k1.generateAccount());
            const notes = await Promise.all(
                aztecAccounts.map(({ publicKey }, i) => {
                    return note.create(publicKey, noteValues[i]);
                }),
            );

            const newTotalBurned = notes[0];
            const oldTotalBurned = notes[1];
            const adjustedNotes = notes.slice(2, 4);
            const senderAddress = accounts[0];

            const inputNotes = [newTotalBurned];
            const outputNotes = [oldTotalBurned, ...adjustedNotes];

            const m = 1;
            const kPublic = 0;
            const kPublicBN = new BN(kPublic);
            const rollingHash = new Keccak();
            notes.forEach((individualNote) => {
                rollingHash.append(individualNote.gamma);
                rollingHash.append(individualNote.sigma);
            });

            const localConstructBlindingFactors = joinSplit.constructBlindingFactors;
            const localGenerateBlindingScalars = joinSplit.generateBlindingScalars;

            const blindingScalars = joinSplit.generateBlindingScalars(numNotes, m);
            const blindingFactors = joinSplit.constructBlindingFactors(notes, m, rollingHash, blindingScalars);

            const localComputeChallenge = proofUtils.computeChallenge;
            proofUtils.computeChallenge = () => localComputeChallenge(senderAddress, kPublicBN, notes, blindingFactors);
            joinSplit.constructBlindingFactors = () => blindingFactors;
            joinSplit.generateBlindingScalars = () => blindingScalars;

            const { proofData: proofDataRaw, challenge } = burn.constructProof(
                [...inputNotes, ...outputNotes],
                m,
                senderAddress,
                kPublic,
            );

            proofUtils.computeChallenge = localComputeChallenge;
            joinSplit.constructBlindingFactors = localConstructBlindingFactors;
            joinSplit.generateBlindingScalars = localGenerateBlindingScalars;

            const inputOwners = inputNotes.map((n) => n.owner);
            const outputOwners = outputNotes.map((n) => n.owner);

            const proofData = inputCoder.burn(proofDataRaw, challenge, inputOwners, outputOwners, outputNotes);
            const opts = {
                from: senderAddress,
                gas: 4000000,
            };
            await truffleAssert.reverts(adjustSupplyContract.validateAdjustSupply(proofData, senderAddress, constants.CRS, opts));
        });

        it('should fail if blindingFactors NOT integrated into challenge variable', async () => {
            const noteValues = [50, 30, 10, 10];
            const numNotes = noteValues.length;
            const aztecAccounts = [...new Array(numNotes)].map(() => secp256k1.generateAccount());
            const notes = await Promise.all(
                aztecAccounts.map(({ publicKey }, i) => {
                    return note.create(publicKey, noteValues[i]);
                }),
            );

            const newTotalBurned = notes[0];
            const oldTotalBurned = notes[1];
            const adjustedNotes = notes.slice(2, 4);
            const senderAddress = accounts[0];

            const inputNotes = [newTotalBurned];
            const outputNotes = [oldTotalBurned, ...adjustedNotes];

            const m = 1;
            const kPublic = 0;
            const kPublicBN = new BN(kPublic);
            const rollingHash = new Keccak();
            notes.forEach((individualNote) => {
                rollingHash.append(individualNote.gamma);
                rollingHash.append(individualNote.sigma);
            });

            const localConstructBlindingFactors = joinSplit.constructBlindingFactors;
            const localGenerateBlindingScalars = joinSplit.generateBlindingScalars;

            const blindingScalars = joinSplit.generateBlindingScalars(numNotes, m);
            const blindingFactors = joinSplit.constructBlindingFactors(notes, m, rollingHash, blindingScalars);

            const localComputeChallenge = proofUtils.computeChallenge;
            proofUtils.computeChallenge = () => localComputeChallenge(senderAddress, kPublicBN, m, notes);
            joinSplit.constructBlindingFactors = () => blindingFactors;
            joinSplit.generateBlindingScalars = () => blindingScalars;

            const { proofData: proofDataRaw, challenge } = burn.constructProof(
                [...inputNotes, ...outputNotes],
                m,
                senderAddress,
                kPublic,
            );

            proofUtils.computeChallenge = localComputeChallenge;
            joinSplit.constructBlindingFactors = localConstructBlindingFactors;
            joinSplit.generateBlindingScalars = localGenerateBlindingScalars;

            const inputOwners = inputNotes.map((n) => n.owner);
            const outputOwners = outputNotes.map((n) => n.owner);

            const proofData = inputCoder.burn(proofDataRaw, challenge, inputOwners, outputOwners, outputNotes);
            const opts = {
                from: senderAddress,
                gas: 4000000,
            };
            await truffleAssert.reverts(adjustSupplyContract.validateAdjustSupply(proofData, senderAddress, constants.CRS, opts));
        });

        it('should fail if number of notes supplied is less than the minimum (2) i.e. no output notes', async () => {
            const noteValues = [50];
            const numNotes = noteValues.length;
            const aztecAccounts = [...new Array(numNotes)].map(() => secp256k1.generateAccount());
            const notes = await Promise.all(
                aztecAccounts.map(({ publicKey }, i) => {
                    return note.create(publicKey, noteValues[i]);
                }),
            );

            const newTotalBurned = notes[0];
            const senderAddress = accounts[0];

            const { proofData: proofDataRaw, challenge } = burn.constructProof([newTotalBurned], senderAddress);

            const inputNotes = [newTotalBurned];
            const outputNotes = [];

            const inputOwners = inputNotes.map((m) => m.owner);
            const outputOwners = outputNotes.map((n) => n.owner);

            const proofData = inputCoder.burn(proofDataRaw, challenge, inputOwners, outputOwners, outputNotes);

            const opts = {
                from: senderAddress,
                gas: 4000000,
            };
            await truffleAssert.reverts(adjustSupplyContract.validateAdjustSupply(proofData, senderAddress, constants.CRS, opts));
        });
    });
});
