const express = require('express');
const { query } = require('./database'); // Use your database connection
const router = express.Router();

// POST endpoint to create a new product
router.post('/products', async (req, res) => {
    const { product_name, product_price, referral_points_amount } = req.body;
    try {
        const sql = 'INSERT INTO products (product_name, product_price, referral_points_amount) VALUES (?, ?, ?)';
        await query(sql, [product_name, product_price, referral_points_amount]);
        res.status(201).send({ message: "Product created successfully" });
    } catch (error) {
        console.error('Error creating product:', error);
        res.status(500).send({ message: "Error creating product", error: error.toString() });
    }
});

module.exports = router;
