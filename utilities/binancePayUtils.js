const crypto = require('crypto');

function generateBinancePaySignature(secretKey, timestamp, nonceStr, requestBody = '') {
    const payload = `${timestamp}\n${nonceStr}\n${requestBody}\n`;
    const signature = crypto.createHmac('sha512', secretKey)
                            .update(payload)
                            .digest('hex')
                            .toUpperCase();
    return signature;
}

function generateBinancePayHeaders(apiKey, secretKey, requestBody = '') {
    const timestamp = Date.now().toString();
    const nonceStr = crypto.randomBytes(16).toString('hex');
    const signature = generateBinancePaySignature(secretKey, timestamp, nonceStr, requestBody);

    return {
        'BinancePay-Timestamp': timestamp,
        'BinancePay-Nonce': nonceStr,
        'BinancePay-Certificate-SN': apiKey,
        'BinancePay-Signature': signature
    };
}

module.exports = { generateBinancePayHeaders };

