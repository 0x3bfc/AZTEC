const BN = require('bn.js');
const { expect } = require('chai');
const crypto = require('crypto');
const sinon = require('sinon');
const { padLeft } = require('web3-utils');

const bn128 = require('../../../src/bn128');
const extractor = require('../../../src/proof/joinSplit/extractor');
const proof = require('../../../src/proof/joinSplit');
const proofHelpers = require('../../../src/proof/joinSplit/helpers');
const proofUtils = require('../../../src/proof/proofUtils');

const getKPublic = (kIn, kOut) => {
    return kOut.reduce((acc, v) => acc - v, kIn.reduce((acc, v) => acc + v, 0));
};

const randomAddress = () => {
    return `0x${padLeft(crypto.randomBytes(20).toString('hex'), 64)}`;
};

/**
 * Extractor test.
 *
 * What is the purpose of this test? The AZTEC zero-knowledge proof is a specially sound sigma protocol.
 * If a prover is capable of satisfying the verifier with two proofs over the *same* input string,
 * but with *different* challenges, there should exist an extractor algorithm that can
 * recover the witnesses from the proof transcript.
 * i.e. if you can satisfy the verifier in this way, an observer can extract the witnesses that prove the proof statement,
 * therefore the proof must be an honest proof.
 * So, we might as well verify that this is the case for our implementation.
 *
 * We stub proof.computeChallenge with a 'random oracle' - something that spits out random challenges instead of using hashes.
 * We also stub proof.generateBlindingScalars with a function that always returns the same set of blinding scalars.
 * This ensures that when we call proof.constructProof two times, with the same notes, we have the same input string
 * for both proofs.
 *
 * Finally, once we have our two proof transcripts we call extractor.extractWitness
 * and validate that we have indeed recovered the witnesses.
 *
 * N.B. This is also why re-using blinding scalars for multiple proofs leaks secrets, so don't try this at home, or in production.
 */
describe('Join-Split Proof Extractor', () => {
    let blindingScalars;
    let nIn;
    let nOut;
    let generateBlindingScalars;
    let computeChallenge;
    beforeEach(() => {
        nIn = 5;
        nOut = 5;
        blindingScalars = proof.generateBlindingScalars(nIn + nOut, nIn);

        // We want a satisfying proof over the same input string, so we want the same set of blinding scalars.
        // Stub proof.generateBlindingScalars to always return the same set of scalars.
        generateBlindingScalars = sinon.stub(proof, 'generateBlindingScalars').callsFake(() => blindingScalars);

        // It's a random oracle! ...sort of, if you squint a bit.
        computeChallenge = sinon.stub(proofUtils, 'computeChallenge').callsFake(() => {
            return new BN(crypto.randomBytes(32), 16).toRed(bn128.groupReduction);
        });
    });

    afterEach(() => {
        generateBlindingScalars.restore();
        computeChallenge.restore();
    });

    // eslint-disable-next-line max-len
    it('should extract witnesses from two satisfying proofs over the same input string in the random oracle model', async () => {
        const kIn = [...Array(nIn)].map(() => proofUtils.randomNoteValue());
        const kOut = [...Array(nOut)].map(() => proofUtils.randomNoteValue());
        const { commitments, m } = await proofHelpers.generateFakeCommitmentSet({ kIn, kOut });
        const kPublic = getKPublic(kIn, kOut);
        const sender = randomAddress();

        // construct first proof
        const { proofData: firstTranscript, challenge: firstChallenge } = proof.constructProof(commitments, m, sender, kPublic);

        // and now let's get a second proof over the same input string
        const { proofData: secondTranscript, challenge: secondChallenge } = proof.constructProof(commitments, m, sender, kPublic);

        const witnesses = extractor.extractWitness([firstTranscript, secondTranscript], m, [firstChallenge, secondChallenge]);

        // validate that the extractor has extracted the correct witnesses
        witnesses.forEach(({ gamma, sigma, k, a }) => {
            expect(
                gamma
                    .mul(k)
                    .add(bn128.h.mul(a))
                    .eq(sigma),
            ).to.equal(true);
        });
    });
});
