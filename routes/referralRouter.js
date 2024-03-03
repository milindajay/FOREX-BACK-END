const express = require('express');
const router = express.Router();

router.get('/', (req, res) => {
    const referrerId = req.query.ref;
    const type = req.query.type;

    // Your logic to handle the referral, e.g., logging, updating the database, etc.
    console.log(`Referral accessed with referrer ID: ${referrerId} and type: ${type}`);
    
    // For now, just send a confirmation response
    res.json({ message: "Referral route reached", referrerId, type });
});

module.exports = router;
