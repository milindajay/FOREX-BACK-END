const express = require('express');
const referralTreeService = require('../utilities/referralTreeService'); // Make sure this path is correct.
const router = express.Router();

router.get('/:memberId', async (req, res) => {
    const { memberId } = req.params;
    try {
        const tree = await referralTreeService.getReferralTree(memberId);
        res.json(tree);
    } catch (error) {
        console.error('Error fetching referral tree:', error);
        res.status(500).send({ message: 'Internal server error', code: 'SERVER_ERROR', error: error.toString() });
    }
});

module.exports = router;