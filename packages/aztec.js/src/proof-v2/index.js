const BurnProof = require('./joinSplitFluid/burn');
const DividendProof = require('./dividend');
const JoinSplitProof = require('./joinSplit');
const JoinSplitProofFluid = require('./joinSplitFluid');
const MintProof = require('./joinSplitFluid/mint');
const TradeProof = require('./trade');

module.exports = {
    BurnProof,
    DividendProof,
    JoinSplitProof,
    JoinSplitProofFluid,
    MintProof,
    TradeProof,
};
